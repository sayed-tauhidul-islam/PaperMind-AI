import os
import logging
import secrets
import re
from datetime import timedelta
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.hashers import check_password, make_password
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
from django.core.validators import validate_email
from django.middleware.csrf import get_token
from django.db import transaction
from rest_framework.decorators import throttle_classes
from .authentication import _password_fingerprint, signer
from .models import PasswordResetChallenge
from .throttles import (LoginThrottle, PasswordResetRequestThrottle, PasswordResetConfirmThrottle,
                        RegistrationThrottle, ResendVerificationThrottle)

User = get_user_model()
logger = logging.getLogger(__name__)


def _password_input(request, key):
    value = request.data.get(key, "")
    return value if isinstance(value, str) and len(value) <= 128 else ""


def _send_verification_email(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    frontend = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    verification_url = f"{frontend}/?verify_email=1&uid={uid}&token={token}"
    from django.core.mail import send_mail
    try:
        send_mail(
            "Verify your PaperMind AI email",
            f"Open this link within 3 days to verify your email and activate your account:\n\n{verification_url}",
            None,
            [user.email],
            fail_silently=False,
        )
    except Exception:
        logger.exception("Could not send email verification to account id=%s", user.pk)
    return verification_url

def user_data(user):
    return {"id": user.id, "name": user.get_full_name() or user.username, "email": user.email}


@api_view(["GET"])
@permission_classes([AllowAny])
def csrf_token(request):
    return Response({"csrfToken": get_token(request)})


@api_view(["POST"])
@permission_classes([AllowAny])
def logout(request):
    response = Response({"message": "Signed out."})
    response.delete_cookie(settings.PAPERMIND_SESSION_COOKIE, path="/", samesite="None" if not settings.DEBUG else "Lax")
    return response

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
@throttle_classes([RegistrationThrottle])
def register(request):
    name = str(request.data.get("name", "")).strip()
    email = str(request.data.get("email", "")).strip().lower()
    password = _password_input(request, "password")
    if not name or not email or not password:
        return Response({"error": "Name, email and password are required."}, status=400)
    try:
        validate_email(email)
    except ValidationError:
        return Response({"error": "Enter a valid email address."}, status=400)
    if User.objects.filter(email__iexact=email).exists():
        return Response({"error": "An account with this email already exists."}, status=400)
    user = User(username=email, email=email, first_name=name)
    try:
        validate_password(password, user)
    except ValidationError as exc:
        return Response({"error": " ".join(exc.messages)}, status=400)
    user.set_password(password)
    user.is_active = False
    user.save()
    verification_url = _send_verification_email(user)
    response = {"message": "Check your inbox for a verification link before signing in.", "verification_required": True, "email": user.email}
    if settings.DEBUG:
        response["verification_url"] = verification_url
    return Response(response, status=201)


@api_view(["POST"])
@permission_classes([AllowAny])
def verify_email(request):
    try:
        user_id = force_str(urlsafe_base64_decode(request.data.get("uid", "")))
        user = User.objects.get(pk=user_id)
    except Exception:
        return Response({"error": "Verification link is invalid or expired."}, status=400)
    if user.is_active:
        return Response({"message": "This email is already verified. You can sign in."})
    if not default_token_generator.check_token(user, request.data.get("token", "")):
        return Response({"error": "Verification link is invalid or expired. Request a new one."}, status=400)
    user.is_active = True
    user.save(update_fields=["is_active"])
    return Response({"message": "Email verified. You can now sign in."})


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([ResendVerificationThrottle])
def resend_verification(request):
    email = str(request.data.get("email", "")).strip().lower()
    user = User.objects.filter(email__iexact=email, is_active=False).first()
    response = {"message": "If an unverified account exists, a new verification email has been sent."}
    if user:
        verification_url = _send_verification_email(user)
        if settings.DEBUG:
            response["verification_url"] = verification_url
    return Response(response)

@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def login(request):
    email = str(request.data.get("email", "")).strip().lower()
    password = _password_input(request, "password")
    user_obj = User.objects.filter(email__iexact=email).first()
    if user_obj and not user_obj.is_active:
        return Response({"error": "Email or password is incorrect."}, status=400)
    user = authenticate(request, username=user_obj.username if user_obj else email, password=password)
    if not user:
        return Response({"error": "Email or password is incorrect."}, status=400)
    # Bind the signed session to the current password hash so a reset or
    # password change invalidates all tokens issued before it.
    response = Response({"user": user_data(user)})
    response.set_cookie(
        settings.PAPERMIND_SESSION_COOKIE,
        signer.sign(f"{user.pk}:{_password_fingerprint(user.password)}"),
        max_age=60 * 60 * 12,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="None" if not settings.DEBUG else "Lax",
        path="/",
    )
    return response

@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def profile(request):
    user = request.user
    if request.method == "PATCH":
        name = str(request.data.get("name", "")).strip()
        email = str(request.data.get("email", "")).strip().lower()
        if not name or not email:
            return Response({"error": "Name and email are required."}, status=400)
        try:
            validate_email(email)
        except ValidationError:
            return Response({"error": "Enter a valid email address."}, status=400)
        if email != user.email.lower() and not user.check_password(_password_input(request, "current_password")):
            return Response({"error": "Enter your current password to change your account email."}, status=400)
        if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
            return Response({"error": "That email is already in use."}, status=400)
        user.first_name, user.email, user.username = name, email, email
        user.save(update_fields=["first_name", "email", "username"])
    return Response(user_data(user))

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    if not request.user.check_password(_password_input(request, "current_password")):
        return Response({"error": "Current password is incorrect."}, status=400)
    new_password = _password_input(request, "new_password")
    try:
        validate_password(new_password, request.user)
    except ValidationError as exc:
        return Response({"error": " ".join(exc.messages)}, status=400)
    request.user.set_password(new_password)
    request.user.save(update_fields=["password"])
    return Response({"message": "Password updated. Please sign in again."})

@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetRequestThrottle])
def request_password_reset(request):
    email = str(request.data.get("email", "")).strip().lower()
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    response = {"message": "If an account exists, a 6-digit reset code has been sent to its email address."}
    if user:
        now = timezone.now()
        recent = PasswordResetChallenge.objects.filter(user=user, created_at__gte=now - timedelta(seconds=60)).exists()
        if not recent:
            PasswordResetChallenge.objects.filter(user=user, consumed_at__isnull=True).update(consumed_at=now)
            code = f"{secrets.randbelow(1_000_000):06d}"
            challenge = PasswordResetChallenge.objects.create(user=user, code_hash=make_password(code), expires_at=now + timedelta(minutes=15))
            from django.core.mail import send_mail
            try:
                send_mail("Your PaperMind AI password reset code",
                          f"Your 6-digit password reset code is {code}. It expires in 15 minutes and can be used once. If you did not request this, ignore this email.",
                          settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)
            except Exception:
                challenge.consumed_at = timezone.now()
                challenge.save(update_fields=["consumed_at"])
                logger.exception("Could not send password reset code to account id=%s", user.pk)
    return Response(response)

@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetConfirmThrottle])
def reset_password(request):
    email = str(request.data.get("email", "")).strip().lower()
    code = str(request.data.get("code", "")).strip()
    invalid = Response({"error": "The 6-digit code is invalid or expired."}, status=400)
    if not re.fullmatch(r"\d{6}", code):
        return invalid
    with transaction.atomic():
        challenge = PasswordResetChallenge.objects.select_for_update().filter(
            user__email__iexact=email, user__is_active=True, consumed_at__isnull=True,
        ).first()
        now = timezone.now()
        if not challenge or challenge.expires_at <= now or challenge.attempts >= 5:
            return invalid
        if not check_password(code, challenge.code_hash):
            challenge.attempts += 1
            challenge.save(update_fields=["attempts"])
            return invalid
        user = challenge.user
        try:
            new_password = _password_input(request, "password")
            validate_password(new_password, user)
        except ValidationError as exc:
            return Response({"error": " ".join(exc.messages)}, status=400)
        user.set_password(new_password)
        user.save(update_fields=["password"])
        challenge.consumed_at = now
        challenge.save(update_fields=["consumed_at"])
        PasswordResetChallenge.objects.filter(user=user, consumed_at__isnull=True).exclude(pk=challenge.pk).update(consumed_at=now)
    return Response({"message": "Password reset successfully. You can sign in now."})

@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_account(request):
    if not request.user.check_password(_password_input(request, "password")):
        return Response({"error": "Enter your password to confirm account deletion."}, status=400)
    request.user.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
