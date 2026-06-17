import os
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

PUSH_NOTIFICATIONS_ENABLED = os.environ.get("PUSH_NOTIFICATIONS_ENABLED", "true").lower() == "true"
WEBPUSH_VAPID_PUBLIC_KEY = os.environ.get("WEBPUSH_VAPID_PUBLIC_KEY", "").strip()
WEBPUSH_VAPID_PRIVATE_KEY = os.environ.get("WEBPUSH_VAPID_PRIVATE_KEY", "").strip()
WEBPUSH_VAPID_SUBJECT = os.environ.get("WEBPUSH_VAPID_SUBJECT", "mailto:soporte@maqgo.cl").strip()


def webpush_enabled() -> bool:
    return bool(PUSH_NOTIFICATIONS_ENABLED and WEBPUSH_VAPID_PUBLIC_KEY and WEBPUSH_VAPID_PRIVATE_KEY)


def get_vapid_public_key() -> Optional[str]:
    return WEBPUSH_VAPID_PUBLIC_KEY or None


def _normalize_subscription(raw: Any) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None
    endpoint = str(raw.get("endpoint") or "").strip()
    keys = raw.get("keys")
    if not endpoint or not isinstance(keys, dict):
        return None
    auth = str(keys.get("auth") or "").strip()
    p256dh = str(keys.get("p256dh") or "").strip()
    if not auth or not p256dh:
        return None
    return {"endpoint": endpoint, "keys": {"auth": auth, "p256dh": p256dh}}


async def upsert_subscription(db: AsyncIOMotorDatabase, user_id: str, subscription: dict, user_agent: str = "") -> dict:
    sub = _normalize_subscription(subscription)
    if not sub:
        return {"success": False, "error": "subscription inválida"}
    now = datetime.now(timezone.utc).isoformat()
    await db.push_subscriptions.update_one(
        {"endpoint": sub["endpoint"]},
        {
            "$set": {
                "userId": str(user_id),
                "endpoint": sub["endpoint"],
                "keys": sub["keys"],
                "userAgent": str(user_agent or "")[:300],
                "updatedAt": now,
            },
            "$setOnInsert": {"createdAt": now},
        },
        upsert=True,
    )
    return {"success": True}


async def remove_subscription(db: AsyncIOMotorDatabase, user_id: str, endpoint: Optional[str]) -> dict:
    q: dict = {"userId": str(user_id)}
    if endpoint:
        q["endpoint"] = str(endpoint).strip()
    await db.push_subscriptions.delete_many(q)
    return {"success": True}


def _vapid_private_key_value() -> str:
    k = str(WEBPUSH_VAPID_PRIVATE_KEY or "").strip()
    if not k:
        return ""
    if "BEGIN" in k and "PRIVATE KEY" in k:
        return k
    try:
        import base64
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization

        pad = "=" * ((4 - (len(k) % 4)) % 4)
        raw = base64.urlsafe_b64decode((k + pad).encode())
        if len(raw) != 32:
            return k
        priv_int = int.from_bytes(raw, "big")
        priv_key = ec.derive_private_key(priv_int, ec.SECP256R1())
        pem = priv_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        return pem.decode()
    except Exception:
        return k


def _send_webpush(subscription_info: dict, payload: dict) -> Tuple[bool, Optional[int], Optional[str]]:
    if not webpush_enabled():
        return True, None, None
    try:
        from pywebpush import webpush, WebPushException
    except Exception:
        return False, None, "pywebpush no disponible"

    data = json.dumps(payload, ensure_ascii=False)
    try:
        webpush(
            subscription_info=subscription_info,
            data=data,
            vapid_private_key=_vapid_private_key_value(),
            vapid_claims={"sub": WEBPUSH_VAPID_SUBJECT},
        )
        return True, 201, None
    except WebPushException as e:
        code = None
        try:
            code = int(getattr(e, "response", None).status_code)
        except Exception:
            code = None
        return False, code, str(e)
    except Exception as e:
        return False, None, str(e)


async def notify_user(
    db: AsyncIOMotorDatabase,
    user_id: str,
    title: str,
    body: str,
    url: str,
    tag: str = "maqgo",
) -> dict:
    if not user_id:
        return {"success": True, "sent": 0, "skipped": 0}
    subs = await db.push_subscriptions.find({"userId": str(user_id)}, {"_id": 0}).to_list(50)
    if not subs:
        return {"success": True, "sent": 0, "skipped": 0}
    payload = {"title": str(title or "MAQGO"), "body": str(body or ""), "url": str(url or "/"), "tag": str(tag or "maqgo")}
    sent = 0
    skipped = 0
    for sub_doc in subs:
        sub = _normalize_subscription(sub_doc)
        if not sub:
            skipped += 1
            continue
        ok, status_code, err = _send_webpush(sub, payload)
        if ok:
            sent += 1
            continue
        if status_code in (404, 410):
            await db.push_subscriptions.delete_one({"endpoint": sub.get("endpoint")})
            skipped += 1
            continue
        skipped += 1
        logger.warning("webpush failed user=%s status=%s err=%s", str(user_id), status_code, err)
    return {"success": True, "sent": sent, "skipped": skipped}


async def notify_service_event(db: AsyncIOMotorDatabase, client_id: str, service_request_id: str, kind: str, extra: Optional[dict] = None) -> dict:
    k = str(kind or "").strip().lower()
    title = "Actualización del servicio"
    body = "Revisa el estado del servicio en la app."
    if k == "confirmed":
        title = "Servicio confirmado"
        body = "Tu servicio quedó confirmado. Revisa el estado del servicio en la app."
    elif k == "arrival":
        title = "Operador llegó"
        body = "El operador marcó llegada. Revisa el estado del servicio en la app."
    elif k == "started":
        title = "Servicio iniciado"
        body = "El servicio comenzó. Revisa el estado del servicio en la app."
    elif k == "incident":
        title = "Demora reportada"
        reason = str((extra or {}).get("reason") or "").strip()
        body = f"Motivo: {reason}" if reason else "El operador reportó una demora/incidente."
    elif k == "incident_cleared":
        title = "Incidente resuelto"
        body = "El servicio continúa. Revisa el estado del servicio en la app."
    elif k == "finished":
        title = "Servicio finalizado"
        body = "El servicio se marcó como finalizado. Revisa el estado del servicio en la app."

    url = "/client/home"
    if k == "confirmed":
        url = "/client/assigned"
    elif k == "arrival":
        url = "/client/provider-arrived"
    elif k == "started":
        url = "/client/service-active"
    elif k in ("incident", "incident_cleared"):
        url = "/client/assigned"
    elif k == "finished":
        url = "/client/service-finished"

    return await notify_user(db=db, user_id=client_id, title=title, body=body, url=url, tag=f"sr:{service_request_id}")
