import logging
import fitz

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import permission_classes

from papers.models import Paper
from .services.paper_analyzer import analyze_paper, _normalize_analysis

logger = logging.getLogger(__name__)


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
