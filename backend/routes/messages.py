from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import re
from pymongo import MongoClient
from rate_limit import limiter
from auth_dependency import get_current_user
from security.policy import AccessPolicy

from db_config import get_db_name, get_mongo_url

router = APIRouter(prefix="/messages", tags=["messages"])

MONGO_URL = get_mongo_url()
DB_NAME = get_db_name()
client = MongoClient(MONGO_URL)
db = client[DB_NAME]

try:
    # Índices para acelerar queries del chat:
    # - delta por service_id + created_at
    # - conteo/patch read por service_id + sender_type + read
    db.messages.create_index([("service_id", 1), ("created_at", 1)])
    db.messages.create_index([("service_id", 1), ("sender_type", 1), ("read", 1)])
except Exception:
    # No bloqueamos el arranque si por cualquier razón falla indexación.
    pass

CHAT_CONTACT_BLOCKED_MSG = (
    "Por seguridad, no compartas datos de contacto. Usa el chat de MAQGO"
)
CHAT_LOW_QUALITY_BLOCKED_MSG = (
    "Escribe un mensaje claro y útil para coordinar el servicio."
)


def _can_access_service_chat(current_user: dict, service_id: str) -> bool:
    """
    Valida pertenencia al servicio en service_requests o services.
    Evita acceso por adivinación de service_id (IDOR).
    """
    return AccessPolicy.can_access_service_sync(db, current_user, service_id)


def _normalize_sender_type(sender_type: str) -> str:
    st = (sender_type or "").strip().lower()
    if st == "provider":
        return "operator"
    return st


def _content_contains_phone_or_contact(text: str) -> bool:
    if not text or not str(text).strip():
        return False
    s = str(text).strip()
    low = s.lower()
    if re.search(r"tel:\s*", s, re.I):
        return True
    if re.search(r"whatsapp|wa\.me", low):
        return True
    if re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", s, re.I):
        return True
    if re.search(
        r"\+?\s*56[\s.\-]*9[\s.\-]*\d[\s.\-]*\d[\s.\-]*\d[\s.\-]*\d[\s.\-]*\d[\s.\-]*\d[\s.\-]*\d[\s.\-]*\d[\s.\-]*\d",
        s,
    ):
        return True
    if re.search(r"\b9[\s.\-]?\d{4}[\s.\-]?\d{4}\b", s):
        return True
    digits = re.sub(r"\D", "", s)
    if len(digits) >= 9 and re.search(r"9\d{8,}", digits):
        return True
    return False


def _is_low_quality_content(text: str) -> bool:
    if not text or not str(text).strip():
        return False
    s = str(text).strip()

    # Repeticiones largas o ruido evidente
    if re.search(r"(.)\1{5,}", s):
        return True
    if re.search(r"([.\-_])\1{3,}", s):
        return True

    tokens = [t for t in re.split(r"\s+", s) if t]
    alnum_only = re.sub(r"[^a-zA-Z0-9]", "", s)
    unique_chars = len(set(alnum_only.lower())) if alnum_only else 0
    diversity = (unique_chars / len(alnum_only)) if alnum_only else 1.0

    # Token con mezcla letras+números, largo y sin vocales (típico spam/junk)
    for token in tokens:
        clean = re.sub(r"[^a-zA-Z0-9]", "", token)
        if len(clean) < 12:
            continue
        has_letters = bool(re.search(r"[a-zA-Z]", clean))
        has_digits = bool(re.search(r"\d", clean))
        has_vowels = bool(re.search(r"[aeiouAEIOU]", clean))
        if has_letters and has_digits and not has_vowels:
            return True
        repeated_punctuation = bool(re.search(r"([.\-_])\1{2,}", token))
        if len(clean) >= 18 and has_letters and (has_digits or repeated_punctuation):
            return True

    # Mensaje largo con baja diversidad y varios tokens -> probable basura
    if len(s) >= 30 and len(tokens) >= 5 and diversity < 0.28:
        return True

    return False


class MessageCreate(BaseModel):
    service_id: str
    sender_type: str  # 'client' or 'operator'
    sender_id: str
    content: str

class MessageResponse(BaseModel):
    id: str
    service_id: str
    sender_type: str
    sender_id: str
    content: str
    created_at: str
    read: bool

@router.post("/send")
async def send_message(message: MessageCreate, current_user: dict = Depends(get_current_user)):
    """Enviar un mensaje en el chat del servicio"""
    try:
        if _content_contains_phone_or_contact(message.content):
            raise HTTPException(status_code=400, detail=CHAT_CONTACT_BLOCKED_MSG)
        if _is_low_quality_content(message.content):
            raise HTTPException(status_code=400, detail=CHAT_LOW_QUALITY_BLOCKED_MSG)

        if not _can_access_service_chat(current_user, message.service_id):
            raise HTTPException(status_code=403, detail="No autorizado para este chat")

        st = _normalize_sender_type(message.sender_type)
        if st not in ("client", "operator"):
            raise HTTPException(status_code=400, detail="sender_type inválido")

        current_user_id = current_user.get("id")
        if message.sender_id != current_user_id:
            raise HTTPException(status_code=403, detail="sender_id inválido")

        # Impide que cliente envíe como operator o viceversa.
        user_role = current_user.get("role")
        provider_role = current_user.get("provider_role")
        expected_sender = "client" if user_role == "client" else "operator"
        if user_role == "provider" and provider_role == "operator":
            expected_sender = "operator"
        if st != expected_sender and not AccessPolicy.is_admin(current_user):
            raise HTTPException(status_code=403, detail="sender_type no corresponde al usuario")

        msg_doc = {
            "service_id": message.service_id,
            "sender_type": st,
            "sender_id": message.sender_id,
            "content": message.content.strip(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "read": False
        }
        
        result = db.messages.insert_one(msg_doc)
        
        return {
            "success": True,
            "message_id": str(result.inserted_id),
            "created_at": msg_doc["created_at"]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/service/{service_id}")
@limiter.limit("30/minute")
async def get_messages(
    request: Request,
    service_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Obtener todos los mensajes de un servicio"""
    try:
        if not _can_access_service_chat(current_user, service_id):
            raise HTTPException(status_code=403, detail="No autorizado para este chat")
        messages = list(db.messages.find(
            {"service_id": service_id}
        ).sort("created_at", 1))
        
        return [
            {
                "id": str(m["_id"]),
                "service_id": m["service_id"],
                "sender_type": m["sender_type"],
                "sender_id": m["sender_id"],
                "content": m["content"],
                "created_at": m["created_at"],
                "read": m.get("read", False)
            }
            for m in messages
        ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/service/{service_id}/delta")
@limiter.limit("60/minute")
async def get_messages_delta(
    request: Request,
    service_id: str,
    since: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
):
    """
    Devuelve solo mensajes nuevos (created_at > since) para reducir carga.
    since debe venir en el mismo formato ISO que retorna `created_at`.
    """
    try:
        if not _can_access_service_chat(current_user, service_id):
            raise HTTPException(status_code=403, detail="No autorizado para este chat")
        q = {"service_id": service_id}
        if since:
            # Usamos >= y luego deduplicamos en frontend por id para evitar
            # perder mensajes si varios comparten el mismo timestamp.
            q["created_at"] = {"$gte": since}

        safe_limit = max(1, min(int(limit or 50), 200))
        messages = list(
            db.messages.find(q).sort("created_at", 1).limit(safe_limit)
        )

        return [
            {
                "id": str(m["_id"]),
                "service_id": m["service_id"],
                "sender_type": m["sender_type"],
                "sender_id": m["sender_id"],
                "content": m["content"],
                "created_at": m["created_at"],
                "read": m.get("read", False),
            }
            for m in messages
        ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/read/{service_id}")
@limiter.limit("60/minute")
async def mark_as_read(
    request: Request,
    service_id: str,
    reader_type: str,
    current_user: dict = Depends(get_current_user),
):
    """Marcar mensajes como leídos"""
    try:
        if not _can_access_service_chat(current_user, service_id):
            raise HTTPException(status_code=403, detail="No autorizado para este chat")
        rt = _normalize_sender_type(reader_type)
        # Marcar como leídos los mensajes del otro participante
        other_type = "client" if rt == "operator" else "operator"
        
        db.messages.update_many(
            {"service_id": service_id, "sender_type": other_type, "read": False},
            {"$set": {"read": True}}
        )
        
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/unread/{service_id}/{user_type}")
async def get_unread_count(
    service_id: str,
    user_type: str,
    current_user: dict = Depends(get_current_user),
):
    """Obtener cantidad de mensajes no leídos"""
    try:
        if not _can_access_service_chat(current_user, service_id):
            raise HTTPException(status_code=403, detail="No autorizado para este chat")
        ut = _normalize_sender_type(user_type)
        other_type = "client" if ut == "operator" else "operator"
        
        count = db.messages.count_documents({
            "service_id": service_id,
            "sender_type": other_type,
            "read": False
        })
        
        return {"unread_count": count}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
