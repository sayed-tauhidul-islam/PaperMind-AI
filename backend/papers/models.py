from django.db import models
from django.conf import settings
from django.db.models.signals import post_delete
from django.dispatch import receiver


class Paper(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="papers", null=True, blank=True)
    title = models.CharField(max_length=255)
    pdf = models.FileField(upload_to="papers/")
    extracted_text = models.TextField(blank=True)
    analysis_result = models.JSONField(null=True, blank=True)
    tags = models.JSONField(default=list, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class PaperNote(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="paper_notes")
    paper = models.ForeignKey(Paper, on_delete=models.CASCADE, related_name="notes")
    content = models.TextField(max_length=10000)
    page = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]


class PaperHighlight(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="paper_highlights")
    paper = models.ForeignKey(Paper, on_delete=models.CASCADE, related_name="highlights")
    quote = models.TextField(max_length=5000)
    page = models.PositiveIntegerField(null=True, blank=True)
    color = models.CharField(max_length=20, default="yellow")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["page", "created_at"]


class ResearchWorkspace(models.Model):
    owner = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="research_workspace")
    topic = models.CharField(max_length=500, blank=True)
    research_question = models.TextField(max_length=5000, blank=True)
    objectives = models.JSONField(default=list, blank=True)
    selected_paper_ids = models.JSONField(default=list, blank=True)
    drafts = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Research workspace for {self.owner_id}"


@receiver(post_delete, sender=Paper)
def delete_paper_file(sender, instance, **kwargs):
    if instance.pdf:
        instance.pdf.delete(save=False)
