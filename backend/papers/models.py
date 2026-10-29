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
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


@receiver(post_delete, sender=Paper)
def delete_paper_file(sender, instance, **kwargs):
    if instance.pdf:
        instance.pdf.delete(save=False)
