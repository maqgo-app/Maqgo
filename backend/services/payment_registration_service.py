"""
Single source of truth: ¿puede el cliente pagar automáticamente sin volver a registrar un medio?

Hoy = OneClick via oneclick_inscriptions.
Futuro = ApplePay, GooglePay, PSP tokens, etc.

REGLA ARQUITECTURAL (PROHIBIDO ROMPER):
  No escribir db.oneclick_inscriptions.find_one(...) EN NINGÚN OTRO
  archivo FUERA de este servicio. Toda consulta de inscripciones de medios
  de pago reutilizables debe pasar por has_reusable_payment_method().
"""
from __future__ import annotations

import logging
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

INSCRIPTIONS_COLLECTION = "oneclick_inscriptions"


def _normalized_email(user: dict[str, Any]) -> str:
    return ((user or {}).get("email", "") or "").strip().lower()


def _is_valid_oneclick_registration(doc: Any) -> bool:
    """
    Validación privada ESPECÍFICA de OneClick. Encapsula aquí TODO el conocimiento
    de lo que significa una inscripción OneClick "válida para cobro automático".

    Futuro (cuando haya más PSPs): añadir funciones _is_valid_* específicas,
    todas invocadas desde OR dentro de has_reusable_payment_method().
    """
    if not doc:
        return False
    if not isinstance(doc, dict):
        return False

    tbk_user = doc.get("tbk_user")
    username = doc.get("username")
    if not bool(tbk_user) or not bool(username):
        return False

    # Extension points (no implementados hoy; placeholders para no romper API mañana)
    # - if doc.get("revokedAt") and doc.get("revokedAt") <= now: return False
    # - if doc.get("status") and doc.get("status") != "active": return False
    # - if doc.get("expiredAt") and doc.get("expiredAt") <= now: return False
    return True


async def has_reusable_payment_method(
    db: AsyncIOMotorDatabase,
    user: dict[str, Any],
) -> bool:
    """
    Helper ÚNICO para toda la aplicación. Devuelve True si el usuario posee
    AL MENOS UN medio de pago reutilizable válido.

    Implementación actual = OneClick (oneclick_inscriptions por email).
    El CALLER DESCONOCE la tecnología (no ve OneClick, no ve TBK).

    Fail-safe estricto: ante CUALQUIER excepción retorna False y cae al flujo actual
    (nunca se bloquea el flujo de reserva).
    """
    try:
        email = _normalized_email(user)
        if not email:
            return False
        doc = await db[INSCRIPTIONS_COLLECTION].find_one(
            {"email": email},
            {
                "_id": 0,
                "tbk_user": 1,
                "username": 1,
                # Campos que se usarán en las extensiones futuras:
                "revokedAt": 1,
                "status": 1,
                "expiredAt": 1,
            },
        )
        return _is_valid_oneclick_registration(doc)
    except Exception as exc:  # noqa: BLE001 (fail-safe por diseño)
        logger.warning(
            "has_reusable_payment_method failed (fail-safe=False): %s",
            exc,
            exc_info=False,
        )
        return False
