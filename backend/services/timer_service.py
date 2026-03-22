"""                
SERVICIO DE TIMERS - MAQGO MVP v1

Timers automáticos para:
- last_30: Se activa 30 minutos antes de endTime
- finished: Se activa exactamente en endTime
- Cierre automático con GPS

Este servicio debe ejecutarse periódicamente (cada minuto)
"""
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

logger = logging.getLogger(__name__)

class TimerService:
    """
    Servicio de timers automáticos para MAQGO.
    Gestiona transiciones automáticas de estado basadas en tiempo.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def check_confirmed_no_arrival_timeout(self) -> int:
        """
        Timeout de confirmación: si status=confirmed, no hay arrival,
        y now > scheduled_start + 2h → cancelar automáticamente (reembolso total).
        Evita servicios muertos en DB.
        """
        from pricing.business_rules import CONFIRMED_NO_ARRIVAL_TIMEOUT_MINUTES
        from services.refund_request_service import RefundRequestService

        now = datetime.now(timezone.utc)
        threshold = now - timedelta(minutes=CONFIRMED_NO_ARRIVAL_TIMEOUT_MINUTES)

        services = await self.db.service_requests.find({
            'status': 'confirmed',
            '$or': [
                {'arrivalDetectedAt': {'$exists': False}},
                {'arrivalDetectedAt': None}
            ]
        }, {'_id': 0, 'id': 1, 'confirmedAt': 1, 'createdAt': 1, 'totalAmount': 1}).to_list(100)

        refund_request_service = RefundRequestService(self.db)
        cancelled_count = 0

        for service in services:
            scheduled_str = service.get('confirmedAt') or service.get('createdAt') or now.isoformat()
            try:
                scheduled = datetime.fromisoformat(scheduled_str.replace('Z', '+00:00'))
            except Exception:
                scheduled = now

            if scheduled.isoformat() > threshold.isoformat():
                continue  # Aún no pasaron 2h desde scheduled_start

            total_amount = float(service.get('totalAmount', 0))
            cancel_event = {'type': 'cancelled_no_arrival', 'at': now.isoformat()}

            if total_amount > 0:
                await refund_request_service.create_request(
                    service_request_id=service['id'],
                    amount=total_amount,
                    reason="no_arrival_timeout",
                    requested_by_user_id=None,
                    source="timer_no_arrival",
                    meta={"timeout_minutes": CONFIRMED_NO_ARRIVAL_TIMEOUT_MINUTES},
                )
            pay_status = 'refund_requested' if total_amount > 0 else 'none'

            await self.db.service_requests.update_one(
                {'id': service['id'], 'status': 'confirmed'},
                {
                    '$set': {
                        'status': 'cancelled_no_arrival',
                        'cancelled_at': now.isoformat(),
                        'cancellation_reason': 'Timeout: proveedor no marcó llegada',
                        'paymentStatus': pay_status,
                    },
                    '$push': {'events': cancel_event}
                }
            )

            cancelled_count += 1
            logger.info(f"Servicio {service['id']} -> cancelled_no_arrival (timeout sin llegada)")

        return cancelled_count

    async def check_auto_start_post_arrival(self) -> int:
        """
        Auto inicio post llegada: si status=confirmed, arrivalDetectedAt existe,
        y now >= arrivalDetectedAt + 30 minutos → status in_progress, autoStartedAt.
        """
        now = datetime.now(timezone.utc)
        threshold = now - timedelta(minutes=30)

        services = await self.db.service_requests.find({
            'status': 'confirmed',
            'arrivalDetectedAt': {'$exists': True, '$ne': None, '$lte': threshold.isoformat()}
        }, {'_id': 0, 'id': 1}).to_list(100)

        updated_count = 0
        for service in services:
            auto_start_event = {
                'type': 'auto_start',
                'at': now.isoformat(),
            }
            result = await self.db.service_requests.update_one(
                {'id': service['id'], 'status': 'confirmed'},
                {
                    '$set': {
                        'status': 'in_progress',
                        'autoStartedAt': now.isoformat(),
                    },
                    '$push': {'events': auto_start_event}
                }
            )
            if result.modified_count > 0:
                updated_count += 1
                logger.info(f"Servicio {service['id']} -> in_progress (auto_start post llegada)")
        return updated_count

    async def check_last_30_services(self) -> int:
        """
        Verifica servicios que deben pasar a estado 'last_30'.
        Se activa 30 minutos antes de endTime.
        
        Returns:
            Número de servicios actualizados
        """
        now = datetime.now(timezone.utc)
        threshold = now + timedelta(minutes=30)
        
        # Buscar servicios in_progress cuyo endTime está a 30 min o menos
        services = await self.db.service_requests.find({
            'status': 'in_progress',
            'endTime': {'$lte': threshold.isoformat()}
        }, {'_id': 0, 'id': 1, 'providerId': 1, 'clientId': 1}).to_list(100)
        
        updated_count = 0
        for service in services:
            result = await self.db.service_requests.update_one(
                {'id': service['id'], 'status': 'in_progress'},
                {
                    '$set': {
                        'status': 'last_30',
                        'last30TriggeredAt': now.isoformat()
                    }
                }
            )
            
            if result.modified_count > 0:
                updated_count += 1
                logger.info(f"Servicio {service['id']} -> last_30 (últimos 30 minutos)")
                
                # TODO: Enviar notificación a cliente y proveedor
                # await send_last_30_notification(service['clientId'], service['providerId'])
        
        return updated_count
    
    async def check_finished_services(self) -> int:
        """
        Verifica servicios que deben cerrarse automáticamente.
        Se activa exactamente en endTime.
        Guarda ubicación GPS final.
        
        Returns:
            Número de servicios finalizados
        """
        now = datetime.now(timezone.utc)
        
        # Buscar servicios cuyo endTime ya pasó
        services = await self.db.service_requests.find({
            'status': {'$in': ['in_progress', 'last_30']},
            'endTime': {'$lte': now.isoformat()}
        }, {'_id': 0, 'id': 1, 'providerId': 1, 'clientId': 1}).to_list(100)
        
        finished_count = 0
        for service in services:
            # Obtener ubicación del proveedor (si está disponible)
            provider = await self.db.users.find_one(
                {'id': service.get('providerId')},
                {'_id': 0, 'location': 1}
            )
            
            final_location = None
            if provider and provider.get('location'):
                final_location = {
                    'lat': provider['location'].get('lat'),
                    'lng': provider['location'].get('lng'),
                    'capturedAt': now.isoformat()
                }
            
            finished_event = {'type': 'finished', 'at': now.isoformat()}
            update_data = {
                'status': 'finished',
                'finishedAt': now.isoformat(),
                'autoFinished': True,  # Marca que fue cierre automático
            }
            if final_location:
                update_data['finalLocation'] = final_location

            result = await self.db.service_requests.update_one(
                {'id': service['id'], 'status': {'$in': ['in_progress', 'last_30']}},
                {'$set': update_data, '$push': {'events': finished_event}}
            )
            
            if result.modified_count > 0:
                finished_count += 1
                logger.info(f"Servicio {service['id']} -> finished (cierre automático)")
                
                # Liberar al proveedor
                if service.get('providerId'):
                    await self.db.users.update_one(
                        {'id': service['providerId']},
                        {'$set': {'isAvailable': True}}
                    )
                    logger.info(f"Proveedor {service['providerId']} liberado")
                
                # TODO: Enviar notificación de servicio finalizado
                # await send_finished_notification(service['clientId'], service['providerId'])
        
        return finished_count
    
    async def check_pending_review_services(self) -> int:
        """
        Verifica servicios en 'pending_review' que ya pasaron 24 horas.
        Auto-aprueba y notifica al proveedor para que emita factura.
        
        REGLA DE NEGOCIO MAQGO - "Pago Ágil":
        1. Servicio finaliza → pending_review (ventana de 24h para reportes críticos)
        2. Si pasan 24h → approved automáticamente
        3. Se notifica al proveedor: "Emite factura a MAQGO por $X (neto menos tarifa)"
        4. Proveedor sube factura → invoiced
        5. MAQGO paga → paid
        
        Nota: Disputas se manejan en paralelo vía WhatsApp soporte,
        NO bloquean el flujo de pago estándar.
        
        Returns:
            Número de servicios auto-aprobados
        """
        from pricing.business_rules import AUTO_APPROVAL_HOURS
        now = datetime.now(timezone.utc)
        threshold = now - timedelta(hours=AUTO_APPROVAL_HOURS)
        
        # Buscar servicios pending_review creados hace más de 24h
        try:
            # Usamos la colección 'services' del módulo de facturación
            services_collection = self.db.services
            
            pending_services = await services_collection.find({
                'status': 'pending_review',
                'created_at': {'$lte': threshold}
            }).to_list(100)
            
            approved_count = 0
            for service in pending_services:
                # Auto-aprobar
                result = await services_collection.update_one(
                    {'_id': service['_id'], 'status': 'pending_review'},
                    {
                        '$set': {
                            'status': 'approved',
                            'approved_at': now,
                            'auto_approved': True,
                            'approval_reason': f'Pago Ágil - {AUTO_APPROVAL_HOURS} horas completadas'
                        }
                    }
                )
                
                if result.modified_count > 0:
                    approved_count += 1
                    logger.info(f"Servicio {service['_id']} auto-aprobado ({AUTO_APPROVAL_HOURS}h - Pago Ágil)")
                    
                    # Notificar al proveedor por WhatsApp
                    await self._notify_provider_invoice_ready(service)
            
            return approved_count
            
        except Exception as e:
            logger.error(f"Error en check_pending_review_services: {e}")
            return 0
    
    async def _notify_provider_invoice_ready(self, service: dict):
        """
        Notifica al proveedor que puede emitir la factura a MAQGO.
        Incluye los datos de MAQGO y el monto neto a facturar (menos tarifa plataforma).
        """
        try:
            from communications import send_whatsapp
            
            # Obtener datos del proveedor
            provider = await self.db.users.find_one(
                {'id': service.get('provider_id')},
                {'_id': 0, 'phone': 1, 'businessName': 1, 'ownerPhone': 1}
            )
            
            if not provider:
                logger.warning(f"Proveedor no encontrado para servicio {service['_id']}")
                return
            
            # Preparar mensaje
            phone = provider.get('ownerPhone') or provider.get('phone')
            if not phone:
                logger.warning(f"Proveedor sin teléfono para servicio {service['_id']}")
                return
            
            # Monto a facturar: neto que recibe el proveedor (menos tarifa plataforma)
            invoice_amount = service.get('net_total', 0)
            formatted_amount = f"${invoice_amount:,.0f}".replace(',', '.')
            
            message = f"""✅ *Servicio Aprobado - MAQGO*

¡Tu servicio fue aprobado! Ya puedes facturar a MAQGO.

📄 *Datos para facturar (a MAQGO, no al cliente):*
• Razón Social: MAQGO SpA
• RUT: 76.248.124-3
• Monto: {formatted_amount} (neto, menos tarifa plataforma)

👉 Sube tu factura en la app para recibir el pago.

_Ingresa a "Mis Cobros" en MAQGO_"""

            # Enviar WhatsApp
            result = send_whatsapp(
                phone_number=f"+56{phone}" if not phone.startswith('+') else phone,
                template='custom',
                params={'message': message}
            )
            
            if result.get('success'):
                logger.info(f"Notificación enviada al proveedor para servicio {service['_id']}")
            else:
                logger.warning(f"Error enviando notificación: {result.get('error')}")
                
        except Exception as e:
            logger.error(f"Error notificando proveedor: {e}")
    
    async def check_expired_offers(self) -> int:
        """
        Verifica ofertas que han expirado (timeout de 90 segundos).
        Automáticamente pasa al siguiente proveedor.
        
        Returns:
            Número de ofertas expiradas
        """
        from services.matching_service import handle_offer_expired
        
        now = datetime.now(timezone.utc)
        
        # Buscar ofertas expiradas
        services = await self.db.service_requests.find({
            'status': 'offer_sent',
            'offerExpiresAt': {'$lte': now.isoformat()}
        }, {'_id': 0, 'id': 1, 'currentOfferId': 1}).to_list(100)
        
        expired_count = 0
        for service in services:
            if service.get('currentOfferId'):
                await handle_offer_expired(
                    self.db,
                    service['id'],
                    service['currentOfferId']
                )
                expired_count += 1
                logger.info(f"Oferta expirada para servicio {service['id']}")
        
        return expired_count
    
    async def run_all_checks(self) -> dict:
        """
        Ejecuta todas las verificaciones de timers.
        Este método debe llamarse periódicamente (cada minuto).
        
        Returns:
            Resumen de acciones realizadas
        """
        logger.info("Ejecutando verificación de timers...")
        
        cancelled_no_arrival = await self.check_confirmed_no_arrival_timeout()
        auto_started = await self.check_auto_start_post_arrival()
        expired_offers = await self.check_expired_offers()
        last_30_services = await self.check_last_30_services()
        finished_services = await self.check_finished_services()
        auto_approved = await self.check_pending_review_services()
        
        summary = {
            'cancelled_no_arrival': cancelled_no_arrival,
            'auto_started': auto_started,
            'expired_offers': expired_offers,
            'last_30_triggered': last_30_services,
            'auto_finished': finished_services,
            'auto_approved_6h': auto_approved,
            'checked_at': datetime.now(timezone.utc).isoformat()
        }
        
        if cancelled_no_arrival or auto_started or expired_offers or last_30_services or finished_services or auto_approved:
            logger.info(f"Timer check completado: {summary}")
        
        return summary
