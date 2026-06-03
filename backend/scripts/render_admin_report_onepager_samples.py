import os
import sys
import subprocess
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from routes.admin_reports import _build_weekly_onepager_pdf_bytes, _build_monthly_onepager_pdf_bytes


def main() -> None:
    out_dir = Path(__file__).resolve().parent.parent / "qa-artifacts" / "admin-reports"
    out_dir.mkdir(parents=True, exist_ok=True)

    weekly_report = {
        "periodo": {
            "semana": "Semana 2026-05-18 → 2026-05-25",
            "inicio": "2026-05-18T00:00:00Z",
            "fin": "2026-05-25T00:00:00Z",
        },
        "resumen": {
            "total_servicios_creados_semana": 42,
            "monto_creado_semana_clp": 18300000,
            "servicios_pagados_cerrados_semana": 18,
            "gmv_pagado_semana_clp": 12500000,
            "por_pagar_proveedor_count": 6,
            "por_pagar_proveedor_monto_clp": 4100000,
            "tasa_cancelacion": "7.1%",
            "tiempo_promedio_revision_min": 95.4,
            "nuevos_clientes_semana": 28,
            "nuevos_proveedores_semana": 9,
            "nuevas_maquinarias_semana": 17,
            "por_estado": {
                "pending_review": 6,
                "approved": 9,
                "invoiced": 5,
                "paid": 18,
                "disputed": 1,
                "cancelled": 3,
                "otros": 0,
            },
            "etiquetas_estado": {
                "pending_review": "En revisión MAQGO",
                "approved": "Aprobado (factura proveedor)",
                "invoiced": "Facturado (pago pendiente)",
                "paid": "Pagado",
                "disputed": "En disputa",
                "cancelled": "Cancelado",
                "otros": "Otros",
            },
            "top_maquinaria": [
                {"tipo": "Excavadora", "n": 13},
                {"tipo": "Retroexcavadora", "n": 10},
                {"tipo": "Camión Tolva", "n": 7},
                {"tipo": "Grúa", "n": 5},
                {"tipo": "Camión Pluma", "n": 4},
            ],
        },
        "marketing": {
            "kpi": {
                "CAC_cliente_registro_clp": 18500,
                "CAC_proveedor_registro_clp": 42000,
            },
            "funnel": {
                "clientes": {
                    "registrados": 28,
                    "con_tarjeta_oneclick": 14,
                    "con_solicitud_servicio": 9,
                    "con_servicio_pagado_semana": 3,
                },
                "proveedores": {
                    "registrados": 9,
                    "onboarding_completado": 5,
                    "disponibles": 4,
                    "con_primer_servicio_semana": 1,
                },
            },
        },
        "demand": {
            "requests_created": 120,
            "top_zones": [
                {"zone": "Lampa", "n": 13, "wow_pct": 48.0},
                {"zone": "Quilicura", "n": 10, "wow_pct": 6.0},
                {"zone": "Pudahuel", "n": 7, "wow_pct": -12.0},
            ],
        },
        "integrations": {"komatsu": {"connected": 38, "ok_24h": 31, "stale_72h": 4, "never_sync": 3}},
        "business": {"take_rate_pct": 12.4},
        "ops": {"review_within_24h_pct": 62.5},
        "alertas": [
            {"tipo": "COLA_REVISION", "mensaje": "4 servicio(s) con más de 72h en revisión MAQGO."},
            {"tipo": "FACTURACION_MAQGO_CLIENTE", "mensaje": "6 pago(s) donde MAQGO debe facturar al cliente (pendiente)."},
        ],
    }

    monthly_report = {
        "periodo": {
            "year": 2026,
            "month": 5,
            "label": "2026-05",
            "inicio": "2026-05-01T00:00:00",
            "fin": "2026-06-01T00:00:00",
        },
        "volume": {
            "services_paid": 71,
            "with_provider_invoice": 71,
            "paid_without_invoice": 0,
            "new_clients": 103,
            "new_providers": 22,
            "new_machines": 41,
            "machines_published_total": 420,
        },
        "sales": {
            "net": 46500000,
            "gross": 55300000,
            "net_by_document": {"with_provider_invoice": 46500000, "paid_without_invoice": 0, "other": 0},
        },
        "iva": {"debito": 8800000, "credito_estimado": 5900000, "neto_a_pagar_estimado": 2900000},
        "contribution": {"sales_net": 46500000, "cost_of_sales": 37700000, "margin": 8800000, "margin_pct": 18.92},
        "maqgo_revenue": {"client_commission_net": 4230000, "provider_commission_net": 1590000, "total_net": 5820000, "take_rate_pct": 12.52},
        "marketing": {"kpi": {"CAC_cliente_registro_clp": 22500, "CAC_proveedor_registro_clp": 51000}},
        "demand": {
            "requests_created": 120,
            "top_zones": [
                {"zone": "Las Condes", "n": 28},
                {"zone": "Pudahuel", "n": 21},
                {"zone": "Quilicura", "n": 18},
                {"zone": "Maipú", "n": 14},
                {"zone": "San Bernardo", "n": 11},
            ],
        },
        "integrations": {"komatsu": {"connected": 38, "ok_24h": 31, "stale_72h": 4, "never_sync": 3}},
        "mom": {
            "sales_net_pct": 8.2,
            "margin_pct": -1.1,
            "maqgo_revenue_pct": 5.6,
            "services_paid_pct": 3.4,
            "requests_created_pct": 4.8,
        },
        "insights": [
            "Excavadoras lideran GMV del mes.",
            "Las Condes concentra la mayor demanda (solicitudes).",
            "Integración Komatsu: 4 máquinas sin actualizar (más de 72h).",
        ],
    }

    weekly_pdf = _build_weekly_onepager_pdf_bytes(weekly_report)
    monthly_pdf = _build_monthly_onepager_pdf_bytes(monthly_report)

    weekly_path = out_dir / "onepager_semanal_sample.pdf"
    monthly_path = out_dir / "onepager_mensual_sample.pdf"
    weekly_path.write_bytes(weekly_pdf)
    monthly_path.write_bytes(monthly_pdf)

    try:
        subprocess.run(
            [
                "sips",
                "-s",
                "format",
                "png",
                "-Z",
                "2400",
                str(weekly_path),
                "--out",
                str(out_dir / "onepager_semanal_sample_2400.png"),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            [
                "sips",
                "-s",
                "format",
                "png",
                "-Z",
                "2400",
                str(monthly_path),
                "--out",
                str(out_dir / "onepager_mensual_sample_2400.png"),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        pass

    print(f"Wrote: {weekly_path}")
    print(f"Wrote: {monthly_path}")
    print("Tip: use qlmanage to render PNG thumbnails if needed.")


if __name__ == "__main__":
    os.environ.setdefault("MAQGO_ADMIN_REPORT_TIMEZONE", "America/Santiago")
    main()
