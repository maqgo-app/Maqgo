"""
STABLE MODULE — NO MODIFICAR SIN REVISIÓN DE PRODUCCIÓN
"""
from fastapi import APIRouter, HTTPException, Request, Depends, Query
from fastapi.responses import JSONResponse
from urllib.parse import quote

from rate_limit import limiter
from auth_dependency import get_current_admin_strict, get_current_user, get_current_user_optional
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from datetime import datetime, timezone
import os
import time
import re
import secrets
from pydantic import BaseModel
from typing import Optional

from services.payment_rollout import (
    idempotency_mode_header_value,
    persist_idempotency_key_resolution,
    resolve_idempotency_key,
)
from services.payment_service import provider_oneclick_authorize
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from db_config import get_db_name, get_mongo_url
from services.oneclick_service import (
    start_inscription as tbk_start_inscription,
    confirm_inscription as tbk_confirm_inscription,
    refund_payment as tbk_refund_payment,
)
from services.idempotency import run_idempotent, get_tenant_id
from services.payment_intent_service import PaymentIntentService, PI_CARD_PENDING, PI_CARD_REGISTERED
from services.oneclick_evidence import (
    COLLECTION as ONECLICK_EVIDENCE_COLLECTION,
    record_authorize as evidence_record_authorize,
    record_confirm as evidence_record_confirm,
    record_start as evidence_record_start,
    serialize_evidence_doc,
)
import logging
import json

from ops_structured_log import log_ops_event

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments/oneclick", tags=["oneclick"])

mongo_client = AsyncIOMotorClient(get_mongo_url())
db = mongo_client[get_db_name()]
PAYMENTS_COLLECTION = "payments_oneclick"
payment_intent_service = PaymentIntentService(db)


class StartInscriptionRequest(BaseModel):
    username: str
    email: str
    return_url: Optional[str] = None
    amount: Optional[int] = None
    booking_id: Optional[str] = None


class AuthorizePaymentRequest(BaseModel):
    username: str
    tbk_user: str
    buy_order: str
    amount: int


class RefundPaymentRequest(BaseModel):
    buy_order: str
    detail_buy_order: str
    amount: int


class SaveOneClickRequest(BaseModel):
    email: str
    tbk_user: str
    username: str
    booking_id: Optional[str] = None


class OneclickTestFlowRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    amount: int = 1000
    run_confirm: bool = True
    run_authorize: bool = True
    token: Optional[str] = None
    tbk_user: Optional[str] = None
    buy_order: Optional[str] = None
    return_url: Optional[str] = None


class ConfirmInscriptionRequest(BaseModel):
    token: Optional[str] = None
    TBK_TOKEN: Optional[str] = None
    token_ws: Optional[str] = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_admin(user: dict) -> bool:
    roles = user.get("roles") or []
    return user.get("role") == "admin" or (isinstance(roles, list) and "admin" in roles)


def _generate_buy_order() -> str:
    """
    buy_order bancario real:
    - unico
    - <=26 chars
    - solo alfanumerico
    Formato: MG + yymmddHHMMSS + rand(4)
    """
    ts = datetime.now(timezone.utc).strftime("%y%m%d%H%M%S")
    rnd = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(4))
    return f"MG{ts}{rnd}"


def _generate_session_id() -> str:
    ts = datetime.now(timezone.utc).strftime("%y%m%d%H%M%S")
    rnd = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
    return f"S{ts}{rnd}"


def _validate_buy_order_or_400(buy_order: str) -> None:
    if not buy_order:
        raise HTTPException(status_code=400, detail={"error": "invalid_buy_order", "message": "buy_order requerido"})
    if len(buy_order) > 26:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_buy_order", "message": "buy_order excede 26 caracteres"},
        )
    if not re.fullmatch(r"[A-Za-z0-9]+", buy_order):
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_buy_order", "message": "buy_order debe ser alfanumerico"},
        )


def _extract_incident_id(message: str) -> Optional[str]:
    match = re.search(r"incident ID:\s*([0-9\-]+)", message or "", re.IGNORECASE)
    return match.group(1) if match else None


def _mask_token(token: Optional[str]) -> str:
    token = (token or "").strip()
    if not token:
        return ""
    if len(token) <= 8:
        return "*" * len(token)
    return f"{token[:4]}...{token[-4:]}"


def _partial_email_for_debug(email: Optional[str]) -> str:
    """Email parcial para respuestas de debug (certificación / soporte)."""
    e = (email or "").strip()
    if not e or "@" not in e:
        return ""
    local, _, domain = e.partition("@")
    if len(local) <= 2:
        return f"***@{domain}"
    return f"{local[:2]}***@{domain}"


async def _record_validation_event(
    *,
    buy_order: Optional[str],
    user_id: Optional[str],
    event_type: str,
    status: str,
    detail: Optional[dict] = None,
) -> None:
    """Registro estructurado para evidencias de validación Transbank."""
    doc = {
        "id": f"oc_ev_{secrets.token_hex(8)}",
        "buy_order": buy_order,
        "user_id": user_id,
        "type": event_type,
        "status": status,
        "timestamp": _now_iso(),
        "detail": detail or {},
    }
    await db.oneclick_validation_events.insert_one(doc)


@router.post("/save")
@limiter.limit("10/minute")
async def save_oneclick_credentials(
    request: Request,
    data: SaveOneClickRequest,
):
    """Guarda credenciales OneClick. Idempotency-Key vía resolve_idempotency_key (legacy si falta)."""
    idempotency_key, key_legacy = resolve_idempotency_key(request, "save")
    await persist_idempotency_key_resolution(
        db,
        scope="save",
        endpoint=str(request.url.path),
        was_auto_generated=key_legacy,
        generated_key_prefix=idempotency_key if key_legacy else "",
    )
    body_hash = data.model_dump()

    async def execute() -> tuple[int, dict]:
        await db.oneclick_inscriptions.update_one(
            {"email": data.email},
            {
                "$set": {
                    "tbk_user": data.tbk_user,
                    "username": data.username,
                    "email": data.email,
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                }
            },
            upsert=True,
        )
        bid = (data.booking_id or "").strip()
        if bid:
            u = await db.users.find_one({"email": data.email.strip()}, {"_id": 0, "id": 1})
            uid = (u or {}).get("id")
            if uid:
                try:
                    await payment_intent_service.upsert_for_client(
                        booking_id=bid,
                        client_id=uid,
                        state=PI_CARD_REGISTERED,
                        last_idempotency_key=idempotency_key,
                    )
                except Exception as e:
                    logger.warning("payment_intent CARD_REGISTERED: %s", e)
        return 200, {"success": True}

    code, payload = await run_idempotent(
        db,
        tenant_id=get_tenant_id(),
        idempotency_key=idempotency_key,
        scope="save",
        endpoint=str(request.url.path),
        body_for_hash=body_hash,
        execute=execute,
    )
    r = JSONResponse(content=payload, status_code=code)
    r.headers["X-Idempotency-Mode"] = idempotency_mode_header_value(key_legacy)
    return r


@router.get("/resume-context")
@limiter.limit("30/minute")
async def oneclick_resume_context(request: Request, tbk_user: str = Query(..., min_length=4, max_length=512)):
    """
    Devuelve email/username asociados a tbk_user tras inscripción OK (Mongo).
    Evita que /oneclick/complete falle solo porque se perdió clientEmail en el navegador.
    """
    u = (tbk_user or "").strip()
    if u.startswith("demo-"):
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_tbk_user", "message": "tbk_user no válido para este endpoint"},
        )
    ins = await db.oneclick_inscriptions.find_one({"tbk_user": u}, {"_id": 0, "email": 1, "username": 1})
    if ins and ins.get("email"):
        return {"email": ins["email"], "username": (ins.get("username") or "")}
    pay = await db[PAYMENTS_COLLECTION].find_one({"tbk_user": u}, {"_id": 0, "email": 1, "username": 1})
    if pay and pay.get("email"):
        return {"email": pay["email"], "username": (pay.get("username") or "")}
    raise HTTPException(
        status_code=404,
        detail={"error": "not_found", "message": "No hay datos de inscripción para este tbk_user"},
    )


TBK_DEMO_MODE = os.environ.get("TBK_DEMO_MODE", "false").lower() == "true"
ONECLICK_PUBLIC_VALIDATION_ENABLED = os.environ.get("ONECLICK_PUBLIC_VALIDATION_ENABLED", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
ONECLICK_VALIDATION_TOKEN = os.environ.get("ONECLICK_VALIDATION_TOKEN", "").strip()
ONECLICK_VALIDATION_IP_ALLOWLIST = {
    ip.strip()
    for ip in os.environ.get("ONECLICK_VALIDATION_IP_ALLOWLIST", "").split(",")
    if ip.strip()
}


def _client_ip(request: Request) -> str:
    xff = (request.headers.get("x-forwarded-for") or "").strip()
    if xff:
        return xff.split(",")[0].strip()
    if request.client and request.client.host:
        return str(request.client.host).strip()
    return ""


def _is_integration_env() -> bool:
    return os.getenv("TBK_ENV", "integration").strip().lower() == "integration"


def _require_public_validation_access_or_403(request: Request) -> None:
    """
    Endpoints públicos de validación solo deben estar disponibles
    en ambiente integración + guardas explícitas.
    """
    if not _is_integration_env():
        raise HTTPException(
            status_code=403,
            detail={
                "error": "validation_locked",
                "message": "Endpoint de validación deshabilitado fuera de integración",
            },
        )
    if not ONECLICK_PUBLIC_VALIDATION_ENABLED:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "validation_locked",
                "message": "Habilita ONECLICK_PUBLIC_VALIDATION_ENABLED para acceso público de validación",
            },
        )

    request_token = (request.headers.get("x-oneclick-validation-token") or "").strip()
    token_ok = bool(ONECLICK_VALIDATION_TOKEN) and secrets.compare_digest(request_token, ONECLICK_VALIDATION_TOKEN)
    ip_ok = _client_ip(request) in ONECLICK_VALIDATION_IP_ALLOWLIST if ONECLICK_VALIDATION_IP_ALLOWLIST else False
    if not token_ok and not ip_ok:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "forbidden_validation_access",
                "message": "Se requiere token interno o IP allowlist para validación pública",
            },
        )


async def _start_inscription_body(
    request: Request,
    data: StartInscriptionRequest,
    current_user: dict | None,
    idempotency_key: str,
) -> dict:
    """Cuerpo de inscripción OneClick (envuelto con idempotencia en el endpoint)."""
    user_id = (current_user or {}).get("id") or "public_oneclick"
    if not current_user:
        _require_public_validation_access_or_403(request)

    buy_order = _generate_buy_order()
    session_id = _generate_session_id()
    now = _now_iso()

    # 1) Persistir ANTES de llamar a Transbank.
    record = {
        "id": f"oc_{secrets.token_hex(8)}",
        "buy_order": buy_order,
        "session_id": session_id,
        "user_id": user_id,
        "username": data.username,
        "email": data.email,
        "amount": data.amount,
        "status": "INIT",
        "created_at": now,
        "updated_at": now,
    }
    await db[PAYMENTS_COLLECTION].insert_one(record)

    # Modo demo: salta Transbank y permite completar el flujo en localhost
    if TBK_DEMO_MODE:
        tbk_user = f"demo-{int(time.time())}"
        await db[PAYMENTS_COLLECTION].update_one(
            {"buy_order": buy_order},
            {"$set": {"status": "INSCRIBED", "tbk_user": tbk_user, "updated_at": _now_iso()}},
        )
        out = {
            "demo_mode": True,
            "tbk_user": tbk_user,
            "url_webpay": None,
            "token": None,
            "buy_order": buy_order,
            "session_id": session_id,
        }
        await evidence_record_start(db, token=None, email=data.email, username=data.username)
        await _touch_payment_intent_start(data, current_user, idempotency_key)
        log_ops_event(
            logger,
            event="oneclick_inscription_start",
            buy_order=buy_order,
            user_id=user_id,
            success=True,
            demo_mode=True,
        )
        return out
    try:
        exists = await db[PAYMENTS_COLLECTION].find_one({"buy_order": buy_order}, {"_id": 0, "status": 1})
        if not exists or exists.get("status") != "INIT":
            raise HTTPException(status_code=400, detail="buy_order inválido o estado inválido para start")

        result = tbk_start_inscription(
            username=data.username,
            email=data.email,
            response_url=data.return_url
        )
        logger.info(
            "[ONECLICK_START_ENDPOINT] token=%s url_webpay=%s",
            result.get("token") if isinstance(result, dict) else None,
            (result.get("url_webpay") or result.get("urlWebpay")) if isinstance(result, dict) else None,
        )
        logger.debug("TBK_START full response: %s", result)
        await evidence_record_start(
            db,
            token=result.get("token"),
            email=data.email,
            username=data.username,
        )
        await db[PAYMENTS_COLLECTION].update_one(
            {"buy_order": buy_order},
            {
                "$set": {
                    "token": result.get("token"),
                    "url_webpay": result.get("url_webpay"),
                    "updated_at": _now_iso(),
                }
            },
        )
        await _record_validation_event(
            buy_order=buy_order,
            user_id=user_id,
            event_type="inscription_started",
            status="OK",
            detail={"token": result.get("token")},
        )
        logger.info("Oneclick start OK buy_order=%s user_id=%s", buy_order, user_id)
        result["buy_order"] = buy_order
        result["session_id"] = session_id
        await _touch_payment_intent_start(data, current_user, idempotency_key)
        log_ops_event(
            logger,
            event="oneclick_inscription_start",
            buy_order=buy_order,
            user_id=user_id,
            success=True,
            demo_mode=False,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        error_text = str(e)
        incident_id = _extract_incident_id(error_text)
        log_ops_event(
            logger,
            event="oneclick_inscription_start_failed",
            buy_order=buy_order,
            user_id=user_id,
            success=False,
            incident_id=incident_id,
        )
        await db[PAYMENTS_COLLECTION].update_one(
            {"buy_order": buy_order},
            {"$set": {"status": "FAILED", "error": error_text, "updated_at": _now_iso()}},
        )
        await _record_validation_event(
            buy_order=buy_order,
            user_id=user_id,
            event_type="inscription_rejected",
            status="ERROR_EXTERNO" if "403" in error_text else "ERROR",
            detail={"error": error_text, "incident_id": incident_id},
        )
        logger.exception("Error en start_inscription Transbank buy_order=%s", buy_order)
        if "403" in error_text:
            raise HTTPException(
                status_code=502,
                detail={
                    "error": "external_waf_block",
                    "message": "Transbank devolvió 403 (bloqueo externo)",
                    "incident_id": incident_id,
                    "buy_order": buy_order,
                    "session_id": session_id,
                },
            )
        raise HTTPException(
            status_code=502,
            detail={"error": "transbank_error", "message": str(error_text), "buy_order": buy_order, "session_id": session_id},
        )


async def _touch_payment_intent_start(
    data: StartInscriptionRequest,
    current_user: dict | None,
    idempotency_key: str,
) -> None:
    bid = (data.booking_id or "").strip()
    if not bid:
        return
    uid = (current_user or {}).get("id")
    if not uid:
        u = await db.users.find_one({"email": data.email.strip()}, {"_id": 0, "id": 1})
        uid = (u or {}).get("id")
    if not uid:
        return
    try:
        await payment_intent_service.upsert_for_client(
            booking_id=bid,
            client_id=uid,
            state=PI_CARD_PENDING,
            last_idempotency_key=idempotency_key,
        )
    except Exception as e:
        logger.warning("payment_intent CARD_PENDING: %s", e)


@router.post("/start")
@router.post("/start-inscription")
@limiter.limit("10/minute")
async def start_inscription(
    request: Request,
    data: StartInscriptionRequest,
    current_user: dict | None = Depends(get_current_user_optional),
):
    """
    Inicia inscripción OneClick. Rutas `/start` y `/start-inscription` son el mismo handler
    (resolve_idempotency_key + run_idempotent, sin ramas alternas).
    """
    scope = (
        "start-inscription"
        if request.url.path.rstrip("/").endswith("start-inscription")
        else "start"
    )
    idempotency_key, key_legacy = resolve_idempotency_key(request, scope)
    await persist_idempotency_key_resolution(
        db,
        scope=scope,
        endpoint=str(request.url.path),
        was_auto_generated=key_legacy,
        generated_key_prefix=idempotency_key if key_legacy else "",
    )
    body_hash = data.model_dump()

    async def execute() -> tuple[int, dict]:
        out = await _start_inscription_body(request, data, current_user, idempotency_key)
        return 200, out

    code, payload = await run_idempotent(
        db,
        tenant_id=get_tenant_id(),
        idempotency_key=idempotency_key,
        scope=scope,
        endpoint=str(request.url.path),
        body_for_hash=body_hash,
        execute=execute,
    )
    r = JSONResponse(content=payload, status_code=code)
    r.headers["X-Idempotency-Mode"] = idempotency_mode_header_value(key_legacy)
    return r


@router.get("/confirm-return", response_class=HTMLResponse)
async def confirm_return(request: Request):
    """
    Recibe el redirect de Transbank tras completar inscripción (GET).
    Transbank envía TBK_TOKEN en query. Confirma y muestra resultado.
    """
    token = request.query_params.get("TBK_TOKEN") or request.query_params.get("token_ws")
    frontend_url = (os.environ.get("FRONTEND_URL", "http://localhost:5174") or "").strip().rstrip("/") or "http://localhost:5174"
    error_redirect = f"{frontend_url}/client/card?oneclick_error="

    if not token:
        return RedirectResponse(
            url=f"{error_redirect}token_faltante",
            status_code=302
        )
    try:
        payment = await db[PAYMENTS_COLLECTION].find_one({"token": token}, {"_id": 0})
        if not payment:
            return RedirectResponse(url=f"{error_redirect}token_desconocido", status_code=302)

        # Idempotencia de negocio: refresh / doble GET / replay del redirect no deben
        # volver a consumir el token en Transbank (token suele ser de un solo uso).
        if payment.get("status") == "INSCRIBED" and payment.get("tbk_user"):
            tbk_existing = payment.get("tbk_user")
            logger.info(
                "Oneclick confirm_return idempotent-hit token=%s buy_order=%s (sin reconfirmar TBK)",
                _mask_token(token),
                payment.get("buy_order"),
            )
            redirect_url = f"{frontend_url.rstrip('/')}/oneclick/complete?tbk_user={quote(str(tbk_existing), safe='')}"
            return RedirectResponse(url=redirect_url, status_code=302)

        result = tbk_confirm_inscription(token)
        await evidence_record_confirm(db, token=token, result=result)
        tbk_user = (result.get("tbk_user") or "").strip()
        rc = result.get("response_code")
        if rc is None:
            rc = result.get("responseCode")
        if rc is None:
            rc = -1
        if rc != 0 or not tbk_user:
            fail_reason = "sin_tbk_user" if not tbk_user else "transbank_error"
            await db[PAYMENTS_COLLECTION].update_one(
                {"token": token},
                {
                    "$set": {
                        "status": "FAILED",
                        "updated_at": _now_iso(),
                        "error": "sin_tbk_user" if not tbk_user else "confirm_response_code_nonzero",
                        "confirm_response_code": rc,
                    }
                },
            )
            return RedirectResponse(
                url=f"{error_redirect}{fail_reason}",
                status_code=302,
            )
        logger.info(
            "CONFIRM RETURN VALIDATED buy_order=%s response_code=%s",
            payment.get("buy_order"),
            rc,
        )
        await db[PAYMENTS_COLLECTION].update_one(
            {"token": token},
            {
                "$set": {
                    "status": "INSCRIBED",
                    "tbk_user": tbk_user,
                    "card_type": result.get("card_type"),
                    "card_number": result.get("card_number"),
                    "updated_at": _now_iso(),
                }
            },
        )
        await _record_validation_event(
            buy_order=payment.get("buy_order"),
            user_id=payment.get("user_id"),
            event_type="inscription_approved",
            status="OK",
            detail={"tbk_user": tbk_user, "card_type": result.get("card_type")},
        )
        # Mantener colección funcional del producto para cobros posteriores.
        await db.oneclick_inscriptions.update_one(
            {"email": payment.get("email")},
            {
                "$set": {
                    "tbk_user": tbk_user,
                    "username": payment.get("username"),
                    "email": payment.get("email"),
                    "buy_order": payment.get("buy_order"),
                    "updatedAt": _now_iso(),
                }
            },
            upsert=True,
        )
        redirect_url = f"{frontend_url.rstrip('/')}/oneclick/complete?tbk_user={quote(str(tbk_user), safe='')}"
        return RedirectResponse(url=redirect_url, status_code=302)
    except requests.exceptions.Timeout:
        logger.warning("Timeout al confirmar inscripción con Transbank")
        return RedirectResponse(
            url=f"{error_redirect}timeout",
            status_code=302
        )
    except Exception as e:
        error_text = str(e)
        incident_id = _extract_incident_id(error_text)
        await db[PAYMENTS_COLLECTION].update_one(
            {"token": token},
            {"$set": {"status": "FAILED", "updated_at": _now_iso(), "error": error_text}},
        )
        payment = await db[PAYMENTS_COLLECTION].find_one({"token": token}, {"_id": 0, "buy_order": 1, "user_id": 1})
        await _record_validation_event(
            buy_order=(payment or {}).get("buy_order"),
            user_id=(payment or {}).get("user_id"),
            event_type="inscription_rejected",
            status="ERROR",
            detail={"error": error_text, "incident_id": incident_id},
        )
        logger.exception("Error en confirm_inscription Transbank")
        return RedirectResponse(
            url=f"{error_redirect}transbank_error",
            status_code=302
        )


@router.post("/confirm")
async def confirm_inscription(request: Request, body: ConfirmInscriptionRequest | None = None):
    """
    Confirma inscripción (POST). Para redirect de Transbank usa GET /confirm-return.
    """
    body = body or ConfirmInscriptionRequest()
    source = None
    final_token = (
        (body.token or "").strip()
        or (body.TBK_TOKEN or "").strip()
        or (body.token_ws or "").strip()
    )
    if final_token:
        source = "body"
    else:
        final_token = (
            (request.query_params.get("TBK_TOKEN") or "").strip()
            or (request.query_params.get("token_ws") or "").strip()
        )
        source = "query" if final_token else None
    if not final_token:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "missing_token",
                "message": "Se requiere TBK_TOKEN o token_ws",
            },
        )
    try:
        logger.info(
            "Oneclick confirm request source=%s token=%s",
            source,
            _mask_token(final_token),
        )
        payment = await db[PAYMENTS_COLLECTION].find_one({"token": final_token}, {"_id": 0})
        if not payment:
            raise HTTPException(status_code=404, detail="Token de inscripción no encontrado")
        if payment.get("status") == "INSCRIBED" and payment.get("tbk_user"):
            tbk_existing = payment.get("tbk_user")
            logger.info(
                "CONFIRM IDEMPOTENT OK token=%s buy_order=%s",
                _mask_token(final_token),
                payment.get("buy_order"),
            )
            return {
                "response_code": 0,
                "tbk_user": tbk_existing,
                "message": "CONFIRM IDEMPOTENT OK",
                "idempotent": True,
                "card_type": payment.get("card_type"),
                "card_number": payment.get("card_number"),
            }
        result = tbk_confirm_inscription(final_token)
        await evidence_record_confirm(db, token=final_token, result=result)
        tbk_user = (result.get("tbk_user") or "").strip()
        rc = result.get("response_code")
        if rc is None:
            rc = result.get("responseCode")
        if rc is None:
            rc = -1
        if rc != 0 or not tbk_user:
            await db[PAYMENTS_COLLECTION].update_one(
                {"token": final_token},
                {
                    "$set": {
                        "status": "FAILED",
                        "tbk_user": tbk_user or "",
                        "updated_at": _now_iso(),
                        "error": "sin_tbk_user" if not tbk_user else "confirm_response_code_nonzero",
                        "confirm_response_code": rc,
                    }
                },
            )
            await _record_validation_event(
                buy_order=payment.get("buy_order"),
                user_id=payment.get("user_id"),
                event_type="inscription_rejected",
                status="FAILED",
                detail={
                    "inscription_ok": False,
                    "response_code": rc,
                    "reason": "sin_tbk_user" if not tbk_user else "confirm_response_code_nonzero",
                },
            )
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "confirm_failed",
                    "message": "Inscripción no completada (response_code o tbk_user inválido)",
                    "response_code": rc,
                },
            )
        status = "INSCRIBED"
        await db[PAYMENTS_COLLECTION].update_one(
            {"token": final_token},
            {
                "$set": {
                    "status": status,
                    "tbk_user": tbk_user,
                    "card_type": result.get("card_type"),
                    "card_number": result.get("card_number"),
                    "updated_at": _now_iso(),
                }
            },
        )
        if tbk_user:
            await db.oneclick_inscriptions.update_one(
                {"email": payment.get("email")},
                {
                    "$set": {
                        "tbk_user": tbk_user,
                        "username": payment.get("username"),
                        "email": payment.get("email"),
                        "buy_order": payment.get("buy_order"),
                        "updatedAt": _now_iso(),
                    }
                },
                upsert=True,
            )
        await _record_validation_event(
            buy_order=payment.get("buy_order"),
            user_id=payment.get("user_id"),
            event_type="inscription_approved" if tbk_user else "inscription_rejected",
            status="OK" if tbk_user else "FAILED",
            detail={"inscription_ok": bool(tbk_user)},
        )
        logger.info(
            "Oneclick confirm result buy_order=%s status=%s response_code=%s tbk_user=%s",
            payment.get("buy_order"),
            status,
            result.get("response_code"),
            tbk_user,
        )
        log_ops_event(
            logger,
            event="oneclick_confirm",
            buy_order=payment.get("buy_order"),
            user_id=payment.get("user_id"),
            success=True,
            response_code=result.get("response_code"),
        )
        logger.debug("TBK_CONFIRM full=%s", result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error en confirm_inscription Transbank")
        log_ops_event(
            logger,
            event="oneclick_confirm_error",
            success=False,
            error_type=type(e).__name__,
        )
        raise HTTPException(
            status_code=502,
            detail={
                "error": "transbank_unavailable",
                "message": "No se pudo completar la confirmación. Intenta nuevamente o contacta soporte.",
            },
        )


@router.post("/authorize")
@limiter.limit("20/minute")
async def authorize_payment(
    request: Request,
    data: AuthorizePaymentRequest,
    current_user: dict | None = Depends(get_current_user_optional),
):
    """
    Autoriza cobro con tarjeta inscrita.
    Solo administración (el flujo productivo usa authorize_payment vía payment_service en servidor).
    """
    _validate_buy_order_or_400(data.buy_order)
    if not current_user:
        _require_public_validation_access_or_403(request)
    payment = await db[PAYMENTS_COLLECTION].find_one({"buy_order": data.buy_order}, {"_id": 0})
    if not payment:
        raise HTTPException(
            status_code=400,
            detail={"error": "buy_order_not_found", "message": "buy_order no existe en DB"},
        )
    if payment.get("status") != "INSCRIBED":
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_status", "message": "buy_order no esta INSCRIBED"},
        )
    if payment.get("tbk_user") and payment.get("tbk_user") != data.tbk_user:
        raise HTTPException(
            status_code=400,
            detail={"error": "tbk_user_mismatch", "message": "tbk_user no coincide con la inscripción"},
        )

    owner_id = payment.get("user_id")
    if current_user:
        if not _is_admin(current_user) and owner_id != current_user.get("id"):
            raise HTTPException(
                status_code=403,
                detail={"error": "forbidden", "message": "No autorizado para este buy_order"},
            )

    # Validación defensiva adicional para endpoints públicos:
    # si existe username persistido, debe coincidir.
    if payment.get("username") and str(payment.get("username")) != str(data.username):
        raise HTTPException(
            status_code=400,
            detail={"error": "username_mismatch", "message": "username no coincide con la inscripción"},
        )

    # Idempotencia estricta: si ya está autorizada, no reintentar cobro.
    existing_auth = payment.get("authorization_response")
    if payment.get("status") == "AUTHORIZED" and isinstance(existing_auth, dict):
        detail = ((existing_auth.get("details") or [{}])[0]) if isinstance(existing_auth, dict) else {}
        already_approved = detail.get("response_code") == 0 and detail.get("status") == "AUTHORIZED"
        same_amount = int(payment.get("amount") or 0) == int(data.amount)
        if already_approved and same_amount:
            logger.info("Oneclick authorize idempotent-hit buy_order=%s", data.buy_order)
            return existing_auth
        raise HTTPException(
            status_code=409,
            detail={
                "error": "already_authorized",
                "message": "buy_order ya fue autorizado y no puede recobrarse",
                "buy_order": data.buy_order,
            },
        )

    try:
        result = provider_oneclick_authorize(
            username=data.username,
            tbk_user=data.tbk_user,
            buy_order=data.buy_order,
            amount=data.amount,
        )
        await evidence_record_authorize(
            db,
            buy_order=data.buy_order,
            tbk_user=data.tbk_user,
            amount=data.amount,
            result=result if isinstance(result, dict) else {},
        )
        detail = ((result.get("details") or [{}])[0]) if isinstance(result, dict) else {}
        approved = detail.get("response_code") == 0 and detail.get("status") == "AUTHORIZED"
        await db[PAYMENTS_COLLECTION].update_one(
            {"buy_order": data.buy_order},
            {
                "$set": {
                    "amount": data.amount,
                    "status": "AUTHORIZED" if approved else "FAILED",
                    "authorization_response": result,
                    "updated_at": _now_iso(),
                }
            },
        )
        detail_for_type = detail if isinstance(detail, dict) else {}
        payment_type = detail_for_type.get("payment_type_code")
        installments = int(detail_for_type.get("installments_number") or 0)
        event_type = "authorize_approved" if approved else "authorize_rejected"
        if payment_type in {"VD", "VP"}:
            event_type = "debit"
        elif installments >= 2:
            event_type = "installments"
        await _record_validation_event(
            buy_order=data.buy_order,
            user_id=owner_id,
            event_type=event_type,
            status="OK" if approved else "FAILED",
            detail={"payment_type_code": payment_type, "installments_number": installments},
        )
        detail_rc = detail.get("response_code") if isinstance(detail, dict) else None
        logger.debug("TBK_AUTHORIZE full=%s", result)
        logger.info(
            "Oneclick authorize validation OK buy_order=%s exists=1 status_before=INSCRIBED approved=%s response_code=%s",
            data.buy_order,
            approved,
            detail_rc,
        )
        log_ops_event(
            logger,
            event="oneclick_authorize",
            buy_order=data.buy_order,
            success=bool(approved),
            response_code=detail_rc,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        error_text = str(e)
        incident_id = _extract_incident_id(error_text)
        log_ops_event(
            logger,
            event="oneclick_authorize_failed",
            buy_order=data.buy_order,
            success=False,
            incident_id=incident_id,
        )
        await db[PAYMENTS_COLLECTION].update_one(
            {"buy_order": data.buy_order},
            {"$set": {"status": "FAILED", "error": error_text, "updated_at": _now_iso()}},
        )
        await _record_validation_event(
            buy_order=data.buy_order,
            user_id=owner_id,
            event_type="authorize_rejected",
            status="ERROR_EXTERNO" if "403" in error_text else "ERROR",
            detail={"error": error_text, "incident_id": incident_id},
        )
        logger.exception("Error en authorize_payment Transbank buy_order=%s", data.buy_order)
        if "403" in error_text:
            raise HTTPException(
                status_code=502,
                detail={
                    "error": "external_waf_block",
                    "message": "Transbank devolvió 403 (bloqueo externo)",
                    "incident_id": incident_id,
                    "buy_order": data.buy_order,
                },
            )
        raise HTTPException(
            status_code=502,
            detail={
                "error": "transbank_error",
                "message": "No se pudo autorizar el pago con Transbank. Intenta nuevamente.",
                "buy_order": data.buy_order,
            },
        )


@router.get("/evidence/export")
@limiter.limit("60/minute")
async def export_oneclick_evidence(
    request: Request,
    _: dict = Depends(get_current_admin_strict),
    limit: int = Query(50000, ge=1, le=100000),
):
    """JSON formateado para documentación / certificación (solo admin)."""
    cursor = db[ONECLICK_EVIDENCE_COLLECTION].find().sort("timestamp", 1).limit(limit)
    items = []
    async for doc in cursor:
        items.append(serialize_evidence_doc(doc))
    payload = {"events": items, "count": len(items), "exported_at": _now_iso()}
    body = json.dumps(payload, indent=2, ensure_ascii=False, default=str)
    return Response(content=body.encode("utf-8"), media_type="application/json; charset=utf-8")


@router.get("/evidence")
@limiter.limit("60/minute")
async def list_oneclick_evidence(
    request: Request,
    _: dict = Depends(get_current_admin_strict),
    limit: int = Query(10000, ge=1, le=50000),
):
    """Lista eventos de evidencia OneClick ordenados por timestamp (solo admin)."""
    cursor = db[ONECLICK_EVIDENCE_COLLECTION].find().sort("timestamp", 1).limit(limit)
    items = []
    async for doc in cursor:
        items.append(serialize_evidence_doc(doc))
    return {"events": items, "count": len(items)}


@router.get("/debug-config")
@limiter.limit("20/minute")
async def oneclick_debug_config(
    request: Request,
    _: dict = Depends(get_current_admin_strict),
):
    """
    Verifica variables TBK configuradas en Railway. Solo admin.
    Muestra si cada variable está seteada (valor enmascarado para secretos).
    """
    def _mask(v: str) -> str:
        if not v:
            return "(vacío)"
        if len(v) <= 6:
            return "***"
        return f"{v[:3]}...{v[-3:]}"

    tbk_env = os.getenv("TBK_ENV", "(no seteado)")
    parent_cc = os.getenv("TBK_PARENT_COMMERCE_CODE", "").strip()
    child_cc = os.getenv("TBK_CHILD_COMMERCE_CODE", "").strip()
    api_key_secret = (os.getenv("TBK_API_KEY_SECRET", "") or os.getenv("TBK_API_KEY", "")).strip()
    api_key_id = (os.getenv("TBK_API_KEY_ID", "") or parent_cc).strip()
    return_url = os.getenv("TBK_RETURN_URL", "").strip()
    base_url = (
        "https://webpay3g.transbank.cl"
        if tbk_env == "production"
        else "https://webpay3gint.transbank.cl"
    )
    config_ok = bool(parent_cc and child_cc and api_key_secret)
    logger.info(
        "TBK_DEBUG_CONFIG env=%s parent_cc=%s child_cc=%s api_key_id_set=%s api_key_secret_set=%s return_url=%s config_ok=%s",
        tbk_env,
        parent_cc,
        child_cc,
        bool(api_key_id),
        bool(api_key_secret),
        return_url,
        config_ok,
    )
    return {
        "TBK_ENV": tbk_env,
        "TBK_DEMO_MODE": TBK_DEMO_MODE,
        "TBK_PARENT_COMMERCE_CODE": parent_cc or "(vacío)",
        "TBK_CHILD_COMMERCE_CODE": child_cc or "(vacío)",
        "TBK_API_KEY_ID": _mask(api_key_id),
        "TBK_API_KEY_SECRET": _mask(api_key_secret),
        "TBK_RETURN_URL": return_url or "(vacío)",
        "ONECLICK_PUBLIC_VALIDATION_ENABLED": ONECLICK_PUBLIC_VALIDATION_ENABLED,
        "base_url": base_url,
        "config_ok": config_ok,
        "missing_vars": [
            v for v, val in [
                ("TBK_PARENT_COMMERCE_CODE", parent_cc),
                ("TBK_CHILD_COMMERCE_CODE", child_cc),
                ("TBK_API_KEY_SECRET", api_key_secret),
            ] if not val
        ],
    }


@router.get("/debug-last-token")
@limiter.limit("30/minute")
async def debug_last_oneclick_token(
    request: Request,
    _: dict = Depends(get_current_admin_strict),
):
    """
    Certificación / soporte: último token de inscripción guardado en payments_oneclick
    (respuesta real de Transbank tras start). Solo admin; email parcial en respuesta.
    """
    cursor = (
        db[PAYMENTS_COLLECTION]
        .find(
            {"token": {"$nin": [None, ""]}},
            {"_id": 0, "token": 1, "created_at": 1, "email": 1, "username": 1},
        )
        .sort("created_at", -1)
        .limit(1)
    )
    docs = await cursor.to_list(1)
    doc = docs[0] if docs else None
    if not doc:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "No hay inscripciones con token persistido"},
        )
    return {
        "token": doc.get("token"),
        "created_at": doc.get("created_at"),
        "email": _partial_email_for_debug((doc.get("email") or "").strip()),
        "username": doc.get("username"),
    }


@router.post("/test-flow")
@limiter.limit("8/minute")
async def oneclick_test_flow(
    request: Request,
    body: OneclickTestFlowRequest,
    _: dict | None = Depends(get_current_user_optional),
):
    """
    Orquestador interno para validación: start -> confirm -> authorize.
    Reusa la integración actual sin cambios de headers ni bypass.
    """
    # Modo de validación Transbank: ejecutar desde internet sin sesión.
    # Para evitar abuso, limitamos estrictamente a ambiente integration.
    if not _:
        _require_public_validation_access_or_403(request)

    start_result = {}
    final_buy_order = body.buy_order
    final_token = body.token
    final_tbk_user = body.tbk_user
    steps = []
    # Permite ejecución externa sin payload manual para validación técnica.
    effective_username = (
        (body.username or "").strip()
        or os.getenv("TBK_TEST_USERNAME", "").strip()
        or f"tbk-test-{int(time.time())}"
    )
    effective_email = (
        (body.email or "").strip()
        or os.getenv("TBK_TEST_EMAIL", "").strip()
        or f"tbk.test+{int(time.time())}@maqgo.cl"
    )

    if not final_buy_order:
        start_payload = StartInscriptionRequest(
            username=effective_username,
            email=effective_email,
            return_url=body.return_url,
            amount=body.amount,
        )
        start_result = await start_inscription(request, start_payload, None)
        final_buy_order = start_result.get("buy_order")
        final_token = final_token or start_result.get("token")
        steps.append({"step": "start", "ok": True, "buy_order": final_buy_order, "token": final_token})

    if not final_buy_order:
        raise HTTPException(status_code=400, detail="No se pudo obtener buy_order para test-flow")
    _validate_buy_order_or_400(final_buy_order)

    payment_before = await db[PAYMENTS_COLLECTION].find_one({"buy_order": final_buy_order}, {"_id": 0})
    if not payment_before:
        raise HTTPException(status_code=400, detail="buy_order no existe en DB")

    confirm_result = None
    if body.run_confirm:
        if not final_token:
            raise HTTPException(status_code=400, detail="run_confirm requiere token")
        confirm_result = tbk_confirm_inscription(final_token)
        await evidence_record_confirm(db, token=final_token, result=confirm_result)
        confirm_code = confirm_result.get("response_code")
        final_tbk_user = confirm_result.get("tbk_user") or final_tbk_user
        status = "INSCRIBED" if final_tbk_user else "FAILED"
        await db[PAYMENTS_COLLECTION].update_one(
            {"buy_order": final_buy_order},
            {"$set": {"status": status, "tbk_user": final_tbk_user, "updated_at": _now_iso()}},
        )
        await _record_validation_event(
            buy_order=final_buy_order,
            user_id=payment_before.get("user_id"),
            event_type="inscription_approved" if final_tbk_user else "inscription_rejected",
            status="OK" if final_tbk_user else "FAILED",
            detail={"token": final_token},
        )
        steps.append({"step": "confirm", "ok": bool(final_tbk_user), "tbk_user": final_tbk_user})
        if confirm_code != 0:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "inscription_not_completed",
                    "message": "La inscripción no fue completada en Webpay",
                    "response_code": confirm_code,
                    "buy_order": final_buy_order,
                    "token": final_token,
                },
            )

    authorize_result = None
    if body.run_authorize:
        payment_now = await db[PAYMENTS_COLLECTION].find_one({"buy_order": final_buy_order}, {"_id": 0})
        if not payment_now:
            raise HTTPException(status_code=400, detail="buy_order no existe en DB")
        if payment_now.get("status") != "INSCRIBED":
            raise HTTPException(status_code=400, detail="buy_order no esta INSCRIBED")
        final_tbk_user = final_tbk_user or payment_now.get("tbk_user")
        if not final_tbk_user:
            raise HTTPException(status_code=400, detail="run_authorize requiere tbk_user")
        auth_payload = AuthorizePaymentRequest(
            username=effective_username,
            tbk_user=final_tbk_user,
            buy_order=final_buy_order,
            amount=body.amount,
        )
        authorize_result = await authorize_payment(request, auth_payload, None)
        steps.append({"step": "authorize", "ok": True})

    payment_after = await db[PAYMENTS_COLLECTION].find_one({"buy_order": final_buy_order}, {"_id": 0})
    return {
        "buy_order": final_buy_order,
        "token": final_token,
        "tbk_user": final_tbk_user,
        "steps": steps,
        "start_result": start_result or None,
        "confirm_result": confirm_result,
        "authorize_result": authorize_result,
        "db_status": (payment_after or {}).get("status"),
        "db_record": payment_after,
    }


@router.post("/refund")
@limiter.limit("10/minute")
async def refund_payment(
    request: Request,
    data: RefundPaymentRequest,
    _: dict = Depends(get_current_admin_strict),
):
    """Reembolsa un cobro (solo admin; operación financiera sensible)."""
    try:
        result = tbk_refund_payment(
            buy_order=data.buy_order,
            detail_buy_order=data.detail_buy_order,
            amount=data.amount
        )
        return result
    except Exception as e:
        logger.exception("Error en refund_payment Transbank")
        raise HTTPException(status_code=502, detail=f"Error Transbank: {str(e)}")
