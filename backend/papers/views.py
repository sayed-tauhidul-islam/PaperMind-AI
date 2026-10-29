import os
import re
import fitz
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from .models import Paper
from .serializers import PaperSerializer, PaperDetailSerializer

DAILY_PAPER_UPLOAD_LIMIT = 10


def normalize_extracted_text(text):
    """Join words split by PDF line-end hyphenation (for example, ``ma-\nchines``)."""
    return re.sub(r"(?<=[A-Za-z])-\s*\n\s*(?=[a-z])", "", text)

@api_view(["GET", "POST"])
@parser_classes([MultiPartParser, FormParser])
@permission_classes([IsAuthenticated])
def paper_list(request):
    if request.method == "GET":
        papers = Paper.objects.filter(owner=request.user).order_by("-uploaded_at")
        return Response(PaperSerializer(papers, many=True, context={"request": request}).data)
    uploaded_file = request.FILES.get("pdf")
    uploaded_today = Paper.objects.filter(owner=request.user, uploaded_at__date=timezone.localdate()).count()
    if uploaded_today >= DAILY_PAPER_UPLOAD_LIMIT:
        return Response({"error": f"Daily PDF upload limit reached ({DAILY_PAPER_UPLOAD_LIMIT} per day).", "used": uploaded_today, "limit": DAILY_PAPER_UPLOAD_LIMIT}, status=429)
    if not uploaded_file:
        return Response({"error": "Please upload a PDF file."}, status=400)
    if not uploaded_file.name.lower().endswith(".pdf"):
        return Response({"error": "Only PDF files are allowed."}, status=400)
    if uploaded_file.size > 20 * 1024 * 1024:
        return Response({"error": "PDF size must be 20 MB or less."}, status=400)
    try:
        uploaded_file.seek(0)
        pdf_bytes = uploaded_file.read()
        if not pdf_bytes.startswith(b"%PDF-"):
            return Response({"error": "The uploaded file is not a valid PDF."}, status=400)
        with fitz.open(stream=pdf_bytes, filetype="pdf") as document:
            if document.page_count == 0:
                return Response({"error": "The PDF has no pages."}, status=400)
            extracted_text = "\n".join(
                f"[Page {n}]\n{normalize_extracted_text(page.get_text())}"
                for n, page in enumerate(document, 1)
            ).strip()
            if not extracted_text:
                return Response({"error": "No readable text found. Scanned PDF OCR is not implemented yet."}, status=400)
            paper = Paper.objects.create(owner=request.user, title=os.path.splitext(uploaded_file.name)[0], pdf=uploaded_file, extracted_text=extracted_text)
        data = PaperSerializer(paper, context={"request": request}).data
        return Response({"message": "PDF uploaded and text extracted successfully.", "paper": data, "extracted_characters": len(extracted_text)}, status=status.HTTP_201_CREATED)
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
def paper_file(request, paper_id):
    paper = get_object_or_404(Paper, id=paper_id, owner=request.user)
    if not paper.pdf:
        return Response({"error": "PDF file is unavailable."}, status=404)
    response = FileResponse(paper.pdf.open("rb"), content_type="application/pdf")
    response["Content-Disposition"] = f'inline; filename="{os.path.basename(paper.pdf.name)}"'
    return response
