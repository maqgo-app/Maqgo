"""
STABLE MODULE — NO MODIFICAR SIN REVISIÓN DE PRODUCCIÓN
"""
from fastapi import APIRouter, HTTPException, Body, Request, Depends
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

from pymongo.errors import DuplicateKeyError
from contextvars import ContextVar

from rate_limit import limiter
from db_config import get_db_name, get_mongo_url

from auth_dependency import create_session_for_user, get_current_user
from communications import (
    send_sms_otp,
    verify_sms_otp,
)
from models.trusted_device import build_trusted_session_touch
from ops_structured_log import log_ops_event
from services.risk_auth_service import (
    clear_hard_lockout,
    clear_login_verify_failures,
    ensure_trusted_device_indexes,
    find_trusted_device,
    get_client_country,
    get_client_ip,
    get_client_user_agent,
    is_hard_locked,
    is_risky_login,
    normalize_device_id,
    record_hard_lockout_failure,
    record_login_verify_failure,
    too_many_recent_login_failures,
    upsert_trusted_device,
)

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

# Reintento seguro tras DuplicateKeyError (carrera / índice único): segunda pasada ve al usuario en Mongo.
_register_dup_pass: ContextVar[int] = ContextVar("_register_dup_pass", default=0)


def _mask_email_for_display(email: str) -> str:
    """Enmascara un correo: to***@gmail.com"""
    if not email or "@" not in email:
        return ""
    try:
        user_part, domain_part = email.split("@")
        if len(user_part) <= 2:
            return f"{user_part}***@{domain_part}"
        return f"{user_part[:2]}***@{domain_part}"
    except Exception:
        return ""


def _phone_tail_log(phone: str) -> str:
    d = "".join(c for c in (phone or "") if c.isdigit())
    return f"***{d[-4:]}" if len(d) >= 4 else "***"

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


# Login SMS: solo móvil Chile +569 + 8 dígitos (total 9 nacionales empezando en 9)
_CHILE_MOBILE_E164_RE = re.compile(r"^\+569\d{8}$")


def _normalize_login_celular_e164(celular: str) -> str:
    """
    Normaliza a +569XXXXXXXX. Acepta 9XXXXXXXX, +569…, 569…, espacios y pegados con +56.
    Raises ValueError si no cumple ^\\+569\\d{8}$.
    """
    s = re.sub(r"\s+", "", (celular or "").strip())
    if s.startswith("+"):
        s = s[1:]
    digits = "".join(c for c in s if c.isdigit())
    if digits.startswith("56") and len(digits) >= 11:
        digits = digits[2:]
    elif len(digits) > 9:
        digits = digits[-9:]
    if len(digits) != 9 or digits[0] != "9":
        raise ValueError("invalid_phone")
    out = f"+56{digits}"
    if not _CHILE_MOBILE_E164_RE.fullmatch(out):
        raise ValueError("invalid_phone")
    return out


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
    #: True si el celular ya fue verificado con POST /auth/verify-otp (intent=provider_register) en esta sesión.
    phone_preverified: bool = False

    @field_validator('password')
    @classmethod
    def register_password_complexity(cls, v: str) -> str:
        if not re.search(r'[A-Za-z]', v) or not re.search(r'\d', v):
            raise ValueError('La contraseña debe incluir letras y números')
        return v


class ProviderRegisterStatusBody(BaseModel):
    """Celular chileno (9 dígitos o +56...) para decidir si el alta proveedor puede saltar SMS."""

    celular: str


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
    model_config = {"populate_by_name": True}

    phone: str = Field(..., validation_alias=AliasChoices("phone", "phone_number"))
    code: str = Field(..., min_length=6, max_length=6)
    user_id: Optional[str] = Field(None, description="Opcional: para registrar trusted_device tras OTP válido")
    device_id: Optional[str] = Field(None, description="Opcional: mismo esquema que login-sms/verify")
    intent: Optional[str] = Field(
        None,
        description="provider_register: Redis TTL + sesión JWT para POST /users/become-provider.",
    )


class LoginSmsStartRequest(BaseModel):
    celular: str = Field(..., description="Celular chileno, se normaliza a E.164 (+56...)")
    device_id: Optional[str] = Field(
        None,
        description="Identificador persistente del dispositivo (p. ej. UUID en localStorage)",
    )


class LoginSmsVerifyRequest(BaseModel):
    celular: str = Field(..., description="Celular usado en el paso anterior")
    code: str = Field(..., min_length=6, max_length=6, description="Código OTP de 6 dígitos")
    device_id: Optional[str] = Field(
        None,
        description="Mismo device_id enviado en login-sms/start",
    )


class CheckDeviceRequest(BaseModel):
    """Cuerpo para evaluar si hace falta OTP (misma política que login-sms/start)."""

    user_id: str = Field(..., min_length=4)
    phone_number: str = Field(..., description="Celular chileno (mismo formato que login SMS)")
    device_id: str = Field(..., min_length=8, description="Identificador estable del dispositivo")


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


def _user_roles(existing: dict) -> list:
    """Lista de roles del usuario (compatibilidad: si no hay 'roles', usar 'role')."""
    roles = existing.get("roles")
    if roles:
        return list(roles)
    r = existing.get("role")
    return [r] if r else []


def _effective_session_role(roles: list, legacy_role: Optional[str]) -> str:
    """
    Rol efectivo para login y /me cuando existe roles[].
    - admin gana.
    - Si tiene provider en roles[], exponer provider (misma cuenta cliente+proveedor).
    - Si no, campo legacy `role` (típico solo cliente).
    """
    if "admin" in roles:
        return "admin"
    if "provider" in roles:
        return "provider"
    return (legacy_role or "client") or "client"


def _provider_role_for_api(user: dict, roles: list) -> Optional[str]:
    """
    Rol proveedor jerárquico para JSON (login, SMS, /me).
    - Titular enrolado o legacy `owner` → super_master si tiene rol provider.
    - master / operator se devuelven tal cual.
    - Sin rol provider → None (no forzar super_master: evita confundir clientes).
    """
    pr = user.get("provider_role")
    if pr == "owner" or pr is None:
        return "super_master" if "provider" in roles else None
    return pr


def _build_login_sms_session_payload(user: dict, token: str, *, requires_otp: bool) -> dict:
    """Respuesta unificada login SMS (OTP o confianza por dispositivo)."""
    roles = _user_roles(user)
    legacy_role = user.get("role") or "client"
    effective_role = _effective_session_role(roles, legacy_role)
    pr = _provider_role_for_api(user, roles)
    oid = user.get("owner_id")
    uid = user["id"]
    return {
        "id": uid,
        "user_id": uid,
        "name": user.get("name"),
        "email": user.get("email"),
        "phone": user.get("phone"),
        "role": effective_role,
        "roles": roles,
        "token": token,
        "requires_otp": requires_otp,
        "provider_role": pr,
        "owner_id": oid,
        "user": {
            "id": user["id"],
            "name": user.get("name"),
            "email": user.get("email"),
            "phone": user.get("phone"),
            "roles": roles,
            "role": effective_role,
            "provider_role": pr,
            "owner_id": oid,
        },
    }


@router.post("/send-otp")
@limiter.limit("5/minute")
async def send_otp_auth(request: Request, body: SendOtpRequest):
    """
    /auth/send-otp — tres paths exclusivos:
    1. body.phone solo → OTP registro/verificación (legacy)
    2. body.email + body.celular → recuperación por par email+teléfono
    3. body.identifier → recuperación por email o teléfono con selección de canal
    """
    try:
        return await _send_otp_auth_impl(request, body)
    except HTTPException:
        raise
    except Exception as e:
        log_ops_event(
            logger,
            event="otp_send_unexpected",
            success=False,
            error_type=type(e).__name__,
        )
        logger.exception("send_otp_auth unexpected")
        raise HTTPException(
            status_code=500,
            detail="No pudimos enviar el código. Intenta más tarde.",
        ) from None


async def _send_otp_auth_impl(request: Request, body: SendOtpRequest):
    # --- Path 1: Registro/verificación (legacy) ---
    if body.phone and not body.identifier and not (body.email and body.celular):
        err = _validate_celular_chile(body.phone)
        if err:
            raise HTTPException(status_code=400, detail=err)
        raw = body.phone
        phone_e164 = raw if raw.startswith("+569") else "+569" + _normalize_phone_last9(raw)
        result = send_sms_otp(phone_e164, channel="sms")
        if not result.get("success"):
            log_ops_event(
                logger,
                event="otp_send_failed",
                path="phone_legacy",
                phone=_phone_tail_log(phone_e164),
                success=False,
                reason=str(result.get("error") or "sms")[:120],
            )
            raise HTTPException(status_code=502, detail=result.get("error", "No se pudo enviar el código"))
        log_ops_event(
            logger,
            event="otp_sent",
            path="phone_legacy",
            phone=_phone_tail_log(phone_e164),
            success=True,
        )
        return {"success": True, "message": "Código enviado"}

    # --- Path 2: Recuperación email + celular ---
    email_pair = str(body.email or "").strip()
    cel_pair = str(body.celular or "").strip()
    if email_pair and cel_pair:
        err = _validate_celular_chile(cel_pair)
        if err:
            raise HTTPException(status_code=400, detail=err)
        phone9_in = _normalize_phone_last9(_format_phone(cel_pair))
        if len(phone9_in) != 9:
            raise HTTPException(status_code=400, detail="Celular inválido")
        user = await db.users.find_one({"email": email_pair.lower()})
        if not user or _normalize_phone_last9(user.get("phone", "")) != phone9_in:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        channels = _recovery_channels_for_user(user)
        if "sms" not in channels:
            raise HTTPException(status_code=400, detail="Cuenta sin método de recuperación disponible")
        raw = user.get("phone", "")
        phone_e164 = raw if raw.startswith("+569") else "+569" + _normalize_phone_last9(raw)
        send_result = send_sms_otp(phone_e164, channel="sms")
        if not send_result.get("success"):
            log_ops_event(
                logger,
                event="otp_send_failed",
                path="recovery_email_phone",
                success=False,
                reason=str(send_result.get("error") or "sms")[:120],
            )
            raise HTTPException(status_code=502, detail=send_result.get("error", "No se pudo enviar el código"))
        now = datetime.now(timezone.utc).isoformat()
        await db.password_reset_requests.update_one(
            {"userId": user["id"]},
            {"$set": {"userId": user["id"], "identifierType": "email", "identifierNormalized": email_pair.lower(), "channel": "sms", "createdAt": now, "updatedAt": now}},
            upsert=True,
        )
        logger.info("PASSWORD_RESET_SEND_OTP identifier=%s channel=sms mode=email_plus_phone", email_pair.lower())
        log_ops_event(
            logger,
            event="otp_sent",
            path="recovery_email_phone",
            channel="sms",
            success=True,
        )
        masked_sms = _mask_phone_for_display(user.get("phone", ""))
        return {
            "success": True,
            "otp_sent": True,
            "requires_channel_selection": False,
            "channel": "sms",
            "masked_phone": masked_sms,
            "masked": {"sms": masked_sms, "email": _mask_email_for_display(user.get("email", ""))},
            "message": "Código enviado",
        }

    # --- Path 3: Recuperación por identifier ---
    identifier = _normalize_identifier(body.identifier or "")
    if not identifier:
        raise HTTPException(status_code=400, detail="Ingresa celular o correo")
    user, ident_type, ident_norm = await _find_user_for_recovery(identifier)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    channels = _recovery_channels_for_user(user)
    if not channels:
        raise HTTPException(status_code=400, detail="Cuenta sin método de recuperación disponible")
    selected_channel = str(body.channel or "").strip().lower()
    if not selected_channel:
        if len(channels) > 1:
            log_ops_event(
                logger,
                event="otp_channel_selection_required",
                success=True,
            )
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
    if selected_channel not in channels:
        raise HTTPException(status_code=400, detail="Canal inválido para esta cuenta")
    if selected_channel == "sms":
        raw = user.get("phone", "")
        phone_e164 = raw if raw.startswith("+569") else "+569" + _normalize_phone_last9(raw)
        send_result = send_sms_otp(phone_e164, channel="sms")
        if not send_result.get("success"):
            log_ops_event(
                logger,
                event="otp_send_failed",
                path="recovery_identifier",
                channel="sms",
                success=False,
                reason=str(send_result.get("error") or "sms")[:120],
            )
            raise HTTPException(status_code=502, detail=send_result.get("error", "No se pudo enviar el código"))
    else:
        send_result = await _send_recovery_otp_email(str(user.get("email", "")).lower())
        if not send_result.get("success"):
            log_ops_event(
                logger,
                event="otp_send_failed",
                path="recovery_identifier",
                channel="email",
                success=False,
                reason=str(send_result.get("error") or "email")[:120],
            )
            raise HTTPException(status_code=502, detail=send_result.get("error", "No se pudo enviar el código"))
    now = datetime.now(timezone.utc).isoformat()
    await db.password_reset_requests.update_one(
        {"userId": user["id"]},
        {"$set": {"userId": user["id"], "identifierType": ident_type, "identifierNormalized": ident_norm, "channel": selected_channel, "createdAt": now, "updatedAt": now}},
        upsert=True,
    )
    logger.info("PASSWORD_RESET_SEND_OTP identifier=%s channel=%s", ident_norm, selected_channel)
    masked_sms = _mask_phone_for_display(user.get("phone", "")) if "sms" in channels else None
    log_ops_event(
        logger,
        event="otp_sent",
        path="recovery_identifier",
        channel=selected_channel,
        success=True,
    )
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


@router.post("/verify-otp")
@limiter.limit("10/minute")
async def verify_otp_auth(request: Request, body: VerifyOtpRequest):
    """
    Verifica OTP SMS (legacy: solo phone + code).
    Si envías `device_id` (y existe usuario para ese teléfono), persiste trusted_device
    igual que tras login-sms/verify (upsert_trusted_device + IP/país/UA del request).
    """
    try:
        phone_e164 = _format_phone(body.phone)
        result = verify_sms_otp(phone_e164, body.code)
        if not result.get("success"):
            log_ops_event(
                logger,
                event="otp_verify_failed",
                phone=_phone_tail_log(phone_e164),
                success=False,
                reason="verify_error",
            )
            raise HTTPException(status_code=400, detail=result.get("error", "No se pudo verificar OTP"))
        if not result.get("valid"):
            log_ops_event(
                logger,
                event="otp_verify_failed",
                phone=_phone_tail_log(phone_e164),
                success=False,
                reason="invalid_code",
            )
            raise HTTPException(status_code=400, detail=result.get("error", "Código inválido"))

        device_norm = normalize_device_id(body.device_id)
        if device_norm:
            await ensure_trusted_device_indexes(db)
            phone9 = _normalize_phone_last9(phone_e164)
            if len(phone9) == 9:
                user = await db.users.find_one({"phone": {"$regex": f"{phone9}$"}}, {"_id": 0})
                if user:
                    if body.user_id and user.get("id") != body.user_id:
                        log_ops_event(
                            logger,
                            event="otp_verify_failed",
                            phone=_phone_tail_log(phone_e164),
                            success=False,
                            reason="user_mismatch",
                        )
                        raise HTTPException(
                            status_code=400,
                            detail="El usuario no coincide con el teléfono verificado.",
                        )
                    uid = user["id"]
                    await upsert_trusted_device(
                        db,
                        user_id=uid,
                        phone_e164=phone_e164,
                        device_id=device_norm,
                        last_ip=get_client_ip(request),
                        last_country=get_client_country(request),
                        user_agent=get_client_user_agent(request),
                    )
                    clear_login_verify_failures(uid, device_norm)

        log_ops_event(
            logger,
            event="otp_verified",
            phone=_phone_tail_log(phone_e164),
            success=True,
        )
        if getattr(body, "intent", None) == "provider_register":
            _redis_mark_provider_register_phone_verified(phone_e164)
            phone9_sess = _normalize_phone_last9(phone_e164)
            user_doc = None
            if len(phone9_sess) == 9:
                user_doc = await db.users.find_one(
                    {"phone": {"$regex": f"{phone9_sess}$"}},
                    {"_id": 0},
                )
            now_sess = datetime.now(timezone.utc).isoformat()
            if not user_doc:
                user_id_new = f"user_{secrets.token_hex(8)}"
                user_doc = {
                    "id": user_id_new,
                    "name": None,
                    "email": None,
                    "phone": phone_e164,
                    "role": "client",
                    "roles": ["client"],
                    "isAvailable": None,
                    "createdAt": now_sess,
                    "phoneVerified": True,
                }
                await db.users.insert_one(user_doc)
                logger.info(
                    "VERIFY_OTP provider_register created userId=%s phone=%s",
                    user_id_new,
                    _phone_tail_log(phone_e164),
                )
            else:
                await db.users.update_one(
                    {"id": user_doc["id"]},
                    {"$set": {"phoneVerified": True}},
                )
            sess_token = await create_session_for_user(user_doc["id"])
            uid_otp = user_doc["id"]
            return {
                "success": True,
                "valid": True,
                "token": sess_token,
                "userId": uid_otp,
                "user_id": uid_otp,
            }
        return {"success": True, "valid": True}
    except HTTPException:
        raise
    except Exception as e:
        log_ops_event(
            logger,
            event="otp_verify_unexpected",
            success=False,
            error_type=type(e).__name__,
        )
        logger.exception("verify_otp_auth unexpected")
        raise HTTPException(
            status_code=500,
            detail="No se pudo verificar el código. Intenta nuevamente.",
        ) from None


@router.post("/login-sms/start")
@limiter.limit("5/minute")
async def login_sms_start(request: Request, body: LoginSmsStartRequest):
    """
    Paso 1: login unificado por celular.
    - Normaliza celular chileno a E.164.
    - Busca usuario por teléfono (últimos 9 dígitos).
    - Si no existe, crea usuario client con ese teléfono como identidad base (siempre OTP).
    - Si existe y hay dispositivo de confianza sin señales de riesgo → sesión directa (sin OTP).
    - Si no → envía OTP (TTL 5 min, rate limit SMS en otp_service).
    La decisión de confianza no usa caducidad temporal: solo riesgo (dispositivo, país, fallos recientes).
    No se pide OTP por “cambio de rol” ni por flujo proveedor: la política es riesgo/sesión/dispositivo.
    """
    try:
        raw_phone = _normalize_login_celular_e164(body.celular)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_phone", "message": "Número de celular inválido"},
        ) from None

    phone9 = _normalize_phone_last9(raw_phone)
    if len(phone9) != 9:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_phone", "message": "Número de celular inválido"},
        )

    await ensure_trusted_device_indexes(db)
    device_norm = normalize_device_id(body.device_id)

    if is_hard_locked(raw_phone):
        logger.warning("LOGIN_SMS_START hard_locked phone=%s", _phone_tail_log(raw_phone))
        raise HTTPException(
            status_code=429,
            detail="Tu cuenta está temporalmente bloqueada por seguridad. Intenta en 15 minutos.",
        )

    # Identidad base: teléfono único (últimos 9 dígitos) — evita duplicados por email.
    existing = await db.users.find_one({"phone": {"$regex": f"{phone9}$"}}, {"_id": 0})
    now = datetime.now(timezone.utc).isoformat()

    if existing:
        user_id = existing["id"]
        logger.info("LOGIN_SMS_START reuse userId=%s phone9=%s", user_id, phone9)

        ip = get_client_ip(request)
        country = get_client_country(request)
        ua_hdr = get_client_user_agent(request)

        trusted = None
        if device_norm:
            trusted = await find_trusted_device(
                db, user_id=user_id, phone_e164=raw_phone, device_id=device_norm
            )
            fails = too_many_recent_login_failures(user_id, device_norm)
            risky = is_risky_login(
                trusted_row=trusted,
                device_id_valid=True,
                current_country=country,
                too_many_failed=fails,
                current_ip=ip,
                current_user_agent=ua_hdr,
            )
        else:
            risky = True

        if not risky:
            token = generate_token()
            await db.sessions.insert_one(
                {
                    "userId": existing["id"],
                    "token": token,
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                }
            )
            if device_norm and trusted:
                cc = (country or trusted.get("last_country") or "").strip().upper()[:2]
                await db.trusted_devices.update_one(
                    {"user_id": user_id, "device_id": device_norm},
                    {"$set": build_trusted_session_touch(ip, cc, ua_hdr)},
                )
            logger.info(
                "LOGIN_SMS_START trust_login userId=%s phone9=%s country=%s",
                user_id,
                phone9,
                country or "-",
            )
            return _build_login_sms_session_payload(existing, token, requires_otp=False)
    else:
        user_id = f"user_{secrets.token_hex(8)}"
        user = {
            "id": user_id,
            "name": None,
            "email": None,
            "phone": raw_phone,
            "role": "client",
            "roles": ["client"],
            "isAvailable": None,
            "createdAt": now,
            "phoneVerified": False,
        }
        await db.users.insert_one(user)
        logger.info("LOGIN_SMS_START created userId=%s phone9=%s", user_id, phone9)

    sms_result = send_sms_otp(raw_phone, channel="sms")
    if not sms_result.get("success"):
        log_ops_event(
            logger,
            event="login_otp_send_failed",
            user_id=user_id,
            phone=_phone_tail_log(raw_phone),
            success=False,
            reason=str(sms_result.get("error") or "sms")[:120],
        )
        logger.warning(
            "LOGIN_SMS_START sms_failed userId=%s phone=%s error=%s",
            user_id,
            raw_phone,
            sms_result.get("error"),
        )
        user_doc = await db.users.find_one({"id": user_id})
        email = str(user_doc.get("email") or "").strip().lower() if user_doc else ""
        email_fallback_ok = False
        if email:
            email_result = await _send_recovery_otp_email(email)
            email_fallback_ok = bool(email_result.get("success"))
            logger.info(
                "LOGIN_SMS_START email_fallback userId=%s email=%s success=%s",
                user_id,
                email,
                email_fallback_ok,
            )
        if not email_fallback_ok:
            err_sms = str(sms_result.get("error") or "").strip()
            if "Demasiados intentos" in err_sms:
                detail = err_sms
            elif "OTP service not configured" in err_sms or "REDIS_URL required" in err_sms:
                detail = (
                    "El envío de SMS no está disponible. Si tienes correo en la cuenta, "
                    "prueba iniciar con email o contacta soporte."
                )
            else:
                detail = "No pudimos enviarte el código. Intenta nuevamente o usa tu correo."
            raise HTTPException(status_code=502, detail=detail)
        log_ops_event(
            logger,
            event="login_otp_sent",
            user_id=user_id,
            channel="email",
            success=True,
        )
        return {
            "success": True,
            "userId": user_id,
            "phone": raw_phone,
            "message": "No pudimos enviar SMS, te enviamos un código a tu correo.",
            "channel": "email",
            "requires_otp": True,
        }

    log_ops_event(
        logger,
        event="login_otp_sent",
        user_id=user_id,
        channel="sms",
        phone=_phone_tail_log(raw_phone),
        success=True,
    )
    return {
        "success": True,
        "userId": user_id,
        "phone": raw_phone,
        "message": "Te enviamos un código por SMS",
        "channel": "sms",
        "requires_otp": True,
    }


@router.post("/login-sms/verify")
@limiter.limit("10/minute")
async def login_sms_verify(request: Request, body: LoginSmsVerifyRequest):
    """
    Paso 2: validar OTP y crear sesión.
    - Si OTP válido → sesión + datos de usuario + trusted_device actualizado.
    - Si OTP inválido → mensaje claro y no avanza.
    """
    try:
        try:
            raw_phone = _normalize_login_celular_e164(body.celular)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={"error": "invalid_phone", "message": "Número de celular inválido"},
            )

        phone9 = _normalize_phone_last9(raw_phone)
        if len(phone9) != 9:
            raise HTTPException(
                status_code=400,
                detail={"error": "invalid_phone", "message": "Número de celular inválido"},
            )

        device_norm = normalize_device_id(body.device_id)
        ip = get_client_ip(request)
        country = get_client_country(request)
        ua_hdr = get_client_user_agent(request)

        user = await db.users.find_one({"phone": {"$regex": f"{phone9}$"}}, {"_id": 0})
        if not user:
            logger.warning("LOGIN_SMS_VERIFY user_not_found phone9=%s", phone9)
            log_ops_event(
                logger,
                event="login_otp_verify_failed",
                phone=_phone_tail_log(raw_phone),
                success=False,
                reason="user_not_found",
            )
            raise HTTPException(status_code=404, detail="No encontramos tu cuenta. Vuelve a intentar.")

        if is_hard_locked(raw_phone):
            raise HTTPException(
                status_code=429,
                detail="Tu cuenta está temporalmente bloqueada por seguridad. Intenta en 15 minutos.",
            )

        result = verify_sms_otp(raw_phone, body.code)
        if not result.get("success"):
            logger.info("LOGIN_SMS_VERIFY fail phone9=%s reason=%s", phone9, result.get("error"))
            log_ops_event(
                logger,
                event="login_otp_verify_failed",
                user_id=user["id"],
                phone=_phone_tail_log(raw_phone),
                success=False,
                reason="verify_error",
            )
            if device_norm:
                record_login_verify_failure(user["id"], device_norm)
            record_hard_lockout_failure(raw_phone)
            raise HTTPException(status_code=400, detail="El código no es correcto. Intenta nuevamente.")
        if not result.get("valid"):
            logger.info("LOGIN_SMS_VERIFY invalid_code phone9=%s", phone9)
            log_ops_event(
                logger,
                event="login_otp_verify_failed",
                user_id=user["id"],
                phone=_phone_tail_log(raw_phone),
                success=False,
                reason="invalid_code",
            )
            if device_norm:
                record_login_verify_failure(user["id"], device_norm)
            record_hard_lockout_failure(raw_phone)
            raise HTTPException(status_code=400, detail="El código no es correcto. Intenta nuevamente.")

        # --- STEP-UP AUTH: Solo para Proveedores en dispositivos nuevos ---
        roles = _user_roles(user)
        is_provider = "provider" in roles or user.get("role") == "provider"
        
        if is_provider:
            trusted = await find_trusted_device(
                db, user_id=user["id"], phone_e164=raw_phone, device_id=device_norm
            )
            # Si el dispositivo NO es de confianza o hay riesgo, exigir clave.
            if not trusted or is_risky_login(trusted, True, country, False, ip, ua_hdr):
                logger.info("LOGIN_SMS_VERIFY step_up_required userId=%s", user["id"])
                return {
                     "requires_password": True,
                     "user_id": user["id"],
                     "phone": raw_phone,
                     "email_masked": _mask_email_for_display(user.get("email", "")),
                     "message": "Por seguridad, ingresa tu contraseña de proveedor."
                 }

        token = generate_token()
        await db.sessions.insert_one(
            {
                "userId": user["id"],
                "token": token,
                "createdAt": datetime.now(timezone.utc).isoformat(),
            }
        )

        if device_norm:
            await upsert_trusted_device(
                db,
                user_id=user["id"],
                phone_e164=raw_phone,
                device_id=device_norm,
                last_ip=ip,
                last_country=country,
                        user_agent=ua_hdr,
                    )
                    clear_login_verify_failures(user["id"], device_norm)
                clear_hard_lockout(raw_phone)

        logger.info("LOGIN_SMS_VERIFY success userId=%s roles=%s", user["id"], _user_roles(user))
        log_ops_event(
            logger,
            event="login_otp_verified",
            user_id=user["id"],
            phone=_phone_tail_log(raw_phone),
            success=True,
        )

        return _build_login_sms_session_payload(user, token, requires_otp=False)
    except HTTPException:
        raise
    except Exception as e:
        log_ops_event(
            logger,
            event="login_otp_verify_unexpected",
            success=False,
            error_type=type(e).__name__,
        )
        logger.exception("login_sms_verify unexpected")
        raise HTTPException(
            status_code=500,
            detail="No se pudo completar el inicio de sesión. Intenta nuevamente.",
        ) from None


class StepUpVerifyRequest(BaseModel):
    user_id: str
    phone: str
    password: str
    device_id: Optional[str] = None


@router.post("/login-sms/verify-password")
@limiter.limit("5/minute")
async def verify_sms_password(request: Request, body: StepUpVerifyRequest):
    """
    Paso 3 del login SMS (Step-Up): Verifica la contraseña del proveedor tras un OTP exitoso.
    """
    user = await db.users.find_one({"id": body.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if not verify_password(body.password, user.get("password", "")):
        log_ops_event(
            logger,
            event="login_stepup_failed",
            user_id=body.user_id,
            success=False,
            reason="invalid_password",
        )
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")

    device_norm = normalize_device_id(body.device_id)
    ip = get_client_ip(request)
    country = get_client_country(request)
    ua_hdr = get_client_user_agent(request)

    token = generate_token()
    await db.sessions.insert_one(
        {
            "userId": user["id"],
            "token": token,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
    )

    if device_norm:
        await upsert_trusted_device(
            db,
            user_id=user["id"],
            phone_e164=body.phone,
            device_id=device_norm,
            last_ip=ip,
            last_country=country,
            user_agent=ua_hdr,
        )

    logger.info("LOGIN_STEPUP success userId=%s", user["id"])
    log_ops_event(
        logger,
        event="login_stepup_verified",
        user_id=user["id"],
        success=True,
    )

    return _build_login_sms_session_payload(user, token, requires_otp=False)


@router.post("/check-device")
@limiter.limit("10/minute")
async def check_device(request: Request, body: CheckDeviceRequest):
    """
    Evalúa si debe pedirse OTP para user_id + teléfono + device_id (misma lógica que login-sms/start).
    No crea sesión ni devuelve token; solo `require_otp` y, si no hay riesgo, actualiza last_* en trusted_devices.
    El teléfono debe corresponder al user_id (anti suplantación por ID).
    """
    await ensure_trusted_device_indexes(db)
    err = _validate_celular_chile(body.phone_number)
    if err:
        raise HTTPException(status_code=400, detail=err)

    raw_phone = _format_phone(body.phone_number)
    phone9 = _normalize_phone_last9(raw_phone)
    if len(phone9) != 9:
        raise HTTPException(status_code=400, detail="Celular inválido")

    user = await db.users.find_one({"phone": {"$regex": f"{phone9}$"}}, {"_id": 0})
    if not user or user.get("id") != body.user_id:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    device_norm = normalize_device_id(body.device_id)
    if not device_norm:
        return {"require_otp": True}

    ip = get_client_ip(request)
    country = get_client_country(request)
    ua_hdr = get_client_user_agent(request)

    trusted = await find_trusted_device(
        db, user_id=body.user_id, phone_e164=raw_phone, device_id=device_norm
    )
    fails = too_many_recent_login_failures(body.user_id, device_norm)
    risky = is_risky_login(
        trusted_row=trusted,
        device_id_valid=True,
        current_country=country,
        too_many_failed=fails,
        current_ip=ip,
        current_user_agent=ua_hdr,
    )

    if risky:
        return {"require_otp": True}

    cc = (country or (trusted or {}).get("last_country") or "").strip().upper()[:2]
    await db.trusted_devices.update_one(
        {"user_id": body.user_id, "device_id": device_norm},
        {"$set": build_trusted_session_touch(ip, cc, ua_hdr)},
    )
    return {"require_otp": False}


async def _apply_me_profile_update(body: dict, current_user: dict) -> dict:
    """Actualiza name, email, rut, razon_social del usuario autenticado (Bearer)."""
    allowed_fields = {"name", "email", "rut", "razon_social"}
    update_data = {k: v for k, v in body.items() if k in allowed_fields}
    if "email" in update_data and update_data["email"] is not None:
        em = str(update_data["email"]).strip().lower()
        update_data["email"] = em if em else None
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay campos válidos para actualizar")
    uid = current_user["id"]
    result = await db.users.update_one({"id": uid}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"message": "Perfil actualizado", "id": uid, **update_data}


@router.get("/me")
async def auth_me(current_user: dict = Depends(get_current_user)):
    """Valida Bearer y devuelve perfil mínimo (hidratación de sesión en el cliente)."""
    roles = _user_roles(current_user)
    legacy_role = current_user.get("role") or "client"
    effective_role = _effective_session_role(roles, legacy_role)
    pr = _provider_role_for_api(current_user, roles)
    return {
        "id": current_user["id"],
        "name": current_user.get("name"),
        "email": current_user.get("email"),
        "phone": current_user.get("phone"),
        "rut": current_user.get("rut"),
        "razon_social": current_user.get("razon_social"),
        "role": effective_role,
        "roles": roles,
        "provider_role": pr,
        "owner_id": current_user.get("owner_id"),
    }


@router.patch("/me")
async def auth_patch_me(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Actualiza perfil (compat). Cliente checkout: preferir POST /me/profile."""
    return await _apply_me_profile_update(body, current_user)


@router.post("/me/profile")
async def auth_post_me_profile(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Misma semántica que PATCH /me. POST reduce bloqueos en proxies/CDN que filtran PATCH;
    alineado con el patrón fetch+Bearer de GET /me.
    """
    return await _apply_me_profile_update(body, current_user)


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


PROVIDER_REG_PHONE_OK_PREFIX = "maqgo:provider_reg_phone_ok:"
# Ventana OTP → POST /register: 10 min era corta si el usuario completa "Crear perfil" lento.
PROVIDER_REG_PHONE_OK_TTL_SEC = 1800


def _redis_mark_provider_register_phone_verified(phone_e164: str) -> None:
    """Tras verify-otp con intent=provider_register: permite register sin segundo SMS."""
    r = _get_redis_client()
    if not r:
        return
    phone9 = _normalize_phone_last9(phone_e164)
    if len(phone9) != 9:
        return
    try:
        r.setex(f"{PROVIDER_REG_PHONE_OK_PREFIX}{phone9}", PROVIDER_REG_PHONE_OK_TTL_SEC, "1")
    except Exception:
        logger.warning("redis mark provider_reg_phone failed")


def _redis_peek_provider_register_phone_verified(phone_e164: str) -> bool:
    """True si la marca OTP→register sigue vigente (sin borrar). Evita consumir Redis antes del commit en Mongo."""
    r = _get_redis_client()
    if not r:
        return False
    phone9 = _normalize_phone_last9(phone_e164)
    if len(phone9) != 9:
        return False
    key = f"{PROVIDER_REG_PHONE_OK_PREFIX}{phone9}"
    try:
        return r.get(key) == "1"
    except Exception:
        return False


def _redis_consume_provider_register_phone_verified(phone_e164: str) -> bool:
    """Un solo uso; consume la marca para que no se reutilice."""
    r = _get_redis_client()
    if not r:
        return False
    phone9 = _normalize_phone_last9(phone_e164)
    if len(phone9) != 9:
        return False
    key = f"{PROVIDER_REG_PHONE_OK_PREFIX}{phone9}"
    try:
        val = r.get(key)
        if val != "1":
            return False
        r.delete(key)
        return True
    except Exception:
        return False


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


@router.post("/provider-register-status")
@limiter.limit("30/minute")
async def provider_register_status(request: Request, body: ProviderRegisterStatusBody):
    """
    UX alta proveedor: si el celular ya existe y está verificado (p. ej. enrolado como cliente),
    el front puede saltar SMS y pedir solo datos + contraseña de la cuenta.
    No sustituye la verificación de contraseña en POST /register (anti takeover).
    """
    celular_err = _validate_celular_chile(body.celular)
    if celular_err:
        raise HTTPException(status_code=400, detail=celular_err)
    phone_e164 = _format_phone(body.celular)
    phone9 = _normalize_phone_last9(phone_e164 or body.celular)
    if len(phone9) != 9:
        raise HTTPException(status_code=400, detail="Celular inválido")
    existing = await db.users.find_one(
        {"phone": {"$regex": f"{phone9}$"}},
        {"_id": 0, "id": 1, "roles": 1, "role": 1, "phoneVerified": 1},
    )
    if not existing:
        return {
            "exists": False,
            "skip_otp": False,
            "already_provider": False,
        }
    roles = _user_roles(existing)
    already_provider = "provider" in roles
    phone_verified = bool(existing.get("phoneVerified"))
    skip_otp = phone_verified and not already_provider
    return {
        "exists": True,
        "skip_otp": skip_otp,
        "already_provider": already_provider,
    }


@router.post("/provider-register/establish-session")
@limiter.limit("10/minute")
async def provider_register_establish_session(request: Request, body: ProviderRegisterStatusBody):
    """
    Si el celular ya está verificado en MAQGO (skip OTP en alta proveedor), emite JWT para
    POST /users/become-provider sin usar /auth/register.
    """
    celular_err = _validate_celular_chile(body.celular)
    if celular_err:
        raise HTTPException(status_code=400, detail=celular_err)
    phone_e164 = _format_phone(body.celular)
    phone9 = _normalize_phone_last9(phone_e164 or body.celular)
    if len(phone9) != 9:
        raise HTTPException(status_code=400, detail="Celular inválido")
    existing = await db.users.find_one(
        {"phone": {"$regex": f"{phone9}$"}},
        {"_id": 0, "id": 1, "roles": 1, "role": 1, "phoneVerified": 1},
    )
    if not existing:
        raise HTTPException(
            status_code=400,
            detail="No hay cuenta con este celular. Solicita el código SMS primero.",
        )
    roles = _user_roles(existing)
    if "provider" in roles:
        raise HTTPException(
            status_code=400,
            detail="Este número ya tiene cuenta de proveedor. Inicia sesión.",
        )
    if not existing.get("phoneVerified"):
        raise HTTPException(
            status_code=400,
            detail="Este celular aún no está verificado en MAQGO.",
        )
    token = await create_session_for_user(existing["id"])
    uid_es = existing["id"]
    logger.info(
        "PROVIDER_REGISTER_ESTABLISH_SESSION userId=%s phone=%s",
        uid_es,
        _phone_tail_log(phone_e164),
    )
    return {
        "token": token,
        "userId": uid_es,
        "user_id": uid_es,
        "requires_otp": False,
    }


@router.post("/register")
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest):
    """
    Registrar nuevo usuario.
    Regla MAQGO: el teléfono es la identidad base (evita duplicados).
    - Si ya existe una cuenta con ese teléfono → reutilizar usuario y agregar rol si falta.
    - Si no existe, crear nueva cuenta.
    El email se considera dato secundario y puede actualizarse.
    """
    _register_dup_pass.set(0)
    return await _register_impl(request, body)


async def _register_impl(request: Request, body: RegisterRequest):
    """
    Implementación interna de POST /register (reintento tras índice único / fusión).
    """
    celular_err = _validate_celular_chile(body.celular)
    if celular_err:
        raise HTTPException(status_code=400, detail=celular_err)
    phone_e164 = _format_phone(body.celular)
    phone9 = _normalize_phone_last9(phone_e164 or body.celular)
    email_low = str(body.email).strip().lower()
    logger.info(
        "REGISTER attempt phone=%s role=%s phone_preverified=%s",
        _phone_tail_log(phone_e164 or ""),
        body.role,
        body.phone_preverified,
    )
    # Teléfono primero; email solo si coincide el mismo celular (evita fusionar cuentas distintas).
    existing = None
    if len(phone9) == 9:
        existing = await db.users.find_one({"phone": {"$regex": f"{phone9}$"}})
    if not existing:
        cand = await db.users.find_one({"email": email_low})
        if cand:
            ex9 = _normalize_phone_last9(cand.get("phone") or "")
            if len(ex9) == 9 and ex9 == phone9:
                existing = cand
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Este correo ya está registrado con otro número. Usa el correo y celular de tu cuenta o inicia sesión.",
                )
    now = datetime.now(timezone.utc).isoformat()

    if existing:
        roles = _user_roles(existing)
        if body.role in roles:
            # Mismo rol ya asignado (p. ej. ya es proveedor): tras OTP válido en Redis, actualizar
            # perfil de forma idempotente (reintento de "Crear cuenta" sin duplicar usuario).
            if (
                body.role == "provider"
                and body.phone_preverified
                and _redis_peek_provider_register_phone_verified(phone_e164 or body.celular)
            ):
                user_id = existing["id"]
                other_email = await db.users.find_one({"email": email_low})
                if other_email and other_email.get("id") != user_id:
                    logger.info(
                        "REGISTER idempotent_email_conflict phone=%s",
                        _phone_tail_log(phone_e164 or body.celular),
                    )
                    raise HTTPException(
                        status_code=409,
                        detail="Este correo ya está registrado. Inicia sesión o usa otro correo.",
                    ) from None
                update = {
                    "name": f"{body.nombre} {body.apellido}",
                    "email": email_low,
                    "password": hash_password(body.password),
                    "phone": phone_e164 or body.celular,
                    "phoneVerified": True,
                    "isAvailable": True,
                }
                if not existing.get("provider_role"):
                    update["provider_role"] = "super_master"
                await db.users.update_one({"id": user_id}, {"$set": update})
                _redis_consume_provider_register_phone_verified(phone_e164 or body.celular)
                logger.info(
                    "REGISTER idempotent_provider_profile user_id=%s phone=%s",
                    user_id,
                    _phone_tail_log(phone_e164 or body.celular),
                )
                return {
                    "id": user_id,
                    "message": "Perfil de proveedor actualizado. ¡Bienvenido a MAQGO!",
                    "role": "provider",
                    "roles": roles,
                    "phoneVerified": True,
                }
            detail_dup = (
                "Este número ya está registrado como proveedor. Inicia sesión para continuar."
                if body.role == "provider"
                else "Esta cuenta ya tiene ese rol en MAQGO. Inicia sesión para continuar."
            )
            logger.info(
                "REGISTER conflict_duplicate_role phone=%s role=%s",
                _phone_tail_log(phone_e164 or body.celular),
                body.role,
            )
            raise HTTPException(status_code=409, detail=detail_dup) from None
        # Agregar el otro rol a la misma cuenta (cliente + proveedor) sin duplicar usuario.
        user_id = existing["id"]
        new_roles = list(dict.fromkeys(roles + [body.role]))
        email_norm = email_low
        update = {
            "roles": new_roles,
            "name": f"{body.nombre} {body.apellido}",
            "phone": phone_e164 or body.celular,
            "email": email_norm,
            "password": hash_password(body.password),
        }
        if body.role == "provider":
            update["isAvailable"] = True
            # Titular que se suma como proveedor: jerarquía empresa (invitaciones master/operador).
            if not existing.get("provider_role"):
                update["provider_role"] = "super_master"

        redis_peek_ok = False
        if body.role == "provider" and body.phone_preverified:
            redis_peek_ok = _redis_peek_provider_register_phone_verified(phone_e164 or body.celular)

        verified_phone = bool(existing.get("phoneVerified"))
        pwd_matches = verify_password(body.password, existing.get("password") or "")

        skip_sms = False
        if body.role == "provider" and body.phone_preverified:
            if redis_peek_ok:
                skip_sms = True
            elif verified_phone:
                if not pwd_matches:
                    raise HTTPException(
                        status_code=400,
                        detail="La contraseña no coincide con tu cuenta MAQGO. Usa la misma con la que inicias sesión.",
                    )
                skip_sms = True

        if skip_sms:
            update["phoneVerified"] = True

        await db.users.update_one(
            {"id": user_id},
            {"$set": update},
        )
        if body.role == "provider" and body.phone_preverified and redis_peek_ok and skip_sms:
            _redis_consume_provider_register_phone_verified(phone_e164 or body.celular)
        if not skip_sms:
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
        logger.info(
            "REGISTER existing_user_add_role user_id=%s phone=%s new_roles=%s",
            user_id,
            _phone_tail_log(phone_e164 or body.celular),
            new_roles,
        )
        return {
            "id": user_id,
            "message": (
                "Rol agregado a tu cuenta. Celular verificado."
                if skip_sms
                else "Rol agregado a tu cuenta. Código SMS enviado."
            ),
            "role": body.role,
            "roles": new_roles,
            "phoneVerified": bool(skip_sms),
        }

    dup_email = await db.users.find_one({"email": email_low})
    if dup_email:
        ex9_dup = _normalize_phone_last9(dup_email.get("phone") or "")
        if len(ex9_dup) == 9 and ex9_dup == phone9 and _register_dup_pass.get() < 1:
            logger.info(
                "REGISTER merge_dup_email_same_identity phone=%s",
                _phone_tail_log(phone_e164 or body.celular),
            )
            _register_dup_pass.set(_register_dup_pass.get() + 1)
            return await _register_impl(request, body)
        logger.info(
            "REGISTER conflict_email email_in_use phone=%s",
            _phone_tail_log(phone_e164 or body.celular),
        )
        raise HTTPException(
            status_code=409,
            detail="Este correo ya está registrado. Inicia sesión o usa otro correo.",
        ) from None

    user_id = f"user_{secrets.token_hex(8)}"
    phone_e164 = _format_phone(body.celular)
    redis_peek_ok = (
        body.role == "provider"
        and body.phone_preverified
        and _redis_peek_provider_register_phone_verified(phone_e164 or body.celular)
    )
    skip_sms = redis_peek_ok
    user = {
        "id": user_id,
        "name": f"{body.nombre} {body.apellido}",
        "email": email_low,
        "phone": phone_e164 or body.celular,
        "password": hash_password(body.password),
        "role": body.role,
        "roles": [body.role],
        "isAvailable": True if body.role == "provider" else None,
        "createdAt": now,
        "phoneVerified": True if skip_sms else False,
    }
    if body.role == "provider":
        # Dueño de cuenta proveedor (invita gerentes/operadores vía /operators/*).
        user["provider_role"] = "super_master"
    try:
        await db.users.insert_one(user)
    except DuplicateKeyError:
        logger.warning(
            "REGISTER duplicate_key_merge phone=%s pass=%s",
            _phone_tail_log(phone_e164 or body.celular),
            _register_dup_pass.get(),
        )
        if _register_dup_pass.get() >= 1:
            raise HTTPException(
                status_code=409,
                detail="Ya existe una cuenta con este teléfono o correo. Inicia sesión.",
            ) from None
        merged = await db.users.find_one({"phone": {"$regex": f"{phone9}$"}})
        if not merged:
            merged = await db.users.find_one({"email": email_low})
        if merged:
            _register_dup_pass.set(_register_dup_pass.get() + 1)
            return await _register_impl(request, body)
        raise HTTPException(
            status_code=409,
            detail="Ya existe una cuenta con este teléfono o correo. Inicia sesión.",
        ) from None

    logger.info(
        "REGISTER created user_id=%s phone=%s role=%s",
        user_id,
        _phone_tail_log(phone_e164 or body.celular),
        body.role,
    )

    if redis_peek_ok:
        _redis_consume_provider_register_phone_verified(phone_e164 or body.celular)

    if not skip_sms:
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
        "message": (
            "Usuario registrado. Celular verificado."
            if skip_sms
            else "Usuario registrado. Código SMS enviado."
        ),
        "role": body.role,
        "roles": [body.role],
        "phoneVerified": bool(skip_sms),
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
    legacy_role = user.get("role") or "client"
    effective_role = _effective_session_role(roles, legacy_role)
    pr = _provider_role_for_api(user, roles)
    return {
        "id": user["id"],
        "name": user.get("name"),
        "email": user.get("email"),
        "phone": user.get("phone"),
        "role": effective_role,
        "roles": roles,
        "token": token,
        "provider_role": pr,
        "owner_id": user.get("owner_id"),
    }

@router.post("/debug/test-sms")
@limiter.limit("5/minute")
async def debug_test_sms(request: Request, body: dict = Body(...)):
    """
    Endpoint temporal SOLO ADMIN para test directo de SMS.
    Permite diagnosticar problemas de envío sin flujo OTP.
    """
    phone = body.get("phone", "")
    message = body.get("message", "MAQGO: Test de SMS desde debug endpoint.")
    
    logger.info("DEBUG_SMS_TEST_START phone=%s", _phone_tail_log(str(phone)))

    if not phone:
        return {
            "success": False,
            "error": "Phone required",
            "debug": "Missing phone parameter"
        }
    
    # Validar y formatear teléfono
    if not phone.startswith("+569"):
        if len(phone) == 9 and phone.startswith("9"):
            phone = "+56" + phone
        elif len(phone) == 8:
            phone = "+569" + phone
        else:
            return {
                "success": False,
                "error": "Formato de teléfono inválido",
                "debug": f"Original: {phone}, esperado: +569XXXXXXXX o 9XXXXXXXX"
            }
    
    logger.info("DEBUG_PHONE_FORMATTED phone=%s", _phone_tail_log(phone))

    # Enviar SMS real
    try:
        from services.otp_service import send_sms
        success, error = send_sms(phone, message)
        
        logger.info("DEBUG_SMS_RESULT success=%s err=%s", success, error)

        return {
            "success": success,
            "phone_original": body.get("phone"),
            "phone_formatted": phone,
            "message_sent": message,
            "error": error,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "debug_info": {
                "provider": "LabsMobile",
                "credentials_check": {
                    "LABSMOBILE_USERNAME": bool(os.environ.get("LABSMOBILE_USERNAME")),
                    "LABSMOBILE_API_TOKEN": bool(os.environ.get("LABSMOBILE_API_TOKEN")),
                    "LABSMOBILE_SENDER": os.environ.get("LABSMOBILE_SENDER", "MAQGO")
                }
            }
        }
        
    except Exception as e:
        logger.exception("DEBUG_SMS_EXCEPTION")
        return {
            "success": False,
            "error": str(e),
            "phone_formatted": phone,
            "debug": "Exception during SMS send"
        }

@router.post("/debug/test-otp")
@limiter.limit("10/minute")
async def debug_send_otp_test(request: Request, body: dict = Body(...)):
    """
    Endpoint temporal SOLO ADMIN para test directo de OTP.
    Permite testear el flujo completo sin pasar por validaciones complejas.
    """
    phone = body.get("phone", "")
    logger.info("DEBUG_OTP_TEST_START phone=%s", _phone_tail_log(str(phone)))

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
    
    logger.info("DEBUG_PHONE_FORMATTED phone=%s", _phone_tail_log(phone_e164))

    try:
        result = send_sms_otp(phone_e164, channel='sms')
        logger.info("DEBUG_SMS_SEND_RESULT success=%s", result.get("success"))
        
        return {
            "success": True,
            "phone_original": phone,
            "phone_formatted": phone_e164,
            "otp_result": result,
            "message": "Debug test completed"
        }
        
    except Exception as e:
        logger.exception("DEBUG_OTP_TEST_ERROR")
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
