"""
MAQGO - Asistente operativo
Enfocado en ayudar con el uso diario de la plataforma.
Pagos, comisiones y facturación → redirige a FAQ y T&C.
"""
import re
import uuid
from fastapi import APIRouter, Request
from pydantic import BaseModel

from rate_limit import limiter

router = APIRouter(prefix="/chatbot", tags=["chatbot"])


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


# Palabras que indican pregunta sobre pago/comisiones/facturación
PAYMENT_KEYWORDS = [
    r"comisi[oó]n", r"comisiones", r"pago", r"pagos", r"factur", r"facturaci[oó]n",
    r"tarifa", r"tarifas", r"cobro", r"cobrar", r"precio", r"precios",
    r"iva", r"porcentaje", r"\d+%", r"depósito", r"transferencia",
    r"cuánto cobra", r"cuanto cobra", r"cuánto paga", r"cuanto paga",
]


def _is_payment_question(text: str) -> bool:
    t = text.lower().strip()
    for kw in PAYMENT_KEYWORDS:
        if re.search(kw, t, re.I):
            return True
    return False


# Respuestas operativas
OPERATIONAL_RESPONSES = {
    "como funciona": "Para usar MAQGO:\n\n1. Elige el tipo de maquinaria que necesitas\n2. Indica cuándo (hoy, mañana o fecha)\n3. Marca la ubicación en el mapa\n4. Revisa proveedores disponibles\n5. Confirma y listo — el operador se contactará\n\n¿Necesitas más detalle de algún paso?",
    "como solicito": "Para solicitar una maquinaria:\n\n• Ve a Inicio → Empezar ahora\n• Selecciona tipo (retro, excavadora, etc.)\n• Elige día y horas\n• Marca la ubicación de tu obra\n• Elige entre los proveedores disponibles\n\nTu tarjeta solo se cobra cuando alguien acepta.",
    "como reservo": "Igual que solicitar: elige maquinaria, fecha, ubicación y confirma. Si es para hoy, verás disponibilidad inmediata.",
    "registro": "Para registrarte:\n\n• Cliente: Empezar ahora → completa datos → verifica SMS → elige \"Soy Cliente\"\n• Proveedor: Empezar ahora → completa datos → verifica SMS → elige \"Soy Proveedor\"\n• Operador: \"Soy operador (tengo código)\" en la pantalla de inicio → ingresa el código de 6 dígitos",
    "operador": "Si eres operador:\n\n1. Toca 'Soy operador (tengo código)' en la pantalla de inicio\n2. Ingresa el código de 6 dígitos que recibiste por SMS\n3. Quedarás activo y asociado a la maquinaria\n\nTu empresa y tú recibirán confirmación.",
    "maquinaria": "En MAQGO hay retroexcavadoras, excavadoras, bulldozers, camiones tolva, grúas, minicargadores y más. Selecciona el tipo que necesitas en la app y verás disponibilidad en tu zona.",
    "disponibilidad": "La disponibilidad se muestra al elegir tipo de maquinaria, fecha y ubicación. Para hoy suele haber opciones inmediatas.",
    "cancelar": "Puedes cancelar desde la app. Si cancelas dentro de los 15 minutos después de pagar, no hay costo. Después aplican cargos según el avance del servicio.",
    "contacto": "Puedes escribir al operador por el chat de MAQGO una vez confirmada tu solicitud. También hay un botón de WhatsApp para soporte en horario hábil.",
    "proveedor": "Para registrarte como proveedor:\n\n• Toca \"Empezar ahora\" en la pantalla de inicio\n• Completa tus datos y verifica tu número por SMS\n• Cuando te pregunten \"¿Cómo usarás la app?\", elige \"Soy Proveedor\"\n• Luego completa datos de empresa, maquinarias y operadores\n• Una vez listo, empezarás a recibir solicitudes",
    "soporte": "El soporte está en el botón de WhatsApp de la app. Horario hábil, lunes a viernes.",
}

# Respuestas específicas por rol (registro)
REGISTRO_PROVEEDOR = "Para registrarte como proveedor:\n\n• Toca \"Empezar ahora\" en la pantalla de inicio\n• Completa tus datos y verifica tu número por SMS\n• Cuando te pregunten \"¿Cómo usarás la app?\", elige \"Soy Proveedor\"\n• Luego completa datos de empresa, maquinarias y operadores\n• Una vez listo, empezarás a recibir solicitudes"
REGISTRO_CLIENTE = "Para registrarte como cliente:\n\n• Toca \"Empezar ahora\" en la pantalla de inicio\n• Completa tus datos (nombre, email, teléfono)\n• Verifica tu número por SMS\n• Listo: ya puedes solicitar maquinaria"
REGISTRO_OPERADOR = "Si eres operador:\n\n1. Toca \"Soy operador (tengo código)\" en la pantalla de inicio\n2. Ingresa el código de 6 dígitos que recibiste por SMS\n3. Quedarás activo y asociado a la maquinaria\n\nTu empresa y tú recibirán confirmación."


def _match_operational(text: str) -> str | None:
    t = text.lower().strip()
    # Específico por rol primero (registro como X)
    if ("registro" in t or "registrar" in t) and "proveedor" in t:
        return REGISTRO_PROVEEDOR
    if ("registro" in t or "registrar" in t) and "cliente" in t:
        return REGISTRO_CLIENTE
    if ("operador" in t) and ("uno" in t or "unir" in t or "registro" in t or "código" in t):
        return REGISTRO_OPERADOR
    # Proveedor genérico (sin "registro")
    if "proveedor" in t:
        return OPERATIONAL_RESPONSES["proveedor"]
    # Operador genérico
    if "operador" in t:
        return OPERATIONAL_RESPONSES["operador"]
    # Resto
    for key, resp in OPERATIONAL_RESPONSES.items():
        if key in t:
            return resp
    return None


@router.post("/send")
@limiter.limit("30/minute")
async def send_message(request: Request, body: ChatRequest):
    """
    Asistente operativo MAQGO.
    - Preguntas operativas: responde directo
    - Preguntas de pago/comisiones/facturación: redirige a FAQ y T&C
    """
    msg = body.message.strip()
    session_id = body.session_id or str(uuid.uuid4())

    # Pago/comisiones/facturación → redirigir a FAQ y T&C (botón lleva directo, sin explicar ubicación)
    if _is_payment_question(msg):
        return {
            "response": "Para pagos, comisiones y facturación hay respuestas detalladas en el FAQ. ¿Te llevo?",
            "session_id": session_id,
            "actions": [{"label": "Ver FAQ", "path": "/faq"}, {"label": "Ver Términos", "path": "/terms"}],
        }

    # Intentar respuesta operativa
    resp = _match_operational(msg)
    if resp:
        return {"response": resp, "session_id": session_id}

    # Fallback genérico
    return {
        "response": "¿En qué te puedo ayudar? Puedo orientarte sobre cómo solicitar maquinaria, registrarte como cliente o proveedor, o usar el código de operador. También puedes revisar FAQ para más detalles.",
        "session_id": session_id,
    }
