import json
import logging
import os
import re

import requests
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from papers.models import Paper
from .models import ChatConversation, ChatMessage

logger = logging.getLogger(__name__)
DAILY_CHAT_MESSAGE_LIMIT = 30
# The selected paper excerpt and short conversation window stay below the
# provider's on-demand TPM limit while retaining enough context to answer.
CHAT_CONTEXT_LIMIT = 6500
CHAT_HISTORY_TURNS = 4
CHAT_HISTORY_CHAR_LIMIT = 3500
MODEL = "openai/gpt-oss-120b"
CHAT_API_URL = "https://api.groq.com/openai/v1/chat/completions"


def _select_chat_context(text, question, limit=CHAT_CONTEXT_LIMIT):
    """Select question-relevant, page-aware excerpts within a hard character cap."""
    text = re.sub(r"(?<=[A-Za-z])-\s*\n\s*(?=[a-z])", "", text)
    pages = re.findall(r"\[Page\s+(\d+)\]\s*([\s\S]*?)(?=\n\[Page\s+\d+\]|\Z)", text)
    if not pages:
        return text[:limit]

    terms = {
        token.lower()
        for token in re.findall(r"[a-zA-Z0-9]{4,}", question)
        if token.lower() not in {"what", "which", "when", "where", "does", "this", "that", "from", "with", "about", "paper"}
    }
    scored = []
    for number, body in pages:
        words = set(re.findall(r"[a-zA-Z0-9]{4,}", body.lower()))
        score = len(terms & words)
        if re.search(r"abstract|conclusion|dataset|data availability|methodology|methods|results|evaluation", body, re.IGNORECASE):
            score += 1
        scored.append((score, int(number), body))

    chosen = []
    seen = set()
    size = 0
    ordered = [item for item in scored if item[1] <= 2]
    ordered += sorted((item for item in scored if item[1] > 2), key=lambda item: item[0], reverse=True)
    for _, number, body in ordered:
        remaining = limit - size
        if remaining <= 0:
            break
        excerpt = body[:min(len(body), 3000 if number <= 2 else 2200, remaining)].strip()
        if not excerpt or excerpt in seen:
            continue
        page_excerpt = f"[Page {number}]\n{excerpt}"
        chosen.append(page_excerpt)
        seen.add(excerpt)
        size += len(page_excerpt)
    return "\n\n".join(chosen)


def _conversation_data(conversation):
    return {
        "id": conversation.id,
        "paper_id": conversation.paper_id,
        "title": conversation.title,
        "is_locked": conversation.is_locked,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
    }


def _message_data(item):
    return {
        "id": item.id,
        "conversation_id": item.conversation_id,
        "question": item.question,
        "answer": item.answer,
        "evidence": item.evidence,
        "created_at": item.created_at,
    }


@api_view(["GET"])
def chat_status(request):
    return Response({"success": True, "message": "PaperMind AI Chat API is ready.", "chat_available": True})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def paper_conversations(request, paper_id):
    paper = get_object_or_404(Paper, pk=paper_id, owner=request.user)
    if request.method == "GET":
        conversations = ChatConversation.objects.filter(owner=request.user, paper=paper)
        return Response([_conversation_data(item) for item in conversations])

    title = str(request.data.get("title", "New chat")).strip()[:200] or "New chat"
    conversation = ChatConversation.objects.create(owner=request.user, paper=paper, title=title)
    return Response(_conversation_data(conversation), status=status.HTTP_201_CREATED)


@api_view(["GET", "POST", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def conversation_chat(request, paper_id, conversation_id):
    paper = get_object_or_404(Paper, pk=paper_id, owner=request.user)
    conversation = get_object_or_404(
        ChatConversation, pk=conversation_id, paper=paper, owner=request.user,
    )
    if request.method == "DELETE":
        if conversation.is_locked:
            return Response({"detail": "Unlock this chat before deleting it."}, status=status.HTTP_423_LOCKED)
        conversation.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method == "PATCH":
        changed_fields = []
        if "title" in request.data:
            title = str(request.data.get("title", "")).strip()
            if not title:
                return Response({"detail": "Chat title cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)
            conversation.title = title[:200]
            changed_fields.append("title")
        if "is_locked" in request.data:
            if not isinstance(request.data["is_locked"], bool):
                return Response({"detail": "is_locked must be true or false."}, status=status.HTTP_400_BAD_REQUEST)
            conversation.is_locked = request.data["is_locked"]
            changed_fields.append("is_locked")
        if changed_fields:
            conversation.save(update_fields=[*changed_fields, "updated_at"])
        return Response(_conversation_data(conversation))
    if request.method == "GET":
        items = conversation.messages.order_by("created_at")
        return Response([_message_data(item) for item in items])
    if conversation.is_locked:
        return Response({"detail": "Unlock this chat before sending messages."}, status=status.HTTP_423_LOCKED)
    return _send_message(request, paper, conversation)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def paper_chat(request, paper_id):
    paper = get_object_or_404(Paper, pk=paper_id, owner=request.user)
    if request.method == "GET":
        conversation_id = request.query_params.get("conversation_id")
        items = ChatMessage.objects.filter(owner=request.user, paper=paper)
        if conversation_id:
            items = items.filter(conversation_id=conversation_id)
        return Response([_message_data(item) for item in items.order_by("created_at")])

    conversation_id = request.data.get("conversation_id")
    if conversation_id:
        conversation = get_object_or_404(
            ChatConversation, pk=conversation_id, owner=request.user, paper=paper,
        )
        if conversation.is_locked:
            return Response({"detail": "Unlock this chat before sending messages."}, status=status.HTTP_423_LOCKED)
    else:
        conversation = ChatConversation.objects.create(owner=request.user, paper=paper)
    return _send_message(request, paper, conversation)


def _send_message(request, paper, conversation):
    question = str(request.data.get("question", "")).strip()
    if not question:
        return Response({"error": "Please enter a question."}, status=status.HTTP_400_BAD_REQUEST)
    if len(question) > 4000:
        return Response({"error": "Question must be 4,000 characters or less."}, status=status.HTTP_400_BAD_REQUEST)

    sent_today = ChatMessage.objects.filter(
        owner=request.user, created_at__date=timezone.localdate(),
    ).count()
    if sent_today >= DAILY_CHAT_MESSAGE_LIMIT:
        return Response({
            "error": f"Daily chat message limit reached ({DAILY_CHAT_MESSAGE_LIMIT} per day).",
            "used": sent_today,
            "limit": DAILY_CHAT_MESSAGE_LIMIT,
        }, status=429)

    api_keys = [os.getenv("GROQ_API_KEY_1"), os.getenv("GROQ_API_KEY_2")]
    api_keys = [key.strip() for key in api_keys if key and key.strip()]
    if not api_keys:
        return Response({"error": "Paper chat is not configured. Add a Groq API key to backend/.env."}, status=503)

    context = _select_chat_context(paper.extracted_text, question)
    previous = list(conversation.messages.order_by("-created_at")[:CHAT_HISTORY_TURNS])
    previous.reverse()
    history_messages = []
    history_chars = 0
    for item in previous:
        remaining = CHAT_HISTORY_CHAR_LIMIT - history_chars
        if remaining <= 0:
            break
        user_text = item.question[:remaining]
        history_chars += len(user_text)
        history_messages.append({"role": "user", "content": user_text})
        remaining = CHAT_HISTORY_CHAR_LIMIT - history_chars
        if remaining <= 0:
            break
        assistant_text = item.answer[:remaining]
        history_chars += len(assistant_text)
        history_messages.append({"role": "assistant", "content": assistant_text})

    messages = [
        {"role": "system", "content": (
            "You are PaperMind, a research-paper assistant. Answer the user's latest question "
            "using only the supplied paper excerpts and relevant conversation history. "
            "Use clear concise bullet points. If evidence is absent, say so instead of guessing. "
            "Return valid JSON with an answer string and evidence array. Each evidence item "
            "must contain quote and page (integer or null). Never invent a quote or page number."
        )},
        {"role": "user", "content": f"Paper: {paper.title}\n\nPaper excerpts:\n{context}"},
        *history_messages,
        {"role": "user", "content": question},
    ]

    errors = []
    for index, key in enumerate(api_keys, start=1):
        try:
            response = requests.post(
                CHAT_API_URL,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "model": MODEL,
                    "temperature": 0.2,
                    "max_completion_tokens": 1200,
                    "reasoning_effort": "low",
                    "reasoning_format": "hidden",
                    "messages": messages,
                    "response_format": {"type": "json_object"},
                },
                timeout=90,
            )
            if not response.ok:
                errors.append(f"Key {index}: HTTP {response.status_code}: {response.text[:700]}")
                continue
            payload = response.json()
            content = payload["choices"][0]["message"]["content"]
            data = json.loads(content)
            answer_value = data.get("answer", "The paper does not clearly state this.")
            answer = "\n".join(f"• {point}" for point in answer_value) if isinstance(answer_value, list) else str(answer_value)
            evidence = data.get("evidence", [])
            if not isinstance(evidence, list):
                evidence = []

            item = ChatMessage.objects.create(
                owner=request.user,
                paper=paper,
                conversation=conversation,
                question=question,
                answer=answer,
                evidence=evidence,
            )
            if conversation.title == "New chat":
                conversation.title = question.replace("\n", " ")[:197]
            conversation.save(update_fields=["title", "updated_at"])
            return Response(_message_data(item), status=status.HTTP_201_CREATED)
        except (requests.RequestException, KeyError, IndexError, json.JSONDecodeError, TypeError, ValueError) as exc:
            logger.warning("Groq chat attempt %s failed for paper_id=%s: %s", index, paper.id, exc)
            errors.append(f"Key {index}: {exc}")

    logger.error("All Groq chat attempts failed for paper_id=%s: %s", paper.id, " | ".join(errors))
    return Response({
        "error": "Paper chat could not get a response from Groq.",
        "details": " | ".join(errors),
    }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
