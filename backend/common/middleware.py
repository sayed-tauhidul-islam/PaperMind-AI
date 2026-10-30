from django.middleware.csrf import CsrfViewMiddleware
from django.utils.deprecation import MiddlewareMixin


class ApiSecurityHeadersMiddleware:
    """Add restrictive headers to API responses without affecting app/PDF UI."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/api/"):
            response.setdefault("X-Content-Type-Options", "nosniff")
            response.setdefault("Referrer-Policy", "same-origin")
            response.setdefault("Cross-Origin-Opener-Policy", "same-origin")
            response.setdefault("Cache-Control", "no-store, max-age=0")
            response.setdefault("Pragma", "no-cache")
            if response.get("Content-Type", "").split(";", 1)[0] != "application/pdf":
                response.setdefault("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
                response.setdefault("X-Frame-Options", "DENY")
        return response


class ApiCsrfProtectionMiddleware(MiddlewareMixin):
    """Enforce CSRF for cookie-authenticated API mutations despite DRF wrappers."""

    def __init__(self, get_response=None):
        super().__init__(get_response)
        self.csrf = CsrfViewMiddleware(lambda request: None)

    def process_view(self, request, view_func, view_args, view_kwargs):
        if not request.path.startswith("/api/") or request.method in {"GET", "HEAD", "OPTIONS", "TRACE"}:
            return None
        # DRF marks function views csrf_exempt because token auth normally
        # does not use ambient cookies. This API uses HttpOnly auth cookies,
        # so apply Django's origin and double-submit checks explicitly.
        return self.csrf.process_view(request, lambda req: None, view_args, view_kwargs)
