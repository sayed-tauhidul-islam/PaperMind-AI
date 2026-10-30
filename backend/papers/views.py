import os
import re
import json
import zipfile
from io import BytesIO
from xml.etree import ElementTree
import fitz
import requests
from django.db.models import BooleanField, Case, F, Value, When
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from .models import Paper, PaperHighlight, PaperNote
from .serializers import PaperSerializer, PaperDetailSerializer, PaperListSerializer

DAILY_PAPER_UPLOAD_LIMIT = 10


def normalize_extracted_text(text):
    """Join words split by PDF line-end hyphenation (for example, ``ma-\nchines``)."""
    return re.sub(r"(?<=[A-Za-z])-\s*\n\s*(?=[a-z])", "", text)


def extract_docx_text(file_bytes):
    """Extract plain paragraph text from a bounded DOCX archive."""
    with zipfile.ZipFile(BytesIO(file_bytes)) as archive:
        entries = {item.filename: item for item in archive.infolist()}
        document = entries.get("word/document.xml")
        if len(entries) > 5000 or "[Content_Types].xml" not in entries or document is None:
            raise ValueError("This is not a valid DOCX document.")
        if sum(item.file_size for item in entries.values()) > 80 * 1024 * 1024 or document.file_size > 40 * 1024 * 1024:
            raise ValueError("The DOCX expands to too much text to process safely.")
        root = ElementTree.fromstring(archive.read("word/document.xml"))
    namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    paragraphs = []
    for paragraph in root.iter(f"{namespace}p"):
        parts = []
        for node in paragraph.iter():
            if node.tag == f"{namespace}t":
                parts.append(node.text or "")
            elif node.tag == f"{namespace}tab":
                parts.append("\t")
        value = "".join(parts).strip()
        if value:
            paragraphs.append(value)
    return "\n".join(paragraphs)


def extract_pdf_research_assets(page, page_number, page_text, table_number_start=1, ocr_figure=False):
    """Return a text appendix for detected tables, figure captions, and OCR labels."""
    blocks = []
    table_number = table_number_start
    captions = list(re.finditer(r"(?im)^\s*(?:table|tab\.)\s*\d+\s*[:.\-]?[^\n]{0,240}", page_text))
    figure_captions = list(re.finditer(r"(?im)^\s*(?:figure|fig\.)\s*\d+\s*[:.\-]?[^\n]{0,300}", page_text))

    try:
        finder = page.find_tables()
        for table in getattr(finder, "tables", [])[:5]:
            rows = table.extract() or []
            rows = [[re.sub(r"\s+", " ", str(cell or "")).strip()[:160] for cell in row[:10]] for row in rows[:20]]
            rows = [row for row in rows if any(row)]
            if not rows:
                continue
            caption = ""
            if captions:
                caption_index = min(table_number - table_number_start, len(captions) - 1)
                caption = captions[caption_index].group(0).strip()
            lines = ["\t".join(row) for row in rows]
            blocks.append((f"[Table {table_number} on PDF page {page_number}] {caption}\n" + "\n".join(lines))[:6500])
            table_number += 1
            if sum(len(block) for block in blocks) >= 12000:
                break
    except (AttributeError, RuntimeError, ValueError, TypeError):
        # PyMuPDF table detection is best-effort; ordinary text extraction remains available.
        pass

    for index, caption in enumerate(figure_captions[:8], 1):
        blocks.append(f"[Figure {index} caption on PDF page {page_number}] {caption.group(0).strip()}")

    if ocr_figure and figure_captions:
        try:
            text_page = page.get_textpage_ocr(
                language=os.getenv("OCR_LANGUAGE", "eng"), dpi=200, full=False,
            )
            ocr_text = normalize_extracted_text(page.get_text("text", textpage=text_page)).strip()
            if ocr_text and ocr_text.casefold() != page_text.casefold():
                blocks.append(f"[Figure and scanned labels OCR on PDF page {page_number}]\n{ocr_text[:5000]}")
        except Exception:
            pass

    return "\n\n".join(blocks), table_number


def _semantic_paper_description(paper):
    analysis = paper.analysis_result or {}
    overview = analysis.get("paper_overview") or {}
    summary = analysis.get("summary") or []
    if not isinstance(summary, list):
        summary = [summary]
    method = analysis.get("methodology") or []
    if not isinstance(method, list):
        method = [method]
    result = analysis.get("results") or []
    if not isinstance(result, list):
        result = [result]
    parts = [f"Title: {analysis.get('title') or paper.title}", f"Topic: {overview.get('topic', '')}"]
    if summary:
        parts.append("Summary: " + "; ".join(str(value) for value in summary[:5]))
    elif paper.extracted_text:
        parts.append("Extracted paper text: " + re.sub(r"\[Page\s+\d+\]", "", paper.extracted_text[:1800]))
    if method:
        parts.append("Methods: " + "; ".join(str(value) for value in method[:3]))
    if result:
        parts.append("Results: " + "; ".join(str(value) for value in result[:3]))
    return "\n".join(parts)[:2800]

@api_view(["GET", "POST"])
@parser_classes([MultiPartParser, FormParser])
@permission_classes([IsAuthenticated])
def paper_list(request):
    if request.method == "GET":
        papers = Paper.objects.filter(owner=request.user).annotate(
            list_has_analysis=Case(
                When(analysis_result__isnull=False, then=Value(True)),
                default=Value(False), output_field=BooleanField(),
            ),
            list_confidence_score=F("analysis_result__confidence__score"),
        ).defer("extracted_text", "analysis_result").order_by("-uploaded_at")
        return Response(PaperListSerializer(papers, many=True, context={"request": request}).data)
    uploaded_file = request.FILES.get("pdf") or request.FILES.get("document")
    uploaded_today = Paper.objects.filter(owner=request.user, uploaded_at__date=timezone.localdate()).count()
    if uploaded_today >= DAILY_PAPER_UPLOAD_LIMIT:
        return Response({"error": f"Daily PDF upload limit reached ({DAILY_PAPER_UPLOAD_LIMIT} per day).", "used": uploaded_today, "limit": DAILY_PAPER_UPLOAD_LIMIT}, status=429)
    if not uploaded_file:
        return Response({"error": "Please upload a PDF file."}, status=400)
    extension = os.path.splitext(uploaded_file.name)[1].lower()
    if extension not in {".pdf", ".docx"}:
        return Response({"error": "Only PDF and Word DOCX files are allowed. Images and legacy .doc files are not accepted."}, status=400)
    if uploaded_file.size > 20 * 1024 * 1024:
        return Response({"error": "PDF and DOCX files must be 20 MB or smaller."}, status=413)
    try:
        uploaded_file.seek(0)
        pdf_bytes = uploaded_file.read()
        ocr_unavailable = False
        if extension == ".docx":
            if not pdf_bytes.startswith(b"PK"):
                return Response({"error": "The uploaded DOCX file is invalid."}, status=400)
            extracted_text = extract_docx_text(pdf_bytes)
            if not extracted_text.strip():
                return Response({"error": "No readable text found in this DOCX file."}, status=400)
            extracted_text = f"[Page 1]\n{extracted_text}"
        else:
            if not pdf_bytes.startswith(b"%PDF-"):
                return Response({"error": "The uploaded file is not a valid PDF."}, status=400)
            with fitz.open(stream=pdf_bytes, filetype="pdf") as document:
                if document.page_count == 0:
                    return Response({"error": "The PDF has no pages."}, status=400)
                if document.page_count > 500:
                    return Response({"error": "PDFs are limited to 500 pages to protect processing capacity."}, status=413)
                page_text = []
                ocr_attempted = False
                ocr_unavailable = False
                table_number = 1
                figure_ocr_pages = 0
                try:
                    max_figure_ocr_pages = max(0, min(20, int(os.getenv("OCR_FIGURE_MAX_PAGES", "10"))))
                except ValueError:
                    max_figure_ocr_pages = 10
                for n, page in enumerate(document, 1):
                    text = page.get_text().strip()
                    if len(text) < 30:
                        ocr_attempted = True
                        try:
                            text = page.get_textpage_ocr(language=os.getenv("OCR_LANGUAGE", "eng"), dpi=200, full=True).extractText().strip()
                        except Exception:
                            ocr_unavailable = True
                            text = ""
                    text = normalize_extracted_text(text)
                    has_captioned_figure = bool(re.search(r"(?im)^\s*(?:figure|fig\.)\s*\d+", text))
                    has_page_images = bool(page.get_images(full=True))
                    run_figure_ocr = has_captioned_figure and has_page_images and figure_ocr_pages < max_figure_ocr_pages
                    if run_figure_ocr:
                        figure_ocr_pages += 1
                    assets, table_number = extract_pdf_research_assets(
                        page, n, text, table_number_start=table_number, ocr_figure=run_figure_ocr,
                    )
                    page_content = f"[Page {n}]\n{text}"
                    if assets:
                        page_content += f"\n\n{assets}"
                    page_text.append(page_content)
                extracted_text = "\n".join(page_text).strip()
                if not re.sub(r"\[Page\s+\d+\]", "", extracted_text).strip():
                    if ocr_unavailable:
                        raise ValueError("This scanned PDF needs Tesseract OCR. Install Tesseract, put it on PATH, and retry the upload.")
                    message = "OCR found no readable text in this PDF." if ocr_attempted else "No readable text found in this PDF."
                    return Response({"error": message}, status=400)
        paper = Paper.objects.create(owner=request.user, title=os.path.splitext(uploaded_file.name)[0], pdf=uploaded_file, extracted_text=extracted_text)
        data = PaperSerializer(paper, context={"request": request}).data
        return Response({"message": "PDF uploaded and text extracted successfully.", "paper": data, "extracted_characters": len(extracted_text), "ocr_warning": "Some scanned pages were skipped because Tesseract OCR is not available on the server." if ocr_unavailable else None}, status=status.HTTP_201_CREATED)
    except ValueError as exc:
        return Response({"error": str(exc)}, status=400)
    except Exception:
        return Response({"error": "Could not process this PDF."}, status=400)

@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def paper_detail(request, paper_id):
    paper = get_object_or_404(Paper, id=paper_id, owner=request.user)
    if request.method == "DELETE":
        paper.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method == "PATCH":
        if "tags" in request.data:
            tags = request.data.get("tags")
            if not isinstance(tags, list) or len(tags) > 30 or any(not isinstance(tag, str) or not tag.strip() or len(tag.strip()) > 40 for tag in tags):
                return Response({"error": "Tags must be up to 30 non-empty values (40 characters max each)."}, status=400)
            paper.tags = list(dict.fromkeys(tag.strip() for tag in tags))
            paper.save(update_fields=["tags"])
            return Response(PaperSerializer(paper, context={"request": request}).data)
        title = str(request.data.get("title", "")).strip()
        if not title or len(title) > 255:
            return Response({"error": "Title must be 1–255 characters."}, status=400)
        paper.title = title
        paper.save(update_fields=["title"])
    if request.method == "GET":
        return Response(PaperDetailSerializer(paper, context={"request": request}).data)
    return Response(PaperSerializer(paper, context={"request": request}).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def paper_analysis(request, paper_id):
    paper = get_object_or_404(
        Paper.objects.only("id", "owner_id", "analysis_result"),
        id=paper_id, owner=request.user,
    )
    if not paper.analysis_result:
        return Response({"error": "This paper has not been analyzed yet."}, status=404)
    return Response({"analysis": paper.analysis_result})

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def paper_file(request, paper_id):
    paper = get_object_or_404(Paper, id=paper_id, owner=request.user)
    if os.path.splitext(paper.pdf.name)[1].lower() != ".pdf":
        return Response({"error": "This document is not a PDF preview."}, status=415)
    if not paper.pdf:
        return Response({"error": "PDF file is unavailable."}, status=404)
    response = FileResponse(paper.pdf.open("rb"), content_type="application/pdf")
    response["Content-Disposition"] = f'inline; filename="{os.path.basename(paper.pdf.name)}"'
    return response


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def semantic_paper_search(request):
    query = str(request.data.get("query", "")).strip()
    if len(query) < 3:
        return Response({"error": "Enter at least 3 characters describing the research you want to find."}, status=400)
    if len(query) > 1000:
        return Response({"error": "Search description must be 1,000 characters or less."}, status=400)
    owned_papers = Paper.objects.filter(owner=request.user).order_by("-uploaded_at")
    library_size = owned_papers.count()
    papers = list(owned_papers[:30])
    if not papers:
        return Response({"query": query, "matches": [], "searched": 0, "library_size": library_size})
    api_keys = [os.getenv("GROQ_API_KEY_1"), os.getenv("GROQ_API_KEY_2")]
    api_keys = [key.strip() for key in api_keys if key and key.strip()]
    if not api_keys:
        return Response({"error": "AI paper search is not configured. Add a Groq API key."}, status=503)

    library_context = [{"paper_id": paper.id, "description": _semantic_paper_description(paper)[:1150]} for paper in papers]
    messages = [
        {"role": "system", "content": (
            "You are a semantic research-paper retrieval assistant. Match the user's research need to papers by topic, "
            "research question, methods, data, and findings, even when wording differs. Use only the supplied library "
            "descriptions. Return JSON with matches, an array of at most 8 objects containing paper_id, relevance "
            "(integer 0-100), reason, and evidence (array of claim, quote, page integer or null). Do not invent "
            "paper facts, quotes, or page numbers. Return an empty array when nothing is relevant."
        )},
        {"role": "user", "content": f"RESEARCH NEED:\n{query}\n\nMY PAPER LIBRARY:\n{json.dumps(library_context, ensure_ascii=False)}"},
    ]
    errors = []
    for index, key in enumerate(api_keys, 1):
        try:
            response = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={"model": "openai/gpt-oss-120b", "temperature": 0.1, "max_completion_tokens": 1800,
                      "reasoning_effort": "low", "reasoning_format": "hidden", "response_format": {"type": "json_object"}, "messages": messages},
                timeout=90,
            )
            if not response.ok:
                errors.append(f"Key {index}: HTTP {response.status_code}")
                continue
            result = json.loads(response.json()["choices"][0]["message"]["content"])
            owned_papers = {paper.id: paper for paper in papers}
            source_matches = {}
            matches = []
            for item in result.get("matches", [])[:8]:
                if not isinstance(item, dict):
                    continue
                try:
                    paper_id = int(item.get("paper_id"))
                except (TypeError, ValueError):
                    continue
                paper = owned_papers.get(paper_id)
                if not paper:
                    continue
                analysis = paper.analysis_result or {}
                overview = analysis.get("paper_overview") or {}
                pages = source_matches.setdefault(paper_id, {
                    int(number): re.sub(r"\s+", " ", body).strip().casefold()
                    for number, body in re.findall(r"\[Page\s+(\d+)\]\s*([\s\S]*?)(?=\n\[Page\s+\d+\]|\Z)", paper.extracted_text)
                })
                evidence = []
                for cited in item.get("evidence", [])[:3]:
                    if not isinstance(cited, dict):
                        continue
                    quote = re.sub(r"\s+", " ", str(cited.get("quote", ""))).strip()
                    page = cited.get("page")
                    normalized = quote.casefold()
                    source = pages.get(page, "") if isinstance(page, int) else " ".join(pages.values())
                    evidence.append({"claim": str(cited.get("claim", "")), "quote": quote, "page": page,
                                     "verified": bool(quote) and normalized in source})
                try:
                    relevance = max(0, min(100, int(item.get("relevance", 0))))
                except (TypeError, ValueError):
                    relevance = 0
                matches.append({"id": paper.id, "title": analysis.get("title") or paper.title,
                                "topic": overview.get("topic", ""), "relevance": relevance,
                                "reason": str(item.get("reason", ""))[:800], "evidence": evidence,
                                "file_type": paper.pdf.name.rsplit(".", 1)[-1].lower() if paper.pdf and "." in paper.pdf.name else "",
                                "uploaded_at": paper.uploaded_at})
            matches.sort(key=lambda item: item["relevance"], reverse=True)
            return Response({"query": query, "matches": matches, "searched": len(papers), "library_size": library_size})
        except (requests.RequestException, KeyError, IndexError, json.JSONDecodeError, TypeError, ValueError) as exc:
            logger.warning("Semantic paper search failed on attempt %s: %s", index, exc)
            errors.append(f"Key {index}: {exc}")
    return Response({"error": "Could not search your paper library right now.", "details": " | ".join(errors)}, status=502)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def paper_annotations(request, paper_id):
    paper = get_object_or_404(Paper, id=paper_id, owner=request.user)
    if request.method == "GET":
        notes = PaperNote.objects.filter(owner=request.user, paper=paper)
        highlights = PaperHighlight.objects.filter(owner=request.user, paper=paper)
        return Response({"notes": [{"id": n.id, "content": n.content, "page": n.page, "updated_at": n.updated_at} for n in notes], "highlights": [{"id": h.id, "quote": h.quote, "page": h.page, "color": h.color, "created_at": h.created_at} for h in highlights]})
    kind = request.data.get("kind")
    page = request.data.get("page")
    if page is not None and (not str(page).isdigit() or int(page) < 1):
        return Response({"error": "Page must be a positive integer."}, status=400)
    if kind == "note":
        content = str(request.data.get("content", "")).strip()
        if not content or len(content) > 10000:
            return Response({"error": "Note must contain 1 to 10,000 characters."}, status=400)
        item = PaperNote.objects.create(owner=request.user, paper=paper, content=content, page=page)
        return Response({"id": item.id, "kind": kind, "content": item.content, "page": item.page}, status=201)
    if kind == "highlight":
        quote = str(request.data.get("quote", "")).strip()
        color = str(request.data.get("color", "yellow"))
        if not quote or len(quote) > 5000:
            return Response({"error": "Highlight must contain 1 to 5,000 characters."}, status=400)
        if color not in {"yellow", "green", "blue", "pink"}:
            return Response({"error": "Choose a supported highlight color."}, status=400)
        item = PaperHighlight.objects.create(owner=request.user, paper=paper, quote=quote, page=page, color=color)
        return Response({"id": item.id, "kind": kind, "quote": item.quote, "page": item.page, "color": item.color}, status=201)
    return Response({"error": "kind must be 'note' or 'highlight'."}, status=400)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def annotation_detail(request, paper_id, kind, annotation_id):
    paper = get_object_or_404(Paper, id=paper_id, owner=request.user)
    model = PaperNote if kind == "note" else PaperHighlight if kind == "highlight" else None
    if model is None:
        return Response({"error": "Unknown annotation type."}, status=404)
    item = get_object_or_404(model, id=annotation_id, paper=paper, owner=request.user)
    if request.method == "PATCH":
        if kind != "note":
            return Response({"error": "Highlights cannot be edited."}, status=400)
        content = str(request.data.get("content", "")).strip()
        if not content or len(content) > 10000:
            return Response({"error": "Note must contain 1 to 10,000 characters."}, status=400)
        item.content = content
        if "page" in request.data:
            page = request.data.get("page")
            if page is not None and (not str(page).isdigit() or int(page) < 1):
                return Response({"error": "Page must be a positive integer."}, status=400)
            item.page = page
        item.save(update_fields=["content", "page", "updated_at"])
        return Response({"id": item.id, "kind": kind, "content": item.content, "page": item.page})
    item.delete()
    return Response(status=204)
