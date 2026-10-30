import logging
import json
import os
import re
import fitz
import requests
import zipfile
from io import BytesIO
from xml.sax.saxutils import escape
from django.http import HttpResponse

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import permission_classes

from papers.models import Paper, ResearchWorkspace
from papers.views import extract_pdf_research_assets
from .services.paper_analyzer import analyze_paper, _normalize_analysis, _select_context

logger = logging.getLogger(__name__)


def _ensure_pdf_research_assets(paper):
    """Add table/figure text for older uploads that predate asset extraction."""
    if not paper.pdf or not paper.pdf.name.lower().endswith(".pdf") or "[Table " in paper.extracted_text:
        return
    try:
        page_texts = {
            int(number): body
            for number, body in re.findall(r"\[Page\s+(\d+)\]\s*([\s\S]*?)(?=\n\[Page\s+\d+\]|\Z)", paper.extracted_text)
        }
        additions = []
        table_number = 1
        try:
            ocr_limit = max(0, int(os.getenv("OCR_FIGURE_MAX_PAGES", "10")))
        except ValueError:
            ocr_limit = 10
        ocr_pages = 0
        with fitz.open(paper.pdf.path) as document:
            for index, page in enumerate(document):
                number = index + 1
                if number not in page_texts:
                    continue
                try:
                    assets, table_number = extract_pdf_research_assets(
                        page, number, page_texts[number], table_number,
                        ocr_figure=bool(page.get_images(full=True)) and ocr_pages < ocr_limit,
                    )
                except Exception:
                    logger.debug("Could not extract research assets from page %s", number, exc_info=True)
                    continue
                if assets:
                    additions.append(assets)
                    if "[Figure and scanned labels OCR" in assets:
                        ocr_pages += 1
                if sum(map(len, additions)) > 50000:
                    break
        if additions:
            paper.extracted_text += "\n\n[Detected PDF research assets]\n" + "\n\n".join(additions)
            paper.save(update_fields=["extracted_text"])
    except (OSError, RuntimeError, ValueError, TypeError):
        logger.info("Could not enrich existing PDF assets for paper_id=%s", paper.id, exc_info=True)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def analyzer_status(request):
    return Response({
        "success": True,
        "message": "PaperMind AI Analyzer API is ready.",
        "analysis_available": True,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def analyze_existing_paper(request, paper_id):
    try:
        paper = Paper.objects.get(id=paper_id, owner=request.user)

    except Paper.DoesNotExist:
        return Response(
            {"error": "Paper not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    _ensure_pdf_research_assets(paper)

    if not paper.extracted_text:
        return Response(
            {"error": "No extracted text available for this paper."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Reuse saved analysis unless the client explicitly requests a refresh.
    if getattr(paper, "analysis_result", None) and request.query_params.get("refresh") != "1":
        # Upgrade reports saved by older analyzer versions without making a
        # new paid/provider request. Recover results and solutions directly
        # from the full extracted paper text when earlier AI output omitted them.
        analysis = _normalize_analysis(paper.analysis_result, paper.extracted_text)
        if analysis != paper.analysis_result:
            paper.analysis_result = analysis
            paper.save(update_fields=["analysis_result"])
        return Response({
            "success": True,
            "paper_id": paper.id,
            "title": paper.title,
            "analysis": analysis,
            "cached": True,
        })

    try:
        pdf_metadata = {}
        if paper.pdf.name.lower().endswith(".pdf"):
            try:
                with fitz.open(paper.pdf.path) as document:
                    pdf_metadata = document.metadata or {}
            except (OSError, RuntimeError, ValueError):
                logger.info("Could not read embedded PDF metadata for paper_id=%s.", paper_id)

        analysis = analyze_paper(paper.extracted_text, pdf_metadata=pdf_metadata)

        # Save the analysis if the model supports this field.
        if hasattr(paper, "analysis_result"):
            paper.analysis_result = analysis
            paper.save(update_fields=["analysis_result"])

        return Response({
            "success": True,
            "paper_id": paper.id,
            "title": paper.title,
            "analysis": analysis,
            "cached": False,
        })

    except ValueError as exc:
        logger.warning("Paper analysis configuration error: %s", exc)

        return Response(
            {"error": str(exc)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    except Exception as exc:
        logger.exception("Paper analysis failed for paper_id=%s", paper_id)

        return Response(
            {
                "error": "Analysis failed.",
                "details": str(exc),
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def compare_papers(request):
    ids = request.data.get("paper_ids")
    if not isinstance(ids, list) or not 2 <= len(ids) <= 4 or len(set(ids)) != len(ids):
        return Response({"error": "Choose between 2 and 4 different papers."}, status=400)
    papers = list(Paper.objects.filter(owner=request.user, id__in=ids))
    if len(papers) != len(ids):
        return Response({"error": "One or more papers were not found."}, status=404)
    excerpts = []
    for paper in papers:
        analysis = paper.analysis_result or {}
        summary = analysis.get("summary") or []
        summary = "\n".join(summary) if isinstance(summary, list) else str(summary)
        excerpts.append(f"PAPER {paper.id}: {paper.title}\nSAVED SUMMARY: {summary[:1800]}\nSOURCE EXCERPTS:\n{_select_context(paper.extracted_text, 3500)}")
    api_keys = [os.getenv("GROQ_API_KEY_1"), os.getenv("GROQ_API_KEY_2")]
    api_keys = [key.strip() for key in api_keys if key and key.strip()]
    if not api_keys:
        return Response({"error": "Paper comparison is not configured. Add a Groq API key."}, status=503)
    messages = [
        {"role": "system", "content": "Synthesize the selected research papers using only supplied source excerpts and saved analyses. Return JSON with overview (string), dimensions (array of objects with dimension and values, where values has paper_id and value), agreements (array), differences (array), research_gaps (array of objects with gap, source_paper_ids, and rationale), and evidence (array with paper_id, claim, quote, page integer or null). Keep findings attached to their paper IDs. Mark absent information as Not stated. Research gaps are tentative opportunities suggested by reported limitations or missing evidence, not proof that no prior work exists. Every gap must identify supporting paper IDs. Do not invent facts, quotes, page numbers, or citations."},
        {"role": "user", "content": "Compare these papers. Keep every value tied to its paper id.\n\n" + "\n\n".join(excerpts)},
    ]
    for key in api_keys:
        try:
            response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers={"Authorization": f"Bearer {key}"}, json={"model": "openai/gpt-oss-120b", "temperature": 0.1, "max_completion_tokens": 1800, "reasoning_effort": "low", "reasoning_format": "hidden", "response_format": {"type": "json_object"}, "messages": messages}, timeout=90)
            if response.ok:
                result = json.loads(response.json()["choices"][0]["message"]["content"])
                source_pages = {
                    paper.id: {int(number): re.sub(r"\s+", " ", body).strip().casefold() for number, body in re.findall(r"\[Page\s+(\d+)\]\s*([\s\S]*?)(?=\n\[Page\s+\d+\]|\Z)", paper.extracted_text)}
                    for paper in papers
                }
                for item in result.get("evidence", []):
                    if not isinstance(item, dict):
                        continue
                    try:
                        paper_id = int(item.get("paper_id"))
                    except (TypeError, ValueError):
                        paper_id = None
                    page = item.get("page")
                    quote = re.sub(r"\s+", " ", str(item.get("quote", ""))).strip().casefold()
                    page_texts = source_pages.get(paper_id, {})
                    source = page_texts.get(page, "") if isinstance(page, int) else " ".join(page_texts.values())
                    item["verified"] = bool(quote) and quote in source
                return Response({"papers": [{"id": p.id, "title": p.title, "file_type": p.pdf.name.rsplit(".", 1)[-1].lower() if p.pdf and "." in p.pdf.name else ""} for p in papers], "comparison": result})
        except (requests.RequestException, KeyError, IndexError, ValueError, TypeError):
            logger.exception("Paper comparison request failed")
    return Response({"error": "Could not compare the selected papers right now."}, status=502)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_analysis_evidence(request, paper_id):
    paper = Paper.objects.filter(id=paper_id, owner=request.user).first()
    if not paper:
        return Response({"error": "Paper not found."}, status=404)
    evidence = (paper.analysis_result or {}).get("evidence") or []
    pages = {int(number): body for number, body in re.findall(r"\[Page\s+(\d+)\]\s*([\s\S]*?)(?=\n\[Page\s+\d+\]|\Z)", paper.extracted_text)}
    checks = []
    for item in evidence:
        if not isinstance(item, dict):
            continue
        support = re.sub(r"\s+", " ", str(item.get("support", ""))).strip().casefold()
        page = item.get("page")
        source = pages.get(page, "") if isinstance(page, int) else paper.extracted_text
        source = re.sub(r"\s+", " ", source).strip().casefold()
        verified = bool(support) and support in source
        checks.append({"claim": item.get("claim", ""), "page": page, "status": "verified" if verified else "unverified", "reason": "Supporting text matches the extracted PDF text." if verified else "The supplied support was not found verbatim in the extracted source text."})
    return Response({"paper_id": paper.id, "total": len(checks), "verified": sum(item["status"] == "verified" for item in checks), "evidence": checks})


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def research_workspace(request):
    workspace, _ = ResearchWorkspace.objects.get_or_create(owner=request.user)
    if request.method == "PATCH":
        for field, limit in (("topic", 500), ("research_question", 5000)):
            if field in request.data:
                value = str(request.data[field]).strip()
                if len(value) > limit:
                    return Response({"error": f"{field} exceeds {limit} characters."}, status=400)
                setattr(workspace, field, value)
        for field in ("objectives", "selected_paper_ids", "drafts"):
            if field in request.data:
                value = request.data[field]
                if not isinstance(value, list) or len(value) > (30 if field != "drafts" else 50):
                    return Response({"error": f"{field} must be a bounded list."}, status=400)
                setattr(workspace, field, value)
        workspace.save()
    return Response({"topic": workspace.topic, "research_question": workspace.research_question,
                     "objectives": workspace.objectives, "selected_paper_ids": workspace.selected_paper_ids,
                     "drafts": workspace.drafts, "updated_at": workspace.updated_at})


def _workspace_sources(user, ids):
    if not isinstance(ids, list) or not 1 <= len(ids) <= 8:
        return None, Response({"error": "Select 1–8 papers for this research tool."}, status=400)
    try:
        normalized_ids = [int(value) for value in ids]
    except (TypeError, ValueError):
        return None, Response({"error": "Paper ids must be valid integers."}, status=400)
    if any(value < 1 for value in normalized_ids) or len(set(normalized_ids)) != len(normalized_ids):
        return None, Response({"error": "Select distinct valid paper ids."}, status=400)
    papers = list(Paper.objects.filter(owner=user, id__in=normalized_ids))
    if len(papers) != len(normalized_ids):
        return None, Response({"error": "One or more selected papers were not found."}, status=404)
    snippets = []
    for paper in papers:
        content = _select_context(paper.extracted_text, 10500)
        if not content:
            content = paper.extracted_text[:10000]
        snippets.append(f"PAPER_ID {paper.id}\nTITLE {paper.title}\nSOURCE TEXT:\n{content[:12000]}")
    return (papers, "\n\n".join(snippets)), None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def research_ai_tool(request):
    action = str(request.data.get("action", ""))
    allowed = {"matrix", "gaps", "methodology", "writing", "flashcards"}
    if action not in allowed:
        return Response({"error": "Choose a supported research tool."}, status=400)
    papers, error = _workspace_sources(request.user, request.data.get("paper_ids"))
    if error:
        return error
    paper_records, source_text = papers
    topic = str(request.data.get("topic", "")).strip()[:1000]
    question = str(request.data.get("question", "")).strip()[:2000]
    draft = str(request.data.get("draft", "")).strip()[:5000]
    contracts = {
        "matrix": "Return JSON {rows:[{dimension, values:[{paper_id,value,quote,page}]}]}. Include dataset, sample size, model, metrics, and limitations. Use Not stated when absent.",
        "gaps": "Return JSON {recurring_limitations:[{theme,paper_ids,evidence:[{paper_id,quote,page}]}], underexplored_questions:[{question,rationale,source_paper_ids}]}. Describe only gaps suggested by these selected sources, not proof that no literature exists.",
        "methodology": "Return JSON {research_question, objectives:[...], proposed_methods:[{method,fit,advantages,limitations,data_needed,evidence:[{paper_id,quote,page}]}], checklist:[...]}. Clearly label recommendations and distinguish from source findings.",
        "writing": "Return JSON {draft, citations:[{paper_id,title,page,quote,verified}], caveats:[...]}. Draft one evidence-led academic passage. Cite only selected papers using [Paper ID, PDF p. N]. Every factual source claim must map to a short exact quote and page; do not invent references or results. If evidence is missing, say so.",
        "flashcards": "Return JSON {cards:[{question,answer,paper_id,page,quote}]}, at most 12 cards. Each answer must be grounded in supplied paper text.",
    }
    task = {"matrix": "Build the cross-paper evidence matrix", "gaps": "Find recurring limitations and cautiously suggested research questions", "methodology": "Help plan a method for this research question", "writing": "Draft a citation-aware paragraph from the selected papers", "flashcards": "Create study flashcards"}[action]
    user_prompt = f"TASK: {task}\nTOPIC: {topic}\nRESEARCH QUESTION: {question}\nUSER DRAFT: {draft}\n\nSELECTED SOURCE PAPERS:\n{source_text}"
    keys = [x.strip() for x in (os.getenv("GROQ_API_KEY_1"), os.getenv("GROQ_API_KEY_2")) if x and x.strip()]
    if not keys:
        return Response({"error": "Research AI is not configured. Add a Groq API key."}, status=503)
    for key in keys:
        try:
            response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers={"Authorization": f"Bearer {key}"},
                json={"model": "openai/gpt-oss-120b", "temperature": 0.1, "max_completion_tokens": 3000,
                      "reasoning_effort": "low", "reasoning_format": "hidden", "response_format": {"type": "json_object"},
                      "messages": [
                          {"role": "system", "content": "You are a careful research assistant. " + contracts[action]},
                          {"role": "user", "content": user_prompt},
                      ]},
                timeout=90)
            if not response.ok:
                continue
            output = json.loads(response.json()["choices"][0]["message"]["content"])
            pages = {p.id: {int(n): re.sub(r"\s+", " ", t).strip().casefold() for n, t in re.findall(r"\[Page\s+(\d+)\]\s*([\s\S]*?)(?=\n\[Page\s+\d+\]|\Z)", p.extracted_text)} for p in paper_records}
            def verify(item):
                try:
                    paper_id = int(item.get("paper_id"))
                except (TypeError, ValueError):
                    item["verified"] = False
                    return item
                quote = re.sub(r"\s+", " ", str(item.get("quote", ""))).strip().casefold()
                page = item.get("page")
                source = pages.get(paper_id, {}).get(page, "") if isinstance(page, int) else " ".join(pages.get(paper_id, {}).values())
                item["verified"] = bool(quote) and quote in source
                return item
            for row in output.get("rows", []):
                for value in row.get("values", []):
                    verify(value)
            for row in output.get("recurring_limitations", []):
                for item in row.get("evidence", []):
                    verify(item)
            for row in output.get("proposed_methods", []):
                for item in row.get("evidence", []):
                    verify(item)
            for item in output.get("citations", []):
                verify(item)
            for item in output.get("cards", []):
                verify(item)
            return Response({"action": action, "result": output, "sources": [{"id": p.id, "title": p.title} for p in paper_records], "confidence_note": "Source matches are exact text checks. Recommendations and generated drafts still require researcher review."})
        except (requests.RequestException, KeyError, IndexError, json.JSONDecodeError, TypeError, ValueError):
            logger.exception("Research AI tool failed for action=%s", action)
    return Response({"error": "Could not complete this research task. Please retry."}, status=502)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_references(request, paper_id):
    paper = Paper.objects.filter(owner=request.user, id=paper_id).first()
    if not paper:
        return Response({"error": "Paper not found."}, status=404)
    front_matter = re.split(r"(?im)^\s*(?:references|bibliography)\s*$", paper.extracted_text, maxsplit=1)[0][:10000]
    own_doi_match = re.search(r"(?i)\b10\.\d{4,9}/[-._;()/:A-Z0-9]+", front_matter)
    own_doi = own_doi_match.group(0).rstrip(".,;:)").lower() if own_doi_match else ""
    dois = [doi for doi in dict.fromkeys(re.findall(r"(?i)\b10\.\d{4,9}/[-._;()/:A-Z0-9]+", paper.extracted_text)) if doi.rstrip(".,;:)").lower() != own_doi][:50]
    results = []
    for raw_doi in dois:
        doi = raw_doi.rstrip(".,;:)").lower()
        occurrence = re.search(re.escape(raw_doi), paper.extracted_text, re.IGNORECASE)
        citation_context = paper.extracted_text[max(0, occurrence.start() - 350):occurrence.end() + 120] if occurrence else ""
        try:
            response = requests.get(f"https://api.crossref.org/works/{doi}", headers={"User-Agent": "PaperMindAI/1.0 (reference verification)"}, timeout=12)
            if response.ok:
                item = response.json().get("message", {})
                title = (item.get("title") or [""])[0]
                authors = [f"{a.get('given','')} {a.get('family','')}".strip() for a in (item.get("author") or [])[:8]]
                venue = (item.get("container-title") or [""])[0]
                context = re.sub(r"\s+", " ", citation_context).casefold()
                normalized_title = re.sub(r"[^a-z0-9 ]", " ", title.casefold())
                title_words = [word for word in normalized_title.split() if len(word) > 3]
                title_matches = sum(word in context for word in title_words)
                publication_date = item.get("published") or item.get("published-print") or item.get("published-online") or {}
                year = (publication_date.get("date-parts") or [[None]])[0][0]
                fields = {"doi": True, "title": bool(title_words) and title_matches / len(title_words) >= 0.65,
                          "author": any(a.get("family", "").casefold() in context for a in (item.get("author") or []) if a.get("family")),
                          "publication": bool(venue) and venue.casefold() in context,
                          "year": bool(year) and str(year) in context}
                results.append({"doi": doi, "title": title, "authors": authors,
                    "publication": venue, "year": year,
                    "status": "metadata found", "field_matches": fields,
                    "discrepancies": [name for name, matched in fields.items() if not matched], "citation_context": citation_context[:500], "url": item.get("URL")})
            else:
                results.append({"doi": doi, "status": "not found in Crossref"})
        except (requests.RequestException, ValueError, TypeError):
            results.append({"doi": doi, "status": "verification unavailable"})
    return Response({"paper_id": paper.id, "references_checked": len(results), "references": results,
                     "note": "DOI matches are checked against Crossref metadata. Citations without a DOI are not verified by this check."})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def citation_graph(request, paper_id):
    paper = Paper.objects.filter(owner=request.user, id=paper_id).first()
    if not paper:
        return Response({"error": "Paper not found."}, status=404)
    doi_match = re.search(r"(?i)\b10\.\d{4,9}/[-._;()/:A-Z0-9]+", paper.extracted_text[:10000])
    if not doi_match:
        return Response({"paper": {"id": paper.id, "title": paper.title}, "doi": None, "references": [], "cited_by": [], "note": "No DOI was found in the extracted text, so a citation graph could not be resolved."})
    doi = doi_match.group(0).rstrip(".,;:)").lower()
    try:
        response = requests.get(f"https://api.openalex.org/works/https://doi.org/{doi}", timeout=15)
        if not response.ok:
            raise ValueError("OpenAlex record unavailable")
        work = response.json()
        ids = work.get("referenced_works", [])[:50]
        referenced = []
        for start in range(0, len(ids), 20):
            chunk = ids[start:start + 20]
            if not chunk:
                continue
            batch = requests.get("https://api.openalex.org/works", params={"filter": "ids.openalex:" + "|".join(x.rsplit("/", 1)[-1] for x in chunk), "per-page": 20}, timeout=15)
            if batch.ok:
                for item in batch.json().get("results", []):
                    referenced.append({"title": item.get("title"), "year": item.get("publication_year"), "doi": item.get("doi"), "url": item.get("id")})
        cited_by = []
        cited_url = work.get("cited_by_api_url")
        cited_response = requests.get(cited_url, params={"per-page": 20, "sort": "cited_by_count:desc"}, timeout=15) if cited_url else None
        if cited_response is not None and cited_response.ok:
            cited_by = [{"title": x.get("title"), "year": x.get("publication_year"), "doi": x.get("doi"), "url": x.get("id")} for x in cited_response.json().get("results", [])]
        return Response({"paper": {"id": paper.id, "title": paper.title}, "doi": doi, "references": referenced, "cited_by": cited_by,
                         "note": "Citation links come from OpenAlex and may be incomplete or delayed. Confirm important references with the publisher."})
    except (requests.RequestException, ValueError, KeyError, TypeError):
        return Response({"paper": {"id": paper.id, "title": paper.title}, "doi": doi, "references": [], "cited_by": [], "error": "Could not retrieve citation graph from OpenAlex."}, status=502)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def export_research_docx(request):
    title = str(request.data.get("title", "PaperMind research export"))[:200]
    content = request.data.get("content")
    if not isinstance(content, dict) or len(json.dumps(content, ensure_ascii=False)) > 150000:
        return Response({"error": "Provide a research result under 150 KB to export."}, status=400)
    paragraphs = [title]
    def flatten(value, label=""):
        if isinstance(value, dict):
            for key, item in value.items():
                flatten(item, key.replace("_", " ").title())
        elif isinstance(value, list):
            for item in value:
                flatten(item, label)
        else:
            text = str(value).strip()
            if text:
                paragraphs.append(f"{label}: {text}" if label else text)
    flatten(content)
    document_paragraphs = "".join(
        "<w:p><w:r><w:t xml:space=\"preserve\">" + escape(paragraph) + "</w:t></w:r></w:p>"
        for paragraph in paragraphs
    )
    document = ("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
        "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>"
        + document_paragraphs + "<w:sectPr><w:pgSz w:w=\"12240\" w:h=\"15840\"/></w:sectPr></w:body></w:document>")
    output = BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>")
        archive.writestr("_rels/.rels", "<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>")
        archive.writestr("word/document.xml", document)
    response = HttpResponse(output.getvalue(), content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    response["Content-Disposition"] = 'attachment; filename="papermind-research-export.docx"'
    return response
