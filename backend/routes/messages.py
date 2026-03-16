from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
import os
from pymongo import MongoClient

router = APIRouter(prefix="/messages", tags=["messages"])

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'maqgo')
client = MongoClient(MONGO_URL)
db = client[DB_NAME]

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
        msg_doc = {
            "service_id": message.service_id,
            "sender_type": message.sender_type,
            "sender_id": message.sender_id,
            "content": message.content,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "read": False
        }
        
        result = db.messages.insert_one(msg_doc)
        
        return {
            "success": True,
            "message_id": str(result.inserted_id),
            "created_at": msg_doc["created_at"]
        }
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
        # Marcar como leídos los mensajes del otro participante
        other_type = "client" if reader_type == "operator" else "operator"
        
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
        other_type = "client" if user_type == "operator" else "operator"
        
        count = db.messages.count_documents({
            "service_id": service_id,
            "sender_type": other_type,
            "read": False
        })
        
        return {"unread_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
