from rest_framework.throttling import AnonRateThrottle


class LoginThrottle(AnonRateThrottle):
    scope = "login"


class PasswordResetRequestThrottle(AnonRateThrottle):
    scope = "password_reset_request"


class PasswordResetConfirmThrottle(AnonRateThrottle):
    scope = "password_reset_confirm"


class RegistrationThrottle(AnonRateThrottle):
    scope = "register"


class ResendVerificationThrottle(AnonRateThrottle):
    scope = "resend_verification"
