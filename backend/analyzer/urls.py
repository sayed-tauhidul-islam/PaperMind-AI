from django.urls import path
from .views import analyzer_status, analyze_existing_paper, compare_papers, verify_analysis_evidence, research_workspace, research_ai_tool, verify_references, citation_graph, export_research_docx

urlpatterns = [
    path("", analyzer_status, name="analyzer-status"),
    path("compare/", compare_papers, name="compare-papers"),
    path(
        "<int:paper_id>/analyze/",
        analyze_existing_paper,
        name="analyze-paper",
    ),
    path("<int:paper_id>/verify/", verify_analysis_evidence, name="verify-analysis-evidence"),
    path("research-workspace/", research_workspace, name="research-workspace"),
    path("research-tools/", research_ai_tool, name="research-ai-tools"),
    path("research-export/docx/", export_research_docx, name="research-export-docx"),
    path("<int:paper_id>/references/verify/", verify_references, name="verify-references"),
    path("<int:paper_id>/citation-graph/", citation_graph, name="citation-graph"),
]
