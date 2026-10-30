from rest_framework import serializers
from .models import Paper


class PaperSerializer(serializers.ModelSerializer):
    extracted_characters = serializers.SerializerMethodField()
    page_count = serializers.SerializerMethodField()
    file_type = serializers.SerializerMethodField()

    def get_extracted_characters(self, obj):
        return len(obj.extracted_text or "")

    def get_page_count(self, obj):
        return (obj.extracted_text or "").count("[Page ")

    def get_file_type(self, obj):
        return (obj.pdf.name.rsplit(".", 1)[-1].lower() if obj.pdf and "." in obj.pdf.name else "")

    class Meta:
        model = Paper
        fields = [
            "id",
            "title",
            "extracted_characters",
            "page_count",
            "file_type",
            "uploaded_at",
            "analysis_result",
            "tags",
        ]
        read_only_fields = ["extracted_characters", "page_count", "uploaded_at", "analysis_result"]


class PaperDetailSerializer(PaperSerializer):
    class Meta(PaperSerializer.Meta):
        fields = PaperSerializer.Meta.fields + ["extracted_text"]
        read_only_fields = PaperSerializer.Meta.read_only_fields + ["extracted_text"]


class PaperListSerializer(serializers.ModelSerializer):
    """Small library payload; full text and full AI reports load only on demand."""
    file_type = serializers.SerializerMethodField()
    analysis_result = serializers.SerializerMethodField()

    def get_file_type(self, obj):
        return (obj.pdf.name.rsplit(".", 1)[-1].lower() if obj.pdf and "." in obj.pdf.name else "")

    def get_analysis_result(self, obj):
        if hasattr(obj, "list_has_analysis"):
            if not obj.list_has_analysis:
                return None
            return {"confidence": {"score": obj.list_confidence_score}}
        analysis = obj.analysis_result or {}
        if not analysis:
            return None
        return {"confidence": {"score": (analysis.get("confidence") or {}).get("score")}}

    class Meta:
        model = Paper
        fields = ["id", "title", "file_type", "uploaded_at", "analysis_result", "tags"]
        read_only_fields = fields
