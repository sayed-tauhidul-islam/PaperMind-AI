from django.contrib.auth import get_user_model
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from rest_framework.authentication import BaseAuthentication
from django.utils.crypto import constant_time_compare, salted_hmac
from django.conf import settings

User = get_user_model()
signer = TimestampSigner(salt="papermind-auth")


def _password_fingerprint(password_hash):
    # Bind sessions to password changes without placing Django's password hash
    # in the browser cookie payload.
    return salted_hmac("papermind-session", password_hash).hexdigest()


class PaperMindTokenAuthentication(BaseAuthentication):
    def authenticate_header(self, request):
        return "PaperMindSession"

    def authenticate(self, request):
        token = request.COOKIES.get(settings.PAPERMIND_SESSION_COOKIE, "")
        if not token:
            return None
        try:
            payload = signer.unsign(token, max_age=60 * 60 * 12)
            user_id, password_hash = payload.split(":", 1)
            user = User.objects.get(pk=user_id, is_active=True)
            if not constant_time_compare(password_hash, _password_fingerprint(user.password)):
                return None
        except (BadSignature, SignatureExpired, User.DoesNotExist, ValueError):
            # A stale cookie must become anonymous instead of blocking public
            # endpoints such as login after a password reset.
            return None
        return user, None
