import json
import zipfile
from io import BytesIO
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from papers.models import Paper
from analyzer.services.paper_analyzer import _normalize_analysis


class ResearchWorkspaceApiTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username="researcher", password="test-password")
        self.other = user_model.objects.create_user(username="other", password="test-password")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.paper = Paper.objects.create(
            owner=self.user,
            title="Evidence paper",
            pdf="papers/evidence.pdf",
            extracted_text="[Page 1]\nWe evaluated YOLO using the Leather-Defect dataset. The sample contained 120 images. mAP was 91%.",
        )
        self.other_paper = Paper.objects.create(
            owner=self.other,
            title="Private paper",
            pdf="papers/private.pdf",
            extracted_text="[Page 1]\nPrivate content.",
        )

    def test_workspace_persists_project_data_for_authenticated_owner(self):
        response = self.client.patch("/api/analyzer/research-workspace/", {
            "topic": "Surface defect detection", "research_question": "Which model performs best?",
            "selected_paper_ids": [self.paper.id], "drafts": [{"text": "Draft paragraph"}],
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["topic"], "Surface defect detection")
        self.assertEqual(response.data["drafts"][0]["text"], "Draft paragraph")

    def test_paper_library_is_compact_and_full_analysis_loads_on_demand(self):
        full_report = {
            "title": "Evidence paper", "confidence": {"score": 92},
            "summary": ["Long report text"], "evidence": [{"claim": "claim", "support": "long source quote"}],
        }
        self.paper.analysis_result = full_report
        self.paper.save(update_fields=["analysis_result"])

        listing = self.client.get("/api/papers/")
        self.assertEqual(listing.status_code, 200)
        item = next(value for value in listing.data if value["id"] == self.paper.id)
        self.assertEqual(item["analysis_result"], {"confidence": {"score": 92}})
        self.assertNotIn("extracted_text", item)
        self.assertNotIn("evidence", item["analysis_result"])

        detail = self.client.get(f"/api/papers/{self.paper.id}/analysis/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["analysis"], full_report)
        self.assertEqual(self.client.get(f"/api/papers/{self.other_paper.id}/analysis/").status_code, 404)

    def test_analysis_confidence_records_verified_source_coverage(self):
        source = "[Page 1]\nThe Leather-Defect dataset contains 120 sample images."
        analysis = _normalize_analysis({
            "paper_overview": {"topic": "Leather defect detection", "authors": ["A Researcher"],
                               "paper_year": "2024", "publication_type": "Conference paper",
                               "dataset_mentioned": "Yes", "dataset_type": "Image dataset",
                               "dataset_accessibility": "Not stated", "models": []},
            "research_objective": ["Detect surface defects"], "research_problem": ["Surface defects"],
            "methodology": ["Image classification"], "results": ["120 sample images"],
            "problems_solved": [], "proposed_solution": [], "key_findings": ["Data size stated"],
            "conclusion": ["See source"], "limitations": [], "future_research": [], "summary": ["Study"],
            "evidence": [{"claim": "The dataset contains 120 images", "support": "The Leather-Defect dataset contains 120 sample images.", "page": 1}],
            "confidence": {"score": 99},
        }, source)
        self.assertTrue(analysis["evidence"][0]["verified"])
        self.assertEqual(analysis["confidence"]["verified_evidence"], 1)
        self.assertEqual(analysis["confidence"]["evidence_match_rate"], 100)

    def test_docx_export_returns_a_word_package(self):
        response = self.client.post("/api/analyzer/research-export/docx/", {
            "title": "Evidence matrix", "content": {"dataset": "Leather-Defect", "result": "91% mAP"},
        }, format="json")
        self.assertEqual(response.status_code, 200)
        with zipfile.ZipFile(BytesIO(response.content)) as archive:
            self.assertIn("word/document.xml", archive.namelist())
            self.assertIn("Leather-Defect", archive.read("word/document.xml").decode())

    @patch("analyzer.views.requests.post")
    @patch.dict("os.environ", {"GROQ_API_KEY_1": "unit-test-key"})
    def test_matrix_tool_returns_quote_verification(self, post):
        payload = {"rows": [{"dimension": "Dataset", "values": [{"paper_id": self.paper.id, "value": "Leather-Defect", "quote": "Leather-Defect dataset", "page": 1}]}]}
        response_mock = Mock(ok=True)
        response_mock.json.return_value = {"choices": [{"message": {"content": json.dumps(payload)}}]}
        post.return_value = response_mock
        response = self.client.post("/api/analyzer/research-tools/", {"action": "matrix", "paper_ids": [self.paper.id]}, format="json")
        self.assertEqual(response.status_code, 200)
        evidence = response.data["result"]["rows"][0]["values"][0]
        self.assertTrue(evidence["verified"])

    @patch("analyzer.views.requests.get")
    def test_reference_verification_reports_crossref_metadata(self, get):
        mock_response = Mock(ok=True)
        mock_response.json.return_value = {"message": {"title": ["Evidence paper"], "author": [{"given": "A", "family": "Researcher"}], "container-title": ["Journal of Tests"], "published": {"date-parts": [[2024]]}, "URL": "https://doi.org/10.1234/example"}}
        get.return_value = mock_response
        self.paper.extracted_text += "\nReferences\nResearcher A. Evidence paper. Journal of Tests. 2024. doi:10.1234/example"
        self.paper.save(update_fields=["extracted_text"])
        response = self.client.post(f"/api/analyzer/{self.paper.id}/references/verify/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        reference = response.data["references"][0]
        self.assertEqual(reference["title"], "Evidence paper")
        self.assertTrue(reference["field_matches"]["title"])

    @patch("analyzer.views.requests.get")
    def test_citation_graph_uses_openalex_reference_and_citing_links(self, get):
        work = Mock(ok=True)
        work.json.return_value = {"id": "https://openalex.org/W1", "referenced_works": [], "cited_by_api_url": "https://api.openalex.org/works?filter=cites:W1"}
        citing = Mock(ok=True)
        citing.json.return_value = {"results": [{"title": "A later paper", "publication_year": 2025, "doi": "https://doi.org/10.1234/later", "id": "https://openalex.org/W2"}]}
        get.side_effect = [work, citing]
        self.paper.extracted_text += "\nDOI: 10.1234/example"
        self.paper.save(update_fields=["extracted_text"])
        response = self.client.get(f"/api/analyzer/{self.paper.id}/citation-graph/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["cited_by"][0]["title"], "A later paper")

