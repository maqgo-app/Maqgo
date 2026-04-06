"""                
SERVICIO DE EVALUACIONES - MAQGO MVP v1

Sistema de rating bidireccional:
- Cliente califica al proveedor
- Proveedor califica al cliente
- 1 a 5 estrellas
- Comentario opcional
- Una evaluación por servicio por usuario
"""
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging
import uuid

logger = logging.getLogger(__name__)

class RatingService:
    """
    Servicio de evaluaciones para MAQGO.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def create_rating(
        self,
        service_request_id: str,
        from_user_id: str,
        to_user_id: str,
        from_role: str,  # 'client' | 'provider'
        stars: int,
        comment: str = None
    ) -> dict:
        """
        Crea una evaluación.
        
        Args:
            service_request_id: ID del servicio
            from_user_id: ID del usuario que califica
            to_user_id: ID del usuario calificado
            from_role: Rol del que califica ('client' o 'provider')
            stars: Calificación de 1 a 5
            comment: Comentario opcional
            
        Returns:
            Resultado de la operación
        """
        # Validar estrellas
        if not 1 <= stars <= 5:
            return {
                'success': False,
                'error': 'La calificación debe ser entre 1 y 5 estrellas'
            }
        
        # Verificar que el servicio existe y está finalizado
        service = await self.db.service_requests.find_one(
            {'id': service_request_id},
            {'_id': 0, 'status': 1, 'clientId': 1, 'providerId': 1}
        )
        
        if not service:
            return {
                'success': False,
                'error': 'Servicio no encontrado'
            }
        
        if service.get('status') not in ['finished', 'rated']:
            return {
                'success': False,
                'error': 'Solo puedes calificar servicios finalizados'
            }
        
        # Verificar que no haya calificado antes
        existing_rating = await self.db.ratings.find_one({
            'serviceRequestId': service_request_id,
            'fromUserId': from_user_id
        })
        
        if existing_rating:
            return {
                'success': False,
                'error': 'Ya has calificado este servicio'
            }
        
        now = datetime.now(timezone.utc)
        
        # Crear rating
        rating = {
            'id': str(uuid.uuid4()),
            'serviceRequestId': service_request_id,
            'fromUserId': from_user_id,
            'toUserId': to_user_id,
            'fromRole': from_role,
            'stars': stars,
            'comment': comment,
            'createdAt': now.isoformat()
        }
        
        await self.db.ratings.insert_one(rating)
        
        # Actualizar promedio del usuario calificado
        await self._update_user_rating(to_user_id)
        
        # Verificar si ambos calificaron
        await self._check_both_rated(service_request_id)
        
        logger.info(f"Rating creado: {from_role} -> {stars} estrellas para servicio {service_request_id}")
        
        return {
            'success': True,
            'ratingId': rating['id'],
            'message': '¡Gracias por tu evaluación!'
        }
    
    async def _update_user_rating(self, user_id: str):
        """
        Actualiza el promedio de calificación de un usuario.
        """
        # Obtener todos los ratings del usuario
        ratings = await self.db.ratings.find(
            {'toUserId': user_id},
            {'_id': 0, 'stars': 1}
        ).to_list(1000)
        
        if ratings:
            total_stars = sum(r['stars'] for r in ratings)
            avg_rating = total_stars / len(ratings)
            
            await self.db.users.update_one(
                {'id': user_id},
                {
                    '$set': {
                        'rating': round(avg_rating, 1),
                        'totalRatings': len(ratings)
                    }
                }
            )
            
            logger.info(f"Rating promedio actualizado para usuario {user_id}: {avg_rating}")
    
    async def _check_both_rated(self, service_request_id: str):
        """
        Verifica si ambas partes han calificado y actualiza el estado del servicio.
        """
        ratings = await self.db.ratings.find(
            {'serviceRequestId': service_request_id},
            {'_id': 0, 'fromRole': 1}
        ).to_list(2)
        
        roles_rated = set(r['fromRole'] for r in ratings)
        
        if 'client' in roles_rated and 'provider' in roles_rated:
            await self.db.service_requests.update_one(
                {'id': service_request_id},
                {'$set': {'status': 'rated'}}
            )
            logger.info(f"Servicio {service_request_id} -> rated (ambos calificaron)")
    
    async def get_ratings_for_service(self, service_request_id: str) -> list:
        """
        Obtiene las evaluaciones de un servicio.
        """
        ratings = await self.db.ratings.find(
            {'serviceRequestId': service_request_id},
            {'_id': 0}
        ).to_list(2)
        
        return ratings
    
    async def get_user_ratings(self, user_id: str, as_recipient: bool = True) -> list:
        """
        Obtiene las evaluaciones de/para un usuario.
        
        Args:
            user_id: ID del usuario
            as_recipient: Si True, obtiene ratings recibidos. Si False, ratings dados.
        """
        field = 'toUserId' if as_recipient else 'fromUserId'
        
        ratings = await self.db.ratings.find(
            {field: user_id},
            {'_id': 0}
        ).to_list(100)
        
        return ratings
    
    async def can_rate(self, service_request_id: str, user_id: str) -> dict:
        """
        Verifica si un usuario puede calificar un servicio.
        """
        # Verificar servicio
        service = await self.db.service_requests.find_one(
            {'id': service_request_id},
            {'_id': 0, 'status': 1, 'clientId': 1, 'providerId': 1}
        )
        
        if not service:
            return {'canRate': False, 'reason': 'Servicio no encontrado'}
        
        if service.get('status') not in ['finished', 'rated']:
            return {'canRate': False, 'reason': 'El servicio no ha finalizado'}
        
        # Verificar que el usuario es parte del servicio
        if user_id not in [service.get('clientId'), service.get('providerId')]:
            return {'canRate': False, 'reason': 'No eres parte de este servicio'}
        
        # Verificar si ya calificó
        existing = await self.db.ratings.find_one({
            'serviceRequestId': service_request_id,
            'fromUserId': user_id
        })
        
        if existing:
            return {'canRate': False, 'reason': 'Ya calificaste este servicio'}
        
        return {'canRate': True}
