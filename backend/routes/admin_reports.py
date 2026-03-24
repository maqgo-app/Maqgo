"""
MAQGO Admin - Informe Operativo Semanal y Planilla de Pagos
"""
from fastapi import APIRouter, HTTPException, Query, Depends

from auth_dependency import get_current_admin
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta
from typing import Optional
from collections import Counter
import io
import csv
import os

from db_config import get_db_name, get_mongo_url

router = APIRouter(prefix="/admin/reports", tags=["admin-reports"])

mongo_url = get_mongo_url()
client = AsyncIOMotorClient(mongo_url)
db = client[get_db_name()]


@router.get("/sms-balance")
async def get_sms_balance(_: dict = Depends(get_current_admin)):
    """
    Saldo de créditos SMS (LabsMobile) para monitoreo operativo en Admin.
    """
    try:
        from services.otp_service import get_sms_balance as otp_get_sms_balance
    except ImportError:
        raise HTTPException(status_code=500, detail="Servicio OTP no disponible")

    result = otp_get_sms_balance()
    threshold = float(str(os.environ.get("SMS_LOW_BALANCE_THRESHOLD", "300")).strip() or "300")
    credits = result.get("credits")

    if not result.get("success"):
        return {
            "success": False,
            "provider": "labsmobile",
            "credits": credits,
            "low_balance_threshold": threshold,
            "is_low_balance": (credits is not None and credits <= threshold),
            "error": result.get("error") or "No se pudo consultar saldo SMS",
            "code": result.get("code"),
        }

    return {
        "success": True,
        "provider": "labsmobile",
        "credits": credits,
        "low_balance_threshold": threshold,
        "is_low_balance": (credits is not None and credits <= threshold),
        "code": result.get("code"),
    }

async def _build_weekly_report(weeks_ago: int = 0):
    """
    Informe semanal alineado al pipeline de facturación MAQGO (colección `services`):
    pending_review → approved → invoiced → paid | disputed | cancelled
    """
    now = datetime.utcnow()
    start_of_week = now - timedelta(days=now.weekday() + (weeks_ago * 7))
    start_of_week = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_week = start_of_week + timedelta(days=7)

    services = await db.services.find({
        "created_at": {"$gte": start_of_week, "$lt": end_of_week}
    }).to_list(None)

    pipeline_keys = ["pending_review", "approved", "invoiced", "paid", "disputed", "cancelled"]
    por_estado = {k: 0 for k in pipeline_keys}
    por_estado["otros"] = 0

    for s in services:
        st = s.get("status") or ""
        if st in pipeline_keys:
            por_estado[st] += 1
        else:
            por_estado["otros"] += 1

    review_hours = []
    for s in services:
        if s.get("approved_at") and s.get("created_at"):
            ca, aa = s["created_at"], s["approved_at"]
            if isinstance(ca, datetime) and isinstance(aa, datetime):
                review_hours.append((aa - ca).total_seconds() / 3600.0)

    tiempo_promedio_revision_h = round(sum(review_hours) / len(review_hours), 1) if review_hours else 0.0
    tiempo_promedio_revision_min = round(tiempo_promedio_revision_h * 60, 1) if tiempo_promedio_revision_h else 0.0

    paid_docs = await db.services.find({
        "status": "paid",
        "paid_at": {"$gte": start_of_week, "$lt": end_of_week}
    }).to_list(None)
    gmv_week = sum(float(d.get("gross_total") or 0) for d in paid_docs)
    n_pagados_cerrados = len(paid_docs)

    total_creados = len(services)
    canceladas = por_estado.get("cancelled", 0)
    tasa_cancel = round((canceladas / total_creados * 100), 1) if total_creados else 0.0

    mach = Counter((s.get("machinery_type") or "—") for s in services)
    top_maquinaria = [{"tipo": k, "n": v} for k, v in mach.most_common(5)]

    alertas = await generate_alerts(db, start_of_week, end_of_week)

    etiquetas = {
        "pending_review": "En revisión MAQGO",
        "approved": "Aprobado (factura proveedor)",
        "invoiced": "Facturado (pago pendiente)",
        "paid": "Pagado",
        "disputed": "En disputa",
        "cancelled": "Cancelado",
        "otros": "Otro estado",
    }

    return {
        "periodo": {
            "inicio": start_of_week.isoformat(),
            "fin": end_of_week.isoformat(),
            "semana": f"Semana del {start_of_week.strftime('%d/%m/%Y')} al {(end_of_week - timedelta(days=1)).strftime('%d/%m/%Y')}"
        },
        "resumen": {
            "total_servicios_creados_semana": total_creados,
            "por_estado": por_estado,
            "etiquetas_estado": etiquetas,
            "tiempo_promedio_revision_h": tiempo_promedio_revision_h,
            "tiempo_promedio_revision_min": tiempo_promedio_revision_min,
            "servicios_pagados_cerrados_semana": n_pagados_cerrados,
            "gmv_pagado_semana_clp": round(gmv_week),
            "tasa_cancelacion": f"{tasa_cancel}%",
            "top_maquinaria": top_maquinaria,
            "total_solicitudes": total_creados,
            "tiempo_promedio_confirmacion_min": tiempo_promedio_revision_min,
            "solicitudes_aceptadas": por_estado.get("approved", 0) + por_estado.get("invoiced", 0) + por_estado.get("paid", 0),
            "solicitudes_rechazadas": 0,
            "solicitudes_sin_respuesta": por_estado.get("pending_review", 0),
            "solicitudes_canceladas": canceladas,
            "reservas_inmediatas": 0,
            "tasa_aceptacion_inmediatas": "N/A",
        },
        "alertas": alertas,
        "generado_el": datetime.utcnow().isoformat(),
        "pipeline": "facturacion_post_servicio",
    }


@router.get("/weekly")
async def get_weekly_report(weeks_ago: int = 0, _: dict = Depends(get_current_admin)):
    """Genera el Informe Operativo Semanal. weeks_ago: 0 = actual, 1 = pasada."""
    return await _build_weekly_report(weeks_ago)


@router.get("/monthly-finance")
async def get_monthly_finance(
    year: Optional[int] = Query(None, ge=2020, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    _: dict = Depends(get_current_admin),
):
    """
    Métricas mensuales de conciliación:
    - IVA débito / IVA crédito estimado / IVA neto a pagar (estimado)
    - Margen de contribución mensual (ingreso neto venta - costo de venta proveedor)
    """
    now = datetime.utcnow()
    y = year or now.year
    m = month or now.month
    start = datetime(y, m, 1, 0, 0, 0, 0)
    if m == 12:
        end = datetime(y + 1, 1, 1, 0, 0, 0, 0)
    else:
        end = datetime(y, m + 1, 1, 0, 0, 0, 0)

    # Conciliación sobre servicios cerrados (pagados) en el mes.
    services = await db.services.find({
        "status": "paid",
        "paid_at": {"$gte": start, "$lt": end},
    }).to_list(5000)

    sales_net = 0.0
    sales_gross = 0.0
    provider_payment_total = 0.0
    iva_debito = 0.0
    iva_credito_estimado = 0.0
    client_commission_net = 0.0
    provider_commission_net = 0.0
    paid_without_invoice_count = 0
    with_provider_invoice_count = 0

    for s in services:
        net_total = float(s.get("net_total") or 0)
        gross_total = float(s.get("gross_total") or 0)
        if gross_total <= 0 and net_total > 0:
            gross_total = round(net_total * 1.19, 0)

        service_fee = float(s.get("service_fee") or 0)
        paid_without_invoice = bool(s.get("paid_without_invoice", False))

        provider_paid = (
            float(s.get("amount_paid_to_provider"))
            if s.get("amount_paid_to_provider") is not None
            else net_total
        )

        sales_net += net_total
        sales_gross += gross_total
        provider_payment_total += provider_paid

        iva_servicio = max(0.0, gross_total - net_total)
        iva_debito += iva_servicio

        # Crédito fiscal estimado: solo cuando hay factura proveedor (no aplica pago sin factura).
        if paid_without_invoice:
            paid_without_invoice_count += 1
        else:
            has_provider_invoice = bool(s.get("invoice_number")) or bool(s.get("invoice_uploaded_at"))
            if has_provider_invoice:
                iva_credito_estimado += iva_servicio
                with_provider_invoice_count += 1

        # Igual que cálculo del dashboard (mantiene consistencia entre pantallas).
        gross_sin_iva = (gross_total / 1.19) if gross_total else 0.0
        subtotal_base = gross_sin_iva / 1.10 if gross_sin_iva else 0.0
        client_commission_net += subtotal_base * 0.10
        provider_commission_net += (service_fee / 1.19) if service_fee else 0.0

    iva_neto_a_pagar_estimado = max(0.0, iva_debito - iva_credito_estimado)
    contribution_margin = sales_net - provider_payment_total
    contribution_margin_pct = (contribution_margin / sales_net * 100.0) if sales_net > 0 else 0.0
    maqgo_operating_revenue = client_commission_net + provider_commission_net

    return {
        "periodo": {
            "year": y,
            "month": m,
            "inicio": start.isoformat(),
            "fin": end.isoformat(),
            "label": f"{y}-{m:02d}",
        },
        "volume": {
            "services_paid": len(services),
            "with_provider_invoice": with_provider_invoice_count,
            "paid_without_invoice": paid_without_invoice_count,
        },
        "sales": {
            "net": round(sales_net, 0),
            "gross": round(sales_gross, 0),
        },
        "iva": {
            "debito": round(iva_debito, 0),
            "credito_estimado": round(iva_credito_estimado, 0),
            "neto_a_pagar_estimado": round(iva_neto_a_pagar_estimado, 0),
            "warning": "Estimado contable. Validar con SII/libro compra-venta y documentos tributarios.",
        },
        "contribution": {
            "sales_net": round(sales_net, 0),
            "cost_of_sales": round(provider_payment_total, 0),
            "margin": round(contribution_margin, 0),
            "margin_pct": round(contribution_margin_pct, 2),
        },
        "maqgo_revenue": {
            "client_commission_net": round(client_commission_net, 0),
            "provider_commission_net": round(provider_commission_net, 0),
            "total_net": round(maqgo_operating_revenue, 0),
        },
        "generated_at": datetime.utcnow().isoformat(),
    }


async def generate_alerts(db, start_date, end_date, umbral_revision_h=72):
    """
    Alertas alineadas al pipeline de facturación (colección `services`).
    Sin dependencias de colecciones legacy (operators / matching).
    """
    alertas = []
    now = datetime.utcnow()

    cola_lenta = await db.services.count_documents({
        "status": "pending_review",
        "created_at": {"$lt": now - timedelta(hours=umbral_revision_h)},
    })
    if cola_lenta > 0:
        alertas.append({
            "tipo": "COLA_REVISION",
            "mensaje": f"{cola_lenta} servicio(s) con más de {umbral_revision_h}h en revisión MAQGO (revisar/aprobar).",
            "detalle": [],
        })

    disp = await db.services.count_documents({
        "status": "disputed",
        "created_at": {"$gte": start_date, "$lt": end_date},
    })
    if disp > 0:
        alertas.append({
            "tipo": "DISPUTAS",
            "mensaje": f"{disp} servicio(s) en disputa creado(s) en esta ventana.",
            "detalle": [],
        })

    start_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start_month.month == 12:
        end_month = start_month.replace(year=start_month.year + 1, month=1)
    else:
        end_month = start_month.replace(month=start_month.month + 1)
    mq_inv = await db.services.count_documents({
        "status": "paid",
        "maqgo_client_invoice_pending": {"$ne": False},
        "paid_at": {"$gte": start_month, "$lt": end_month},
    })
    if mq_inv > 0:
        alertas.append({
            "tipo": "FACTURACION_MAQGO_CLIENTE",
            "mensaje": f"{mq_inv} pago(s) donde MAQGO debe facturar al cliente (pendiente).",
            "detalle": [],
        })
    mq_inv_overdue = await db.services.count_documents({
        "status": "paid",
        "maqgo_client_invoice_pending": {"$ne": False},
        "paid_at": {"$lt": start_month},
    })
    if mq_inv_overdue > 0:
        alertas.append({
            "tipo": "FACTURACION_MAQGO_VENCIDA",
            "mensaje": f"{mq_inv_overdue} pago(s) de meses anteriores siguen sin factura cliente MAQGO.",
            "detalle": [],
        })

    inv_pend = await db.services.count_documents({"status": "invoiced"})
    if inv_pend > 0:
        alertas.append({
            "tipo": "COBROS_PROVEEDOR",
            "mensaje": f"{inv_pend} servicio(s) facturados esperando marcar pago a proveedor.",
            "detalle": [],
        })

    if not alertas:
        alertas.append({
            "tipo": "SIN_ALERTAS",
            "mensaje": "No hay alertas críticas en este snapshot.",
            "detalle": [],
        })

    return alertas


@router.get("/payments-planilla")
async def get_payments_planilla(
    format: str = Query("json", description="json o csv"),
    date: Optional[str] = Query(None, description="YYYY-MM-DD. Sin fecha = todos los pendientes"),
    _: dict = Depends(get_current_admin),
):
    """
    Planilla de pagos pendientes (status=invoiced) para conciliación financiera.
    Incluye desglose neto/IVA/bruto y visibilidad de facturación MAQGO al cliente.
    """
    query = {"status": "invoiced"}
    if date:
        try:
            d = datetime.strptime(date, "%Y-%m-%d")
            start = d.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=1)
            query["$or"] = [
                {"invoice_uploaded_at": {"$gte": start, "$lt": end}},
                {"created_at": {"$gte": start, "$lt": end}},
            ]
        except ValueError:
            date = None  # Ignorar fecha inválida

    services = await db.services.find(query).sort("created_at", -1).to_list(500)
    rows = []
    provider_ids = list(set(s.get("provider_id") for s in services if s.get("provider_id")))
    providers = {}
    if provider_ids:
        for u in await db.users.find({"id": {"$in": provider_ids}}, {"id": 1, "name": 1, "email": 1, "phone": 1}).to_list(100):
            providers[u["id"]] = u

    for s in services:
        prov = providers.get(s.get("provider_id", ""), {})
        net_amount = float(s.get("net_total") or 0)
        service_fee = float(s.get("service_fee") or 0)
        gross_total = float(s.get("gross_total") or 0)
        # Si el backend viejo no trae gross_total, lo reconstruimos desde neto.
        if gross_total <= 0 and net_amount > 0:
            gross_total = round(net_amount * 1.19, 0)
        iva_amount = max(0.0, round(gross_total - net_amount, 0))
        maqgo_invoice_pending = bool(s.get("maqgo_client_invoice_pending", False))
        paid_without_invoice = bool(s.get("paid_without_invoice", False))
        retention_amount = float(s.get("retention_amount") or 0)
        amount_paid_to_provider = (
            float(s.get("amount_paid_to_provider"))
            if s.get("amount_paid_to_provider") is not None
            else net_amount
        )
        rows.append({
            "id": str(s.get("_id", s.get("id", ""))),
            "fecha_creacion": s.get("created_at", ""),
            "fecha_factura": s.get("invoice_uploaded_at", ""),
            "fecha_servicio": s.get("service_date", ""),
            "proveedor": prov.get("name", "–"),
            "proveedor_email": prov.get("email", "–"),
            "proveedor_telefono": prov.get("phone", "–"),
            "cliente": s.get("client_name", "–"),
            "maquinaria": s.get("machinery_type", "–"),
            "horas": s.get("hours", 0),
            "monto_neto": round(net_amount, 0),
            "monto_iva": iva_amount,
            "monto_bruto": round(gross_total, 0),
            "comision_maqgo_proveedor": round(service_fee, 0),
            "monto_pago_proveedor": round(amount_paid_to_provider, 0),
            "pagado_sin_factura": "SI" if paid_without_invoice else "NO",
            "retencion_iva_sin_factura": round(retention_amount, 0) if paid_without_invoice else 0,
            "n_factura": s.get("invoice_number", "–"),
            "maqgo_facturo_cliente": "NO" if maqgo_invoice_pending else "SI",
            "fecha_factura_cliente_maqgo": s.get("maqgo_client_invoiced_at", ""),
            "estado_servicio": s.get("status", "–"),
        })

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        header = [
            "ID",
            "Estado servicio",
            "Fecha creación",
            "Fecha servicio",
            "Fecha factura proveedor",
            "Proveedor",
            "Email",
            "Teléfono",
            "Cliente",
            "Maquinaria",
            "Horas",
            "Monto neto (CLP)",
            "IVA 19% (CLP)",
            "Monto bruto cliente (CLP)",
            "Comisión MAQGO proveedor (CLP)",
            "Monto a pagar proveedor (CLP)",
            "Pagado sin factura",
            "Retención IVA sin factura (CLP)",
            "Nº factura proveedor",
            "MAQGO facturó cliente",
            "Fecha factura cliente MAQGO",
        ]
        writer.writerow(header)
        for r in rows:
            writer.writerow([
                r["id"],
                r["estado_servicio"],
                str(r["fecha_creacion"])[:19] if r["fecha_creacion"] else "",
                str(r["fecha_servicio"])[:19] if r["fecha_servicio"] else "",
                str(r["fecha_factura"])[:19] if r["fecha_factura"] else "",
                r["proveedor"],
                r["proveedor_email"],
                r["proveedor_telefono"],
                r["cliente"],
                r["maquinaria"],
                r["horas"],
                r["monto_neto"],
                r["monto_iva"],
                r["monto_bruto"],
                r["comision_maqgo_proveedor"],
                r["monto_pago_proveedor"],
                r["pagado_sin_factura"],
                r["retencion_iva_sin_factura"],
                r["n_factura"],
                r["maqgo_facturo_cliente"],
                str(r["fecha_factura_cliente_maqgo"])[:19] if r["fecha_factura_cliente_maqgo"] else "",
            ])
        output.seek(0)
        filename = f"maqgo_planilla_pagos_{date or datetime.now().strftime('%Y-%m-%d')}.csv"
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    return {
        "rows": rows,
        "total": len(rows),
        "total_neto": sum(r["monto_neto"] for r in rows),
        "total_iva": sum(r["monto_iva"] for r in rows),
        "total_bruto": sum(r["monto_bruto"] for r in rows),
        "total_pago_proveedor": sum(r["monto_pago_proveedor"] for r in rows),
    }


@router.post("/weekly/send-email")
async def send_weekly_report_email(email: str = None, _: dict = Depends(get_current_admin)):
    """Envía el informe semanal por email"""
    report = await _build_weekly_report(weeks_ago=0)
    
    # Formatear como texto
    texto = format_report_as_text(report)
    
    # TODO: Integrar con Resend cuando esté activo
    # Por ahora retornamos el texto formateado
    
    return {
        "status": "pending_email_integration",
        "mensaje": "Informe generado. Integración de email pendiente.",
        "informe_texto": texto
    }


def format_report_as_text(report: dict) -> str:
    """Formatea el informe como texto plano (pipeline facturación MAQGO)."""
    r = report["resumen"]
    pe = r.get("por_estado") or {}
    lab = r.get("etiquetas_estado") or {}

    lineas_estado = ""
    for k, v in pe.items():
        if v or k == "pending_review":
            etiqueta = lab.get(k, k)
            lineas_estado += f"  • {etiqueta}: {v}\n"

    top_m = r.get("top_maquinaria") or []
    lineas_maq = ""
    for row in top_m[:5]:
        lineas_maq += f"  • {row.get('tipo', '—')}: {row.get('n', 0)}\n"
    if not lineas_maq:
        lineas_maq = "  (sin datos)\n"

    texto = f"""
═══════════════════════════════════════════════════════════════
     MAQGO - INFORME SEMANAL (pipeline facturación post-servicio)
═══════════════════════════════════════════════════════════════
{report["periodo"]["semana"]}
Generado: {report["generado_el"][:19]}

Servicios creados en la semana: {r.get("total_servicios_creados_semana", r.get("total_solicitudes", 0))}
Tiempo promedio revisión MAQGO→aprobado: {r.get("tiempo_promedio_revision_h", 0)} h
Pagados cerrados en la semana (paid_at): {r.get("servicios_pagados_cerrados_semana", 0)}
GMV pagado en la semana (CLP): {r.get("gmv_pagado_semana_clp", 0)}
Tasa cancelación (sobre creados): {r.get("tasa_cancelacion", "0%")}

Por estado (creados esta semana):
{lineas_estado}
Top maquinaria (creados esta semana):
{lineas_maq}
───────────────────────────────────────────────────────────────
                        ALERTAS
───────────────────────────────────────────────────────────────
"""

    for alerta in report["alertas"]:
        texto += f"\n⚠️  {alerta['mensaje']}\n"
        if alerta.get("detalle"):
            for d in alerta["detalle"][:5]:
                texto += f"    • {d}\n"

    texto += """
═══════════════════════════════════════════════════════════════
Alineado a estados: pending_review → approved → invoiced → paid
═══════════════════════════════════════════════════════════════
"""

    return texto
