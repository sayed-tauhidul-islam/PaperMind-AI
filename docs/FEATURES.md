# PaperMind AI features

## Research library

- Upload PDF or Word DOCX files up to 20 MB. PDF text uses PyMuPDF and Tesseract OCR when installed; DOCX text is extracted from its document XML. Images and legacy `.doc` files are rejected.
- Search papers by title and tags. Add up to 30 tags per paper.
- Store page-linked notes and text highlights on each paper.
- Export metadata-based APA-style, BibTeX, or RIS citations.

## Analysis and review

- Require email verification before a newly registered account can sign in. Configure SMTP on the backend for production; development writes email messages to the backend console.

- Generate and cache structured analysis with evidence and page references.
- Ask paper-grounded questions. Chat retrieves short passages across pages and marks evidence quotes that match source text.
- Check saved analysis evidence for exact matches in extracted PDF text. A non-match means unverified, not necessarily false; paraphrases are not marked verified.
- Compare two to four of your papers for methods, datasets, findings, similarities, and differences.
- Export analysis as Markdown and read it with browser English text-to-speech.

## External requirements and limits

- Scanned PDF OCR needs Tesseract OCR on the backend host's `PATH`; set `OCR_LANGUAGE` and install matching language data if needed.
- Analysis, chat, and comparison use Groq and need an API key and network access.
- Citations use metadata detected in the PDF or saved analysis. Check them for missing authors, venue, year, and DOI.
- Evidence verification is a literal extracted-text check. It cannot validate scientific truth and may not recognize paraphrased support.
