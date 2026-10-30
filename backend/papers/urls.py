from django.urls import path
from .views import annotation_detail, paper_analysis, paper_annotations, paper_list, paper_detail, paper_file, semantic_paper_search

urlpatterns = [
    path("", paper_list, name="paper-list"),
    path("<int:paper_id>/analysis/", paper_analysis, name="paper-analysis"),
    path("<int:paper_id>/", paper_detail, name="paper-detail"),
    path("<int:paper_id>/file/", paper_file, name="paper-file"),
    path("semantic-search/", semantic_paper_search, name="semantic-paper-search"),
    path("<int:paper_id>/annotations/", paper_annotations, name="paper-annotations"),
    path("<int:paper_id>/annotations/<str:kind>/<int:annotation_id>/", annotation_detail, name="annotation-detail"),
]
