import base64
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from routes.admin_reports import (  # noqa: E402
    _fmt_clp,
    _render_admin_monthly_intelligence_email,
    _render_admin_weekly_brief_email,
)


def _load_logo_data_uri() -> str:
    repo_root = BACKEND_DIR.parent
    candidates = [
        repo_root / "frontend" / "public" / "maqgo_logo_clean.png",
        repo_root / "frontend" / "src" / "assets" / "maqgo-logo.png",
        repo_root / "frontend" / "public" / "maqgo-logo-transparent.png",
    ]
    for p in candidates:
        if p.exists():
            b = p.read_bytes()
            enc = base64.b64encode(b).decode("utf-8")
            return f"data:image/png;base64,{enc}"
    return ""


def main() -> None:
    out_dir = BACKEND_DIR / "qa-artifacts" / "admin-reports"
    out_dir.mkdir(parents=True, exist_ok=True)

    os.environ.setdefault("FRONTEND_URL", "https://www.maqgo.cl")
    logo_uri = _load_logo_data_uri()
    if logo_uri:
        os.environ["MAQGO_EMAIL_LOGO_URL"] = logo_uri

    weekly_report = {
        "periodo": {"semana": "Semana del 18/05/2026 al 24/05/2026"},
        "business": {
            "gmv_paid_clp": 12500000,
            "maqgo_revenue_net_clp": 1650000,
            "services_completed": 18,
            "ticket_promedio_clp": 694444,
            "avg_rental_days": 1.15,
            "wow_gmv_pct": 12.4,
            "wow_maqgo_revenue_pct": 9.8,
            "wow_completed_pct": 5.6,
        },
        "ops": {
            "health_score": 82,
            "review_avg_min": 95,
            "pending_review_total": 6,
            "stuck_over_72h": 2,
            "disputed_total": 1,
            "invoiced_total": 5,
        },
        "growth": {"new_clients": 24, "new_providers": 5, "new_machines": 7},
        "marketing": {
            "funnel": {
                "clientes": {"registrados": 24, "con_tarjeta_oneclick": 10, "con_solicitud_servicio": 8},
                "proveedores": {"registrados": 5, "disponibles": 2, "con_primer_servicio_semana": 0},
            }
        },
        "demand": {
            "requests_created": 52,
            "top_zones": [
                {"zone": "Lampa", "n": 13, "wow_pct": 48.0},
                {"zone": "Quilicura", "n": 10, "wow_pct": 6.0},
                {"zone": "Pudahuel", "n": 7, "wow_pct": -12.0},
            ],
        },
        "integrations": {"komatsu": {"connected": 38, "ok_24h": 31, "stale_72h": 4, "never_sync": 3}},
        "insights": [
            "GMV subió 12,4% vs semana anterior.",
            "Backlog crítico: 2 servicios en revisión (más de 72h).",
            "Demanda: Lampa creció 48% vs semana anterior.",
            "Integración Komatsu: 4 máquinas sin actualizar (más de 72h).",
        ],
    }
    weekly_html = _render_admin_weekly_brief_email(
        report=weekly_report, report_id="weekly-2026-05-18", cta_url="https://www.maqgo.cl/admin"
    )

    monthly_report = {
        "periodo": {"label": "2026-05"},
        "sales": {
            "net": 46500000,
            "net_by_document": {"with_provider_invoice": 46500000, "paid_without_invoice": 0, "other": 0},
        },
        "contribution": {"margin": 8800000, "margin_pct": 18.9},
        "iva": {"neto_a_pagar_estimado": 2900000},
        "maqgo_revenue": {"total_net": 5820000},
        "volume": {
            "services_paid": 71,
            "with_provider_invoice": 71,
            "paid_without_invoice": 0,
            "provider_doc_missing": 0,
            "new_clients": 140,
            "new_providers": 22,
            "new_machines": 31,
            "avg_rental_days": 1.32,
            "maqgo_client_invoice_pending": 12,
            "maqgo_client_invoiced_marked": 59,
            "machines_published_total": 420,
        },
        "demand": {"requests_created": 312, "top_zones": [{"zone": "Lampa", "n": 44}, {"zone": "Quilicura", "n": 31}, {"zone": "Pudahuel", "n": 25}]},
        "marketing": {"kpi": {"CAC_cliente_registro_clp": 8900, "CAC_proveedor_registro_clp": 21500}},
        "integrations": {"komatsu": {"connected": 38, "ok_24h": 31, "stale_72h": 4, "never_sync": 3}},
        "insights": [
            "Excavadoras lideran GMV del mes.",
            "Lampa concentra la mayor demanda (solicitudes).",
            "Integración Komatsu: 4 máquinas sin actualizar (más de 72h).",
        ],
    }
    monthly_html = _render_admin_monthly_intelligence_email(
        report=monthly_report, report_id="monthly-2026-05", cta_url="https://www.maqgo.cl/admin"
    )

    (out_dir / "email_weekly_sample.html").write_text(weekly_html, encoding="utf-8")
    (out_dir / "email_monthly_sample.html").write_text(monthly_html, encoding="utf-8")
    print(f"Wrote: {out_dir / 'email_weekly_sample.html'}")
    print(f"Wrote: {out_dir / 'email_monthly_sample.html'}")

    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={"width": 1200, "height": 900}, device_scale_factor=2)
            page = context.new_page()

            page.set_content(weekly_html, wait_until="networkidle")
            page.wait_for_timeout(200)
            page.screenshot(path=str(out_dir / "email_weekly_sample_2400.png"), full_page=True)

            page.set_content(monthly_html, wait_until="networkidle")
            page.wait_for_timeout(200)
            page.screenshot(path=str(out_dir / "email_monthly_sample_2400.png"), full_page=True)

            context.close()
            browser.close()
            print(f"Wrote: {out_dir / 'email_weekly_sample_2400.png'}")
            print(f"Wrote: {out_dir / 'email_monthly_sample_2400.png'}")
    except Exception as e:
        print(f"Screenshot skipped: {e}")


if __name__ == "__main__":
    main()
