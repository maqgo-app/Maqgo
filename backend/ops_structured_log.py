"""
Logs estructurados (una línea JSON por evento) para agregación en producción.
No incluir datos sensibles completos: usar phone_tail u otros campos enmascarados.
"""
from __future__ import annotations

import json
import logging
from typing import Any


def log_ops_event(logger: logging.Logger, **fields: Any) -> None:
    """Emite un objeto JSON por línea vía logger.info (nivel INFO)."""
    try:
        line = json.dumps(fields, default=str, ensure_ascii=False)
    except Exception:
        line = json.dumps(
            {"event": fields.get("event", "log_serialize_error"), "success": False},
            default=str,
            ensure_ascii=False,
        )
    logger.info(line)
