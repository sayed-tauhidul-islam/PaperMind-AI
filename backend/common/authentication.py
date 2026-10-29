from django.contrib.auth import get_user_model
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

User = get_user_model()
signer = TimestampSigner(salt="papermind-auth")


class PaperMindTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return None
        try:
            user_id = signer.unsign(header[7:], max_age=60 * 60 * 24 * 30)
            user = User.objects.get(pk=user_id, is_active=True)
        except (BadSignature, SignatureExpired, User.DoesNotExist, ValueError):
            raise AuthenticationFailed("Session expired. Please sign in again.")
        return user, None
