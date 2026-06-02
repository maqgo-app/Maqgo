from __future__ import annotations

import base64
import binascii
import io
import mimetypes
import os
import re
from typing import Any, Dict, List, Literal, Optional, Tuple

from PIL import Image

InvoiceFileKind = Literal["pdf", "image", "unknown"]
PrecheckStatus = Literal["ok", "warning"]
AmountBucket = Literal["lt_500k", "500k_1m", "gte_1m", "missing"]
AmountSource = Literal["confirmed", "detected", "expected", "missing"]


def _env_int(name: str, default: int) -> int:
    raw = str(os.environ.get(name, "") or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except Exception:
        return default


MAX_INVOICE_IMAGE_BYTES = _env_int("MAQGO_MAX_INVOICE_IMAGE_BYTES", 6 * 1024 * 1024)
MAX_INVOICE_PDF_BYTES = _env_int("MAQGO_MAX_INVOICE_PDF_BYTES", 8 * 1024 * 1024)
MIN_INVOICE_IMAGE_MIN_SIDE_PX = _env_int("MAQGO_MIN_INVOICE_IMAGE_MIN_SIDE_PX", 700)

ALLOWED_INVOICE_MIMES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}


def guess_mime(filename: Optional[str], content_type: Optional[str], file_head: bytes) -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct and ct != "application/octet-stream":
        return ct

    head = file_head[:16]
    if head.startswith(b"%PDF"):
        return "application/pdf"
    if head.startswith(b"\xFF\xD8\xFF"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"RIFF") and b"WEBP" in head:
        return "image/webp"

    guess, _ = mimetypes.guess_type(filename or "")
    return (guess or "application/octet-stream").lower()


_DATA_URL_RE = re.compile(r"^data:([^;]+);base64,(.*)$", re.IGNORECASE | re.DOTALL)


def decode_data_url(data_url: str) -> Tuple[str, bytes]:
    m = _DATA_URL_RE.match((data_url or "").strip())
    if not m:
        t = (data_url or "").strip()
        if not t:
            raise ValueError("Archivo vacío.")
        try:
            raw = base64.b64decode(t, validate=True)
        except Exception as e:
            raise ValueError("Formato base64 inválido.") from e
        return "application/octet-stream", raw

    mime = (m.group(1) or "").strip().lower()
    payload = (m.group(2) or "").strip()
    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as e:
        raise ValueError("Formato base64 inválido.") from e
    return mime, raw


def classify_amount_bucket(amount_clp: Optional[float]) -> AmountBucket:
    if amount_clp is None:
        return "missing"
    try:
        v = float(amount_clp)
    except Exception:
        return "missing"
    if v <= 0:
        return "missing"
    if v < 500_000:
        return "lt_500k"
    if v < 1_000_000:
        return "500k_1m"
    return "gte_1m"


def choose_amount_for_bucket(
    confirmed_clp: Optional[float],
    detected_clp: Optional[float],
    expected_clp: Optional[float],
) -> Tuple[Optional[float], AmountSource]:
    for src, val in (
        ("confirmed", confirmed_clp),
        ("detected", detected_clp),
        ("expected", expected_clp),
    ):
        try:
            if val is None:
                continue
            v = float(val)
            if v > 0:
                return v, src  # type: ignore[return-value]
        except Exception:
            continue
    return None, "missing"


def precheck_invoice_bytes(
    *,
    file_bytes: bytes,
    filename: Optional[str] = None,
    content_type: Optional[str] = None,
) -> Dict[str, Any]:
    if not file_bytes:
        raise ValueError("Archivo vacío.")

    mime = guess_mime(filename, content_type, file_bytes)
    kind: InvoiceFileKind = "unknown"
    if mime == "application/pdf":
        kind = "pdf"
    elif mime.startswith("image/"):
        kind = "image"

    if mime not in ALLOWED_INVOICE_MIMES:
        raise ValueError("Formato no soportado. Sube PDF o imagen (JPG/PNG/WEBP).")

    size = len(file_bytes)
    if kind == "pdf":
        if size > MAX_INVOICE_PDF_BYTES:
            raise ValueError("El PDF supera el tamaño máximo permitido.")
    elif kind == "image":
        if size > MAX_INVOICE_IMAGE_BYTES:
            raise ValueError("La imagen supera el tamaño máximo permitido.")

    status: PrecheckStatus = "ok"
    reasons: List[str] = []
    image_width: Optional[int] = None
    image_height: Optional[int] = None

    if kind == "pdf":
        if not file_bytes[:4].startswith(b"%PDF"):
            status = "warning"
            reasons.append("El archivo parece PDF, pero no se detectó cabecera %PDF.")
    elif kind == "image":
        try:
            with Image.open(io.BytesIO(file_bytes)) as img:
                image_width, image_height = img.size
        except Exception as e:
            raise ValueError("La imagen no se pudo leer. Intenta con otra foto o exporta a PDF.") from e
        if image_width is not None and image_height is not None:
            min_side = min(image_width, image_height)
            if min_side < MIN_INVOICE_IMAGE_MIN_SIDE_PX:
                status = "warning"
                reasons.append("La foto se ve de baja resolución. Recomendado: PDF escaneado o foto más nítida.")

    return {
        "status": status,
        "reasons": reasons,
        "file_kind": kind,
        "file_mime": mime,
        "file_size_bytes": size,
        "image_width": image_width,
        "image_height": image_height,
    }


def normalize_invoice_number(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    s = re.sub(r"\s+", " ", s)
    return s[:64]

