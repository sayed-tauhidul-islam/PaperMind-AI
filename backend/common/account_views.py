import os
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.signing import TimestampSigner
from django.contrib.auth.tokens import default_token_generator
from django.conf import settings
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from .authentication import signer

User = get_user_model()

def user_data(user):
    return {"id": user.id, "name": user.get_full_name() or user.username, "email": user.email}

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def usage(request):
    from papers.models import Paper
    from chat.models import ChatMessage
    today = timezone.localdate()
    return Response({
        "date": today.isoformat(),
        "uploads": {"used": Paper.objects.filter(owner=request.user, uploaded_at__date=today).count(), "limit": 10},
        "chat_messages": {"used": ChatMessage.objects.filter(owner=request.user, created_at__date=today).count(), "limit": 30},
    })

@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    name = str(request.data.get("name", "")).strip()
    email = str(request.data.get("email", "")).strip().lower()
    password = str(request.data.get("password", ""))
    if not name or not email or not password:
        return Response({"error": "Name, email and password are required."}, status=400)
    if User.objects.filter(email__iexact=email).exists():
        return Response({"error": "An account with this email already exists."}, status=400)
    user = User(username=email, email=email, first_name=name)
    try:
        validate_password(password, user)
    except ValidationError as exc:
        return Response({"error": " ".join(exc.messages)}, status=400)
    user.set_password(password)
    user.save()
    return Response({"token": signer.sign(str(user.pk)), "user": user_data(user)}, status=201)

@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    email = str(request.data.get("email", "")).strip().lower()
    user_obj = User.objects.filter(email__iexact=email).first()
    user = authenticate(request, username=user_obj.username if user_obj else email, password=request.data.get("password", ""))
    if not user:
        return Response({"error": "Email or password is incorrect."}, status=400)
    return Response({"token": signer.sign(str(user.pk)), "user": user_data(user)})

@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def profile(request):
    user = request.user
    if request.method == "PATCH":
        name = str(request.data.get("name", "")).strip()
        email = str(request.data.get("email", "")).strip().lower()
        if not name or not email:
            return Response({"error": "Name and email are required."}, status=400)
        if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
            return Response({"error": "That email is already in use."}, status=400)
        user.first_name, user.email, user.username = name, email, email
        user.save(update_fields=["first_name", "email", "username"])
    return Response(user_data(user))

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    if not request.user.check_password(request.data.get("current_password", "")):
        return Response({"error": "Current password is incorrect."}, status=400)
    try:
        validate_password(request.data.get("new_password", ""), request.user)
    except ValidationError as exc:
        return Response({"error": " ".join(exc.messages)}, status=400)
    request.user.set_password(request.data["new_password"])
    request.user.save(update_fields=["password"])
    return Response({"message": "Password updated. Please sign in again."})

@api_view(["POST"])
@permission_classes([AllowAny])
def request_password_reset(request):
    email = str(request.data.get("email", "")).strip()
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    response = {"message": "If an account exists, reset instructions have been sent."}
    if user:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        if settings.DEBUG:
            response["uid"] = uid
            response["token"] = token
            response["development_note"] = "Development reset codes are shown here because email delivery is not configured."
        else:
            from django.core.mail import send_mail
            frontend = os.getenv("FRONTEND_URL", "http://localhost:5173")
            send_mail("Reset your PaperMind AI password", f"Open {frontend} and use reset UID {uid} with reset code {token}.", None, [user.email], fail_silently=True)
    return Response(response)

@api_view(["POST"])
@permission_classes([AllowAny])
def reset_password(request):
    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(request.data.get("uid", ""))))
    except Exception:
        return Response({"error": "Reset link is invalid or expired."}, status=400)
    if not default_token_generator.check_token(user, request.data.get("token", "")):
        return Response({"error": "Reset link is invalid or expired."}, status=400)
    try:
        validate_password(request.data.get("password", ""), user)
    except ValidationError as exc:
        return Response({"error": " ".join(exc.messages)}, status=400)
    user.set_password(request.data["password"])
    user.save(update_fields=["password"])
    return Response({"message": "Password reset successfully. You can sign in now."})

@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_account(request):
    if not request.user.check_password(request.data.get("password", "")):
        return Response({"error": "Enter your password to confirm account deletion."}, status=400)
    request.user.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
