from __future__ import annotations

from typing import Any


def _normalize_machine_key(v: str) -> str:
    return (
        (v or "")
        .strip()
        .lower()
        .replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
        .replace(" ", "_")
    )


_MACHINE_DISPLAY = {
    "retroexcavadora": "Retroexcavadora",
    "camion_tolva": "Camión Tolva",
    "camión_tolva": "Camión Tolva",
    "excavadora": "Excavadora Hidráulica",
    "excavadora_hidraulica": "Excavadora Hidráulica",
    "bulldozer": "Bulldozer",
    "motoniveladora": "Motoniveladora",
    "grua": "Grúa Móvil",
    "camion_pluma": "Camión Pluma (Hiab)",
    "camión_pluma": "Camión Pluma (Hiab)",
    "compactadora": "Compactadora / Rodillo",
    "rodillo": "Rodillo Compactador",
    "camion_aljibe": "Camión Aljibe",
    "camión_aljibe": "Camión Aljibe",
    "minicargador": "Minicargador",
}


def _display_machine(v: str) -> str:
    raw = (v or "").strip()
    if not raw:
        return "maquinaria pesada"
    k = _normalize_machine_key(raw)
    return _MACHINE_DISPLAY.get(k) or raw


def _clip(s: str, max_len: int) -> str:
    s = (s or "").strip()
    if len(s) <= max_len:
        return s
    return s[: max(0, max_len - 1)].rstrip() + "…"


def _safe_str(v: Any, default: str = "") -> str:
    if v is None:
        return default
    return str(v).strip() or default


def _normalize_role(role: str) -> str:
    r = (role or "").strip()
    if not r:
        return ""
    low = r.lower()
    if "municip" in low:
        return "Compras"
    if "compra" in low:
        return "Compras"
    if "jef" in low and "obra" in low:
        return "Jefatura de obra"
    if "oper" in low:
        return "Operaciones"
    if "ger" in low:
        return "Gerencia"
    if "due" in low or "admin" in low:
        return "Administración"
    return r


def _channel_for_persona(persona: str) -> str:
    p = (persona or "").strip().lower()
    if p in {"proveedor", "provider", "empresa"}:
        return "email"
    if p in {"cliente", "client"}:
        return "email"
    return "whatsapp"


def _draft_for_provider(context: dict[str, Any]) -> dict[str, Any]:
    city = _safe_str(context.get("city"), "")
    machine = _display_machine(_safe_str(context.get("machine"), ""))
    role = _safe_str(context.get("role"), "")
    role_norm = _normalize_role(role)
    benefit = _safe_str(
        context.get("benefit"),
        "más solicitudes sin inversión publicitaria y con visibilidad por rol (Titular/Gerente/Operador)",
    )
    contact = _safe_str(context.get("contact_name"), "")
    who = f"{contact}, " if contact else ""
    loc = f" en {city}" if city else ""
    role_line = f"Para {role_norm}: " if role_norm else ""
    msg = (
        f"Hola {who}soy del equipo MAQGO. {role_line}Estamos sumando proveedores de {machine}{loc}. "
        f"MAQGO te ayuda a recibir {benefit}. "
        "Recibe solicitudes para obras y proyectos (mismo día o programado) y con seguimiento en línea. "
        "Las solicitudes con inicio el mismo día pueden pagar una bonificación adicional por disponibilidad (hasta +20%). "
        "¿Te interesa? Haz clic en Iniciar onboarding para activar tu perfil. Si prefieres, responde este correo."
    )
    return {
        "channel": "email",
        "subject": "MAQGO — Activa tu perfil y recibe solicitudes",
        "message": _clip(msg, 500),
        "short_reason": "Captación proveedor con propuesta directa y CTA simple.",
        "cta": "Iniciar onboarding",
    }


def _draft_for_client(context: dict[str, Any]) -> dict[str, Any]:
    city = _safe_str(context.get("city"), "")
    machine = _display_machine(_safe_str(context.get("machine"), ""))
    need = _safe_str(context.get("need"), "")
    urgency = _safe_str(context.get("urgency"), "")
    role = _safe_str(context.get("role"), "")
    role_norm = _normalize_role(role)
    loc = f" en {city}" if city else ""
    extra = f" ({need})" if need else ""
    urg = f" Hoy" if urgency.lower() in {"hoy", "urgent", "urgente"} else ""
    role_line = f"Para {role_norm}: " if role_norm else ""
    msg = (
        f"Hola, soy del equipo MAQGO. {role_line}Si necesitas {machine}{extra}{loc}.{urg} "
        "Cotiza y reserva maquinaria con operador en tiempo real, incluso para el mismo día (según disponibilidad), con seguimiento en línea. "
        "Aplica para obras, faenas y proyectos de cualquier tamaño (empresas y organizaciones). "
        "Haz clic en Cotizar ahora o responde con: ubicación + fecha/hora + tipo de trabajo (1 línea)."
    )
    return {
        "channel": "email",
        "subject": "MAQGO — Cotiza maquinaria en tiempo real",
        "message": _clip(msg, 500),
        "short_reason": "Captación cliente con foco en rapidez y coordinación.",
        "cta": "Cotizar ahora",
    }


async def draft_outreach_message(*, persona: str, context: dict[str, Any]) -> dict[str, Any]:
    p = (persona or "").strip().lower()
    if p in {"proveedor", "provider", "empresa"}:
        return {"ok": True, "engine": "maqgo_internal", "result": _draft_for_provider(context)}
    if p in {"cliente", "client"}:
        return {"ok": True, "engine": "maqgo_internal", "result": _draft_for_client(context)}
    return {
        "ok": True,
        "engine": "maqgo_internal",
        "result": {
            "channel": _channel_for_persona(persona),
            "subject": "",
            "message": _clip("Hola, soy del equipo MAQGO. ¿En qué te puedo ayudar hoy?", 500),
            "short_reason": "Mensaje neutro por persona desconocida.",
            "cta": "Responder con tu necesidad",
        },
    }
