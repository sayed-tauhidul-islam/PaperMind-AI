from django.db import models
from django.conf import settings


class ChatConversation(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_conversations")
    paper = models.ForeignKey("papers.Paper", on_delete=models.CASCADE, related_name="chat_conversations")
    title = models.CharField(max_length=200, default="New chat")
    is_locked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title


class ChatMessage(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_messages")
    paper = models.ForeignKey("papers.Paper", on_delete=models.CASCADE, related_name="chat_messages")
    conversation = models.ForeignKey(ChatConversation, on_delete=models.CASCADE, related_name="messages", null=True, blank=True)
    question = models.TextField()
    answer = models.TextField()
    evidence = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
