from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os
import logging
import asyncio
from pathlib import Path
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from rate_limit import limiter

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging early
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Timer scheduler task
async def timer_scheduler():
    """
    Ejecuta verificación de timers cada 60 segundos.
    - Ofertas expiradas (90s timeout)
    - Últimos 30 minutos
    - Cierre automático de servicios
    Si MongoDB no está disponible, solo loguea y sigue (no tira el servidor).
    """
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        from services.timer_service import TimerService
    except Exception as e:
        logger.warning(f"Timer scheduler no iniciado (dependencias): {e}")
        return

    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    try:
        client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=3000)
        db = client[os.environ.get('DB_NAME', 'maqgo_db')]
        await client.admin.command('ping')
    except Exception as e:
        logger.warning(f"MongoDB no disponible. Timer scheduler desactivado. (Puedes correr sin MongoDB para probar el frontend.) Error: {e}")
        return

    timer_service = TimerService(db)
    logger.info("⏰ Timer scheduler iniciado")

    while True:
        try:
            await timer_service.run_all_checks()
        except Exception as e:
            logger.error(f"Error en timer scheduler: {e}")
        await asyncio.sleep(60)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager para la aplicación"""
    # Startup
    logger.info("🚀 MAQGO API iniciando...")

    # Advertencias de producción
    cors_origins = os.environ.get('CORS_ORIGINS', '*')
    if cors_origins.strip() == '*':
        logger.warning("⚠️ CORS_ORIGINS=* (permite cualquier origen). En producción definir dominios explícitos.")
    demo_mode = os.environ.get('MAQGO_DEMO_MODE', 'true').lower() == 'true'
    if demo_mode:
        logger.warning("⚠️ MAQGO_DEMO_MODE=true. En producción usar false para SMS reales.")
    tbk_demo = os.environ.get('TBK_DEMO_MODE', 'false').lower() == 'true'
    if tbk_demo:
        logger.warning("⚠️ TBK_DEMO_MODE=true. En producción usar false para Transbank real.")

    # Iniciar scheduler de timers en background
    scheduler_task = asyncio.create_task(timer_scheduler())

    # Índice abandonment: el módulo usa dict en memoria; si más adelante usas MongoDB aquí crear índices

    yield
    
    # Shutdown
    scheduler_task.cancel()
    logger.info("👋 MAQGO API detenida")

# Create FastAPI app with lifespan
app = FastAPI(title="MAQGO API", version="1.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security headers middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routes
from routes.users import router as users_router
from routes.service_requests import router as service_requests_router
from routes.payments import router as payments_router
from routes.oneclick import router as oneclick_router
from routes.ratings import router as ratings_router
from routes.auth import router as auth_router
from routes.providers import router as providers_router
from routes.pricing import router as pricing_router
from routes.communications import router as communications_router
from routes.abandonment import router as abandonment_router
from routes.services import router as services_router
from routes.invoices import router as invoices_router
from routes.messages import router as messages_router
from routes.admin_reports import router as admin_reports_router
from routes.admin_config import router as admin_config_router
from routes.chatbot import router as chatbot_router
from routes.public_stats import router as public_stats_router
from routes.maps import router as maps_router

# Create main API router
api_router = APIRouter(prefix="/api")

# Health check
@api_router.get("/")
async def root():
    return {
        "message": "MAQGO API v1.0",
        "status": "operational",
        "endpoints": [
            "/api/users",
            "/api/service-requests",
            "/api/payments",
            "/api/ratings",
            "/api/operators"
        ]
    }

# Import operators router
from routes.operators import router as operators_router

# Include all routers
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(service_requests_router)
api_router.include_router(payments_router)
api_router.include_router(oneclick_router)
api_router.include_router(ratings_router)
api_router.include_router(providers_router)
api_router.include_router(pricing_router)
api_router.include_router(communications_router)
api_router.include_router(abandonment_router)
api_router.include_router(services_router)
api_router.include_router(operators_router)
api_router.include_router(invoices_router)
api_router.include_router(messages_router)
api_router.include_router(admin_reports_router)
api_router.include_router(admin_config_router)
api_router.include_router(chatbot_router)
api_router.include_router(public_stats_router)
# Register main router
app.include_router(api_router)
# Maps router ya trae prefijo /api/maps, se monta directo para evitar /api/api/maps
app.include_router(maps_router)
