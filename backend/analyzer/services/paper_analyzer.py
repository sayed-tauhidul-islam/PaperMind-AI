import os
import json
import logging
import re
import requests

logger = logging.getLogger(__name__)

API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "openai/gpt-oss-120b"


# Keep the full request (prompt + completion allowance) comfortably below
# Groq's 8k TPM on-demand limit. Long PDFs are sampled across their pages.
CONTEXT_LIMIT = 18000
METADATA_TERMS = re.compile(
    r"author|published|publication|journal|conference|proceedings|review article|"
    r"dataset|data set|data availability|supplementary|github|repository|"
    r"model|architecture|benchmark|experiment|methodology|materials and methods|"
    r"result|accuracy|precision|recall|f1|mAP|mean average precision|evaluation|"
    r"performance|proposed|contribution|solv(e|ed|ing)|problem",
    re.IGNORECASE,
)


def _select_context(text, limit=CONTEXT_LIMIT):
    """Keep front matter and relevant passages from across the full PDF."""
    text = re.sub(r"(?<=[A-Za-z])-\s*\n\s*(?=[a-z])", "", text)
    pages = re.findall(r"\[Page\s+(\d+)\]\s*([\s\S]*?)(?=\n\[Page\s+\d+\]|\Z)", text)
    if not pages:
        return text[:limit]

    excerpts, seen, size = [], set(), 0

    def add(number, value):
        nonlocal size
        value = value.strip()
        if not value or value in seen or size >= limit:
            return
        value = value[: max(0, limit - size)]
        excerpts.append(f"[Page {number}]\n{value}")
        seen.add(value)
        size += len(value)

    # The title, author block, abstract, and publication clues are usually here.
    for number, body in pages:
        if int(number) <= 3:
            add(number, body[:2800])

    # Include metadata and research-method passages wherever they occur.
    for number, body in pages:
        if size >= limit:
            break
        for match in list(METADATA_TERMS.finditer(body))[:2]:
            add(number, body[max(0, match.start() - 550):match.end() + 900])
            if size >= limit:
                break

    for number, body in reversed(pages[-3:]):
        if size >= limit:
            break
        add(number, body[-2500:])
    return "\n\n".join(excerpts)


def _is_missing(value):
    return value is None or value == [] or value == "" or "not stated" in str(value).lower() or "not clearly stated" in str(value).lower()


def _paper_sentences(source_text):
    """Build page-aware sentences for deterministic recovery of stated results."""
    text = re.sub(r"(?<=[A-Za-z])-\s*\n\s*(?=[a-z])", "", source_text)
    pages = re.findall(r"\[Page\s+(\d+)\]\s*([\s\S]*?)(?=\n\[Page\s+\d+\]|\Z)", text)
    sentences = []
    for page, body in pages:
        body = re.sub(r"\ufffd+", "", body)
        body = re.sub(r"\s+", " ", body).strip()
        body = re.sub(r"(?:VOLUME\s+\d+|\d{5,})\s*$", "", body, flags=re.IGNORECASE)
        for sentence in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9(])", body):
            sentence = sentence.strip(" -•\t")
            if len(sentence) >= 45:
                sentences.append((int(page), sentence))
    return sentences


def _extract_paper_results(source_text):
    metric = re.compile(r"\b(?:accuracy|precision|recall|mAP(?:@?\d*)?|mean average precision|F1(?:-score)?|FPS|frames per second|AP)\b", re.IGNORECASE)
    number = re.compile(r"\d+(?:\.\d+)?")
    candidates = []
    for page, sentence in _paper_sentences(source_text):
        if metric.search(sentence) and number.search(sentence):
            cleaned = sentence[:700]
            if cleaned not in [item[1] for item in candidates]:
                candidates.append((page, cleaned))
    return [f"{sentence} (PDF page {page})" for page, sentence in candidates[:14]]


def _extract_proposed_solutions(source_text):
    proposal = re.compile(
        r"\b(?:propos(?:e|ed|es|al)|in response to|by adding|we introduce|we develop|"
        r"solution|future efforts will|improvements?\s+(?:to|in)\s+(?:the\s+)?(?:YOLO|model|network|approach))\b",
        re.IGNORECASE,
    )
    candidates = []
    for page, sentence in _paper_sentences(source_text):
        if proposal.search(sentence) and re.search(r"\b(?:model|attention|network|dataset|detection|method|approach|system|architecture|defect)\b", sentence, re.IGNORECASE):
            cleaned = sentence[:700]
            if cleaned not in [item[1] for item in candidates]:
                candidates.append((page, cleaned))
    # Prioritize the authors' own discussion/conclusion over literature review.
    candidates.sort(key=lambda item: (item[0] < 10, item[0]))
    return [f"{sentence} (PDF page {page})" for page, sentence in candidates[:8]]


def _extract_problems_solved(source_text):
    candidates = []
    for page, sentence in _paper_sentences(source_text):
        if page < 8 or not re.search(r"\b(?:improv|reduc|overcom|address|challeng|missed detection|false negative|performance)\w*\b", sentence, re.IGNORECASE):
            continue
        if not re.search(r"\d+(?:\.\d+)?\s*%|significant|substantial|better|higher|lower|effective|improv", sentence, re.IGNORECASE):
            continue
        cleaned = sentence[:700]
        if cleaned not in [item[1] for item in candidates]:
            candidates.append((page, cleaned))
    return [f"{sentence} (PDF page {page})" for page, sentence in candidates[:10]]


def _extract_model_accuracies(source_text):
    model_pattern = re.compile(r"\bYOLOv[5-8](?:[nslmx])?\b", re.IGNORECASE)
    accuracy_pattern = re.compile(r"\baccuracy\b[^.]{0,180}?\b(?:of\s+)?(\d+(?:\.\d+)?\s*%)", re.IGNORECASE)
    accuracies = {}
    for _, sentence in _paper_sentences(source_text):
        names = list(dict.fromkeys(match.group(0) for match in model_pattern.finditer(sentence)))
        reported_values = list(accuracy_pattern.finditer(sentence))
        # Only assign a value when the sentence unambiguously ties one model to it.
        if len(names) == 1 and reported_values:
            accuracies.setdefault(names[0], [])
            for result in reported_values:
                nearby = sentence[max(0, result.start() - 500):min(len(sentence), result.end() + 180)]
                class_matches = list(re.finditer(
                    r"[\"'“”]([A-Za-z][A-Za-z -]{1,28})[\"'“”]\s*(?:defect|are|is)",
                    nearby,
                    re.IGNORECASE,
                ))
                if class_matches:
                    subject = class_matches[-1].group(1).strip().lower()
                else:
                    challenging = re.search(r"\b([A-Za-z-]+)\s+are challenging defect", nearby, re.IGNORECASE)
                    dataset = re.search(r"(?:on|for)\s+(?:the\s+)?([A-Za-z-]+)\s+defect", nearby, re.IGNORECASE)
                    subject = (challenging or dataset).group(1).lower() if challenging or dataset else "reported task"
                value = f"{result.group(1)} accuracy ({subject})"
                if value not in accuracies[names[0]]:
                    accuracies[names[0]].append(value)
    return {name: "; ".join(values) for name, values in accuracies.items()}


def _normalize_analysis(analysis, source_text, pdf_metadata=None):
    overview = analysis.get("paper_overview")
    if not isinstance(overview, dict):
        overview = {}
    for field in ("authors", "models"):
        value = overview.get(field, [])
        overview[field] = [] if value is None else value if isinstance(value, list) else [value]

    models = []
    for model in overview["models"]:
        if isinstance(model, str):
            models.append({"name": model, "explanation": "Named in the paper.", "accuracy": "Not declared in the paper."})
        elif isinstance(model, dict) and model.get("name"):
            models.append({
                "name": str(model["name"]),
                "explanation": str(model.get("explanation") or "Named in the paper."),
                "accuracy": str(model.get("accuracy") or "Not declared in the paper."),
            })
    overview["models"] = models

    for model_name, accuracy in _extract_model_accuracies(source_text).items():
        existing = next((item for item in models if item["name"].lower() == model_name.lower()), None)
        if existing:
            if _is_missing(existing.get("accuracy")) or "not declared" in existing.get("accuracy", "").lower():
                existing["accuracy"] = accuracy
        else:
            models.append({
                "name": model_name,
                "explanation": "Model variant explicitly linked to a reported accuracy value in the paper.",
                "accuracy": accuracy,
            })

    dataset_found = bool(re.search(
        r"\bdatasets?\b|\bdata sets?\b|data availability|supplementary data",
        source_text,
        re.IGNORECASE,
    ))
    if dataset_found and (
        _is_missing(overview.get("dataset_mentioned"))
        or overview.get("dataset_mentioned") is False
        or str(overview.get("dataset_mentioned", "")).strip().lower() in {"no", "false"}
    ):
        overview["dataset_mentioned"] = "Yes; dataset-related text appears in the paper."

    author = str((pdf_metadata or {}).get("author") or "").strip()
    if author and _is_missing(overview.get("authors")):
        overview["authors"] = [author]
    analysis["paper_overview"] = overview

    for field, fallback in (
        ("results", _extract_paper_results(source_text)),
        ("problems_solved", _extract_problems_solved(source_text)),
        ("proposed_solution", _extract_proposed_solutions(source_text)),
    ):
        if _is_missing(analysis.get(field)) and fallback:
            analysis[field] = fallback

    # The model tended to repeat a default-looking confidence score. Derive a
    # reproducible coverage estimate from the fields it actually identified.
    coverage_fields = [
        overview.get(key) for key in (
            "topic", "authors", "paper_year", "publication_type",
            "dataset_mentioned", "dataset_type", "dataset_accessibility", "models",
        )
    ] + [analysis.get(key) for key in (
        "research_objective", "research_problem", "methodology", "key_findings",
        "conclusion", "limitations", "future_research", "summary", "evidence",
        "results", "problems_solved", "proposed_solution",
    )]
    covered = sum(not _is_missing(value) for value in coverage_fields)
    score = round(covered * 100 / len(coverage_fields))
    confidence = analysis.get("confidence")
    if not isinstance(confidence, dict):
        confidence = {}
    confidence["score"] = score
    confidence["explanation"] = (
        f"{covered} of {len(coverage_fields)} requested metadata and analysis areas "
        "contained paper-supported information. This is a coverage estimate, not a "
        "measure of scientific correctness."
    )
    analysis["confidence"] = confidence
    return analysis


def analyze_paper(text, pdf_metadata=None):
    api_keys = [
        os.getenv("GROQ_API_KEY_1"),
        os.getenv("GROQ_API_KEY_2"),
    ]

    api_keys = [
        key.strip()
        for key in api_keys
        if key and key.strip()
    ]

    if not api_keys:
        raise ValueError(
            "No Groq API keys configured. Check backend/.env."
        )

    prompt = f"""
Analyze the following research paper and return ONLY valid JSON.

Use exactly this structure:
{{
  "title": "Paper title",
  "paper_overview": {{
    "topic": "Main topic",
    "authors": ["Author names or Not stated in the paper"],
    "paper_year": "Publication month and year when stated (for example, March 2024); otherwise year only",
    "publication_type": "Journal article, conference paper, review, or Not stated in the paper",
    "dataset_mentioned": "Yes, No, or Not stated in the paper",
    "dataset_type": "Dataset type or Not stated in the paper",
    "dataset_accessibility": "Availability/access information or Not stated in the paper",
    "models": [{{"name": "Model name", "explanation": "One-line paper-grounded description", "accuracy": "Exact accuracy explicitly reported for this model, or Not declared in the paper."}}]
  }},
  "research_objective": ["Research objective point"],
  "research_problem": ["Research problem point"],
  "methodology": ["Methodology point"],
  "results": ["Paper result, including explicit metric values and which model/dataset they belong to"],
  "problems_solved": ["Problem addressed and the paper-supported result showing how it was addressed"],
  "proposed_solution": ["Solution or contribution proposed by the authors for an identified problem"],
  "key_findings": ["Finding 1", "Finding 2"],
  "conclusion": ["Conclusion point"],
  "limitations": ["Limitation 1", "Limitation 2"],
  "future_research": ["Direction 1", "Direction 2"],
  "summary": ["One concise, paper-grounded summary point; provide 15-30 distinct points when the paper contains enough information"],
  "confidence": {{
    "score": 0,
    "explanation": "Explain how complete and clear the paper's evidence is"
  }},
  "evidence": [
    {{
      "claim": "A finding or claim",
      "support": "Supporting information from the paper",
      "page": null
    }}
  ]
}}

Rules:
- Return valid JSON only. Do not use Markdown code fences.
- Use only information supported by the supplied paper.
- Never invent facts, results, references, or page numbers.
- If information is missing, use "Not clearly stated in the paper".
- For missing lists, return an empty array.
- Confidence score must be an integer from 0 to 100.
- Confidence measures how clearly the paper supports the analysis, not whether the research is objectively correct.
- In evidence, include only claims supported by the supplied text.
- Set page to an integer only when the page number is explicitly identifiable; otherwise use null.
- Write in clear, understandable English.
- Present all analysis sections as concise bullet-ready arrays, not paragraphs.
- The summary must contain at least 15 distinct, useful bullet points for a substantive paper, and may contain 30 or more when justified. Do not pad with repetition; summarize the paper's scope, approach, data, experiments, results, and implications.
- In paper_year, include both publication month and year when explicitly present; do not substitute upload date or PDF creation date.
- In paper_overview, report only metadata that is explicitly present or directly supported by the paper. Do not infer authors, year, venue/type, dataset availability, or model names.
- Include every named model with a one-line explanation. If no model is named, return an empty models array.
- For each model, report an accuracy value only if the paper explicitly reports an accuracy metric for that exact model. Do not treat precision, recall, F1, mAP, or another metric as accuracy. If accuracy is absent or cannot be matched to the model, set accuracy to exactly "Not declared in the paper." Preserve exact numeric values and experimental context.
- In results, report the paper's actual findings and all clearly stated evaluation metrics with their model, dataset, and setting when available. Do not manufacture or compare metrics that are not stated.
- In problems_solved, connect each addressed research problem to the paper's stated approach/result. Do not claim a problem was solved completely if the paper only reports an improvement or evaluation.
- In proposed_solution, describe the authors' proposed method/contribution that addresses the identified problems. If the paper proposes no distinct solution, return an empty array.
- Search all supplied page excerpts for the requested metadata. Front matter may identify authors/year/type; methods and data-availability sections may identify datasets. Do not return "Not stated" if the supplied text contains the answer.

PDF FILE METADATA (may be incomplete; prefer the paper text for publication facts):
{json.dumps(pdf_metadata or {}, ensure_ascii=False)}

RESEARCH PAPER CONTEXT SELECTED FROM THE FULL DOCUMENT:
{_select_context(text)}
"""

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a careful academic research analyst. "
                    "Analyze only the supplied research paper. "
                    "Never fabricate evidence or findings. "
                    "Return only valid JSON."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        "temperature": 0.2,
        # GPT-OSS spends part of its completion budget on reasoning before
        # emitting the JSON body. Keep reasoning light and leave enough room
        # for the full analysis so it does not return truncated/empty JSON.
        "max_completion_tokens": 3000,
        "reasoning_effort": "low",
        "reasoning_format": "hidden",
        "response_format": {"type": "json_object"},
    }

    errors = []

    for index, api_key in enumerate(api_keys, start=1):
        try:
            logger.info("Trying Groq API key %s.", index)

            response = requests.post(
                API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=120,
            )

            if not response.ok:
                error_message = (
                    f"HTTP {response.status_code}: "
                    f"{response.text[:1000]}"
                )

                logger.warning(
                    "Groq API key %s failed: %s",
                    index,
                    error_message,
                )
                errors.append(f"Key {index}: {error_message}")
                continue

            result = response.json()
            content = result["choices"][0]["message"]["content"]

            if not content or not content.strip():
                errors.append(
                    f"Key {index}: The API returned an empty analysis."
                )
                continue

            try:
                analysis = json.loads(content)
            except json.JSONDecodeError as exc:
                logger.warning(
                    "Groq returned invalid JSON for key %s: %s",
                    index,
                    exc,
                )
                errors.append(
                    f"Key {index}: The API returned invalid JSON."
                )
                continue

            required_fields = [
                "title",
                "research_objective",
                "research_problem",
                "methodology",
                "results",
                "problems_solved",
                "proposed_solution",
                "key_findings",
                "conclusion",
                "limitations",
                "future_research",
                "summary",
                "confidence",
                "evidence",
            ]

            missing_fields = [
                field
                for field in required_fields
                if field not in analysis
            ]

            if missing_fields:
                errors.append(
                    f"Key {index}: Missing fields: "
                    + ", ".join(missing_fields)
                )
                continue

            logger.info(
                "Analysis succeeded using key %s.",
                index,
            )
            return _normalize_analysis(analysis, text, pdf_metadata)

        except requests.Timeout:
            message = "Request timed out."
            logger.warning("Groq API key %s: %s", index, message)
            errors.append(f"Key {index}: {message}")

        except requests.RequestException as exc:
            logger.warning(
                "Groq API key %s request failed: %s",
                index,
                str(exc),
            )
            errors.append(f"Key {index}: {str(exc)}")

        except (KeyError, IndexError, TypeError, ValueError) as exc:
            logger.exception(
                "Invalid Groq API response for key %s.",
                index,
            )
            errors.append(
                f"Key {index}: Invalid API response: {str(exc)}"
            )

    raise RuntimeError(
        "All configured Groq API keys failed. "
        + " | ".join(errors)
    )
