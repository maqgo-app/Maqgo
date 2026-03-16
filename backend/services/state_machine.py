"""Service state transitions and automation"""
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging

logger = logging.getLogger(__name__)

class ServiceStates:
    CREATED = "created"
    SEARCHING = "searching"
    CONFIRMED = "confirmed"
    IN_PROGRESS = "in_progress"
    LAST_30 = "last_30"
    FINISHED = "finished"
    RATED = "rated"

def get_next_state(current_state: str) -> str:
    """Get next state in the flow"""
    transitions = {
        ServiceStates.CREATED: ServiceStates.SEARCHING,
        ServiceStates.SEARCHING: ServiceStates.CONFIRMED,
        ServiceStates.CONFIRMED: ServiceStates.IN_PROGRESS,
        ServiceStates.IN_PROGRESS: ServiceStates.LAST_30,
        ServiceStates.LAST_30: ServiceStates.FINISHED,
        ServiceStates.FINISHED: ServiceStates.RATED,
    }
    return transitions.get(current_state, current_state)

async def check_and_update_service_states():
    """Background task to auto-update service states based on time"""
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'maqgo_db')]
    
    now = datetime.utcnow()
    
    # Find services in progress that should move to last_30
    in_progress_services = await db.service_requests.find(
        {"status": ServiceStates.IN_PROGRESS},
        {"_id": 0}
    ).to_list(1000)
    
    for service in in_progress_services:
        if service.get('endTime'):
            end_time = datetime.fromisoformat(service['endTime'])
            time_remaining = end_time - now
            
            # If 30 minutes or less remaining
            if timedelta(0) < time_remaining <= timedelta(minutes=30):
                await db.service_requests.update_one(
                    {"id": service['id']},
                    {"$set": {"status": ServiceStates.LAST_30}}
                )
                logger.info(f"⏰ Servicio {service['id']} movido a LAST_30")
    
    # Find services in last_30 that should be finished
    last_30_services = await db.service_requests.find(
        {"status": ServiceStates.LAST_30},
        {"_id": 0}
    ).to_list(1000)
    
    for service in last_30_services:
        if service.get('endTime'):
            end_time = datetime.fromisoformat(service['endTime'])
            
            # If time has passed
            if now >= end_time:
                await db.service_requests.update_one(
                    {"id": service['id']},
                    {"$set": {"status": ServiceStates.FINISHED}}
                )
                logger.info(f"✅ Servicio {service['id']} finalizado automáticamente")
    
    await client.close()
    return {"checked": len(in_progress_services) + len(last_30_services)}