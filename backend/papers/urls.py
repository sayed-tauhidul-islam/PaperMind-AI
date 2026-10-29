from django.urls import path
from .views import paper_list, paper_detail, paper_file

urlpatterns = [
    path("", paper_list, name="paper-list"),
    path("<int:paper_id>/", paper_detail, name="paper-detail"),
    path("<int:paper_id>/file/", paper_file, name="paper-file"),
]
