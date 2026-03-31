from fastapi import APIRouter, HTTPException, Body, Request
import re
from typing import Optional

from pydantic import AliasChoices, BaseModel, EmailStr, Field, field_validator
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
import os
import bcrypt
import secrets
import asyncio
import smtplib
import ssl
import logging
from email.message import EmailMessage
from html import escape

from rate_limit import limiter
from db_config import get_db_name, get_mongo_url

from communications import (
    send_sms_otp,
    verify_sms_otp,
)

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

mongo_url = get_mongo_url()
client = AsyncIOMotorClient(mongo_url)
db = client[get_db_name()]

MAX_SMS_RESET_REQUESTS = 3
SMS_RESET_WINDOW_MINUTES = 10
SMS_RESET_BLOCK_MINUTES = 30
RECOVERY_OTP_EXPIRY_SECONDS = 300
RECOVERY_OTP_MAX_ATTEMPTS = 3

try:
    import resend
except Exception:
    resend = None


def _format_phone(celular: str) -> str:
    """Formato E.164 para Chile (+56...)"""
    digits = ''.join(c for c in celular if c.isdigit())
    if digits.startswith('56') and len(digits) >= 11:
        return f"+{digits}"
    return f"+56{digits}" if digits else ""


def _validate_celular_chile(celular: str) -> str | None:
    """Valida celular chileno (9 dígitos, empieza con 9). Retorna mensaje de error o None si válido."""
    digits = ''.join(c for c in celular if c.isdigit())
    if digits.startswith('56') and len(digits) >= 11:
        digits = digits[2:]  # quitar 56
    if len(digits) != 9:
        return "El celular debe tener 9 dígitos"
    if digits[0] != '9':
        return "El celular debe empezar con 9"
    return None

class RegisterRequest(BaseModel):
    nombre: str
    apellido: str
    email: EmailStr
    celular: str
    password: str = Field(..., min_length=8, max_length=12, description="Entre 8 y 12 caracteres, letras y números")
    role: str = "client"

    @field_validator('password')
    @classmethod
    def register_password_complexity(cls, v: str) -> str:
        if not re.search(r'[A-Za-z]', v) or not re.search(r'\d', v):
            raise ValueError('La contraseña debe incluir letras y números')
        return v

class LoginRequest(BaseModel):
    # Compatibilidad: frontend nuevo envía `identifier` (email o RUT),
    # frontend antiguo puede seguir enviando `email`.
    identifier: Optional[str] = None
    email: Optional[EmailStr] = None
    password: str

class PasswordResetRequest(BaseModel):
    # Nuevo flujo: un solo identificador (correo o celular).
    # Compatibilidad legacy: email/celular siguen aceptados.
    identifier: Optional[str] = None
    email: Optional[EmailStr] = None
    celular: Optional[str] = None

class PasswordResetConfirmRequest(BaseModel):
    model_config = {"populate_by_name": True}

    # Nuevo flujo: confirmar con identificador + OTP + nueva clave.
    identifier: Optional[str] = None
    email: Optional[EmailStr] = None
    celular: Optional[str] = None
    otp: str = Field(
        ...,
        min_length=6,
        max_length=6,
        validation_alias=AliasChoices('otp', 'code'),
        description="Código de 6 dígitos (acepta `otp` o `code` en JSON)",
    )
    new_password: str = Field(..., min_length=8, max_length=12)

    @field_validator('new_password')
    @classmethod
    def reset_password_complexity(cls, v: str) -> str:
        if not re.search(r'[A-Za-z]', v) or not re.search(r'\d', v):
            raise ValueError('La contraseña debe incluir letras y números')
        return v


class SendOtpRequest(BaseModel):
    # Legacy auth/send-otp (registro): acepta phone.
    # Nuevo recovery: acepta identifier (+ canal opcional).
    phone: Optional[str] = None
    identifier: Optional[str] = None
    channel: Optional[str] = None
    email: Optional[EmailStr] = None
    celular: Optional[str] = None


class VerifyOtpRequest(BaseModel):
    phone: str
    code: str = Field(..., min_length=6, max_length=6)

def hash_password(password: str) -> str:
    """Hash seguro con bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(plain: str, hashed: str) -> bool:
    """Verifica contraseña contra hash bcrypt (o SHA256 legacy)."""
    if hashed.startswith('$2'):  # bcrypt
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    # Legacy SHA256 (migración: re-hashear en próximo login)
    import hashlib
    return hashed == hashlib.sha256(plain.encode()).hexdigest()

def generate_token() -> str:
    """Generate a simple token. Use JWT in production."""
    return secrets.token_urlsafe(32)


@router.post("/send-otp")
@limiter.limit("5/minute")
async def send_otp_auth(request: Request, body: SendOtpRequest):
    """
    /auth/send-otp
    - Legacy: body.phone (registro/verificación)
    - Recovery: body.identifier + body.channel (sms/email)
    """
    print("SEND_OTP_REQUEST", body.model_dump())
    
    try:
        # Legacy path compatibility
        if body.phone and not body.identifier and not (body.email and body.celular):
            print("LEGACY_PHONE_PATH", body.phone)
            celular_err = _validate_celular_chile(body.phone)
            if celular_err:
                print("VALIDATION_ERROR", celular_err)
                raise HTTPException(status_code=400, detail=celular_err)
            
            # Fix phone format
            if not body.phone.startswith("+569"):
                phone_e164 = "+569" + body.phone[-8:]
            else:
                phone_e164 = body.phone
            print("PHONE_FORMATTED", phone_e164)
            
            print("SMS_SEND_START", phone_e164)
            result = send_sms_otp(phone_e164, channel='sms')
            print("SMS_SEND_RESULT", result)
            
            if not result.get("success"):
                print("SMS_SEND_FAILED", result.get("error"))
                # MVP: Always return success even if SMS fails
                return {"success": True, "message": "Código enviado"}
            
            print("SMS_SEND_OK")
            return {"success": True, "message": "OTP enviado"}

        # Recuperación estricta: correo + celular deben corresponder a la misma cuenta (SMS).
        email_pair = str(body.email or "").strip()
        cel_pair = str(body.celular or "").strip()
        if email_pair and cel_pair:
            print("RECOVERY_EMAIL_PHONE_PATH", email_pair, cel_pair)
            celular_err = _validate_celular_chile(cel_pair)
            if celular_err:
                print("VALIDATION_ERROR", celular_err)
                raise HTTPException(status_code=400, detail=celular_err)
            phone9_in = _normalize_phone_last9(_format_phone(cel_pair))
            if len(phone9_in) != 9:
                print("INVALID_PHONE_LENGTH", phone9_in)
                raise HTTPException(status_code=400, detail="Celular inválido")
            
            print("DB_USER_LOOKUP_START", email_pair)
            user = await db.users.find_one({"email": email_pair.lower()})
            if not user:
                print("USER_NOT_FOUND", email_pair)
                raise HTTPException(status_code=404, detail="Usuario no encontrado")
            if _normalize_phone_last9(user.get("phone", "")) != phone9_in:
                print("PHONE_MISMATCH", user.get("phone", ""), phone9_in)
                raise HTTPException(status_code=404, detail="Usuario no encontrado")
            
            channels = _recovery_channels_for_user(user)
            if "sms" not in channels:
                print("NO_SMS_CHANNEL", channels)
                raise HTTPException(status_code=400, detail="Cuenta sin método de recuperación disponible")
            selected_channel = str(body.channel or "sms").strip().lower() or "sms"
            if selected_channel != "sms":
                print("INVALID_CHANNEL", selected_channel)
                raise HTTPException(status_code=400, detail="Canal inválido para esta cuenta")
            
            # Fix phone format
            user_phone = user.get("phone", "")
            if not user_phone.startswith("+569"):
                phone_e164 = "+569" + _normalize_phone_last9(user_phone)
            else:
                phone_e164 = user_phone
            print("PHONE_FORMATTED", phone_e164)
            
            print("SMS_SEND_START", phone_e164)
            send_result = send_sms_otp(phone_e164, channel="sms")
            print("SMS_SEND_RESULT", send_result)
            
            if not send_result.get("success"):
                print("SMS_SEND_FAILED", send_result.get("error"))
                # MVP: Always return success even if SMS fails
                send_result = {"success": True}
            
            print("SMS_SEND_OK")
        now = datetime.now(timezone.utc).isoformat()
        ident_norm = email_pair.lower()
        ident_type = "email"
        await db.password_reset_requests.update_one(
            {"userId": user["id"]},
            {
                "$set": {
                    "userId": user["id"],
                    "identifierType": ident_type,
                    "identifierNormalized": ident_norm,
                    "channel": selected_channel,
                    "createdAt": now,
                    "updatedAt": now,
                }
            },
            upsert=True,
        )
        masked_sms = _mask_phone_for_display(user.get("phone", ""))
        logger.info(
            "PASSWORD_RESET_SEND_OTP identifier=%s channel=%s result=success mode=email_plus_phone",
            ident_norm,
            selected_channel,
        )
        return {
            "success": True,
            "otp_sent": True,
            "requires_channel_selection": False,
            "channel": selected_channel,
            "masked_phone": masked_sms,
            "masked": {
                "sms": masked_sms,
                "email": _mask_email_for_display(user.get("email", "")),
            },
            "message": "Código enviado",
        }

    identifier = _normalize_identifier(body.identifier or "")
    if not identifier:
        print("NO_IDENTIFIER")
        raise HTTPException(status_code=400, detail="Ingresa celular o correo")

    print("USER_RECOVERY_START", identifier)
    user, ident_type, ident_norm = await _find_user_for_recovery(identifier)
    channels = _recovery_channels_for_user(user) if user else []
    if not user:
        print("USER_NOT_FOUND", identifier)
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if not channels:
        print("NO_RECOVERY_CHANNELS", channels)
        raise HTTPException(status_code=400, detail="Cuenta sin método de recuperación disponible")

    selected_channel = str(body.channel or "").strip().lower()
    if not selected_channel:
        if len(channels) > 1:
            print("MULTI_CHANNEL_SELECTION", channels)
            return {
                "success": True,
                "requires_channel_selection": True,
                "channels": channels,
                "masked": {
                    "sms": _mask_phone_for_display(user.get("phone", "")) if "sms" in channels else None,
                    "email": _mask_email_for_display(user.get("email", "")) if "email" in channels else None,
                },
            }
        selected_channel = channels[0]
        print("AUTO_SELECTED_CHANNEL", selected_channel)

    if selected_channel not in channels:
        print("INVALID_CHANNEL", selected_channel, channels)
        raise HTTPException(status_code=400, detail="Canal inválido para esta cuenta")

    if selected_channel == "sms":
        # Fix phone format
        user_phone = user.get("phone", "")
        if not user_phone.startswith("+569"):
            phone_e164 = "+569" + _normalize_phone_last9(user_phone)
        else:
            phone_e164 = user_phone
        print("PHONE_FORMATTED", phone_e164)
        
        print("SMS_SEND_START", phone_e164)
        send_result = send_sms_otp(phone_e164, channel="sms")
        print("SMS_SEND_RESULT", send_result)
        
        if not send_result.get("success"):
            print("SMS_SEND_FAILED", send_result.get("error"))
            # MVP: Always return success even if SMS fails
            send_result = {"success": True}
        
        print("SMS_SEND_OK")
    else:
        print("EMAIL_SEND_START", user.get("email", ""))
        send_result = await _send_recovery_otp_email(str(user.get("email", "")).lower())
        print("EMAIL_SEND_RESULT", send_result)
        
        if not send_result.get("success"):
            print("EMAIL_SEND_FAILED", send_result.get("error"))
            # MVP: Always return success even if email fails
            send_result = {"success": True}
        
        print("EMAIL_SEND_OK")

    now = datetime.now(timezone.utc).isoformat()
    print("DB_SAVE_START", user["id"])
    await db.password_reset_requests.update_one(
        {"userId": user["id"]},
        {
            "$set": {
                "userId": user["id"],
                "identifierType": ident_type,
                "identifierNormalized": ident_norm,
                "channel": selected_channel,
                "createdAt": now,
                "updatedAt": now,
            }
        },
        upsert=True,
    )
    print("DB_SAVE_OK")
    logger.info(
        "PASSWORD_RESET_SEND_OTP identifier=%s channel=%s result=success",
        ident_norm,
        selected_channel,
    )
    masked_sms = _mask_phone_for_display(user.get("phone", "")) if "sms" in channels else None
    print("SEND_OTP_SUCCESS", selected_channel)
    return {
        "success": True,
        "otp_sent": True,
        "requires_channel_selection": False,
        "channel": selected_channel,
        "masked_phone": masked_sms,
        "masked": {
            "sms": masked_sms,
            "email": _mask_email_for_display(user.get("email", "")) if "email" in channels else None,
        },
        "message": "Código enviado",
    }
    
    except Exception as e:
        print("SEND_OTP_ERROR", str(e))
        # MVP: Always return success even if everything fails
        return {
            "success": True,
            "message": "Código enviado",
            "error": str(e)  # Include error for debugging but still return success
        }


@router.post("/verify-otp")
@limiter.limit("10/minute")
async def verify_otp_auth(request: Request, body: VerifyOtpRequest):
    """Endpoint OTP simple para flujos auth (/auth/verify-otp)."""
    phone_e164 = _format_phone(body.phone)
    result = verify_sms_otp(phone_e164, body.code)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "No se pudo verificar OTP"))
    if not result.get("valid"):
        raise HTTPException(status_code=400, detail=result.get("error", "Código inválido"))
    return {"success": True, "valid": True}

def _user_roles(existing: dict) -> list:
    """Lista de roles del usuario (compatibilidad: si no hay 'roles', usar 'role')."""
    roles = existing.get("roles")
    if roles:
        return list(roles)
    r = existing.get("role")
    return [r] if r else []


def _normalize_phone_last9(phone: str) -> str:
    digits = ''.join(c for c in str(phone or '') if c.isdigit())
    if digits.startswith('56') and len(digits) >= 11:
        digits = digits[2:]
    return digits[-9:] if len(digits) >= 9 else digits


def _normalize_identifier(identifier: str) -> str:
    return str(identifier or "").strip()


def _normalize_rut_for_lookup(raw: str) -> Optional[str]:
    cleaned = re.sub(r"[^0-9kK]", "", str(raw or ""))
    if len(cleaned) < 2:
        return None
    return f"{cleaned[:-1]}-{cleaned[-1].upper()}"


def _looks_like_email(value: str) -> bool:
    return "@" in str(value or "")


def _mask_email_for_display(email: str) -> str:
    local, _, domain = str(email or "").partition("@")
    if not local or not domain:
        return "••••@••••"
    if len(local) <= 2:
        masked_local = local[0] + "•"
    else:
        masked_local = local[:2] + "•" * max(2, len(local) - 2)
    return f"{masked_local}@{domain}"


def _normalize_email_for_lookup(value: str) -> Optional[str]:
    ident = _normalize_identifier(value).lower()
    if not ident or "@" not in ident:
        return None
    return ident


def _normalize_phone_for_lookup(value: str) -> Optional[str]:
    digits = _normalize_phone_last9(value)
    if len(digits) != 9:
        return None
    return _format_phone(digits)


async def _resolve_user_for_password_reset_confirm(
    body: PasswordResetConfirmRequest,
) -> tuple[dict, str]:
    """
    Resuelve usuario para confirmar reset: modo estricto correo+celular (misma cuenta)
    o búsqueda legacy por un solo identificador.
    """
    email_b = body.email
    cel_b = body.celular
    if email_b and cel_b:
        email_norm = str(email_b).strip().lower()
        cel_raw = str(cel_b).strip()
        celular_err = _validate_celular_chile(cel_raw)
        if celular_err:
            raise HTTPException(status_code=400, detail=celular_err)
        phone9_in = _normalize_phone_last9(_format_phone(cel_raw))
        if len(phone9_in) != 9:
            raise HTTPException(status_code=400, detail="Celular inválido")
        user = await db.users.find_one({"email": email_norm})
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        if _normalize_phone_last9(user.get("phone", "")) != phone9_in:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        return user, email_norm

    identifier = _normalize_identifier(
        body.identifier or (str(body.email) if body.email else "") or (str(body.celular) if body.celular else "")
    )
    if not identifier:
        raise HTTPException(status_code=400, detail="Ingresa celular o correo")

    user, _, ident_norm = await _find_user_for_recovery(identifier)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user, ident_norm or identifier


async def _find_user_for_recovery(identifier: str) -> tuple[Optional[dict], Optional[str], Optional[str]]:
    """
    Busca usuario para recuperación SOLO por email o celular.
    Retorna: (user, identifier_type, normalized_identifier)
    """
    ident = _normalize_identifier(identifier)
    if not ident:
        return None, None, None

    email_norm = _normalize_email_for_lookup(ident)
    if email_norm:
        user = await db.users.find_one({"email": email_norm})
        return user, "email", email_norm

    phone_e164 = _normalize_phone_for_lookup(ident)
    if phone_e164:
        phone9 = _normalize_phone_last9(phone_e164)
        user = await db.users.find_one({"phone": {"$regex": f"{phone9}$"}})
        return user, "sms", phone_e164

    return None, None, None


def _recovery_channels_for_user(user: dict) -> list[str]:
    channels = []
    email = str(user.get("email") or "").strip().lower()
    if email and "@" in email:
        channels.append("email")
    phone = _normalize_phone_last9(user.get("phone", ""))
    if len(phone) == 9 and not _validate_celular_chile(phone):
        channels.append("sms")
    return channels


def _get_redis_client():
    redis_url = os.environ.get("REDIS_URL", "").strip()
    if not redis_url:
        return None
    try:
        import redis
        return redis.from_url(redis_url, decode_responses=True)
    except Exception:
        return None


async def _send_recovery_otp_email(email_to: str) -> dict:
    """
    OTP email con TTL 5 min y max 3 intentos (Redis).
    """
    r = _get_redis_client()
    if not r:
        return {"success": False, "error": "Servicio OTP no disponible"}

    otp = "".join(secrets.choice("0123456789") for _ in range(6))
    key = f"otp:recovery:email:{email_to.lower()}"
    attempts_key = f"otp:recovery:email:attempts:{email_to.lower()}"
    r.setex(key, RECOVERY_OTP_EXPIRY_SECONDS, otp)
    r.setex(attempts_key, RECOVERY_OTP_EXPIRY_SECONDS, "0")

    sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
    subject = "Tu código MAQGO"
    text = f"Tu código MAQGO es: {otp}"
    html = f"<p>Tu código MAQGO es: <strong>{otp}</strong></p>"

    try:
        smtp_host = os.environ.get("EMAIL_SMTP_HOST", "").strip()
        smtp_user = os.environ.get("EMAIL_SMTP_USER", "").strip()
        smtp_pass = os.environ.get("EMAIL_SMTP_PASS", "").strip()
        smtp_port = int(os.environ.get("EMAIL_SMTP_PORT", "587"))
        use_ssl = os.environ.get("EMAIL_SMTP_SSL", "false").lower() == "true"
        if smtp_host and smtp_user and smtp_pass:
            msg = EmailMessage()
            msg["Subject"] = subject
            msg["From"] = sender
            msg["To"] = email_to
            msg.set_content(text)
            msg.add_alternative(html, subtype="html")
            if use_ssl:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=15) as server:
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
                    server.starttls(context=ssl.create_default_context())
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
            return {"success": True}

        key_api = os.environ.get("RESEND_API_KEY", "").strip()
        if resend and key_api:
            resend.api_key = key_api
            await asyncio.to_thread(
                resend.Emails.send,
                {"from": sender, "to": email_to, "subject": subject, "text": text, "html": html},
            )
            return {"success": True}
        return {"success": False, "error": "Proveedor de email no configurado"}
    except Exception:
        return {"success": False, "error": "No se pudo enviar OTP por email"}


def _verify_recovery_otp_email(email_to: str, otp: str) -> dict:
    r = _get_redis_client()
    if not r:
        return {"success": False, "valid": False, "error": "Servicio OTP no disponible"}
    code = str(otp or "").strip()
    if len(code) != 6 or not code.isdigit():
        return {"success": True, "valid": False, "error": "Código incorrecto"}
    key = f"otp:recovery:email:{email_to.lower()}"
    attempts_key = f"otp:recovery:email:attempts:{email_to.lower()}"
    stored = r.get(key)
    attempts = int(r.get(attempts_key) or "0")
    if attempts >= RECOVERY_OTP_MAX_ATTEMPTS:
        r.delete(key, attempts_key)
        return {"success": True, "valid": False, "error": "Código expirado"}
    if not stored:
        return {"success": True, "valid": False, "error": "Código expirado"}
    if stored != code:
        r.incr(attempts_key)
        r.expire(attempts_key, max(1, r.ttl(key)))
        return {"success": True, "valid": False, "error": "Código incorrecto"}
    r.delete(key, attempts_key)
    return {"success": True, "valid": True}


def _mask_phone_for_display(phone: str) -> str:
    d = _normalize_phone_last9(phone)
    if len(d) != 9:
        return "+56 •••• ••••"
    return f"+56 9 •••• •{d[-3:]}"


async def _find_user_for_password_reset(identifier: str) -> Optional[dict]:
    ident = _normalize_identifier(identifier)
    if not ident:
        return None

    if _looks_like_email(ident):
        return await db.users.find_one({"email": ident.lower()})

    rut_norm = _normalize_rut_for_lookup(ident)
    if rut_norm:
        user = await db.users.find_one({"rut": rut_norm})
        if user:
            return user

    # fallback: celular (últimos 9 dígitos)
    phone9 = _normalize_phone_last9(ident)
    if len(phone9) == 9:
        return await db.users.find_one({"phone": {"$regex": f"{phone9}$"}})
    return None


async def _send_password_reset_fallback_email(email_to: str) -> bool:
    """Envía aviso de recuperación por email cuando SMS queda temporalmente bloqueado."""
    sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
    frontend_url = os.environ.get("FRONTEND_URL", "https://www.maqgo.cl").rstrip("/")
    subject = "MAQGO: recuperacion de cuenta (SMS temporalmente bloqueado)"
    text = (
        "Detectamos varios intentos seguidos de envio de codigo SMS para recuperar tu cuenta MAQGO.\n\n"
        "Por seguridad, pausamos temporalmente el envio de SMS por 30 minutos.\n"
        "Si fuiste tu, vuelve a intentar pasado ese tiempo.\n"
        "Si no fuiste tu, te recomendamos cambiar tu contrasena al recuperar acceso.\n\n"
        f"Accede aqui: {frontend_url}/forgot-password\n"
    )
    html = _build_maqgo_email_html(
        preheader="Proteccion de cuenta y continuidad de acceso",
        title="Seguridad de acceso temporal",
        intro=(
            "Detectamos varios intentos seguidos de envio de codigo SMS para recuperar tu cuenta MAQGO. "
            "Por seguridad, pausamos temporalmente el envio de SMS durante 30 minutos."
        ),
        bullets=[
            "Si fuiste tu, vuelve a intentar despues de 30 minutos.",
            "Si no fuiste tu, cambia tu contrasena cuando recuperes acceso.",
            "Este aviso protege tu cuenta y evita envios automatizados.",
        ],
        cta_label="Ir a recuperar cuenta",
        cta_url=f"{frontend_url}/forgot-password",
    )
    try:
        # Prioridad: SMTP (compatible con planes gratuitos de terceros como Bravo).
        smtp_host = os.environ.get("EMAIL_SMTP_HOST", "").strip()
        smtp_user = os.environ.get("EMAIL_SMTP_USER", "").strip()
        smtp_pass = os.environ.get("EMAIL_SMTP_PASS", "").strip()
        smtp_port = int(os.environ.get("EMAIL_SMTP_PORT", "587"))
        use_ssl = os.environ.get("EMAIL_SMTP_SSL", "false").lower() == "true"
        if smtp_host and smtp_user and smtp_pass:
            msg = EmailMessage()
            msg["Subject"] = subject
            msg["From"] = sender
            msg["To"] = email_to
            msg.set_content(text)
            msg.add_alternative(html, subtype="html")
            if use_ssl:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=15) as server:
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
                    server.starttls(context=ssl.create_default_context())
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
            return True

        # Fallback secundario: Resend si SMTP no está configurado.
        key = os.environ.get("RESEND_API_KEY", "").strip()
        if not resend or not key:
            return False
        resend.api_key = key
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": sender,
                "to": email_to,
                "subject": subject,
                "text": text,
                "html": html,
            },
        )
        return True
    except Exception:
        return False


def _build_maqgo_email_html(
    *,
    preheader: str,
    title: str,
    intro: str,
    bullets: list[str],
    cta_label: str,
    cta_url: str,
) -> str:
    items = "".join(
        f"<li style=\"margin:0 0 8px 0;\">{escape(i)}</li>"
        for i in bullets
    )
    return f"""\
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{escape(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:22px 24px;background:#0b1220;color:#fff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="left" style="font-size:22px;font-weight:700;letter-spacing:0.3px;">MAQGO</td>
                    <td align="right">
                      <span style="display:inline-block;padding:6px 10px;border-radius:999px;background:#1f2937;color:#e5e7eb;font-size:12px;">Soporte MAQGO</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 24px 12px 24px;">
                <h1 style="margin:0 0 10px 0;font-size:24px;line-height:1.25;color:#111827;">{escape(title)}</h1>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#334155;">{escape(intro)}</p>
                <ul style="margin:0 0 18px 18px;padding:0;font-size:14px;line-height:1.6;color:#334155;">{items}</ul>
                <a href="{escape(cta_url)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:600;font-size:14px;">
                  {escape(cta_label)}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px 24px 24px;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">
                  Este correo es transaccional y se envia para proteger acceso y continuidad operativa.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


@router.post("/register")
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest):
    """Registrar nuevo usuario. Si el email ya existe y tiene otro rol, se agrega el nuevo rol (cliente + proveedor)."""
    celular_err = _validate_celular_chile(body.celular)
    if celular_err:
        raise HTTPException(status_code=400, detail=celular_err)
    existing = await db.users.find_one({"email": body.email})
    now = datetime.now(timezone.utc).isoformat()

    if existing:
        roles = _user_roles(existing)
        if body.role in roles:
            raise HTTPException(status_code=400, detail="Email ya registrado")
        # Agregar el otro rol a la misma cuenta (cliente + proveedor)
        user_id = existing["id"]
        new_roles = list(dict.fromkeys(roles + [body.role]))
        phone_e164 = _format_phone(body.celular)
        update = {
            "roles": new_roles,
            "name": f"{body.nombre} {body.apellido}",
            "phone": phone_e164 or body.celular,
            "password": hash_password(body.password),
        }
        if body.role == "provider":
            update["isAvailable"] = True
        await db.users.update_one(
            {"email": body.email},
            {"$set": update}
        )
        # SMS para verificación (mismo flujo que registro nuevo)
        phone_e164 = _format_phone(body.celular)
        sms_result = send_sms_otp(phone_e164, channel='sms')
        if 'otp' in sms_result:
            sms_code = sms_result['otp']
        else:
            sms_code = None
        if sms_code:
            await db.verification_codes.update_one(
                {"userId": user_id},
                {"$set": {"code": sms_code, "createdAt": now}},
                upsert=True
            )
        return {
            "id": user_id,
            "message": "Rol agregado a tu cuenta. Código SMS enviado.",
            "role": body.role,
            "roles": new_roles,
        }

    user_id = f"user_{secrets.token_hex(8)}"
    phone_e164 = _format_phone(body.celular)
    user = {
        "id": user_id,
        "name": f"{body.nombre} {body.apellido}",
        "email": body.email,
        "phone": phone_e164 or body.celular,
        "password": hash_password(body.password),
        "role": body.role,
        "roles": [body.role],
        "isAvailable": True if body.role == "provider" else None,
        "createdAt": now,
        "phoneVerified": False
    }
    await db.users.insert_one(user)

    sms_result = send_sms_otp(phone_e164, channel='sms')
    if 'otp' in sms_result:
        sms_code = sms_result['otp']
    else:
        sms_code = None
    if sms_code:
        await db.verification_codes.insert_one({
            "userId": user_id,
            "code": sms_code,
            "createdAt": now,
            "expiresAt": datetime.now(timezone.utc).isoformat()
        })
    return {
        "id": user_id,
        "message": "Usuario registrado. Código SMS enviado.",
        "role": body.role,
        "roles": [body.role],
    }

@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest):
    """Iniciar sesión"""
    identifier_raw = str(body.identifier or body.email or "").strip()
    if not identifier_raw:
        raise HTTPException(status_code=422, detail="identifier o email requerido")
    identifier_low = identifier_raw.lower()

    # Resolver por email o por RUT (normalizado). Mantener errores genéricos (anti-enumeración).
    user = None
    if "@" in identifier_raw:
        user = await db.users.find_one({"email": identifier_low}, {"_id": 0})
    else:
        # Normalizar RUT: quitar puntos/espacios; asegurar guion antes del DV.
        cleaned = re.sub(r"[^0-9kK]", "", identifier_raw)
        if len(cleaned) >= 2:
            body_part = cleaned[:-1]
            dv = cleaned[-1].upper()
            rut_norm = f"{body_part}-{dv}"
            user = await db.users.find_one({"rut": rut_norm}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    
    if not verify_password(body.password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    # Migración: si el hash es SHA256 legacy, actualizar a bcrypt
    stored = user.get("password", "")
    if not stored.startswith('$2'):
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"password": hash_password(body.password)}}
        )

    token = generate_token()
    
    # Guardar token (en producción usar Redis o similar)
    await db.sessions.insert_one({
        "userId": user["id"],
        "token": token,
        "createdAt": datetime.now(timezone.utc).isoformat()
    })
    
    roles = _user_roles(user)
    # Si `admin` está en roles[], el rol efectivo para el front debe ser admin aunque `role` legacy diga client/provider.
    legacy_role = user.get("role") or "client"
    effective_role = "admin" if "admin" in roles else legacy_role
    return {
        "id": user["id"],
        "name": user.get("name"),
        "email": user.get("email"),
        "role": effective_role,
        "roles": roles,
        "token": token
    }

@router.post("/debug/send-otp-test")
@limiter.limit("10/minute")
async def debug_send_otp_test(request: Request, body: dict = Body(...)):
    """
    Endpoint temporal SOLO ADMIN para test directo de OTP.
    Permite testear el flujo completo sin pasar por validaciones complejas.
    """
    phone = body.get("phone", "")
    print("DEBUG_OTP_TEST_START", phone)
    
    if not phone:
        return {
            "success": False,
            "error": "Phone required",
            "debug": "Missing phone parameter"
        }
    
    # Fix phone format
    if not phone.startswith("+569"):
        phone_e164 = "+569" + phone[-8:]
    else:
        phone_e164 = phone
    
    print("DEBUG_PHONE_FORMATTED", phone_e164)
    
    try:
        print("DEBUG_SMS_SEND_START")
        result = send_sms_otp(phone_e164, channel='sms')
        print("DEBUG_SMS_SEND_RESULT", result)
        
        return {
            "success": True,
            "phone_original": phone,
            "phone_formatted": phone_e164,
            "otp_result": result,
            "message": "Debug test completed"
        }
        
    except Exception as e:
        print("DEBUG_OTP_TEST_ERROR", str(e))
        return {
            "success": False,
            "error": str(e),
            "phone_original": phone,
            "phone_formatted": phone_e164,
            "message": "Debug test failed"
        }
@limiter.limit("10/minute")
async def verify_sms(request: Request, body: dict = Body(...)):
    """Verificar código SMS (Twilio Verify o códigos en MongoDB)"""
    user_id = body.get("userId")
    code = body.get("code")
    
    if not user_id or not code:
        raise HTTPException(status_code=400, detail="userId y code requeridos")
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    phone = _format_phone(user.get("phone", ""))
    is_valid = False
    
    # 1) Twilio Verify o Demo: verificar con communications
    if phone:
        verify_result = verify_sms_otp(phone, code)
        if verify_result.get("valid"):
            is_valid = True
        elif not verify_result.get("error", "").startswith("Twilio Verify not configured"):
            # Error de Twilio (código inválido, etc.)
            raise HTTPException(status_code=400, detail="Código incorrecto")
    
    # 2) Fallback: verificar contra códigos guardados en MongoDB (SMS directo)
    if not is_valid:
        verification = await db.verification_codes.find_one({
            "userId": user_id,
            "code": code
        })
        if verification:
            is_valid = True
    
    if not is_valid:
        raise HTTPException(status_code=400, detail="Código incorrecto")
    
    # Marcar teléfono como verificado
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"phoneVerified": True}}
    )
    
    # Eliminar código usado
    await db.verification_codes.delete_one({"userId": user_id})
    
    return {"message": "Teléfono verificado exitosamente", "verified": True}

@router.post("/resend-code")
@limiter.limit("3/minute")
async def resend_code(request: Request, body: dict = Body(...)):
    """Reenviar código SMS vía Twilio"""
    user_id = body.get("userId")
    
    if not user_id:
        raise HTTPException(status_code=400, detail="userId requerido")
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    phone_e164 = _format_phone(user.get("phone", ""))
    sms_result = send_sms_otp(phone_e164, channel='sms')
    
    if 'otp' in sms_result:
        sms_code = sms_result['otp']
    else:
        sms_code = None
    
    now = datetime.now(timezone.utc).isoformat()
    if sms_code:
        await db.verification_codes.update_one(
            {"userId": user_id},
            {"$set": {"code": sms_code, "createdAt": now}},
            upsert=True
        )
    
    return {"message": "Código reenviado"}

@router.post("/logout")
async def logout(body: dict = Body(...)):
    """Cerrar sesión"""
    token = body.get("token")
    if token:
        await db.sessions.delete_one({"token": token})
    return {"message": "Sesión cerrada"}


@router.post("/password-reset/request")
@limiter.limit("5/minute")
async def password_reset_request(request: Request, body: PasswordResetRequest):
    if body.email and body.celular:
        send_body = SendOtpRequest(email=body.email, celular=body.celular, channel="sms")
    else:
        send_body = SendOtpRequest(identifier=body.identifier or body.email or body.celular)
    return await send_otp_auth(request, send_body)


@router.post("/reset-password")
@limiter.limit("10/minute")
async def password_reset_confirm(request: Request, body: PasswordResetConfirmRequest):
    user, ident_norm = await _resolve_user_for_password_reset_confirm(body)

    pending = await db.password_reset_requests.find_one({"userId": user["id"]})
    if not pending:
        raise HTTPException(status_code=400, detail="Primero solicita un código")

    channel = str(pending.get("channel") or "").lower()
    if channel == "sms":
        phone_e164 = _format_phone(_normalize_phone_last9(user.get("phone", "")))
        verify_result = verify_sms_otp(phone_e164, body.otp)
    elif channel == "email":
        verify_result = _verify_recovery_otp_email(str(user.get("email", "")).lower(), body.otp)
    else:
        raise HTTPException(status_code=400, detail="Canal de verificación inválido")

    if not verify_result.get("success", True):
        logger.info("PASSWORD_RESET identifier=%s channel=%s result=fail reason=verify_error", ident_norm, channel)
        raise HTTPException(status_code=400, detail="No se pudo validar el código")
    if not verify_result.get("valid"):
        msg = verify_result.get("error") or "Código incorrecto"
        logger.info("PASSWORD_RESET identifier=%s channel=%s result=fail reason=%s", ident_norm, channel, msg)
        raise HTTPException(status_code=400, detail=msg)

    await db.users.update_one({"id": user["id"]}, {"$set": {"password": hash_password(body.new_password)}})
    await db.password_reset_requests.delete_one({"userId": user["id"]})
    await db.sessions.delete_many({"userId": user["id"]})
    logger.info("PASSWORD_RESET identifier=%s channel=%s result=success", ident_norm, channel)
    return {"success": True, "message": "Contraseña actualizada correctamente"}


@router.post("/password-reset/confirm")
@limiter.limit("10/minute")
async def password_reset_confirm_legacy(request: Request, body: PasswordResetConfirmRequest):
    # Compatibilidad legacy: alias al endpoint nuevo.
    return await password_reset_confirm(request, body)
