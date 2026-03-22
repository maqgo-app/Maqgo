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

# Load environment variables (solo rellena claves faltantes; no pisa vars del host/Railway)
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env", override=False)

# Configure logging early
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def is_production_env() -> bool:
    value = os.environ.get('MAQGO_ENV', os.environ.get('ENVIRONMENT', 'development'))
    return str(value).strip().lower() in {'prod', 'production'}


def parse_bool_env(name: str, default: bool = False) -> bool:
    raw = str(os.environ.get(name, str(default))).strip().lower()
    return raw in {'1', 'true', 'yes', 'on'}


def validate_production_safety(cors_origins_raw: str) -> None:
    """
    Bloquea arranque en producción si hay configuración insegura.
    """
    if not is_production_env():
        return

    cors_values = [origin.strip() for origin in cors_origins_raw.split(',') if origin.strip()]
    if not cors_values:
        raise RuntimeError("Configuración inválida: CORS_ORIGINS vacío en producción.")
    if '*' in cors_values:
        raise RuntimeError("Configuración insegura: CORS_ORIGINS no puede usar '*' en producción.")
    if parse_bool_env('MAQGO_DEMO_MODE', False):
        raise RuntimeError("Configuración insegura: MAQGO_DEMO_MODE=true en producción.")
    if parse_bool_env('TBK_DEMO_MODE', False):
        raise RuntimeError("Configuración insegura: TBK_DEMO_MODE=true en producción.")

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

    from db_config import get_db_name, get_mongo_url

    mongo_url = get_mongo_url()
    try:
        client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=3000)
        db = client[get_db_name()]
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
    cors_origins_raw = os.environ.get('CORS_ORIGINS', '*')
    validate_production_safety(cors_origins_raw)
    if cors_origins_raw.strip() == '*':
        logger.warning("⚠️ CORS_ORIGINS=* (permite cualquier origen). En producción definir dominios explícitos.")
    demo_mode = parse_bool_env('MAQGO_DEMO_MODE', False)
    if demo_mode:
        logger.warning("⚠️ MAQGO_DEMO_MODE=true. En producción usar false para SMS reales.")
    tbk_demo = parse_bool_env('TBK_DEMO_MODE', False)
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
cors_origins_raw = os.environ.get('CORS_ORIGINS', '*')
cors_origins = [origin.strip() for origin in cors_origins_raw.split(',') if origin.strip()]
if not cors_origins:
    cors_origins = ['*']
allow_all_origins = '*' in cors_origins

# Con wildcard no se deben habilitar credenciales (evita errores CORS en browsers)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=not allow_all_origins,
    allow_origins=(['*'] if allow_all_origins else cors_origins),
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
from routes.marketing_kpi import router as marketing_kpi_router, cron_router as marketing_cron_router
from routes.chatbot import router as chatbot_router
from routes.public_stats import router as public_stats_router
try:
    from routes.maps import router as maps_router
except Exception as e:
    maps_router = None
    logger.error(f"Maps router disabled at startup: {e}")

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
api_router.include_router(marketing_kpi_router)
api_router.include_router(marketing_cron_router)
api_router.include_router(chatbot_router)
api_router.include_router(public_stats_router)
# Register main router
app.include_router(api_router)
# Maps router ya trae prefijo /api/maps, se monta directo para evitar /api/api/maps
if maps_router is not None:
    app.include_router(maps_router)

# Health checks de infraestructura (Railway/monitoreo externo)
@app.get("/")
async def infra_root():
    return {
        "service": "maqgo-backend",
        "status": "ok",
        "api": "/api/"
    }

@app.get("/healthz")
async def infra_healthz():
    return {"status": "ok"}


@app.get("/healthz/otp-readiness")
async def infra_healthz_otp_readiness():
    """
    Infra: OTP vía Redis+SNS. Separado de /api/communications/status para no mezclar dominio con despliegue.
    No expone secretos; solo presencia de variables y flag canónico is_otp_configured().
    """
    redis_url_set = bool(str(os.environ.get("REDIS_URL", "")).strip())
    aws_key_id_set = bool(str(os.environ.get("AWS_ACCESS_KEY_ID", "")).strip())
    try:
        from services.otp_service import is_otp_configured

        ready = is_otp_configured()
    except ImportError:
        ready = False
    return {
        "ready": ready,
        "redis_url_set": redis_url_set,
        "aws_access_key_id_set": aws_key_id_set,
    }
