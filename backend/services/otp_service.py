"""
MAQGO - OTP Service (Redis + AWS SNS)
Reemplaza Twilio Verify para reducir costos (~$6-10/1000 vs $74/1000).

- Redis: OTP + expiración + intentos + rate limit
- AWS SNS: envío SMS
- Sin persistencia en base de datos
"""

import os
import random
import logging
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# Config
OTP_EXPIRY_SECONDS = 300  # 5 minutos
OTP_MAX_ATTEMPTS = 3
RATE_LIMIT_WINDOW = 600  # 10 minutos
RATE_LIMIT_MAX = 3  # máx 3 OTP por número cada 10 min
SMS_MESSAGE = "Tu código MAQGO es: {otp}"

REDIS_URL = os.environ.get("REDIS_URL", "")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")


def _get_redis():
    """Obtiene cliente Redis. Retorna None si no está configurado."""
    if not REDIS_URL:
        return None
    try:
        import redis
        return redis.from_url(REDIS_URL, decode_responses=True)
    except Exception as e:
        logger.warning(f"Redis not available: {e}")
        return None


def _send_sms_sns(phone: str, message: str) -> Tuple[bool, Optional[str]]:
    """
    Envía SMS vía AWS SNS.
    Retorna (success, error_message).
    """
    if not all([
        os.environ.get("AWS_ACCESS_KEY_ID"),
        os.environ.get("AWS_SECRET_ACCESS_KEY"),
    ]):
        return False, "AWS credentials not configured"

    try:
        import boto3
        client = boto3.client("sns", region_name=AWS_REGION)
        client.publish(
            PhoneNumber=phone,
            Message=message,
            MessageAttributes={
                "AWS.SNS.SMS.SMSType": {
                    "DataType": "String",
                    "StringValue": "Transactional"
                }
            }
        )
        return True, None
    except Exception as e:
        logger.error(f"AWS SNS error: {e}")
        return False, str(e)


def _normalize_phone(phone: str) -> str:
    """Asegura formato E.164 para Chile."""
    digits = "".join(c for c in phone if c.isdigit())
    if digits.startswith("56") and len(digits) >= 11:
        return f"+{digits}"
    if len(digits) == 9 and digits[0] == "9":
        return f"+56{digits}"
    return phone if phone.startswith("+") else f"+{phone}"


def send_otp(phone_number: str, channel: str = "sms") -> dict:
    """
    Envía OTP de 6 dígitos.
    - Rate limit: máx 3 OTP por número cada 10 min
    - OTP válido 5 minutos
    - channel: 'sms' (SNS) o 'whatsapp' (por ahora solo SMS)
    """
    phone = _normalize_phone(phone_number)
    if channel not in ("sms", "whatsapp"):
        channel = "sms"

    # Solo SMS vía SNS por ahora
    if channel == "whatsapp":
        return {
            "success": False,
            "error": "WhatsApp no disponible. Usa SMS.",
            "demo_mode": False,
        }

    r = _get_redis()

    # Sin Redis: no podemos hacer rate limit ni guardar OTP
    if not r:
        return {
            "success": False,
            "error": "OTP service not configured (REDIS_URL required)",
            "demo_mode": False,
        }

    rate_key = f"otp_rate:{phone}"
    try:
        current = r.get(rate_key) or "0"
        count = int(current)
        if count >= RATE_LIMIT_MAX:
            ttl = r.ttl(rate_key)
            return {
                "success": False,
                "error": f"Demasiados intentos. Intenta en {max(1, ttl // 60)} minutos.",
                "demo_mode": False,
            }
    except Exception as e:
        logger.warning(f"Redis rate check: {e}")
        count = 0

    otp = "".join(str(random.randint(0, 9)) for _ in range(6))
    otp_key = f"otp:{phone}"
    attempts_key = f"otp_attempts:{phone}"

    # Guardar OTP y resetear intentos
    pipe = r.pipeline()
    pipe.setex(otp_key, OTP_EXPIRY_SECONDS, otp)
    pipe.setex(attempts_key, OTP_EXPIRY_SECONDS, "0")
    if count == 0:
        pipe.setex(rate_key, RATE_LIMIT_WINDOW, "1")
    else:
        pipe.incr(rate_key)
        pipe.expire(rate_key, RATE_LIMIT_WINDOW)
    pipe.execute()

    # Enviar SMS
    ok, err = _send_sms_sns(phone, SMS_MESSAGE.format(otp=otp))
    if not ok:
        r.delete(otp_key, attempts_key)
        return {
            "success": False,
            "error": err or "Error al enviar SMS",
            "demo_mode": False,
        }

    return {
        "success": True,
        "channel": "sms",
        "demo_mode": False,
    }


def verify_otp(phone_number: str, code: str) -> dict:
    """
    Verifica código OTP.
    - Máx 3 intentos
    - Errores claros: inválido, expirado, demasiados intentos
    """
    phone = _normalize_phone(phone_number)
    code = code.strip()

    if len(code) != 6 or not code.isdigit():
        return {
            "success": True,
            "valid": False,
            "error": "Código inválido",
        }

    r = _get_redis()
    if not r:
        return {
            "success": False,
            "valid": False,
            "error": "OTP service not configured",
        }

    otp_key = f"otp:{phone}"
    attempts_key = f"otp_attempts:{phone}"

    try:
        stored = r.get(otp_key)
        attempts = int(r.get(attempts_key) or "0")

        if attempts >= OTP_MAX_ATTEMPTS:
            r.delete(otp_key, attempts_key)
            return {
                "success": True,
                "valid": False,
                "error": "Demasiados intentos. Solicita un nuevo código.",
            }

        if not stored:
            return {
                "success": True,
                "valid": False,
                "error": "Código expirado. Solicita uno nuevo.",
            }

        if code != stored:
            r.incr(attempts_key)
            r.expire(attempts_key, r.ttl(otp_key))
            remaining = OTP_MAX_ATTEMPTS - attempts - 1
            err = "Código incorrecto."
            if remaining > 0:
                err += f" Te quedan {remaining} intentos."
            return {
                "success": True,
                "valid": False,
                "error": err,
            }

        # OK: eliminar OTP
        r.delete(otp_key, attempts_key)
        return {
            "success": True,
            "valid": True,
        }

    except Exception as e:
        logger.error(f"Redis verify error: {e}")
        return {
            "success": False,
            "valid": False,
            "error": "Error al verificar. Intenta nuevamente.",
        }


def is_otp_configured() -> bool:
    """Indica si el servicio OTP (Redis + AWS) está listo."""
    return bool(
        str(os.environ.get("REDIS_URL", "")).strip()
        and str(os.environ.get("AWS_ACCESS_KEY_ID", "")).strip()
    )
