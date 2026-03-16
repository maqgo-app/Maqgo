from fastapi import APIRouter, HTTPException, Body, Request
from pydantic import BaseModel, EmailStr, Field
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import os
import bcrypt
import secrets

from rate_limit import limiter

from communications import (
    send_sms_otp,
    verify_sms_otp,
    DEMO_MODE,
    DEMO_OTP_CODE,
)

router = APIRouter(prefix="/auth", tags=["auth"])

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'maqgo_db')]


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
    password: str = Field(..., min_length=8, description="Mínimo 8 caracteres")
    role: str = "client"

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

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
        update = {
            "roles": new_roles,
            "name": f"{body.nombre} {body.apellido}",
            "phone": body.celular,
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
        if DEMO_MODE or sms_result.get('demo_mode'):
            sms_code = DEMO_OTP_CODE
        elif 'otp' in sms_result:
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
    user = {
        "id": user_id,
        "name": f"{body.nombre} {body.apellido}",
        "email": body.email,
        "phone": body.celular,
        "password": hash_password(body.password),
        "role": body.role,
        "roles": [body.role],
        "isAvailable": True if body.role == "provider" else None,
        "createdAt": now,
        "phoneVerified": False
    }
    await db.users.insert_one(user)

    phone_e164 = _format_phone(body.celular)
    sms_result = send_sms_otp(phone_e164, channel='sms')
    if DEMO_MODE or sms_result.get('demo_mode'):
        sms_code = DEMO_OTP_CODE
    elif 'otp' in sms_result:
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
    return {
        "id": user["id"],
        "name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role", "client"),
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
    
    if DEMO_MODE or sms_result.get('demo_mode'):
        sms_code = DEMO_OTP_CODE
    elif 'otp' in sms_result:
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
