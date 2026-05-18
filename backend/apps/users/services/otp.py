import logging
import re
import secrets
import time
from datetime import timedelta

import requests
from django.conf import settings
from django.utils import timezone

from apps.users.models import OtpCode

logger = logging.getLogger(__name__)

OTP_EXPIRY_MINUTES = 5

# Public base URL the Asterisk dialplan hits when the user presses 1.
# In production this is the same domain the user sees in their browser;
# we use the env-configurable `OTP_DTMF_CALLBACK_BASE` so dev/staging
# can point elsewhere.
DEFAULT_CALLBACK_BASE = 'https://timetable.all-good.co.il/api/auth/otp-dtmf-callback'


def normalize_phone(phone: str) -> str:
    clean = re.sub(r'[\s\-]', '', phone or '')
    clean = re.sub(r'^\+972', '0', clean)
    return clean


def generate_otp(user) -> OtpCode:
    """Invalidate prior OTPs for the user and create a fresh one.
    Returns the OtpCode (caller passes `dtmf_token` to make_otp_call)."""
    OtpCode.objects.filter(user=user, used=False).update(used=True)
    code = f'{secrets.randbelow(1_000_000):06d}'
    return OtpCode.objects.create(
        user=user,
        code=code,
        dtmf_token=secrets.token_urlsafe(24),
        expires_at=timezone.now() + timedelta(minutes=OTP_EXPIRY_MINUTES),
    )


def verify_otp(user, code: str) -> bool:
    otp = (
        OtpCode.objects
        .filter(user=user, code=code, used=False, expires_at__gt=timezone.now())
        .order_by('-created_at')
        .first()
    )
    if otp is None:
        return False
    otp.used = True
    otp.save(update_fields=['used'])
    return True


def make_otp_call(phone: str, name: str, code: str, dtmf_token: str | None = None) -> dict:
    """Place the OTP voice call.

    When `dtmf_token` is set (default for new logins), the call asks the
    user to press 1 and Asterisk pings our callback URL — no code-reading.
    When `dtmf_token` is None we fall back to reading the digits aloud
    (kept for emergency / debugging).
    """
    if dtmf_token:
        text = (
            f'שלום {name}. התקבלה בקשת התחברות למערכת השעות. '
            f'כדי לאשר את ההתחברות, לחץ 1. אני חוזר, לחץ 1 כדי לאשר את ההתחברות.'
        )
    else:
        digits = ' . '.join(code)
        text = f'שלום {name}, קוד הכניסה החד פעמי שלך הוא {digits}. אני חוזר, {digits}'

    try:
        tts_resp = requests.post(
            f'{settings.TTS_API_URL}/tts/synthesize',
            json={'text': text, 'language': 'he', 'sample_rate': 8000},
            headers={'X-API-Key': settings.TTS_API_KEY, 'Content-Type': 'application/json'},
            timeout=30,
        )
        if tts_resp.status_code != 200 or not tts_resp.content:
            logger.error('TTS synthesis failed: %s', tts_resp.status_code)
            return {'success': False, 'error': 'TTS synthesis failed'}
        audio_data = tts_resp.content
    except Exception as exc:
        logger.exception('TTS request error')
        return {'success': False, 'error': str(exc)}

    audio_id = f'otp_{int(time.time())}_{secrets.token_hex(4)}'
    filename = f'{audio_id}.wav'

    try:
        upload_resp = requests.post(
            f'{settings.SIP_API_URL}/calls/upload-audio',
            files={'audio': (filename, audio_data, 'audio/wav')},
            headers={'X-API-Key': settings.SIP_API_KEY},
            timeout=30,
        )
        if upload_resp.status_code != 200:
            logger.error('Audio upload failed: %s %s', upload_resp.status_code, upload_resp.text[:200])
            return {'success': False, 'error': 'Audio upload failed'}
        audio_file = upload_resp.json().get('filename', '')
    except Exception as exc:
        logger.exception('Audio upload error')
        return {'success': False, 'error': str(exc)}

    originate_body: dict = {
        'destination': normalize_phone(phone),
        'caller_id': '037110001',
        'audio_file': audio_file,
        'timeout': 30,
        'context': 'uptime-alert',
    }
    if dtmf_token:
        # Tell Asterisk to listen for "1" and fire our callback on press.
        # The "otp-verify" context on the SIP server is the one configured
        # to handle DTMF + outbound webhooks (same as RC, the canonical
        # implementation).
        callback_base = getattr(settings, 'OTP_DTMF_CALLBACK_BASE', DEFAULT_CALLBACK_BASE)
        originate_body['context'] = 'otp-verify'
        originate_body['variables'] = {
            'DTMF_KEY': '1',
            'DTMF_CALLBACK_URL': f'{callback_base}/{dtmf_token}/',
        }

    try:
        call_resp = requests.post(
            f'{settings.SIP_API_URL}/calls/originate',
            json=originate_body,
            headers={'X-API-Key': settings.SIP_API_KEY, 'Content-Type': 'application/json'},
            timeout=60,
        )
        result = call_resp.json() if call_resp.content else {}
        return {
            'success': call_resp.status_code == 200 and bool(result.get('success')),
            'answered': bool(result.get('answered')),
        }
    except Exception as exc:
        logger.exception('Call originate error')
        return {'success': False, 'error': str(exc)}
