#!/usr/bin/env python3
"""Genera docs/VALIDACION_TRANSBANK_ONECLICK.pdf (FPDF, texto ASCII)."""
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "VALIDACION_TRANSBANK_ONECLICK.pdf"


def main() -> None:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 12)

    def line(txt: str, h: float = 5.5, bold: bool = False) -> None:
        pdf.set_font("Helvetica", "B" if bold else "", 10 if bold else 9)
        pdf.cell(0, h, txt, ln=1)

    line("Validacion OneClick Mall - MAQGO", h=7, bold=True)
    line("Comercio: MAQGO | Producto: Webpay OneClick")
    pdf.ln(2)

    line("1. Flujo", bold=True)
    line("start -> Webpay -> banco -> confirm -> authorize")
    pdf.ln(1)

    line("2. Caso exitoso", bold=True)
    line("- buy_order: unico, alfanumerico, <= 26 caracteres")
    line("- token: inscripcion (start); uso unico en confirm")
    line("- tbk_user: retornado por confirm")
    line("- confirm: response_code = 0")
    line("- authorize: response_code = 0")
    pdf.ln(1)

    line("3. Caso rechazado", bold=True)
    line("- buy_order: mismo formato")
    line("- confirm: response_code = -96")
    line("- authorize: no ejecutado (sin tbk_user valido tras confirm)")
    line("- evidencia: sin llamada authorize / sin TBK_REQ a authorize post-confirm -96")
    pdf.ln(1)

    line("4. Logs (TBK_DEBUG_HTTP=true)", bold=True)
    line("- TBK_REQ: metodo, URL, headers, cuerpo hacia Transbank")
    line("- TBK_RES: HTTP status y cuerpo respuesta")
    line("- timestamps: logs servidor; correlacion por buy_order y orden TBK_REQ -> TBK_RES")
    pdf.ln(1)

    line("5. Endpoints (referencia)", bold=True)
    line("- GET .../api/payments/oneclick/confirm-return?TBK_TOKEN=")
    line("- POST .../api/payments/oneclick/confirm")
    line("- POST .../api/payments/oneclick/authorize")

    pdf.output(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
