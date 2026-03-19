from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
import os
import re
from pymongo import MongoClient

router = APIRouter(prefix="/messages", tags=["messages"])

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'maqgo')
client = MongoClient(MONGO_URL)
db = client[DB_NAME]

CHAT_CONTACT_BLOCKED_MSG = (
    "Por seguridad, no compartas datos de contacto. Usa el chat de MAQGO"
)


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
async def send_message(message: MessageCreate):
    """Enviar un mensaje en el chat del servicio"""
    try:
        if _content_contains_phone_or_contact(message.content):
            raise HTTPException(status_code=400, detail=CHAT_CONTACT_BLOCKED_MSG)

        st = _normalize_sender_type(message.sender_type)
        if st not in ("client", "operator"):
            raise HTTPException(status_code=400, detail="sender_type inválido")

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
async def get_messages(service_id: str):
    """Obtener todos los mensajes de un servicio"""
    try:
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/read/{service_id}")
async def mark_as_read(service_id: str, reader_type: str):
    """Marcar mensajes como leídos"""
    try:
        rt = _normalize_sender_type(reader_type)
        # Marcar como leídos los mensajes del otro participante
        other_type = "client" if rt == "operator" else "operator"
        
        db.messages.update_many(
            {"service_id": service_id, "sender_type": other_type, "read": False},
            {"$set": {"read": True}}
        )
        
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/unread/{service_id}/{user_type}")
async def get_unread_count(service_id: str, user_type: str):
    """Obtener cantidad de mensajes no leídos"""
    try:
        ut = _normalize_sender_type(user_type)
        other_type = "client" if ut == "operator" else "operator"
        
        count = db.messages.count_documents({
            "service_id": service_id,
            "sender_type": other_type,
            "read": False
        })
        
        return {"unread_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
