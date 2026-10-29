from django.urls import path
from .views import analyzer_status, analyze_existing_paper

urlpatterns = [
    path("", analyzer_status, name="analyzer-status"),
    path(
        "<int:paper_id>/analyze/",
        analyze_existing_paper,
        name="analyze-paper",
    ),
]