from django.urls import path
from .views import chat_status, conversation_chat, paper_chat, paper_conversations

urlpatterns = [
    path("", chat_status, name="chat-status"),
    path("<int:paper_id>/conversations/", paper_conversations, name="paper-conversations"),
    path("<int:paper_id>/conversations/<int:conversation_id>/", conversation_chat, name="conversation-chat"),
    path("<int:paper_id>/", paper_chat, name="paper-chat"),
]
