from fastapi import APIRouter, HTTPException, Request, Depends
from urllib.parse import quote

from rate_limit import limiter
from auth_dependency import get_current_admin
from fastapi.responses import HTMLResponse, RedirectResponse
from datetime import datetime, timezone
import os
import time
from pydantic import BaseModel
from typing import Optional
import requests
from services.oneclick_service import (
    start_inscription as tbk_start_inscription,
    confirm_inscription as tbk_confirm_inscription,
    authorize_payment as tbk_authorize_payment,
    refund_payment as tbk_refund_payment,
)
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments/oneclick", tags=["oneclick"])


class StartInscriptionRequest(BaseModel):
    username: str
    email: str
    return_url: Optional[str] = None


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


@router.post("/save")
@limiter.limit("10/minute")
async def save_oneclick_credentials(request: Request, data: SaveOneClickRequest):
    """Guarda credenciales OneClick para cobros futuros (por email)."""
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        from db_config import get_db_name, get_mongo_url

        mongo_url = get_mongo_url()
        client = AsyncIOMotorClient(mongo_url)
        db = client[get_db_name()]
        await db.oneclick_inscriptions.update_one(
            {"email": data.email},
            {"$set": {
                "tbk_user": data.tbk_user,
                "username": data.username,
                "email": data.email,
                "updatedAt": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )
        return {"success": True}
    except Exception as e:
        logger.exception("Error guardando OneClick")
        raise HTTPException(status_code=500, detail=str(e))


TBK_DEMO_MODE = os.environ.get("TBK_DEMO_MODE", "false").lower() == "true"


@router.post("/start")
@limiter.limit("10/minute")
async def start_inscription(request: Request, data: StartInscriptionRequest):
    """Inicia inscripción OneClick. Retorna token y url_webpay para redirigir al usuario."""
    # Modo demo: salta Transbank y permite completar el flujo en localhost
    if TBK_DEMO_MODE:
        tbk_user = f"demo-{int(time.time())}"
        return {
            "demo_mode": True,
            "tbk_user": tbk_user,
            "url_webpay": None,
            "token": None,
        }
    try:
        result = tbk_start_inscription(
            username=data.username,
            email=data.email,
            response_url=data.return_url
        )
        return result
    except Exception as e:
        logger.exception("Error en start_inscription Transbank")
        raise HTTPException(status_code=502, detail=f"Error Transbank: {str(e)}")


@router.get("/confirm-return", response_class=HTMLResponse)
async def confirm_return(request: Request):
    """
    Recibe el redirect de Transbank tras completar inscripción (GET).
    Transbank envía TBK_TOKEN en query. Confirma y muestra resultado.
    """
    token = request.query_params.get("TBK_TOKEN") or request.query_params.get("token_ws")
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5174")
    error_redirect = f"{frontend_url}/client/card?oneclick_error="

    if not token:
        return RedirectResponse(
            url=f"{error_redirect}token_faltante",
            status_code=302
        )
    try:
        result = tbk_confirm_inscription(token)
        tbk_user = result.get("tbk_user", "")
        if not tbk_user:
            return RedirectResponse(
                url=f"{error_redirect}sin_tbk_user",
                status_code=302
            )
        redirect_url = f"{frontend_url}/oneclick/complete?tbk_user={quote(str(tbk_user), safe='')}"
        return RedirectResponse(url=redirect_url, status_code=302)
    except requests.exceptions.Timeout:
        logger.warning("Timeout al confirmar inscripción con Transbank")
        return RedirectResponse(
            url=f"{error_redirect}timeout",
            status_code=302
        )
    except Exception as e:
        logger.exception("Error en confirm_inscription Transbank")
        return RedirectResponse(
            url=f"{error_redirect}transbank_error",
            status_code=302
        )


@router.post("/confirm")
async def confirm_inscription(request: Request):
    """
    Confirma inscripción (POST). Para redirect de Transbank usa GET /confirm-return.
    """
    token = request.query_params.get("TBK_TOKEN") or request.query_params.get("token_ws")
    if not token:
        raise HTTPException(status_code=400, detail="Falta TBK_TOKEN o token_ws en la URL")
    try:
        result = tbk_confirm_inscription(token)
        return result
    except Exception as e:
        logger.exception("Error en confirm_inscription Transbank")
        raise HTTPException(status_code=502, detail=f"Error Transbank: {str(e)}")


@router.post("/authorize")
@limiter.limit("20/minute")
async def authorize_payment(
    request: Request,
    data: AuthorizePaymentRequest,
    _: dict = Depends(get_current_admin),
):
    """
    Autoriza cobro con tarjeta inscrita.
    Solo administración (el flujo productivo usa authorize_payment vía payment_service en servidor).
    """
    try:
        result = tbk_authorize_payment(
            username=data.username,
            tbk_user=data.tbk_user,
            buy_order=data.buy_order,
            amount=data.amount
        )
        return result
    except Exception as e:
        logger.exception("Error en authorize_payment Transbank")
        raise HTTPException(status_code=502, detail=f"Error Transbank: {str(e)}")


@router.post("/refund")
@limiter.limit("10/minute")
async def refund_payment(
    request: Request,
    data: RefundPaymentRequest,
    _: dict = Depends(get_current_admin),
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
