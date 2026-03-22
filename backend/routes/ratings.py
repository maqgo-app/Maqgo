from fastapi import APIRouter, HTTPException, Body
from typing import List, Optional
from services.rating_service import RatingService
from motor.motor_asyncio import AsyncIOMotorClient

from db_config import get_db_name, get_mongo_url

router = APIRouter(prefix="/ratings", tags=["ratings"])

mongo_url = get_mongo_url()
client = AsyncIOMotorClient(mongo_url)
db = client[get_db_name()]

rating_service = RatingService(db)

@router.post("", response_model=dict)
async def create_rating(body: dict = Body(...)):
    """
    Crear evaluación.
    
    Body:
    - serviceId: ID del servicio
    - stars: 1-5 estrellas
    - comment: Comentario opcional
    - fromRole: 'client' o 'provider'
    """
    service_id = body.get('serviceId')
    stars = body.get('stars')
    comment = body.get('comment')
    from_role = body.get('fromRole')
    
    if not service_id or not stars or not from_role:
        raise HTTPException(status_code=400, detail="Faltan campos requeridos")
    
    # Obtener el servicio para determinar from_user y to_user
    service = await db.service_requests.find_one({'id': service_id}, {'_id': 0})
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    
    if from_role == 'client':
        from_user_id = service.get('clientId')
        to_user_id = service.get('providerId')
    else:
        from_user_id = service.get('providerId')
        to_user_id = service.get('clientId')
    
    if not from_user_id or not to_user_id:
        raise HTTPException(status_code=400, detail="Servicio incompleto")
    
    result = await rating_service.create_rating(
        service_request_id=service_id,
        from_user_id=from_user_id,
        to_user_id=to_user_id,
        from_role=from_role,
        stars=stars,
        comment=comment
    )
    
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error'))
    
    return result

@router.get("/service/{service_id}", response_model=List[dict])
async def get_service_ratings(service_id: str):
    """Obtener evaluaciones de un servicio"""
    return await rating_service.get_ratings_for_service(service_id)

@router.get("/user/{user_id}", response_model=List[dict])
async def get_user_ratings(user_id: str, received: bool = True):
    """Obtener evaluaciones de/para un usuario"""
    return await rating_service.get_user_ratings(user_id, as_recipient=received)

@router.get("/can-rate/{service_id}/{user_id}", response_model=dict)
async def check_can_rate(service_id: str, user_id: str):
    """Verificar si un usuario puede calificar un servicio"""
    return await rating_service.can_rate(service_id, user_id)
