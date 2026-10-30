import re
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from common.models import PasswordResetChallenge


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AuthenticationSecurityTests(TestCase):
    def setUp(self):
        cache.clear()
        if hasattr(mail, "outbox"):
            mail.outbox.clear()
        self.user = get_user_model().objects.create_user(
            username="researcher@example.org", email="researcher@example.org",
            password="Original-Strong-Password-482!", is_active=True,
        )
        self.client = APIClient()

    def request_code(self):
        response = self.client.post("/api/auth/password-reset/", {"email": self.user.email}, format="json")
        self.assertEqual(response.status_code, 200)
        challenge = PasswordResetChallenge.objects.get(user=self.user, consumed_at__isnull=True)
        code = re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)
        return response, challenge, code

    def test_reset_code_is_emailed_hashed_single_use_and_revokes_old_sessions(self):
        login = self.client.post("/api/auth/login/", {"email": self.user.email, "password": "Original-Strong-Password-482!"}, format="json")
        self.assertIn("user", login.data)
        self.assertTrue(self.client.cookies["papermind_session"]["httponly"])
        reset_response, challenge, code = self.request_code()
        self.assertNotIn(code, str(reset_response.data))
        self.assertNotIn(code, challenge.code_hash)
        response = self.client.post("/api/auth/password-reset/confirm/", {
            "email": self.user.email, "code": code, "password": "New-Strong-Password-739!",
        }, format="json")
        self.assertEqual(response.status_code, 200)
        challenge.refresh_from_db()
        self.assertIsNotNone(challenge.consumed_at)
        self.assertEqual(self.client.get("/api/auth/profile/").status_code, 401)
        self.assertEqual(self.client.post("/api/auth/login/", {"email": self.user.email, "password": "New-Strong-Password-739!"}, format="json").status_code, 200)

    def test_reset_request_does_not_disclose_account_existence_or_return_code(self):
        known = self.client.post("/api/auth/password-reset/", {"email": self.user.email}, format="json")
        mail.outbox.clear()
        unknown = self.client.post("/api/auth/password-reset/", {"email": "missing@example.org"}, format="json")
        self.assertEqual(known.data["message"], unknown.data["message"])
        self.assertNotIn("code", known.data)
        self.assertEqual(len(mail.outbox), 0)

    def test_code_expires_and_locks_after_five_wrong_attempts(self):
        _, challenge, code = self.request_code()
        wrong_code = "000000" if code != "000000" else "000001"
        for _ in range(5):
            response = self.client.post("/api/auth/password-reset/confirm/", {
                "email": self.user.email, "code": wrong_code, "password": "Some-Other-Password-932!",
            }, format="json")
            self.assertEqual(response.status_code, 400)
        challenge.refresh_from_db()
        self.assertEqual(challenge.attempts, 5)
        response = self.client.post("/api/auth/password-reset/confirm/", {
            "email": self.user.email, "code": "123456", "password": "Some-Other-Password-932!",
        }, format="json")
        self.assertEqual(response.status_code, 400)

    def test_expired_code_cannot_reset_password(self):
        _, challenge, code = self.request_code()
        challenge.expires_at = timezone.now() - timedelta(seconds=1)
        challenge.save(update_fields=["expires_at"])
        response = self.client.post("/api/auth/password-reset/confirm/", {
            "email": self.user.email, "code": code, "password": "Expired-Reset-Password-443!",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Original-Strong-Password-482!"))

    def test_login_token_is_bound_to_password_hash(self):
        self.client.post("/api/auth/login/", {"email": self.user.email, "password": "Original-Strong-Password-482!"}, format="json")
        self.assertEqual(self.client.get("/api/auth/profile/").status_code, 200)
        self.user.set_password("Changed-Strong-Password-473!")
        self.user.save(update_fields=["password"])
        self.assertEqual(self.client.get("/api/auth/profile/").status_code, 401)

    def test_cookie_authenticated_mutations_require_csrf_token(self):
        client = APIClient(enforce_csrf_checks=True)
        blocked = client.post("/api/auth/login/", {"email": self.user.email, "password": "Original-Strong-Password-482!"}, format="json")
        self.assertEqual(blocked.status_code, 403)
        csrf = client.get("/api/auth/csrf/")
        token = csrf.data["csrfToken"]
        allowed = client.post("/api/auth/login/", {"email": self.user.email, "password": "Original-Strong-Password-482!"}, format="json", HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN="http://localhost:5173")
        self.assertEqual(allowed.status_code, 200)
        self.assertTrue(client.cookies["papermind_session"]["httponly"])
        registered = client.post("/api/auth/register/", {
            "name": "New Researcher", "email": "new.researcher@example.org",
            "password": "New-Researcher-Password-839!",
        }, format="json", HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN="http://localhost:5173")
        self.assertEqual(registered.status_code, 201)
