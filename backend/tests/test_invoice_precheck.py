import os
import sys
import base64
import io

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

import pytest
from PIL import Image

from utils.invoice_precheck import (
    classify_amount_bucket,
    choose_amount_for_bucket,
    decode_data_url,
    normalize_invoice_number,
    precheck_invoice_bytes,
)


def test_normalize_invoice_number():
    assert normalize_invoice_number("  123  ") == "123"
    assert normalize_invoice_number("  ") is None
    assert normalize_invoice_number(None) is None


def test_classify_amount_bucket():
    assert classify_amount_bucket(None) == "missing"
    assert classify_amount_bucket(0) == "missing"
    assert classify_amount_bucket(-1) == "missing"
    assert classify_amount_bucket(1) == "lt_500k"
    assert classify_amount_bucket(499_999) == "lt_500k"
    assert classify_amount_bucket(500_000) == "500k_1m"
    assert classify_amount_bucket(999_999) == "500k_1m"
    assert classify_amount_bucket(1_000_000) == "gte_1m"


def test_choose_amount_for_bucket():
    amt, src = choose_amount_for_bucket(None, None, None)
    assert amt is None
    assert src == "missing"

    amt, src = choose_amount_for_bucket(1200, 900, 800)
    assert amt == 1200
    assert src == "confirmed"

    amt, src = choose_amount_for_bucket(None, 900, 800)
    assert amt == 900
    assert src == "detected"

    amt, src = choose_amount_for_bucket(None, None, 800)
    assert amt == 800
    assert src == "expected"


def test_decode_data_url_pdf_roundtrip():
    raw = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"
    b64 = base64.b64encode(raw).decode("utf-8")
    mime, out = decode_data_url(f"data:application/pdf;base64,{b64}")
    assert mime == "application/pdf"
    assert out == raw


def test_precheck_pdf_ok():
    raw = b"%PDF-1.4\n"
    res = precheck_invoice_bytes(file_bytes=raw, filename="invoice.pdf", content_type="application/pdf")
    assert res["file_kind"] == "pdf"
    assert res["file_mime"] == "application/pdf"
    assert res["status"] in ("ok", "warning")


def test_precheck_image_ok():
    img = Image.new("RGB", (1200, 900), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    raw = buf.getvalue()
    res = precheck_invoice_bytes(file_bytes=raw, filename="invoice.png", content_type="image/png")
    assert res["file_kind"] == "image"
    assert res["file_mime"] == "image/png"
    assert res["image_width"] == 1200
    assert res["image_height"] == 900


def test_precheck_reject_unsupported():
    with pytest.raises(ValueError):
        precheck_invoice_bytes(file_bytes=b"hello", filename="invoice.txt", content_type="text/plain")

