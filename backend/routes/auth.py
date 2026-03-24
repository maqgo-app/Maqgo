from fastapi import APIRouter, HTTPException, Body, Request
import re

from pydantic import BaseModel, EmailStr, Field, field_validator
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
import os
import bcrypt
import secrets
import asyncio
import smtplib
import ssl
from email.message import EmailMessage
from html import escape

from rate_limit import limiter
from db_config import get_db_name, get_mongo_url

from communications import (
    send_sms_otp,
    verify_sms_otp,
)

router = APIRouter(prefix="/auth", tags=["auth"])

mongo_url = get_mongo_url()
client = AsyncIOMotorClient(mongo_url)
db = client[get_db_name()]

MAX_SMS_RESET_REQUESTS = 3
SMS_RESET_WINDOW_MINUTES = 10
SMS_RESET_BLOCK_MINUTES = 30

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
    email: EmailStr
    password: str

class PasswordResetRequest(BaseModel):
    email: EmailStr
    celular: str

class PasswordResetConfirmRequest(BaseModel):
    email: EmailStr
    celular: str
    code: str = Field(..., min_length=4, max_length=8)
    new_password: str = Field(..., min_length=8, max_length=12)

    @field_validator('new_password')
    @classmethod
    def reset_password_complexity(cls, v: str) -> str:
        if not re.search(r'[A-Za-z]', v) or not re.search(r'\d', v):
            raise ValueError('La contraseña debe incluir letras y números')
        return v


class SendOtpRequest(BaseModel):
    phone: str


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
    """Endpoint OTP simple para flujos auth (/auth/send-otp)."""
    celular_err = _validate_celular_chile(body.phone)
    if celular_err:
        raise HTTPException(status_code=400, detail=celular_err)
    phone_e164 = _format_phone(body.phone)
    result = send_sms_otp(phone_e164, channel='sms')
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "No se pudo enviar OTP"))
    return {"success": True, "message": "OTP enviado"}


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
    user = await db.users.find_one(
        {"email": body.email},
        {"_id": 0}
    )
    
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

@router.post("/verify-sms")
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
    """
    Inicia restablecimiento de contraseña por SMS OTP.
    Respuesta genérica para no filtrar si un email existe.
    """
    celular_err = _validate_celular_chile(body.celular)
    if celular_err:
        raise HTTPException(status_code=400, detail=celular_err)

    # otp_sent=false si no hay usuario o el celular no calza (sin filtrar cuentas).
    generic_no_send = {
        "success": True,
        "message": "Si los datos coinciden con tu cuenta, te enviamos un código por SMS.",
        "otp_sent": False,
        "reason": "no_match",
    }

    user = await db.users.find_one({"email": body.email})
    if not user:
        return generic_no_send

    user_phone_9 = _normalize_phone_last9(user.get("phone", ""))
    input_phone_9 = _normalize_phone_last9(body.celular)
    if not user_phone_9 or user_phone_9 != input_phone_9:
        return generic_no_send

    phone_e164 = _format_phone(body.celular)
    now = datetime.now(timezone.utc)
    existing_req = await db.password_reset_requests.find_one({"userId": user["id"]})
    if existing_req:
        blocked_raw = existing_req.get("smsBlockedUntil")
        if blocked_raw:
            try:
                blocked_until = datetime.fromisoformat(str(blocked_raw).replace("Z", "+00:00"))
                if blocked_until.tzinfo is None:
                    blocked_until = blocked_until.replace(tzinfo=timezone.utc)
                if blocked_until > now:
                    email_sent = await _send_password_reset_fallback_email(body.email)
                    fallback_message = (
                        "Por seguridad pausamos temporalmente el envío de SMS. "
                        "Revisa tu correo registrado para continuar."
                        if email_sent else
                        "Por seguridad pausamos temporalmente el envío de SMS. "
                        "Intenta nuevamente en 30 minutos."
                    )
                    await db.password_reset_requests.update_one(
                        {"userId": user["id"]},
                        {"$set": {
                            "fallbackEmailSentAt": now.isoformat() if email_sent else None,
                            "updatedAt": now.isoformat(),
                        }},
                        upsert=True
                    )
                    return {
                        "success": True,
                        "message": fallback_message,
                        "otp_sent": False,
                        "reason": "sms_blocked",
                    }
            except Exception:
                pass

        first_raw = existing_req.get("smsWindowStartAt")
        sms_count = int(existing_req.get("smsRequestCount") or 0)
        window_start = None
        if first_raw:
            try:
                window_start = datetime.fromisoformat(str(first_raw).replace("Z", "+00:00"))
                if window_start.tzinfo is None:
                    window_start = window_start.replace(tzinfo=timezone.utc)
            except Exception:
                window_start = None

        if not window_start or (now - window_start) > timedelta(minutes=SMS_RESET_WINDOW_MINUTES):
            sms_count = 0
            window_start = now

        if sms_count >= MAX_SMS_RESET_REQUESTS:
            blocked_until = now + timedelta(minutes=SMS_RESET_BLOCK_MINUTES)
            email_sent = await _send_password_reset_fallback_email(body.email)
            fallback_message = (
                "Por seguridad pausamos temporalmente el envío de SMS. "
                "Revisa tu correo registrado para continuar."
                if email_sent else
                "Por seguridad pausamos temporalmente el envío de SMS. "
                "Intenta nuevamente en 30 minutos."
            )
            await db.password_reset_requests.update_one(
                {"userId": user["id"]},
                {"$set": {
                    "smsBlockedUntil": blocked_until.isoformat(),
                    "smsRequestCount": sms_count,
                    "smsWindowStartAt": window_start.isoformat(),
                    "fallbackEmailSentAt": now.isoformat() if email_sent else None,
                    "updatedAt": now.isoformat(),
                }},
                upsert=True
            )
            return {
                "success": True,
                "message": fallback_message,
                "otp_sent": False,
                "reason": "sms_blocked",
            }

    sms_result = send_sms_otp(phone_e164, channel='sms')
    if not sms_result.get("success"):
        # En modo real devolvemos error explícito para reintento controlado.
        if not sms_result.get("demo_mode"):
            raise HTTPException(status_code=400, detail=sms_result.get("error", "No se pudo enviar el código"))

    # Alineado con OTP (5 min en Redis); ventana de documento un poco mayor por clock skew
    expires_at = now + timedelta(minutes=10)
    next_sms_count = 1
    window_start_to_store = now
    if existing_req:
        first_raw = existing_req.get("smsWindowStartAt")
        sms_count = int(existing_req.get("smsRequestCount") or 0)
        if first_raw:
            try:
                existing_window = datetime.fromisoformat(str(first_raw).replace("Z", "+00:00"))
                if existing_window.tzinfo is None:
                    existing_window = existing_window.replace(tzinfo=timezone.utc)
                if (now - existing_window) <= timedelta(minutes=SMS_RESET_WINDOW_MINUTES):
                    next_sms_count = sms_count + 1
                    window_start_to_store = existing_window
            except Exception:
                pass
    await db.password_reset_requests.update_one(
        {"userId": user["id"]},
        {"$set": {
            "userId": user["id"],
            "email": body.email,
            "phone": phone_e164,
            "createdAt": now.isoformat(),
            "expiresAt": expires_at.isoformat(),
            "smsRequestCount": next_sms_count,
            "smsWindowStartAt": window_start_to_store.isoformat(),
            "smsBlockedUntil": None,
            "updatedAt": now.isoformat(),
        }},
        upsert=True
    )
    return {
        "success": True,
        "message": generic_no_send["message"],
        "otp_sent": True,
        "demo_mode": bool(sms_result.get("demo_mode")),
    }


@router.post("/password-reset/confirm")
@limiter.limit("10/minute")
async def password_reset_confirm(request: Request, body: PasswordResetConfirmRequest):
    """
    Confirma código OTP y actualiza contraseña.
    """
    celular_err = _validate_celular_chile(body.celular)
    if celular_err:
        raise HTTPException(status_code=400, detail=celular_err)

    user = await db.users.find_one({"email": body.email})
    if not user:
        raise HTTPException(status_code=400, detail="Datos inválidos")

    user_phone_9 = _normalize_phone_last9(user.get("phone", ""))
    input_phone_9 = _normalize_phone_last9(body.celular)
    if not user_phone_9 or user_phone_9 != input_phone_9:
        raise HTTPException(status_code=400, detail="Datos inválidos")

    pending = await db.password_reset_requests.find_one({"userId": user["id"]})
    if not pending:
        raise HTTPException(status_code=400, detail="Primero solicita el código de recuperación")

    exp_raw = pending.get("expiresAt")
    if exp_raw:
        try:
            exp = datetime.fromisoformat(str(exp_raw).replace("Z", "+00:00"))
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > exp:
                await db.password_reset_requests.delete_one({"userId": user["id"]})
                raise HTTPException(
                    status_code=400,
                    detail="El código expiró. Solicita uno nuevo desde el paso anterior.",
                )
        except HTTPException:
            raise
        except Exception:
            pass

    phone_e164 = _format_phone(body.celular)
    verify_result = verify_sms_otp(phone_e164, body.code)
    if not verify_result.get("valid"):
        raise HTTPException(status_code=400, detail=verify_result.get("error") or "Código incorrecto")

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password": hash_password(body.new_password)}}
    )
    await db.password_reset_requests.delete_one({"userId": user["id"]})
    # Invalidar sesiones activas para forzar login con nueva clave.
    await db.sessions.delete_many({"userId": user["id"]})

    return {"success": True, "message": "Contraseña actualizada correctamente"}
