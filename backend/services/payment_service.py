"""                
SERVICIO DE PAGOS - MAQGO MVP v1

Lógica de pagos:
- Inscripción OneClick (Transbank) para guardar tarjeta
- Cobro real SOLO cuando proveedor acepta (vía OneClick authorize)
- Nunca cobrar doble
- Rollback en caso de fallo

Estados de pago:
- none: Sin acción de pago
- validated: Tarjeta inscrita OneClick
- charged: Cobro completo realizado
- failed: Error en el cobro
- refunded: Reembolsado
"""
from datetime import datetime, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError
import asyncio
import logging
import uuid
import os

from services.payment_intent_service import (
    CAPTURE_FAILED,
    CAPTURE_PROCESSING,
    CAPTURE_SUCCEEDED,
    PaymentIntentService,
)
from services.payment_ledger import (
    EVT_CHARGE_ATTEMPT,
    EVT_CHARGE_FAILURE,
    EVT_CHARGE_SUCCESS,
    EVT_PROVIDER_CALL_EXECUTED,
    append_dead_letter_payment,
    append_event,
    ledger_has_charge_success_for_service_request,
)
from services.payment_rollout import (
    record_charge_attempt,
    record_charge_failure,
    record_charge_success,
)
from services.oneclick_evidence import record_authorize as evidence_record_authorize

logger = logging.getLogger(__name__)


def provider_oneclick_authorize(
    *,
    username: str,
    tbk_user: str,
    buy_order: str,
    amount: int,
) -> dict:
    """
    Único punto de llamada a Transbank OneClick authorize (cobro con tarjeta inscrita).
    No usar authorize_payment del oneclick_service fuera de payment_service.
    """
    from services.oneclick_service import authorize_payment as _authorize_payment

    return _authorize_payment(
        username=username,
        tbk_user=tbk_user,
        buy_order=buy_order,
        amount=amount,
    )


def _is_production_env() -> bool:
    env = os.environ.get("MAQGO_ENV", os.environ.get("ENVIRONMENT", "development"))
    return str(env).strip().lower() in {"prod", "production"}


def _parse_bool_env(name: str, default: bool) -> bool:
    raw = str(os.environ.get(name, str(default))).strip().lower()
    return raw in {"1", "true", "yes", "on"}

# Configuración de pagos
PAYMENT_CONFIG = {
    'validation_amount': 50,  # CLP $50 para validación
    'currency': 'CLP',
    'provider': 'transbank',  # transbank | mercadopago
}

class PaymentService:
    """
    Servicio de pagos para MAQGO.
    MVP: Simula el flujo de pagos (requiere integración real con Transbank/MercadoPago)
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self._intents = PaymentIntentService(db)
        # En producción se exige pago real (sin fallback simulado).
        self.require_real_payment = _parse_bool_env(
            "REQUIRE_REAL_PAYMENT",
            _is_production_env(),
        )

    async def _wait_capture_not_processing(self, booking_id: str, timeout: float = 90.0) -> Optional[dict]:
        import asyncio
        import time as time_mod

        deadline = time_mod.monotonic() + timeout
        while time_mod.monotonic() < deadline:
            doc = await self._intents.get_by_booking_id(booking_id)
            cap = (doc or {}).get("payment_capture_status") or "idle"
            if cap != CAPTURE_PROCESSING:
                return doc
            await asyncio.sleep(0.3)
        return await self._intents.get_by_booking_id(booking_id)

    async def _charge_result_if_already_charged(self, service_request_id: str, amount: float) -> dict:
        existing = await self.db.payments.find_one(
            {"serviceRequestId": service_request_id, "status": "charged"},
            {"_id": 0},
        )
        if existing:
            return {
                "success": True,
                "status": "charged",
                "message": "Pago ya registrado",
                "paymentId": existing["id"],
                "amount": existing.get("amount", amount),
                "short_circuit": True,
            }
        return {
            "success": False,
            "status": "failed",
            "message": "Estado de captura succeeded sin fila de pago; reintenta o revisa consistencia",
            "error": "PAYMENT_ROW_MISSING",
        }
    
    async def validate_card(
        self,
        client_id: str,
        card_token: str,
        card_last_four: str = "****"
    ) -> dict:
        """
        Valida la tarjeta del cliente con un cargo temporal de $50 CLP.
        Este cargo se revierte inmediatamente.
        
        Args:
            client_id: ID del cliente
            card_token: Token de la tarjeta (de Transbank/MercadoPago)
            card_last_four: Últimos 4 dígitos
            
        Returns:
            Resultado de la validación
        """
        now = datetime.now(timezone.utc)
        
        # Crear registro de validación
        validation = {
            'id': str(uuid.uuid4()),
            'clientId': client_id,
            'cardToken': card_token,
            'cardLastFour': card_last_four,
            'amount': PAYMENT_CONFIG['validation_amount'],
            'currency': PAYMENT_CONFIG['currency'],
            'status': 'validated',
            'type': 'validation',
            'createdAt': now.isoformat(),
            'provider': PAYMENT_CONFIG['provider']
        }
        
        # TODO: Integración real con Transbank OneClick
        # response = await transbank.charge(card_token, 50)
        # if response.success:
        #     await transbank.refund(response.transaction_id)
        
        # Guardar validación
        await self.db.payment_validations.insert_one(validation)
        
        # Actualizar cliente con tarjeta validada
        await self.db.users.update_one(
            {'id': client_id},
            {
                '$set': {
                    'cardValidated': True,
                    'cardLastFour': card_last_four,
                    'cardToken': card_token,
                    'cardValidatedAt': now.isoformat()
                }
            }
        )
        
        logger.info(f"Tarjeta validada para cliente {client_id}")
        
        return {
            'success': True,
            'status': 'validated',
            'message': 'Tarjeta validada correctamente',
            'validationId': validation['id']
        }
    
    async def execute_payment_charge(
        self,
        *,
        service_request_id: str,
        payment_intent_id: Optional[str],
        client_id: str,
        amount: float,
        booking_id: Optional[str] = None,
        scope: str = "accept",
        endpoint: str = "payment_service.execute_payment_charge",
    ) -> dict:
        """
        Único flujo de cobro al proveedor: bloqueo vía payment_intent (processing/succeeded)
        y única llamada al proveedor vía provider_oneclick_authorize.
        """
        sr = await self.db.service_requests.find_one({"id": service_request_id}, {"_id": 0})
        bid = booking_id or (sr.get("bookingId") if sr else None)

        # Exactly-once lógico: ledger como autoridad histórica de éxito
        if await ledger_has_charge_success_for_service_request(self.db, service_request_id):
            if bid:
                try:
                    await self._intents.set_payment_capture_outcome(bid, CAPTURE_SUCCEEDED)
                except Exception:
                    pass
            paid_ledger = await self.db.payments.find_one(
                {"serviceRequestId": service_request_id, "status": "charged"},
                {"_id": 0},
            )
            if paid_ledger:
                return {
                    "success": True,
                    "status": "charged",
                    "message": "Pago ya registrado",
                    "paymentId": paid_ledger["id"],
                    "amount": paid_ledger.get("amount", amount),
                    "short_circuit": True,
                }
            return {
                "success": True,
                "status": "charged",
                "message": "Ledger indica cobro exitoso previo (exactly-once lógico)",
                "short_circuit": True,
                "ledger_replay": True,
            }

        paid = await self.db.payments.find_one(
            {"serviceRequestId": service_request_id, "status": "charged"},
            {"_id": 0},
        )
        if paid:
            if bid:
                try:
                    await self._intents.set_payment_capture_outcome(bid, CAPTURE_SUCCEEDED)
                except Exception:
                    pass
            return {
                "success": True,
                "status": "charged",
                "message": "Pago ya registrado",
                "paymentId": paid["id"],
                "amount": paid.get("amount", amount),
                "short_circuit": True,
            }

        intent: Optional[dict] = None
        if payment_intent_id:
            intent = await self.db.payment_intents.find_one({"id": payment_intent_id}, {"_id": 0})
            if intent and not bid:
                bid = intent.get("booking_id")
        elif bid:
            intent = await self._intents.get_by_booking_id(bid)

        claimed = False
        if intent and bid:
            cap = intent.get("payment_capture_status") or "idle"
            if cap == CAPTURE_SUCCEEDED:
                return await self._charge_result_if_already_charged(service_request_id, amount)
            if cap == CAPTURE_PROCESSING:
                intent = await self._wait_capture_not_processing(bid)
                cap = (intent or {}).get("payment_capture_status") or "idle"
                if cap == CAPTURE_SUCCEEDED:
                    return await self._charge_result_if_already_charged(service_request_id, amount)

            for _ in range(8):
                claimed, cur = await self._intents.claim_payment_capture(bid)
                if claimed:
                    intent = cur
                    break
                cap2 = (cur or {}).get("payment_capture_status") or "idle"
                if cap2 == CAPTURE_SUCCEEDED:
                    return await self._charge_result_if_already_charged(service_request_id, amount)
                if cap2 == CAPTURE_PROCESSING:
                    await self._wait_capture_not_processing(bid, timeout=5.0)
                await asyncio.sleep(0.08)
            else:
                await append_event(
                    self.db,
                    EVT_CHARGE_FAILURE,
                    {
                        "service_request_id": service_request_id,
                        "booking_id": bid,
                        "scope": scope,
                        "endpoint": endpoint,
                        "error": "CHARGE_LOCK_FAILED",
                    },
                )
                return {
                    "success": False,
                    "status": "failed",
                    "message": "No se pudo obtener bloqueo de captura (payment_intent)",
                    "error": "CHARGE_LOCK_FAILED",
                }

        ledger_base = {
            "service_request_id": service_request_id,
            "client_id": client_id,
            "amount": amount,
            "booking_id": bid,
            "scope": scope,
            "endpoint": endpoint,
            "claimed_capture": claimed,
        }
        await record_charge_attempt(
            self.db, service_request_id, scope=scope, endpoint=endpoint
        )
        await append_event(self.db, EVT_CHARGE_ATTEMPT, ledger_base)
        try:
            result = await self._execute_payment_charge_body(
                service_request_id,
                client_id,
                amount,
                ledger_context=ledger_base,
            )
        except Exception as e:
            await append_event(
                self.db,
                EVT_CHARGE_FAILURE,
                {**ledger_base, "error": type(e).__name__, "message": str(e)[:500]},
            )
            await record_charge_failure(
                self.db, service_request_id, scope=scope, endpoint=endpoint
            )
            if claimed and bid:
                try:
                    await self._intents.set_payment_capture_outcome(bid, CAPTURE_FAILED)
                except Exception as e:
                    logger.warning("set_payment_capture_outcome failed: %s", e)
            raise

        if result.get("success"):
            await append_event(
                self.db,
                EVT_CHARGE_SUCCESS,
                {
                    **ledger_base,
                    "payment_id": result.get("paymentId"),
                    "short_circuit": result.get("short_circuit"),
                },
            )
            await record_charge_success(
                self.db, service_request_id, scope=scope, endpoint=endpoint
            )
            if claimed and bid:
                try:
                    await self._intents.set_payment_capture_outcome(bid, CAPTURE_SUCCEEDED)
                except Exception as e:
                    logger.warning("set_payment_capture_outcome success: %s", e)
        else:
            await append_event(
                self.db,
                EVT_CHARGE_FAILURE,
                {
                    **ledger_base,
                    "error": result.get("error"),
                    "status": result.get("status"),
                },
            )
            await record_charge_failure(
                self.db, service_request_id, scope=scope, endpoint=endpoint
            )
            if claimed and bid:
                try:
                    await self._intents.set_payment_capture_outcome(bid, CAPTURE_FAILED)
                except Exception as e:
                    logger.warning("set_payment_capture_outcome fail: %s", e)
        return result

    async def charge_service(
        self,
        service_request_id: str,
        client_id: str,
        amount: float,
    ) -> dict:
        """Compat: delega en execute_payment_charge."""
        return await self.execute_payment_charge(
            service_request_id=service_request_id,
            payment_intent_id=None,
            client_id=client_id,
            amount=amount,
            booking_id=None,
            scope="charge_service",
            endpoint="payment_service.charge_service",
        )

    async def _execute_payment_charge_body(
        self,
        service_request_id: str,
        client_id: str,
        amount: float,
        *,
        ledger_context: Optional[dict] = None,
    ) -> dict:
        """Persistencia de cobro tras autorización del proveedor (TBK o simulado)."""
        lc = ledger_context or {}
        now = datetime.now(timezone.utc)
        
        # Verificar que no se haya cobrado antes
        existing_charge = await self.db.payments.find_one({
            "serviceRequestId": service_request_id,
            "status": "charged",
        })
        if existing_charge:
            logger.warning("Doble cobro evitado (fila payments) service=%s", service_request_id)
            return {
                "success": True,
                "status": "charged",
                "message": "Pago ya registrado",
                "paymentId": existing_charge["id"],
                "amount": existing_charge.get("amount", amount),
                "short_circuit": True,
            }
        
        # Obtener credenciales OneClick (por email del cliente)
        client = await self.db.users.find_one({'id': client_id}, {'_id': 0, 'email': 1, 'cardLastFour': 1})
        client_email = (client or {}).get('email', '')
        oneclick = await self.db.oneclick_inscriptions.find_one(
            {'email': client_email},
            {'_id': 0, 'tbk_user': 1, 'username': 1}
        ) if client_email else None
        
        # Cobro real con Transbank OneClick si hay credenciales
        tbk_response = None
        buy_order = f"MAQ-{service_request_id[:8]}-{int(now.timestamp())}"
        if oneclick and oneclick.get('tbk_user') and oneclick.get('username'):
            try:
                await append_event(
                    self.db,
                    EVT_PROVIDER_CALL_EXECUTED,
                    {
                        **lc,
                        "mode": "oneclick_authorize",
                        "buy_order": buy_order,
                        "amount_clp": int(round(amount)),
                    },
                )
                tbk_response = provider_oneclick_authorize(
                    username=oneclick['username'],
                    tbk_user=oneclick['tbk_user'],
                    buy_order=buy_order,
                    amount=int(round(amount)),
                )
                await evidence_record_authorize(
                    self.db,
                    buy_order=buy_order,
                    tbk_user=oneclick['tbk_user'],
                    amount=int(round(amount)),
                    result=tbk_response if isinstance(tbk_response, dict) else {},
                )
                # Transbank Mall: details[0].response_code 0 = aprobado (snake_case o camelCase)
                details = tbk_response.get('details') or []
                d0 = details[0] if details else {}
                rc = d0.get('response_code') or d0.get('responseCode', -1)
                if rc != 0:
                    logger.error(f"OneClick authorize falló: {tbk_response}")
                    return {
                        'success': False,
                        'status': 'failed',
                        'message': 'Error al procesar el pago con Transbank',
                        'error': 'TBK_AUTHORIZE_FAILED'
                    }
            except Exception as e:
                logger.exception(f"Error OneClick authorize: {e}")
                return {
                    'success': False,
                    'status': 'failed',
                    'message': 'Error al procesar el pago',
                    'error': str(e)
                }
        else:
            if self.require_real_payment:
                logger.warning(
                    "Cobro rechazado sin OneClick en modo real",
                    extra={"client_id": client_id, "service_request_id": service_request_id},
                )
                await append_event(
                    self.db,
                    EVT_PROVIDER_CALL_EXECUTED,
                    {**lc, "mode": "skipped", "reason": "ONECLICK_REQUIRED"},
                )
                await append_dead_letter_payment(
                    self.db,
                    reason="ONECLICK_REQUIRED_NO_INSCRIPTION",
                    payload={
                        **lc,
                        "client_id": client_id,
                    },
                )
                return {
                    'success': False,
                    'status': 'failed',
                    'message': 'El cliente no tiene tarjeta inscrita para cobro real',
                    'error': 'ONECLICK_REQUIRED'
                }
            await append_event(
                self.db,
                EVT_PROVIDER_CALL_EXECUTED,
                {**lc, "mode": "simulated_charge", "buy_order": buy_order},
            )
            logger.info(f"Sin OneClick para cliente {client_id}, usando flujo simulado")

        # Órdenes TBK: guardar padre + detalle Mall (el reembolso exige detail_buy_order correcto)
        main_bo = None
        detail_bo = None
        if tbk_response:
            details = tbk_response.get('details') or []
            d0 = details[0] if details else {}
            main_bo = (
                tbk_response.get('buy_order')
                or tbk_response.get('buyOrder')
                or buy_order
            )
            detail_bo = (
                d0.get('buy_order')
                or d0.get('buyOrder')
                or main_bo
            )

        # Crear registro de pago
        payment = {
            'id': str(uuid.uuid4()),
            'serviceRequestId': service_request_id,
            'clientId': client_id,
            'amount': amount,
            'currency': PAYMENT_CONFIG['currency'],
            'status': 'charged',
            'type': 'service_charge',
            'createdAt': now.isoformat(),
            'chargedAt': now.isoformat(),
            'provider': PAYMENT_CONFIG['provider'],
            'cardLastFour': (client or {}).get('cardLastFour', '****'),
            'tbkBuyOrder': main_bo,
            'tbkDetailBuyOrder': detail_bo,
        }
        
        try:
            await self.db.payments.insert_one(payment)
        except DuplicateKeyError:
            existing = await self.db.payments.find_one(
                {'serviceRequestId': service_request_id, 'status': 'charged'},
                {'_id': 0},
            )
            if existing:
                logger.warning(
                    'Idempotencia cobro: servicio %s ya tenía pago charged; no se duplica TBK',
                    service_request_id,
                )
                return {
                    'success': True,
                    'status': 'charged',
                    'message': 'Pago ya registrado',
                    'paymentId': existing['id'],
                    'amount': existing.get('amount', amount),
                }
            raise

        # Actualizar estado de pago en la solicitud
        await self.db.service_requests.update_one(
            {'id': service_request_id},
            {
                '$set': {
                    'paymentId': payment['id'],
                    'paymentStatus': 'charged',
                    'chargedAt': now.isoformat(),
                    'chargedAmount': amount
                }
            }
        )
        
        logger.info(f"Cobro exitoso: ${amount} CLP para servicio {service_request_id}")
        
        return {
            'success': True,
            'status': 'charged',
            'message': 'Pago procesado correctamente',
            'paymentId': payment['id'],
            'amount': amount
        }

    async def charge_for_accept(
        self,
        service_request_id: str,
        client_id: str,
        amount: float,
        booking_id: Optional[str] = None,
    ) -> dict:
        """
        Cobro disparado al aceptar proveedor (payment_intent + execute_payment_charge).
        """
        return await self.execute_payment_charge(
            service_request_id=service_request_id,
            payment_intent_id=None,
            client_id=client_id,
            amount=amount,
            booking_id=booking_id,
            scope="accept",
            endpoint="payment_service.charge_for_accept",
        )
    
    async def rollback_charge(
        self,
        service_request_id: str,
        reason: str = 'service_cancelled',
        refund_amount: float = None,
        skip_service_request_update: bool = False,
        refund_payment_status_only: bool = False,
    ) -> dict:
        """
        Revierte un cobro en caso de error.
        
        Args:
            service_request_id: ID de la solicitud
            reason: Razón del rollback
            skip_service_request_update: no tocar service_requests
            refund_payment_status_only: si no skip, solo paymentStatus=refunded (no cambiar status a matching)
            
        Returns:
            Resultado del rollback
        """
        now = datetime.now(timezone.utc)
        
        payment = await self.db.payments.find_one({
            'serviceRequestId': service_request_id,
            'status': 'charged'
        })
        
        if not payment:
            return {
                'success': False,
                'message': 'No hay cobro para revertir'
            }

        # Reembolso real con Transbank si fue cobro OneClick
        buy_order = payment.get('tbkBuyOrder')
        detail_buy_order = payment.get('tbkDetailBuyOrder') or buy_order
        amount = int(round(refund_amount if refund_amount is not None else (payment.get('amount', 0) or payment.get('chargedAmount', 0))))
        if buy_order and amount > 0:
            try:
                from services.oneclick_service import refund_payment as tbk_refund

                tbk_refund(
                    buy_order=buy_order,
                    detail_buy_order=detail_buy_order,
                    amount=amount
                )
            except Exception as e:
                logger.exception(f"Error Transbank refund: {e}")
                return {
                    'success': False,
                    'status': 'refund_failed',
                    'message': 'Transbank no confirmó el reembolso; el cobro sigue registrado',
                    'error': str(e),
                    'paymentId': payment['id'],
                }

        # Actualizar estado del pago solo si TBK OK (o no aplica TBK)
        await self.db.payments.update_one(
            {'id': payment['id']},
            {
                '$set': {
                    'status': 'refunded',
                    'refundedAt': now.isoformat(),
                    'refundReason': reason
                }
            }
        )
        
        # Actualizar solicitud (salvo si cancel ya lo hizo)
        if not skip_service_request_update:
            if refund_payment_status_only:
                await self.db.service_requests.update_one(
                    {'id': service_request_id},
                    {'$set': {'paymentStatus': 'refunded'}},
                )
            else:
                await self.db.service_requests.update_one(
                    {'id': service_request_id},
                    {
                        '$set': {
                            'paymentStatus': 'refunded',
                            'status': 'matching',  # Volver a buscar proveedor
                        }
                    },
                )
        
        logger.info(f"Cobro revertido para servicio {service_request_id}: {reason}")
        
        return {
            'success': True,
            'status': 'refunded',
            'message': 'Cobro revertido correctamente',
            'paymentId': payment['id']
        }
    
    async def get_payment_status(self, service_request_id: str) -> dict:
        """
        Obtiene el estado de pago de un servicio.
        """
        payment = await self.db.payments.find_one(
            {'serviceRequestId': service_request_id},
            {'_id': 0}
        )
        
        if not payment:
            return {
                'status': 'none',
                'message': 'Sin pago registrado'
            }
        
        return payment
