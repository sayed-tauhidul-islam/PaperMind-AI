from rest_framework import serializers
from .models import Paper


class PaperSerializer(serializers.ModelSerializer):
    extracted_characters = serializers.SerializerMethodField()
    page_count = serializers.SerializerMethodField()

    def get_extracted_characters(self, obj):
        return len(obj.extracted_text or "")

    def get_page_count(self, obj):
        return (obj.extracted_text or "").count("[Page ")

    class Meta:
        model = Paper
        fields = [
            "id",
            "title",
            "extracted_characters",
            "page_count",
            "uploaded_at",
            "analysis_result",
        ]
        read_only_fields = ["extracted_characters", "page_count", "uploaded_at", "analysis_result"]


class PaperDetailSerializer(PaperSerializer):
    class Meta(PaperSerializer.Meta):
        fields = PaperSerializer.Meta.fields + ["extracted_text"]
        read_only_fields = PaperSerializer.Meta.read_only_fields + ["extracted_text"]
