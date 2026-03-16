"""
MAQGO Admin - Informe Operativo Semanal y Planilla de Pagos
"""
from fastapi import APIRouter, HTTPException, Query, Depends

from auth_dependency import get_current_admin
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta
from typing import Optional
import os
import io
import csv

router = APIRouter(prefix="/admin/reports", tags=["admin-reports"])

# MongoDB connection (alineado con services.py)
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'maqgo')]

async def _build_weekly_report(weeks_ago: int = 0):
    """Lógica interna del informe semanal (sin auth)."""
    # Calcular rango de fechas
    today = datetime.now()
    start_of_week = today - timedelta(days=today.weekday() + (weeks_ago * 7))
    start_of_week = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_week = start_of_week + timedelta(days=7)
    
    # Obtener solicitudes de la semana
    services = await db.services.find({
        "created_at": {"$gte": start_of_week, "$lt": end_of_week}
    }).to_list(None)
    
    total_solicitudes = len(services)
    
    # Calcular métricas
    aceptadas = 0
    rechazadas = 0
    sin_respuesta = 0
    canceladas = 0
    tiempos_confirmacion = []
    horas_solicitadas = 0
    horas_finales = 0
    inmediatas = 0
    inmediatas_aceptadas = 0
    
    for s in services:
        status = s.get("status", "")
        
        # Contar por estado
        if status in ["confirmed", "in_progress", "completed", "in_transit", "arrived"]:
            aceptadas += 1
        elif status == "rejected":
            rechazadas += 1
        elif status == "cancelled":
            canceladas += 1
        elif status in ["pending", "searching", "expired"]:
            sin_respuesta += 1
        
        # Tiempo de confirmación
        if s.get("confirmed_at") and s.get("created_at"):
            diff = (s["confirmed_at"] - s["created_at"]).total_seconds() / 60
            tiempos_confirmacion.append(diff)
        
        # Horas
        horas_solicitadas += s.get("hours", 0)
        horas_finales += s.get("final_hours", s.get("hours", 0))
        
        # Reserva inmediata (mismo día)
        if s.get("service_date"):
            service_date = s["service_date"]
            if isinstance(service_date, str):
                try:
                    service_date = datetime.fromisoformat(service_date.replace("Z", "+00:00"))
                except:
                    service_date = None
            
            if service_date:
                created = s.get("created_at", datetime.now())
                if service_date.date() == created.date():
                    inmediatas += 1
                    if status in ["confirmed", "in_progress", "completed", "in_transit", "arrived"]:
                        inmediatas_aceptadas += 1
    
    # Calcular promedios y tasas
    tiempo_promedio = round(sum(tiempos_confirmacion) / len(tiempos_confirmacion), 1) if tiempos_confirmacion else 0
    tasa_cancelacion = round((canceladas / total_solicitudes * 100), 1) if total_solicitudes > 0 else 0
    tasa_inmediatas = round((inmediatas_aceptadas / inmediatas * 100), 1) if inmediatas > 0 else 0
    
    # Generar alertas
    alertas = await generate_alerts(db, start_of_week, end_of_week)
    
    return {
        "periodo": {
            "inicio": start_of_week.isoformat(),
            "fin": end_of_week.isoformat(),
            "semana": f"Semana del {start_of_week.strftime('%d/%m/%Y')} al {(end_of_week - timedelta(days=1)).strftime('%d/%m/%Y')}"
        },
        "resumen": {
            "total_solicitudes": total_solicitudes,
            "tiempo_promedio_confirmacion_min": tiempo_promedio,
            "solicitudes_aceptadas": aceptadas,
            "solicitudes_rechazadas": rechazadas,
            "solicitudes_sin_respuesta": sin_respuesta,
            "solicitudes_canceladas": canceladas,
            "tasa_cancelacion": f"{tasa_cancelacion}%",
            "reservas_inmediatas": inmediatas,
            "tasa_aceptacion_inmediatas": f"{tasa_inmediatas}%"
        },
        "alertas": alertas,
        "generado_el": datetime.now().isoformat()
    }


@router.get("/weekly")
async def get_weekly_report(weeks_ago: int = 0, _: dict = Depends(get_current_admin)):
    """Genera el Informe Operativo Semanal. weeks_ago: 0 = actual, 1 = pasada."""
    return await _build_weekly_report(weeks_ago)


async def generate_alerts(db, start_date, end_date, umbral_confirmacion_min=30, umbral_no_respuesta=0.3):
    """Genera alertas operativas"""
    alertas = []
    
    # Alerta 1: Solicitudes con más de X minutos sin confirmación
    pending_services = await db.services.find({
        "created_at": {"$gte": start_date, "$lt": end_date},
        "status": {"$in": ["pending", "searching"]}
    }).to_list(None)
    
    solicitudes_lentas = []
    for s in pending_services:
        created = s.get("created_at", datetime.now())
        diff_min = (datetime.now() - created).total_seconds() / 60
        if diff_min > umbral_confirmacion_min:
            solicitudes_lentas.append({
                "id": str(s.get("_id", "")),
                "minutos_esperando": round(diff_min)
            })
    
    if solicitudes_lentas:
        alertas.append({
            "tipo": "SOLICITUDES_SIN_CONFIRMACION",
            "mensaje": f"{len(solicitudes_lentas)} solicitudes con más de {umbral_confirmacion_min} minutos sin confirmación",
            "detalle": solicitudes_lentas[:10]  # Máximo 10
        })
    
    # Alerta 2: Operadores con alta tasa de no respuesta
    operators = await db.operators.find({}).to_list(None)
    operadores_problema = []
    
    for op in operators:
        op_id = str(op.get("_id", ""))
        total_ofertas = await db.services.count_documents({
            "created_at": {"$gte": start_date, "$lt": end_date},
            "offers.operator_id": op_id
        })
        
        if total_ofertas > 0:
            no_respondidas = await db.services.count_documents({
                "created_at": {"$gte": start_date, "$lt": end_date},
                "offers": {
                    "$elemMatch": {
                        "operator_id": op_id,
                        "status": {"$in": ["expired", "timeout"]}
                    }
                }
            })
            
            tasa = no_respondidas / total_ofertas
            if tasa > umbral_no_respuesta:
                operadores_problema.append({
                    "operador": op.get("name", "Sin nombre"),
                    "telefono": op.get("phone", ""),
                    "tasa_no_respuesta": f"{round(tasa * 100)}%"
                })
    
    if operadores_problema:
        alertas.append({
            "tipo": "OPERADORES_NO_RESPUESTA",
            "mensaje": f"{len(operadores_problema)} operadores con alta tasa de no respuesta (>{umbral_no_respuesta*100}%)",
            "detalle": operadores_problema[:10]
        })
    
    # Alerta 3: Zonas/horarios con falta de oferta
    sin_cobertura = await db.services.find({
        "created_at": {"$gte": start_date, "$lt": end_date},
        "status": {"$in": ["expired", "no_providers"]}
    }).to_list(None)
    
    if sin_cobertura:
        zonas = {}
        for s in sin_cobertura:
            comuna = s.get("location", {}).get("comuna", "Desconocida")
            if comuna not in zonas:
                zonas[comuna] = 0
            zonas[comuna] += 1
        
        zonas_ordenadas = sorted(zonas.items(), key=lambda x: x[1], reverse=True)[:5]
        
        alertas.append({
            "tipo": "FALTA_OFERTA",
            "mensaje": f"{len(sin_cobertura)} solicitudes sin cobertura",
            "detalle": [{"zona": z[0], "solicitudes": z[1]} for z in zonas_ordenadas]
        })
    
    if not alertas:
        alertas.append({
            "tipo": "SIN_ALERTAS",
            "mensaje": "No hay alertas operativas esta semana",
            "detalle": []
        })
    
    return alertas


@router.get("/payments-planilla")
async def get_payments_planilla(
    format: str = Query("json", description="json o csv"),
    date: Optional[str] = Query(None, description="YYYY-MM-DD. Sin fecha = todos los pendientes"),
    _: dict = Depends(get_current_admin),
):
    """
    Planilla de pagos pendientes (servicios con factura subida, status=invoiced).
    Para descarga diaria de lo que se debe pagar a proveedores.
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
        rows.append({
            "id": str(s.get("_id", s.get("id", ""))),
            "fecha_creacion": s.get("created_at", ""),
            "fecha_factura": s.get("invoice_uploaded_at", ""),
            "proveedor": prov.get("name", "–"),
            "proveedor_email": prov.get("email", "–"),
            "proveedor_telefono": prov.get("phone", "–"),
            "cliente": s.get("client_name", "–"),
            "maquinaria": s.get("machinery_type", "–"),
            "horas": s.get("hours", 0),
            "monto_neto": s.get("net_total", 0),
            "n_factura": s.get("invoice_number", "–"),
        })

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        header = ["ID", "Fecha creación", "Fecha factura", "Proveedor", "Email", "Teléfono", "Cliente", "Maquinaria", "Horas", "Monto neto (CLP)", "Nº Factura"]
        writer.writerow(header)
        for r in rows:
            writer.writerow([
                r["id"],
                str(r["fecha_creacion"])[:19] if r["fecha_creacion"] else "",
                str(r["fecha_factura"])[:19] if r["fecha_factura"] else "",
                r["proveedor"],
                r["proveedor_email"],
                r["proveedor_telefono"],
                r["cliente"],
                r["maquinaria"],
                r["horas"],
                r["monto_neto"],
                r["n_factura"],
            ])
        output.seek(0)
        filename = f"maqgo_planilla_pagos_{date or datetime.now().strftime('%Y-%m-%d')}.csv"
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    return {"rows": rows, "total": len(rows), "total_monto": sum(r["monto_neto"] for r in rows)}


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
    """Formatea el informe como texto plano"""
    r = report["resumen"]
    
    texto = f"""
═══════════════════════════════════════════════════════════════
        MAQGO - INFORME OPERATIVO SEMANAL
═══════════════════════════════════════════════════════════════
{report["periodo"]["semana"]}
Generado: {report["generado_el"][:10]}

───────────────────────────────────────────────────────────────
                    RESUMEN DE SOLICITUDES
───────────────────────────────────────────────────────────────
Total solicitudes:              {r["total_solicitudes"]}
Tiempo promedio confirmación:   {r["tiempo_promedio_confirmacion_min"]} minutos

Aceptadas:                      {r["solicitudes_aceptadas"]}
Rechazadas:                     {r["solicitudes_rechazadas"]}
Sin respuesta:                  {r["solicitudes_sin_respuesta"]}
Canceladas:                     {r["solicitudes_canceladas"]}

Tasa de cancelación:            {r["tasa_cancelacion"]}

───────────────────────────────────────────────────────────────
                    RESERVAS INMEDIATAS
───────────────────────────────────────────────────────────────
Total reservas inmediatas:      {r["reservas_inmediatas"]}
Tasa de aceptación:             {r["tasa_aceptacion_inmediatas"]}

───────────────────────────────────────────────────────────────
                        ALERTAS
───────────────────────────────────────────────────────────────
"""
    
    for alerta in report["alertas"]:
        texto += f"\n⚠️  {alerta['mensaje']}\n"
        if alerta["detalle"]:
            for d in alerta["detalle"][:5]:
                texto += f"    • {d}\n"
    
    texto += """
═══════════════════════════════════════════════════════════════

Este informe refleja el desempeño operativo de la plataforma 
durante la semana y se utiliza para ajustes de oferta, matching 
y reglas de operación.

═══════════════════════════════════════════════════════════════
"""
    
    return texto
