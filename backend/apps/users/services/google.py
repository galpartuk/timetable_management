from django.conf import settings
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token


class GoogleVerifyError(Exception):
    pass


def verify_google_credential(credential: str) -> dict:
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleVerifyError('Google login not configured')
    try:
        info = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except ValueError as exc:
        raise GoogleVerifyError(str(exc)) from exc

    email = (info.get('email') or '').lower()
    if not email:
        raise GoogleVerifyError('Google token missing email claim')
    return {
        'email': email,
        'name': info.get('name', ''),
        'sub': info.get('sub', ''),
        'email_verified': bool(info.get('email_verified')),
    }
