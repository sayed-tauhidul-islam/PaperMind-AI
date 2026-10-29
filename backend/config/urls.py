from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse


def health_check(request):
    return JsonResponse({
        "success": True,
        "application": "PaperMind AI",
        "status": "running",
    })


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health_check, name="health-check"),
    path("api/auth/", include("common.urls")),
    path("api/papers/", include("papers.urls")),
    path("api/analyzer/", include("analyzer.urls")),
    path("api/chat/", include("chat.urls")),
]

