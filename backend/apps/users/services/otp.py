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


def normalize_phone(phone: str) -> str:
    clean = re.sub(r'[\s\-]', '', phone or '')
    clean = re.sub(r'^\+972', '0', clean)
    return clean


def generate_otp(user) -> str:
    OtpCode.objects.filter(user=user, used=False).update(used=True)
    code = f'{secrets.randbelow(1_000_000):06d}'
    OtpCode.objects.create(
        user=user,
        code=code,
        expires_at=timezone.now() + timedelta(minutes=OTP_EXPIRY_MINUTES),
    )
    return code


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


def make_otp_call(phone: str, name: str, code: str) -> dict:
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

    try:
        call_resp = requests.post(
            f'{settings.SIP_API_URL}/calls/originate',
            json={
                'destination': normalize_phone(phone),
                'caller_id': '037110001',
                'audio_file': audio_file,
                'timeout': 30,
                'context': 'uptime-alert',
            },
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
