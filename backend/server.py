from fastapi import FastAPI, APIRouter
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os
import logging
import asyncio
from pathlib import Path
from datetime import datetime, timezone
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from rate_limit import limiter

# Load environment variables (solo rellena claves faltantes; no pisa vars del host/Railway)
ROOT_DIR = Path(__file__).parent
_static_dir = ROOT_DIR / "static"
_SERVE_SPA = _static_dir.is_dir() and (_static_dir / "index.html").is_file()
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


def validate_transbank_production_config() -> None:
    """
    En MAQGO producción: TBK real, URLs públicas HTTPS, sin modo debug que filtre secretos.
    """
    if not is_production_env():
        return
    if parse_bool_env("TBK_DEBUG_HTTP", False):
        raise RuntimeError(
            "TBK_DEBUG_HTTP=true en producción registra headers/cuerpo TBK en logs (secretos). Desactivar."
        )
    tbk_env = os.environ.get("TBK_ENV", "integration").strip().lower()
    if tbk_env != "production":
        raise RuntimeError(
            f"Producción MAQGO requiere TBK_ENV=production (actual={tbk_env!r}). "
            "Integración Transbank solo en deploys no productivos."
        )
    parent = os.environ.get("TBK_PARENT_COMMERCE_CODE", "").strip()
    child = os.environ.get("TBK_CHILD_COMMERCE_CODE", "").strip()
    secret = (
        os.environ.get("TBK_API_KEY_SECRET", "").strip()
        or os.environ.get("TBK_API_KEY", "").strip()
    )
    if not parent or not child or not secret:
        raise RuntimeError(
            "Producción: definen TBK_PARENT_COMMERCE_CODE, TBK_CHILD_COMMERCE_CODE y TBK_API_KEY_SECRET (o TBK_API_KEY)."
        )
    # TBK_ENV=production implica https://webpay3g.transbank.cl en services.oneclick_service._cfg()

    fe = os.environ.get("FRONTEND_URL", "").strip().rstrip("/")
    if not fe:
        raise RuntimeError("FRONTEND_URL es obligatorio en producción (origen canónico del SPA).")
    fel = fe.lower()
    if not fel.startswith("https://"):
        raise RuntimeError("FRONTEND_URL debe ser HTTPS en producción.")
    if "localhost" in fel or "127.0.0.1" in fe:
        raise RuntimeError("FRONTEND_URL no puede apuntar a localhost en producción.")

    tbk_return = os.environ.get("TBK_RETURN_URL", "").strip()
    if tbk_return:
        trl = tbk_return.lower()
        if not trl.startswith("https://"):
            raise RuntimeError("TBK_RETURN_URL debe usar HTTPS en producción.")
        if "localhost" in trl or "127.0.0.1" in tbk_return:
            raise RuntimeError("TBK_RETURN_URL no puede apuntar a localhost en producción.")
        if "/api/payments/oneclick/confirm-return" not in tbk_return:
            logger.warning(
                "TBK_RETURN_URL no contiene /api/payments/oneclick/confirm-return; "
                "verifica coherencia con el flujo OneClick (el cliente suele enviar return_url explícito)."
            )

    api_public = os.environ.get("MAQGO_API_PUBLIC_URL", "").strip().rstrip("/")
    if api_public:
        apl = api_public.lower()
        if not apl.startswith("https://"):
            raise RuntimeError("MAQGO_API_PUBLIC_URL debe usar HTTPS en producción.")
        if "localhost" in apl or "127.0.0.1" in api_public:
            raise RuntimeError("MAQGO_API_PUBLIC_URL no puede ser localhost en producción.")


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
    if parse_bool_env("ONECLICK_PUBLIC_VALIDATION_ENABLED", False):
        raise RuntimeError("Configuración insegura: ONECLICK_PUBLIC_VALIDATION_ENABLED=true en producción.")
    validate_transbank_production_config()

def _timer_scheduler_interval_sec() -> float:
    """Intervalo entre ejecuciones de run_all_checks (ofertas, last_30, etc.). Default 8s (5–10)."""
    raw = os.environ.get("MAQGO_TIMER_SCHEDULER_INTERVAL_SECONDS", "8").strip()
    try:
        v = float(raw)
    except ValueError:
        v = 8.0
    return max(5.0, min(10.0, v))


# Timer scheduler task
async def timer_scheduler():
    """
    Bucle en background: llama TimerService.run_all_checks() en loop (incluye check_expired_offers).
    Intervalo por defecto 8 s (env MAQGO_TIMER_SCHEDULER_INTERVAL_SECONDS, rango 5–10) para que
    las ofertas de matching (~60 s) expiren sin demoras de hasta un minuto extra.
    Si MongoDB no está disponible, no arranca el loop.
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
    interval = _timer_scheduler_interval_sec()
    logger.info(
        "⏰ Timer scheduler iniciado (intervalo=%ss, incluye check_expired_offers vía run_all_checks)",
        interval,
    )

    while True:
        try:
            await timer_service.run_all_checks()
        except Exception as e:
            logger.error(f"Error en timer scheduler: {e}")
        await asyncio.sleep(interval)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager para la aplicación"""
    # Startup
    logger.info("🚀 MAQGO API iniciando...")

    # Advertencias de producción (no crashear si faltan variables)
    try:
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
    except Exception as e:
        logger.warning(f"Error en validaciones de producción (continuando): {e}")

    # Iniciar scheduler de timers en background (best-effort)
    try:
        scheduler_task = asyncio.create_task(timer_scheduler())
        logger.info("Timer scheduler iniciado")
    except Exception as e:
        logger.warning(f"Timer scheduler no iniciado (continuando): {e}")
        scheduler_task = None

    # Índices idempotencia + ledger + métricas persistentes (best-effort)
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        from db_config import get_db_name, get_mongo_url
        from services.idempotency import ensure_indexes as ensure_idempotency_indexes
        from services.payment_metrics_store import ensure_indexes as ensure_payment_metrics_indexes

        _ic = AsyncIOMotorClient(get_mongo_url())
        _db = _ic[get_db_name()]
        await ensure_idempotency_indexes(_db)
        await ensure_payment_metrics_indexes(_db)

        # Índices service_requests
        await _db.service_requests.create_index([("id", 1)])
        await _db.service_requests.create_index([("bookingId", 1)], sparse=True, name="idx_booking_id")
        await _db.service_requests.create_index([("status", 1), ("currentOfferId", 1)])
        await _db.service_requests.create_index([("offerExpiresAt", 1)])
        await _db.payments.create_index(
            [("serviceRequestId", 1)],
            unique=True,
            partialFilterExpression={"status": "charged"},
            name="uniq_charged_per_service_request"
        )

        logger.info("Índices de MongoDB creados (idempotencia, métricas, service_requests)")
    except Exception as e:
        logger.warning("Error creando índices MongoDB: %s", e)

    try:
        from services.admin_bootstrap import ensure_initial_admin

        result = await ensure_initial_admin(_db)
        if result.get("created"):
            logger.warning(
                "BOOTSTRAP admin created email=%s admin_id=%s must_change_password=true",
                str(result.get("email") or ""),
                str(result.get("admin_id") or ""),
            )
        elif result.get("reason") == "missing_env":
            logger.info("BOOTSTRAP admin skipped (missing env MAQGO_BOOTSTRAP_ADMIN_EMAIL/PASSWORD)")
        else:
            logger.info("BOOTSTRAP admin skipped (%s)", str(result.get("reason") or "exists"))
    except Exception as e:
        logger.warning("BOOTSTRAP admin failed (continuando): %s", e)

    yield
    
    # Shutdown
    if scheduler_task:
        scheduler_task.cancel()
        logger.info("Timer scheduler detenido")
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
        # HTTPS detrás de proxy (Railway/Cloudflare): endurecer transporte en navegador
        if (request.headers.get("x-forwarded-proto") or "").strip().lower() == "https":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )
        # CSP mínima: no embeber la app en iframes de terceros; APIs JSON no cargan subrecursos
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "base-uri 'self'; "
            "frame-ancestors 'none'; "
            "img-src 'self' data: https: blob:; "
            "font-src 'self' data: https:; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self' 'unsafe-inline'; "
            "connect-src 'self' https: wss:; "
            "worker-src 'self' blob:; "
            "manifest-src 'self'"
        )
        return response

app.add_middleware(SecurityHeadersMiddleware)

# Incident containment: block compromised/disabled hostnames at app edge.
BLOCKED_HOSTS = {
    h.strip().lower()
    for h in os.environ.get("BLOCKED_HOSTS", "").split(",")
    if h.strip()
}


@app.middleware("http")
async def block_compromised_hosts(request, call_next):
    host = (request.headers.get("host") or "").split(":")[0].strip().lower()
    if host in BLOCKED_HOSTS:
        return JSONResponse(
            status_code=503,
            content={"detail": "Host temporalmente deshabilitado por contencion de seguridad"},
        )
    return await call_next(request)

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

# Import routes (protegidos para evitar crash en import time)
users_router = None
service_requests_router = None
payments_router = None
oneclick_router = None
ratings_router = None
auth_router = None
providers_router = None
pricing_router = None
communications_router = None
abandonment_router = None
services_router = None
invoices_router = None
messages_router = None
admin_reports_router = None
admin_reports_cron_router = None
admin_config_router = None
admin_access_router = None
marketing_kpi_router = None
marketing_cron_router = None
chatbot_router = None
public_stats_router = None
bookings_router = None

try:
    from routes.users import router as users_router  # type: ignore
    logger.info("ROUTER LOADED: users")
except Exception as e:
    logger.error(f"ROUTER FAILED: users - {e}")
try:
    from routes.service_requests import router as service_requests_router  # type: ignore
    logger.info("ROUTER LOADED: service_requests")
except Exception as e:
    logger.error(f"ROUTER FAILED: service_requests - {e}")
try:
    from routes.payments import router as payments_router  # type: ignore
    logger.info("ROUTER LOADED: payments")
except Exception as e:
    logger.error(f"ROUTER FAILED: payments - {e}")
try:
    from routes.oneclick import router as oneclick_router  # type: ignore
    logger.info("ROUTER LOADED: oneclick")
except Exception as e:
    logger.error(f"ROUTER FAILED: oneclick - {e}")
try:
    from routes.ratings import router as ratings_router  # type: ignore
    logger.info("ROUTER LOADED: ratings")
except Exception as e:
    logger.error(f"ROUTER FAILED: ratings - {e}")
try:
    from routes.auth import router as auth_router  # type: ignore
    logger.info("ROUTER LOADED: auth")
except Exception as e:
    logger.error(f"ROUTER FAILED: auth - {e}")
try:
    from routes.providers import router as providers_router  # type: ignore
    logger.info("ROUTER LOADED: providers")
except Exception as e:
    logger.error(f"ROUTER FAILED: providers - {e}")
try:
    from routes.pricing import router as pricing_router  # type: ignore
    logger.info("ROUTER LOADED: pricing")
except Exception as e:
    logger.error(f"ROUTER FAILED: pricing - {e}")
try:
    from routes.communications import router as communications_router  # type: ignore
    logger.info("ROUTER LOADED: communications")
except Exception as e:
    logger.error(f"ROUTER FAILED: communications - {e}")
try:
    from routes.abandonment import router as abandonment_router  # type: ignore
    logger.info("ROUTER LOADED: abandonment")
except Exception as e:
    logger.error(f"ROUTER FAILED: abandonment - {e}")
try:
    from routes.services import router as services_router  # type: ignore
    logger.info("ROUTER LOADED: services")
except Exception as e:
    logger.error(f"ROUTER FAILED: services - {e}")
try:
    from routes.invoices import router as invoices_router  # type: ignore
    logger.info("ROUTER LOADED: invoices")
except Exception as e:
    logger.error(f"ROUTER FAILED: invoices - {e}")
try:
    from routes.messages import router as messages_router  # type: ignore
    logger.info("ROUTER LOADED: messages")
except Exception as e:
    logger.error(f"ROUTER FAILED: messages - {e}")
try:
    from routes.admin_reports import router as admin_reports_router, cron_router as admin_reports_cron_router  # type: ignore
    logger.info("ROUTER LOADED: admin_reports + cron")
except Exception as e:
    logger.error(f"ROUTER FAILED: admin_reports - {e}")
try:
    from routes.admin_config import router as admin_config_router  # type: ignore
    logger.info("ROUTER LOADED: admin_config")
except Exception as e:
    logger.error(f"ROUTER FAILED: admin_config - {e}")
try:
    from routes.admin_access import router as admin_access_router  # type: ignore
    logger.info("ROUTER LOADED: admin_access")
except Exception as e:
    logger.error(f"ROUTER FAILED: admin_access - {e}")
try:
    from routes.marketing_kpi import router as marketing_kpi_router, cron_router as marketing_cron_router  # type: ignore
    logger.info("ROUTER LOADED: marketing_kpi + cron")
except Exception as e:
    logger.error(f"ROUTER FAILED: marketing_kpi/cron - {e}")
try:
    from routes.chatbot import router as chatbot_router  # type: ignore
    logger.info("ROUTER LOADED: chatbot")
except Exception as e:
    logger.error(f"ROUTER FAILED: chatbot - {e}")
try:
    from routes.public_stats import router as public_stats_router  # type: ignore
    logger.info("ROUTER LOADED: public_stats")
except Exception as e:
    logger.error(f"ROUTER FAILED: public_stats - {e}")
try:
    from routes.bookings import router as bookings_router  # type: ignore
    logger.info("ROUTER LOADED: bookings")
except Exception as e:
    logger.error(f"ROUTER FAILED: bookings - {e}")
try:
    from routes.maps import router as maps_router
except Exception as e:
    maps_router = None
    logger.error(f"Maps router disabled at startup: {e}")

logger.info("STARTUP: creating main API router")
api_router = APIRouter(prefix="/api")


def otp_readiness_payload() -> dict:
    """
    Infra SMS/OTP: sin secretos; flags de entorno + is_otp_configured().
    Usado por /api/health/otp-readiness (mismo origen que el front) y /healthz/otp-readiness.
    """
    try:
        from services.otp_service import is_otp_configured

        ready = is_otp_configured()
    except ImportError:
        ready = False
    except Exception as e:
        logger.warning("otp_readiness_payload: %s", e)
        ready = False

    return {
        "ready": ready,
        "redis_url_set": bool(str(os.environ.get("REDIS_URL", "")).strip()),
        "labsmobile_username_set": bool(str(os.environ.get("LABSMOBILE_USERNAME", "")).strip()),
        "labsmobile_api_token_set": bool(str(os.environ.get("LABSMOBILE_API_TOKEN", "")).strip()),
        "labsmobile_sender_set": bool(str(os.environ.get("LABSMOBILE_SENDER", "")).strip()),
    }


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


@api_router.get("/health/otp-readiness")
async def api_health_otp_readiness():
    """Diagnóstico OTP bajo /api para proxy same-origin (Vercel → API)."""
    return otp_readiness_payload()


try:
    from routes.operators import router as operators_router  # type: ignore
    logger.info("ROUTER LOADED: operators")
except Exception as e:
    operators_router = None  # type: ignore
    logger.error(f"ROUTER FAILED: operators - {e}")

def _include_if_present(r, name: str) -> None:
    if r is not None:
        api_router.include_router(r)
        logger.info(f"ROUTER ATTACHED: {name}")
    else:
        logger.warning(f"ROUTER SKIPPED (not loaded): {name}")

# Include all routers (solo los que cargaron bien)
_include_if_present(auth_router, "auth")
_include_if_present(users_router, "users")
_include_if_present(service_requests_router, "service_requests")
_include_if_present(payments_router, "payments")
_include_if_present(oneclick_router, "oneclick")
_include_if_present(ratings_router, "ratings")
_include_if_present(providers_router, "providers")
_include_if_present(pricing_router, "pricing")
_include_if_present(communications_router, "communications")
_include_if_present(abandonment_router, "abandonment")
_include_if_present(services_router, "services")
_include_if_present(operators_router, "operators")
_include_if_present(invoices_router, "invoices")
_include_if_present(messages_router, "messages")
_include_if_present(admin_reports_router, "admin_reports")
_include_if_present(admin_reports_cron_router, "admin_reports_cron")
_include_if_present(admin_config_router, "admin_config")
_include_if_present(admin_access_router, "admin_access")
_include_if_present(marketing_kpi_router, "marketing_kpi")
_include_if_present(marketing_cron_router, "marketing_cron")
_include_if_present(chatbot_router, "chatbot")
_include_if_present(public_stats_router, "public_stats")
_include_if_present(bookings_router, "bookings")

# Register main router
app.include_router(api_router)
logger.info("ROUTERS LOADED AND ATTACHED")
# Maps router ya trae prefijo /api/maps, se monta directo para evitar /api/api/maps
if maps_router is not None:
    app.include_router(maps_router)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/healthz")
async def infra_healthz():
    return {"status": "ok"}


@app.get("/api/health")
async def api_health():
    return {"status": "ok"}


@app.get("/healthz/otp-readiness")
async def infra_healthz_otp_readiness():
    """
    Infra: OTP vía Redis+LabsMobile. Misma carga útil que GET /api/health/otp-readiness.
    """
    return otp_readiness_payload()


if not _SERVE_SPA:
    @app.get("/")
    async def infra_root():
        return {
            "service": "maqgo-backend",
            "status": "ok",
            "api": "/api/",
        }


if _SERVE_SPA:
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="spa")
