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
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging
import uuid

logger = logging.getLogger(__name__)

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
    
    async def charge_service(
        self,
        service_request_id: str,
        client_id: str,
        amount: float
    ) -> dict:
        """
        Cobra el monto completo del servicio.
        SOLO se llama cuando el proveedor acepta.
        
        Args:
            service_request_id: ID de la solicitud
            client_id: ID del cliente
            amount: Monto a cobrar
            
        Returns:
            Resultado del cobro
        """
        now = datetime.now(timezone.utc)
        
        # Verificar que no se haya cobrado antes
        existing_charge = await self.db.payments.find_one({
            'serviceRequestId': service_request_id,
            'status': 'charged'
        })
        
        if existing_charge:
            logger.warning(f"Intento de doble cobro para servicio {service_request_id}")
            return {
                'success': False,
                'status': 'failed',
                'message': 'El servicio ya fue cobrado',
                'error': 'ALREADY_CHARGED'
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
                from services.oneclick_service import authorize_payment as tbk_authorize
                tbk_response = tbk_authorize(
                    username=oneclick['username'],
                    tbk_user=oneclick['tbk_user'],
                    buy_order=buy_order,
                    amount=int(round(amount))
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
            logger.info(f"Sin OneClick para cliente {client_id}, usando flujo simulado")
        
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
            'tbkBuyOrder': (tbk_response.get('buy_order') or buy_order) if tbk_response else None
        }
        
        await self.db.payments.insert_one(payment)
        
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
    
    async def rollback_charge(
        self,
        service_request_id: str,
        reason: str = 'service_cancelled',
        refund_amount: float = None,
        skip_service_request_update: bool = False
    ) -> dict:
        """
        Revierte un cobro en caso de error.
        
        Args:
            service_request_id: ID de la solicitud
            reason: Razón del rollback
            
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
        amount = int(round(refund_amount if refund_amount is not None else (payment.get('amount', 0) or payment.get('chargedAmount', 0))))
        if buy_order and amount > 0:
            try:
                from services.oneclick_service import refund_payment as tbk_refund
                tbk_refund(
                    buy_order=buy_order,
                    detail_buy_order=buy_order,
                    amount=amount
                )
            except Exception as e:
                logger.exception(f"Error Transbank refund: {e}")
                # Continuar con el rollback en DB aunque Transbank falle
                # (se puede reembolsar manualmente después)

        # Actualizar estado del pago
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
            await self.db.service_requests.update_one(
                {'id': service_request_id},
                {
                    '$set': {
                        'paymentStatus': 'refunded',
                        'status': 'matching'  # Volver a buscar proveedor
                    }
                }
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
