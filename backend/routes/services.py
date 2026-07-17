"""
Rutas para gestión de servicios y facturación
Estados: pending_review → approved → invoiced → paid

RBAC:
- Dueño (owner): Ve todos los servicios con datos financieros completos
- Operador (operator): Solo ve datos operacionales (sin comisiones, facturas, etc.)
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Depends
from pydantic import BaseModel

from auth_dependency import get_current_admin_strict, get_current_user
from security.policy import AccessPolicy
from typing import Optional, List
from datetime import datetime, timedelta
from bson import ObjectId
import base64
import os
from starlette.concurrency import run_in_threadpool

from db_config import get_db_name, get_mongo_url

router = APIRouter(prefix="/services", tags=["services"])

# MongoDB connection
from pymongo import MongoClient
MONGO_URL = get_mongo_url()
DB_NAME = get_db_name()
client = MongoClient(MONGO_URL)
db = client[DB_NAME]
services_collection = db['services']
service_requests_collection = db['service_requests']
users_collection = db['users']


async def _run_sync(fn, *args, **kwargs):
    return await run_in_threadpool(lambda: fn(*args, **kwargs))


async def _run_sync_call(fn):
    return await run_in_threadpool(fn)

# Admin listado paginado por fecha (evita COLLSCAN en volumen alto)
try:
    services_collection.create_index([("created_at", -1)])
except Exception:
    pass

# RBAC imports
from utils.rbac import (
    is_owner_or_master, 
    is_operator, 
    filter_service_for_operator,
    filter_services_for_role,
    has_permission,
    OPERATOR_HIDDEN_FIELDS,
    get_company_owner_id
)
from utils.invoice_precheck import (
    classify_amount_bucket,
    decode_data_url,
    normalize_invoice_number,
    precheck_invoice_bytes,
)

class ServiceCreate(BaseModel):
    provider_id: str
    client_id: str
    client_name: str
    client_billing: dict
    machinery_type: str
    hours: int
    location: str
    gross_total: float
    service_fee: float
    net_total: float
    invoice_amount: float
    invoice_total: float

class InvoiceSubmit(BaseModel):
    invoice_number: str
    invoice_image: Optional[str] = None  # Base64

class ServiceUpdate(BaseModel):
    status: str
    admin_notes: Optional[str] = None


class ProviderInvoiceApprovePayload(BaseModel):
    confirmed_total_clp: float
    note: Optional[str] = None

# Estados posibles
STATUSES = ['pending_review', 'approved', 'invoiced', 'paid', 'disputed']

@router.post("/create")
async def create_service(service: ServiceCreate, current_user: dict = Depends(get_current_user)):
    """Crear servicio al finalizar trabajo - Pago Ágil (24h)"""
    await _run_sync(AccessPolicy.assert_provider_scope_sync, db, current_user, service.provider_id)
    from pricing.business_rules import AUTO_APPROVAL_HOURS
    now = datetime.utcnow()
    result = await _run_sync(
        services_collection.insert_one,
        {
            **service.dict(),
            "status": "pending_review",
            "review_deadline": now + timedelta(hours=AUTO_APPROVAL_HOURS),
            "created_at": now,
            "updated_at": now,
            "invoice_number": None,
            "invoice_image": None,
            "paid_at": None,
            "admin_notes": None,
        },
    )
    service_id_str = str(result.inserted_id)
    # Mantener "id" igual a _id para que invoices (upload por archivo) pueda buscar por id
    await _run_sync(
        services_collection.update_one,
        {"_id": result.inserted_id},
        {"$set": {"id": service_id_str}},
    )
    return {
        "success": True,
        "service_id": service_id_str,
        "message": "Servicio registrado. Aprobación automática en 24 horas."
    }

@router.get("/provider/{provider_id}")
async def get_provider_services(
    provider_id: str,
    user_role: Optional[str] = Query(None, description="Rol del usuario: owner/operator"),
    current_user: dict = Depends(get_current_user),
):
    """
    Obtener historial de servicios del proveedor.
    
    RBAC:
    - Si user_role=operator: Solo muestra datos operacionales (sin financieros)
    - Si user_role=owner o no se especifica: Muestra todo
    """
    await _run_sync(AccessPolicy.assert_provider_scope_sync, db, current_user, provider_id)
    # Obtener usuario para determinar permisos
    user = await _run_sync(users_collection.find_one, {"id": provider_id}, {"_id": 0})
    
    # Determinar qué servicios mostrar
    query = {"provider_id": provider_id}
    
    # Si es operador, también incluir servicios donde es el operador asignado
    if user and user.get('provider_role') == 'operator':
        owner_id = user.get('owner_id')
        query = {
            "$or": [
                {"provider_id": provider_id},
                {"operator_id": provider_id},
                {"provider_id": owner_id}  # Servicios del dueño donde puede participar
            ]
        }
    
    services = await _run_sync_call(
        lambda: list(
            services_collection.find(
                query,
                {"invoice_image": 0},
            ).sort("created_at", -1)
        )
    )
    
    # Formatear documentos
    now = datetime.utcnow()
    for service in services:
        service['_id'] = str(service['_id'])
        
        # Formatear fechas
        if 'created_at' in service:
            service['created_at'] = service['created_at'].isoformat()
        if 'review_deadline' in service:
            service['review_deadline'] = service['review_deadline'].isoformat()
        if 'updated_at' in service:
            service['updated_at'] = service['updated_at'].isoformat()
    
    # Aplicar filtro RBAC si es operador
    if user_role == 'operator' or (user and user.get('provider_role') == 'operator'):
        # Crear usuario mock para filtrado si no existe
        mock_user = user or {'provider_role': 'operator'}
        services = filter_services_for_role(services, mock_user)
    
    return {"services": services}

@router.post("/{service_id}/invoice")
async def submit_invoice(
    service_id: str,
    invoice: InvoiceSubmit,
    current_user: dict = Depends(get_current_user),
):
    """Proveedor sube factura"""
    if not await _run_sync(AccessPolicy.can_access_service_sync, db, current_user, service_id):
        raise HTTPException(status_code=403, detail="No autorizado para este servicio")
    service = await _run_sync(services_collection.find_one, {"_id": ObjectId(service_id)})
    
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    
    if service['status'] != 'approved':
        raise HTTPException(status_code=400, detail="El servicio no está aprobado para facturar")
    
    now = datetime.utcnow()
    invoice_number = normalize_invoice_number(invoice.invoice_number)
    if not invoice_number:
        raise HTTPException(status_code=400, detail="Número de factura inválido.")
    if not invoice.invoice_image:
        raise HTTPException(status_code=400, detail="Debes adjuntar PDF o foto de la factura.")

    try:
        data_mime, raw_bytes = decode_data_url(invoice.invoice_image)
        precheck = precheck_invoice_bytes(file_bytes=raw_bytes, filename=None, content_type=data_mime)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    expected_total = 0.0
    try:
        expected_total = float(service.get("net_total") or 0)
    except Exception:
        expected_total = 0.0
    amount_bucket = classify_amount_bucket(expected_total)

    invoice_image_value = invoice.invoice_image
    if isinstance(invoice_image_value, str) and not invoice_image_value.strip().startswith("data:"):
        invoice_image_value = f"data:{precheck.get('file_mime')};base64,{invoice_image_value.strip()}"

    update_data = {
        "status": "invoiced",
        "invoice_number": invoice_number,
        "invoice_uploaded_at": now,
        "updated_at": now,
        "provider_invoice_expected_total_clp": float(expected_total or 0),
        "provider_invoice_total_detected_clp": float(expected_total or 0),
        "provider_invoice_total_confirmed_clp": None,
        "provider_invoice_approved": False,
        "provider_invoice_reviewed_at": None,
        "provider_invoice_reviewed_by": None,
        "provider_invoice_precheck_status": precheck.get("status"),
        "provider_invoice_precheck_reasons": precheck.get("reasons") or [],
        "provider_invoice_file_kind": precheck.get("file_kind"),
        "provider_invoice_file_mime": precheck.get("file_mime"),
        "provider_invoice_file_size_bytes": precheck.get("file_size_bytes"),
        "provider_invoice_image_width": precheck.get("image_width"),
        "provider_invoice_image_height": precheck.get("image_height"),
        "provider_invoice_amount_bucket": amount_bucket,
        "provider_invoice_amount_bucket_source": "expected",
        "provider_invoice_uploaded_via": "services_json",
    }
    
    update_data["invoice_image"] = invoice_image_value
    
    await _run_sync(
        services_collection.update_one,
        {"_id": ObjectId(service_id)},
        {"$set": update_data},
    )
    
    return {
        "success": True,
        "message": "Factura registrada. Queda pendiente de revisión MAQGO para programar pago."
    }

@router.get("/{service_id}")
async def get_service(service_id: str, current_user: dict = Depends(get_current_user)):
    """Obtener detalle de un servicio"""
    if not await _run_sync(AccessPolicy.can_access_service_sync, db, current_user, service_id):
        raise HTTPException(status_code=403, detail="No autorizado para este servicio")
    service = await _run_sync(services_collection.find_one, {"_id": ObjectId(service_id)})
    
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    
    service['_id'] = str(service['_id'])
    if 'created_at' in service:
        service['created_at'] = service['created_at'].isoformat()
    if 'review_deadline' in service:
        service['review_deadline'] = service['review_deadline'].isoformat()
    
    return service

# ========== ADMIN ENDPOINTS ==========

def _admin_list_filter(status: Optional[str]) -> dict:
    """Filtro Mongo para listado admin. `maqgo_to_invoice` alinea con el dashboard (paid y pending factura MAQGO)."""
    s = (status or "all").strip().lower()
    if s in ("", "all"):
        return {}
    if s == "maqgo_to_invoice":
        now = datetime.utcnow()
        start_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if start_this_month.month == 12:
            end_this_month = start_this_month.replace(year=start_this_month.year + 1, month=1)
        else:
            end_this_month = start_this_month.replace(month=start_this_month.month + 1)
        return {
            "status": "paid",
            "maqgo_client_invoice_pending": {"$ne": False},
            "paid_at": {"$gte": start_this_month, "$lt": end_this_month},
        }
    if s == "maqgo_to_invoice_overdue":
        now = datetime.utcnow()
        start_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return {
            "status": "paid",
            "maqgo_client_invoice_pending": {"$ne": False},
            "paid_at": {"$lt": start_this_month},
        }
    if s in STATUSES:
        return {"status": s}
    raise HTTPException(
        status_code=400,
        detail=f"status inválido. Usar: all, {', '.join(STATUSES)}, maqgo_to_invoice, maqgo_to_invoice_overdue",
    )


def _admin_compute_stats() -> dict:
    """Conteos globales sin cargar todos los documentos."""
    total = services_collection.count_documents({})
    now = datetime.utcnow()
    start_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start_this_month.month == 12:
        end_this_month = start_this_month.replace(year=start_this_month.year + 1, month=1)
    else:
        end_this_month = start_this_month.replace(month=start_this_month.month + 1)
    return {
        "pending_review": services_collection.count_documents({"status": "pending_review"}),
        "approved": services_collection.count_documents({"status": "approved"}),
        "invoiced": services_collection.count_documents({"status": "invoiced"}),
        "paid": services_collection.count_documents({"status": "paid"}),
        "disputed": services_collection.count_documents({"status": "disputed"}),
        "maqgo_to_invoice": services_collection.count_documents(
            {
                "status": "paid",
                "maqgo_client_invoice_pending": {"$ne": False},
                "paid_at": {"$gte": start_this_month, "$lt": end_this_month},
            }
        ),
        "maqgo_to_invoice_overdue": services_collection.count_documents(
            {
                "status": "paid",
                "maqgo_client_invoice_pending": {"$ne": False},
                "paid_at": {"$lt": start_this_month},
            }
        ),
        "total": total,
    }


def _admin_compute_finances() -> dict:
    """
    Misma lógica que AdminDashboard.calculateFinances (frontend): solo approved/invoiced/paid para montos;
    completed = nº paid; cancelled / disputed por conteo.
    """
    total_gross = total_net = client_comm = provider_comm = 0.0
    cur = services_collection.find(
        {"status": {"$in": ["approved", "invoiced", "paid"]}},
        {"gross_total": 1, "service_fee": 1},
    )
    for doc in cur:
        g = float(doc.get("gross_total") or 0)
        total_gross += g
        gross_sin_iva = g / 1.19
        total_net += gross_sin_iva
        subtotal_base = gross_sin_iva / 1.10
        client_comm += subtotal_base * 0.10
        provider_comm += float(doc.get("service_fee") or 0) / 1.19

    completed = services_collection.count_documents({"status": "paid"})
    cancelled = services_collection.count_documents({"status": "cancelled"})
    disputed_n = services_collection.count_documents({"status": "disputed"})
    return {
        "totalGross": round(total_gross),
        "totalNet": round(total_net),
        "clientCommission": round(client_comm),
        "providerCommission": round(provider_comm),
        "totalCommission": round(client_comm + provider_comm),
        "completed": completed,
        "cancelled": cancelled,
        "disputed": disputed_n,
    }


def _utc_now_naive():
    return datetime.utcnow()


def _age_hours(ref, now):
    """Horas desde ref hasta now (Mongo datetime naive o aware)."""
    if ref is None:
        return None
    if getattr(ref, "tzinfo", None) is not None:
        ref = ref.replace(tzinfo=None)
    try:
        return max(0.0, (now - ref).total_seconds() / 3600.0)
    except Exception:
        return None


def _has_provider_invoice_evidence(service: dict) -> bool:
    s = service or {}
    if s.get("invoiceStatus") == "validated":
        return True
    if s.get("invoice_uploaded_at"):
        return True
    if s.get("invoice_number"):
        return True
    if s.get("invoiceFilename"):
        return True
    if s.get("invoice_image"):
        return True
    return False


def _admin_compute_sla_metrics() -> dict:
    """
    Colas del pipeline de facturación (post-servicio): tiempos de espera actuales.
    """
    now = _utc_now_naive()
    pending_ages = []
    for doc in services_collection.find({"status": "pending_review"}, {"created_at": 1}):
        h = _age_hours(doc.get("created_at"), now)
        if h is not None:
            pending_ages.append(h)

    approved_ages = []
    for doc in services_collection.find({"status": "approved"}, {"created_at": 1, "approved_at": 1}):
        ref = doc.get("approved_at") or doc.get("created_at")
        h = _age_hours(ref, now)
        if h is not None:
            approved_ages.append(h)

    invoiced_ages = []
    for doc in services_collection.find({"status": "invoiced"}, {"created_at": 1, "invoice_uploaded_at": 1}):
        ref = doc.get("invoice_uploaded_at") or doc.get("created_at")
        h = _age_hours(ref, now)
        if h is not None:
            invoiced_ages.append(h)

    def _avg(arr):
        return round(sum(arr) / len(arr), 1) if arr else 0.0

    def _mx(arr):
        return round(max(arr), 1) if arr else 0.0

    return {
        "revision_horas_promedio": _avg(pending_ages),
        "revision_horas_max": _mx(pending_ages),
        "en_revision": len(pending_ages),
        "aprobado_sin_factura_h_promedio": _avg(approved_ages),
        "aprobado_sin_facturar": len(approved_ages),
        "facturado_sin_pago_h_promedio": _avg(invoiced_ages),
        "facturados_sin_pago": len(invoiced_ages),
    }


def _admin_week_over_week() -> dict:
    """Comparación simple: semana calendario actual vs anterior (UTC)."""
    now = _utc_now_naive()
    weekday = now.weekday()
    start_this = (now - timedelta(days=weekday)).replace(hour=0, minute=0, second=0, microsecond=0)
    end_this = start_this + timedelta(days=7)
    start_prev = start_this - timedelta(days=7)
    end_prev = start_this

    creados_esta = services_collection.count_documents(
        {"created_at": {"$gte": start_this, "$lt": end_this}}
    )
    creados_ant = services_collection.count_documents(
        {"created_at": {"$gte": start_prev, "$lt": end_prev}}
    )
    pagados_esta = services_collection.count_documents(
        {"status": "paid", "paid_at": {"$gte": start_this, "$lt": end_this}}
    )
    pagados_ant = services_collection.count_documents(
        {"status": "paid", "paid_at": {"$gte": start_prev, "$lt": end_prev}}
    )

    return {
        "ventana_esta_semana": {"inicio": start_this.isoformat(), "fin": end_this.isoformat()},
        "creados_esta_semana": creados_esta,
        "creados_semana_anterior": creados_ant,
        "delta_creados": creados_esta - creados_ant,
        "pagados_esta_semana": pagados_esta,
        "pagados_semana_anterior": pagados_ant,
        "delta_pagados": pagados_esta - pagados_ant,
    }


@router.get("/admin/investor-snapshot")
async def get_investor_snapshot(_: dict = Depends(get_current_admin_strict)):
    """
    Resumen único para pitch / data room interno: usuarios, volumen, economía unitaria y ritmo semanal.
    Misma base de datos y lógica de finanzas que el dashboard admin.
    """
    finances = await _run_sync_call(_admin_compute_finances)
    stats = await _run_sync_call(_admin_compute_stats)
    wow = await _run_sync_call(_admin_week_over_week)
    total_clients = await _run_sync(
        users_collection.count_documents,
        {"$or": [{"role": "client"}, {"roles": "client"}]},
    )
    total_providers = await _run_sync(
        users_collection.count_documents,
        {"$or": [{"role": "provider"}, {"roles": "provider"}]},
    )
    tn = float(finances.get("totalNet") or 0)
    tc = float(finances.get("totalCommission") or 0)
    take_rate = round(100.0 * tc / tn, 2) if tn > 0 else None
    return {
        "finances": finances,
        "pipeline": stats,
        "growth_week": wow,
        "users": {"clientes": total_clients, "proveedores": total_providers},
        "unit_economics": {
            "take_rate_pct_sobre_ventas_netas": take_rate,
            "nota": "Comisión MAQGO total / ventas netas sin IVA (histórico acumulado, servicios approved+).",
        },
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/admin/all")
async def get_all_services(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(
        None,
        description="Filtro de listado: all | pending_review | approved | invoiced | paid | disputed | maqgo_to_invoice",
    ),
    _: dict = Depends(get_current_admin_strict),
):
    """
    Dashboard MAQGO: stats y finanzas globales; listado paginado según `status`.
    Evita cargar toda la colección en memoria ni enviar megabytes al front.
    """
    list_filter = _admin_list_filter(status)
    total_for_filter = await _run_sync(services_collection.count_documents, list_filter)

    stats = await _run_sync_call(_admin_compute_stats)
    finances = await _run_sync_call(_admin_compute_finances)
    sla = await _run_sync_call(_admin_compute_sla_metrics)
    week_comparison = await _run_sync_call(_admin_week_over_week)

    services = await _run_sync_call(
        lambda: list(
            services_collection.find(list_filter, {"invoice_image": 0})
            .sort("created_at", -1)
            .skip(offset)
            .limit(limit)
        )
    )

    for service in services:
        service["_id"] = str(service["_id"])
        if "created_at" in service:
            service["created_at"] = service["created_at"].isoformat()
        if "review_deadline" in service:
            service["review_deadline"] = service["review_deadline"].isoformat()

    return {
        "services": services,
        "stats": stats,
        "finances": finances,
        "sla": sla,
        "week_comparison": week_comparison,
        "total": total_for_filter,
        "limit": limit,
        "offset": offset,
    }

@router.put("/admin/{service_id}")
async def update_service_status(service_id: str, update: ServiceUpdate, _: dict = Depends(get_current_admin_strict)):
    """Admin: actualizar estado de servicio"""
    if update.status not in STATUSES:
        raise HTTPException(status_code=400, detail=f"Estado inválido. Usar: {STATUSES}")
    
    # Obtener servicio actual para notificaciones
    current_service = await _run_sync(services_collection.find_one, {"_id": ObjectId(service_id)})
    if not current_service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    
    update_data = {
        "status": update.status,
        "updated_at": datetime.utcnow()
    }
    
    if update.admin_notes:
        update_data["admin_notes"] = update.admin_notes
    
    if update.status == 'approved':
        update_data["approved_at"] = datetime.utcnow()
    
    if update.status == 'paid':
        if current_service.get("status") != "invoiced":
            raise HTTPException(
                status_code=400,
                detail="No se puede marcar pagado si el servicio no está en estado 'invoiced' (factura proveedor subida).",
            )
        if not _has_provider_invoice_evidence(current_service):
            raise HTTPException(
                status_code=400,
                detail="No se puede marcar pagado sin evidencia de factura proveedor. Debe estar subida y revisada por MAQGO.",
            )
        if current_service.get("provider_invoice_approved") is not True:
            raise HTTPException(
                status_code=400,
                detail="No se puede marcar pagado sin aprobar la factura proveedor (revisión MAQGO).",
            )
        update_data["paid_at"] = datetime.utcnow()
        # MAQGO debe facturar el total al cliente dentro del mes
        update_data["maqgo_client_invoice_pending"] = True
    
    result = await _run_sync(
        services_collection.update_one,
        {"_id": ObjectId(service_id)},
        {"$set": update_data},
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    
    # GATILLOS DE NOTIFICACIÓN
    if current_service and result.modified_count > 0:
        try:
            from communications import (
                notify_service_approved_for_invoice,
                notify_payment_sent
            )
            
            # Cuando se aprueba → Notificar para facturar a MAQGO (neto, menos tarifa)
            if update.status == 'approved' and current_service.get('status') == 'pending_review':
                net_amount = current_service.get('net_total', 0)
                provider_id = current_service.get('provider_id') or current_service.get('owner_id')
                provider_phone = None
                if provider_id:
                    provider = await _run_sync(users_collection.find_one, {"id": provider_id}, {"phone": 1, "owner_id": 1})
                    if provider:
                        if provider.get('owner_id'):
                            owner = await _run_sync(users_collection.find_one, {"id": provider["owner_id"]}, {"phone": 1})
                            provider_phone = owner.get('phone') if owner else provider.get('phone')
                        else:
                            provider_phone = provider.get('phone')
                if provider_phone:
                    try:
                        notify_service_approved_for_invoice(
                            provider_phone,
                            str(int(net_amount)) if net_amount else "0"
                        )
                    except Exception as notify_err:
                        import logging
                        logging.warning(f"Notificación aprobado/factura no enviada: {notify_err}")
            
            # Cuando se paga → Notificar pago realizado
            if update.status == 'paid' and current_service.get('status') == 'invoiced':
                invoice_number = current_service.get('invoice_number', 'N/A')
                net_amount = current_service.get('net_total', 0)
                provider_id = current_service.get('provider_id') or current_service.get('owner_id')
                provider_phone = None
                if provider_id:
                    provider = await _run_sync(users_collection.find_one, {"id": provider_id}, {"phone": 1, "owner_id": 1})
                    if provider:
                        if provider.get('owner_id'):
                            owner = await _run_sync(users_collection.find_one, {"id": provider["owner_id"]}, {"phone": 1})
                            provider_phone = owner.get('phone') if owner else provider.get('phone')
                        else:
                            provider_phone = provider.get('phone')
                if provider_phone:
                    try:
                        notify_payment_sent(
                            provider_phone,
                            str(invoice_number),
                            str(int(net_amount)) if net_amount else "0"
                        )
                    except Exception as notify_err:
                        import logging
                        logging.warning(f"Notificación pago enviado no enviada: {notify_err}")
                
        except Exception as e:
            import logging
            logging.error(f"Error en gatillo de notificación: {e}")
    
    return {"success": True, "message": f"Estado actualizado a {update.status}"}


@router.patch("/admin/{service_id}/pay-without-invoice")
async def pay_without_invoice(service_id: str, _: dict = Depends(get_current_admin_strict)):
    """
    Admin: Pagar al proveedor sin factura (Opción B - Retención IVA).
    MAQGO retiene el IVA (19%) que el proveedor no facturó para cubrir la diferencia fiscal.
    Proveedor recibe: net_total * 0.81 (neto sin IVA).
    Solo aplicable cuando status es 'approved' (proveedor no subió factura).
    """
    allow = str(os.environ.get("MAQGO_ALLOW_PAY_WITHOUT_INVOICE", "") or "").strip().lower() in ("1", "true", "yes", "y", "on")
    if not allow:
        raise HTTPException(status_code=400, detail="Pago sin factura deshabilitado por regla de negocio MAQGO.")
    service = await _run_sync(services_collection.find_one, {"_id": ObjectId(service_id)})
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    if service.get("status") != "approved":
        raise HTTPException(
            status_code=400,
            detail="Solo se puede pagar sin factura cuando el servicio está aprobado (proveedor no subió factura)"
        )
    net_total = service.get("net_total", 0)
    retention_amount = round(net_total * 0.19, 0)
    amount_paid_to_provider = round(net_total - retention_amount, 0)
    now = datetime.utcnow()
    result = await _run_sync(
        services_collection.update_one,
        {"_id": ObjectId(service_id)},
        {
            "$set": {
                "status": "paid",
                "paid_at": now,
                "maqgo_client_invoice_pending": True,
                "paid_without_invoice": True,
                "retention_amount": retention_amount,
                "amount_paid_to_provider": amount_paid_to_provider,
                "updated_at": now,
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    import logging
    logging.info(
        f"Pago sin factura servicio {service_id}: retención IVA ${retention_amount}, "
        f"pagado a proveedor ${amount_paid_to_provider}"
    )
    return {
        "success": True,
        "message": f"Pagado sin factura. Retención IVA: ${retention_amount:,.0f}. Proveedor recibe: ${amount_paid_to_provider:,.0f}",
        "retention_amount": retention_amount,
        "amount_paid_to_provider": amount_paid_to_provider,
    }


@router.patch("/admin/{service_id}/client-invoiced")
async def mark_client_invoiced(service_id: str, _: dict = Depends(get_current_admin_strict)):
    """
    Admin: Marcar que MAQGO ya facturó el total al cliente.
    Se usa cuando el servicio está pagado y MAQGO emitió la factura al cliente dentro del mes.
    """
    now = datetime.utcnow()
    result = await _run_sync(
        services_collection.update_one,
        {"_id": ObjectId(service_id)},
        {
            "$set": {
                "maqgo_client_invoice_pending": False,
                "maqgo_client_invoiced_at": now,
                "updated_at": now,
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return {"success": True, "message": "Cliente facturado por MAQGO"}


@router.get("/admin/{service_id}/invoice-image")
async def get_invoice_image(service_id: str, _: dict = Depends(get_current_admin_strict)):
    """Admin: obtener imagen de factura"""
    service = await _run_sync(
        services_collection.find_one,
        {"_id": ObjectId(service_id)},
        {"invoice_image": 1},
    )
    
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    
    return {"invoice_image": service.get('invoice_image')}


@router.patch("/admin/{service_id}/provider-invoice/approve")
async def approve_provider_invoice(
    service_id: str,
    body: ProviderInvoiceApprovePayload,
    admin: dict = Depends(get_current_admin_strict),
):
    service = await _run_sync(services_collection.find_one, {"_id": ObjectId(service_id)})
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    if service.get("status") != "invoiced":
        raise HTTPException(status_code=400, detail="Solo se puede aprobar la factura cuando el servicio está en estado 'invoiced'.")
    if not _has_provider_invoice_evidence(service):
        raise HTTPException(status_code=400, detail="No hay evidencia de factura proveedor para aprobar.")

    try:
        confirmed = float(body.confirmed_total_clp or 0)
    except Exception:
        confirmed = 0.0
    if confirmed <= 0:
        raise HTTPException(status_code=400, detail="Monto confirmado inválido.")

    expected = service.get("provider_invoice_expected_total_clp")
    if expected is None:
        expected = service.get("net_total")
    try:
        expected = float(expected or 0)
    except Exception:
        expected = 0.0

    update = {
        "provider_invoice_expected_total_clp": float(expected or confirmed or 0),
        "provider_invoice_total_confirmed_clp": float(confirmed),
        "provider_invoice_approved": True,
        "provider_invoice_reviewed_at": datetime.utcnow(),
        "provider_invoice_reviewed_by": str(admin.get("id") or admin.get("email") or "admin"),
        "updated_at": datetime.utcnow(),
    }
    if body.note:
        update["provider_invoice_review_note"] = str(body.note)[:400]

    await _run_sync(
        services_collection.update_one,
        {"_id": ObjectId(service_id)},
        {"$set": update},
    )
    return {"success": True, "message": "Factura proveedor aprobada por MAQGO."}


@router.get("/admin/audit/payment-rule")
async def audit_payment_rule(
    year: Optional[int] = Query(None, ge=2020, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    limit: int = Query(50, ge=0, le=200),
    _: dict = Depends(get_current_admin_strict),
):
    now = datetime.utcnow()
    y = int(year or now.year)
    m = int(month or now.month)
    start = datetime(y, m, 1, 0, 0, 0, 0)
    if m == 12:
        end = datetime(y + 1, 1, 1, 0, 0, 0, 0)
    else:
        end = datetime(y, m + 1, 1, 0, 0, 0, 0)

    base_paid = {"status": "paid", "paid_at": {"$gte": start, "$lt": end}}
    evidence_or = [
        {"invoiceStatus": "validated"},
        {"invoice_uploaded_at": {"$exists": True, "$ne": None}},
        {"invoice_number": {"$exists": True, "$ne": None}},
        {"invoiceFilename": {"$exists": True, "$ne": ""}},
        {"invoice_image": {"$exists": True, "$nin": [None, ""]}},
    ]

    paid_total = await _run_sync(services_collection.count_documents, base_paid)
    paid_without_invoice_total = await _run_sync(
        services_collection.count_documents,
        {**base_paid, "paid_without_invoice": True},
    )
    paid_with_invoice_evidence_total = await _run_sync(
        services_collection.count_documents,
        {**base_paid, "paid_without_invoice": {"$ne": True}, "$or": evidence_or},
    )
    paid_missing_invoice_evidence_total = max(0, int(paid_total) - int(paid_without_invoice_total) - int(paid_with_invoice_evidence_total))
    paid_missing_invoice_approval_total = await _run_sync(
        services_collection.count_documents,
        {**base_paid, "provider_invoice_approved": {"$ne": True}},
    )

    amount_override_filter = {
        **base_paid,
        "paid_without_invoice": {"$ne": True},
        "$expr": {"$and": [{"$ne": ["$amount_paid_to_provider", None]}, {"$ne": ["$amount_paid_to_provider", "$net_total"]}]},
    }
    amount_override_total = await _run_sync(services_collection.count_documents, amount_override_filter)

    lim_i = int(limit or 0)
    violations_missing_evidence = await _run_sync_call(
        lambda: [
            str(x.get("_id"))
            for x in services_collection.find(
                {**base_paid, "paid_without_invoice": {"$ne": True}, "$nor": evidence_or},
                {"_id": 1},
            ).limit(lim_i)
        ]
    )
    violations_paid_without_invoice = await _run_sync_call(
        lambda: [
            str(x.get("_id"))
            for x in services_collection.find(
                {**base_paid, "paid_without_invoice": True},
                {"_id": 1},
            ).limit(lim_i)
        ]
    )
    violations_amount_override = await _run_sync_call(
        lambda: [
            str(x.get("_id"))
            for x in services_collection.find(
                amount_override_filter,
                {"_id": 1},
            ).limit(lim_i)
        ]
    )
    violations_missing_approval = await _run_sync_call(
        lambda: [
            str(x.get("_id"))
            for x in services_collection.find(
                {**base_paid, "provider_invoice_approved": {"$ne": True}},
                {"_id": 1},
            ).limit(lim_i)
        ]
    )

    return {
        "periodo": {"year": y, "month": m, "inicio": start.isoformat(), "fin": end.isoformat()},
        "paid_total": paid_total,
        "paid_with_invoice_evidence_total": paid_with_invoice_evidence_total,
        "paid_missing_invoice_evidence_total": paid_missing_invoice_evidence_total,
        "paid_without_invoice_total": paid_without_invoice_total,
        "paid_missing_invoice_approval_total": paid_missing_invoice_approval_total,
        "paid_amount_override_total": amount_override_total,
        "examples": {
            "paid_missing_invoice_evidence": violations_missing_evidence,
            "paid_without_invoice": violations_paid_without_invoice,
            "paid_missing_invoice_approval": violations_missing_approval,
            "paid_amount_override": violations_amount_override,
        },
    }


@router.get("/provider/{provider_id}/summary")
async def get_provider_summary(
    provider_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Generar resumen de ganancias para el proveedor.
    Útil para el resumen semanal.
    """
    await _run_sync(AccessPolicy.assert_provider_scope_sync, db, current_user, provider_id)
    from datetime import datetime, timedelta
    
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Todos los servicios del proveedor
    all_services = await _run_sync_call(lambda: list(services_collection.find({"provider_id": provider_id})))
    
    def _amount_received(s):
        """Monto que efectivamente recibe el proveedor (con retención si pagado sin factura)."""
        if s.get('paid_without_invoice') and s.get('amount_paid_to_provider') is not None:
            return s['amount_paid_to_provider']
        return s.get('net_total', 0)

    # Servicios pagados esta semana
    weekly_paid = [s for s in all_services 
                   if s.get('status') == 'paid' 
                   and s.get('paid_at') and s.get('paid_at') >= week_ago]
    weekly_earned = sum(_amount_received(s) for s in weekly_paid)
    
    # Servicios pagados este mes
    monthly_paid = [s for s in all_services 
                    if s.get('status') == 'paid' 
                    and s.get('paid_at') and s.get('paid_at') >= month_start]
    monthly_earned = sum(_amount_received(s) for s in monthly_paid)
    
    # Pendientes
    to_invoice = len([s for s in all_services if s.get('status') == 'approved'])
    to_collect = len([s for s in all_services if s.get('status') == 'invoiced'])
    
    # Total servicios completados (pagados)
    total_paid = len([s for s in all_services if s.get('status') == 'paid'])
    
    return {
        "provider_id": provider_id,
        "weekly_earned": weekly_earned,
        "monthly_earned": monthly_earned,
        "services_completed": total_paid,
        "to_invoice": to_invoice,
        "to_collect": to_collect,
        "generated_at": now.isoformat()
    }


# ========== RBAC ENDPOINTS ==========

@router.get("/operator/{operator_id}/available")
async def get_available_services_for_operator(
    operator_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Servicios disponibles para que un operador acepte.
    Usa service_requests: solicitudes confirmadas del dueño (providerId = owner_id)
    que aún no tienen operador asignado.
    """
    AccessPolicy.assert_self_or_admin(current_user, operator_id)
    operator = await _run_sync(users_collection.find_one, {"id": operator_id}, {"_id": 0})
    if not operator:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    if operator.get('provider_role') != 'operator':
        raise HTTPException(status_code=400, detail="El usuario no es un operador")
    owner_id = operator.get('owner_id')
    if not owner_id:
        raise HTTPException(status_code=400, detail="Operador sin Titular asignado")

    # service_requests confirmados del dueño sin operador asignado
    pending = await _run_sync_call(
        lambda: list(
            service_requests_collection.find(
                {
                    "providerId": owner_id,
                    "status": "confirmed",
                    "$or": [{"operator_id": {"$exists": False}}, {"operator_id": None}],
                },
                {"_id": 0, "id": 1, "clientName": 1, "clientId": 1, "location": 1, "machineryType": 1, "status": 1, "totalAmount": 1},
            ).sort("offerSentAt", -1)
        )
    )
    for s in pending:
        if isinstance(s.get("location"), dict):
            s["location"] = s["location"].get("address") or str(s["location"])
    return {"services": pending, "count": len(pending)}


@router.post("/operator/{operator_id}/accept/{service_id}")
async def operator_accept_service(
    operator_id: str,
    service_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Operador acepta un servicio disponible (service_request confirmado del dueño).
    Asigna operator_id y registra evento en_route.
    """
    AccessPolicy.assert_self_or_admin(current_user, operator_id)
    operator = await _run_sync(users_collection.find_one, {"id": operator_id}, {"_id": 0})
    if not operator or operator.get('provider_role') != 'operator':
        raise HTTPException(status_code=403, detail="No tienes permiso para aceptar servicios")
    owner_id = operator.get('owner_id')
    if not owner_id:
        raise HTTPException(status_code=403, detail="Operador sin Titular asignado")

    # Asignar operador en service_request (id es string uuid)
    now_iso = datetime.utcnow().isoformat()
    result = await _run_sync(
        service_requests_collection.update_one,
        {
            "id": service_id,
            "providerId": owner_id,
            "status": "confirmed",
            "$or": [{"operator_id": {"$exists": False}}, {"operator_id": None}]
        },
        {
            "$set": {
                "operator_id": operator_id,
                "operator_name": operator.get("name") or operator.get("providerData", {}).get("name") or "Operador",
                "operator_assigned_at": now_iso,
            },
            "$push": {
                "events": {
                    "type": "en_route",
                    "at": now_iso,
                    "operator_id": operator_id,
                    "providerId": owner_id,
                    "source": "operator_accept_service",
                }
            },
        }
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=409,
            detail="El servicio ya fue tomado por otro operador o no está disponible"
        )
    return {
        "success": True,
        "message": f"Servicio asignado a {operator.get('name', 'Operador')}",
        "service_id": service_id
    }


@router.get("/team/{owner_id}")
async def get_team_services(
    owner_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Para el dueño: obtener todos los servicios de su equipo.
    Incluye servicios propios y de todos sus operadores.
    """
    AccessPolicy.assert_owner_scope(current_user, owner_id)
    # Verificar que es owner
    owner = await _run_sync(users_collection.find_one, {"id": owner_id}, {"_id": 0})
    
    if not owner or owner.get('provider_role') not in ['owner', None]:
        raise HTTPException(status_code=403, detail="Solo el Titular puede ver servicios del equipo")
    
    # Obtener IDs de todos los operadores
    operators = await _run_sync_call(
        lambda: list(
            users_collection.find(
                {"owner_id": owner_id, "provider_role": "operator"},
                {"id": 1, "_id": 0},
            )
        )
    )
    operator_ids = [op['id'] for op in operators]
    
    # Buscar servicios del dueño y sus operadores
    services = await _run_sync_call(
        lambda: list(
            services_collection.find(
                {"$or": [{"provider_id": owner_id}, {"operator_id": {"$in": operator_ids}}]},
                {"invoice_image": 0},
            ).sort("created_at", -1)
        )
    )
    
    # Formatear
    for service in services:
        service['_id'] = str(service['_id'])
        if 'created_at' in service:
            service['created_at'] = service['created_at'].isoformat()
        if 'review_deadline' in service:
            service['review_deadline'] = service['review_deadline'].isoformat()
    
    return {
        "services": services,
        "team_size": len(operator_ids) + 1,  # +1 por el dueño
        "operator_ids": operator_ids
    }


@router.get("/dashboard/{user_id}")
async def get_dashboard_data(
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Obtener datos del dashboard según rol.
    - Owner: métricas financieras completas
    - Operator: solo métricas operacionales
    """
    AccessPolicy.assert_self_or_admin(current_user, user_id)
    user = await _run_sync(users_collection.find_one, {"id": user_id}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    is_owner_role = is_owner_or_master(user)
    
    # Determinar qué servicios consultar
    if is_owner_role:
        # Dueño/Master ve todos los servicios de la empresa y los de sus operadores
        company_owner_id = get_company_owner_id(user)
        operators = await _run_sync_call(
            lambda: list(
                users_collection.find(
                    {"owner_id": company_owner_id, "provider_role": "operator"},
                    {"id": 1, "_id": 0},
                )
            )
        )
        operator_ids = [op['id'] for op in operators]
        
        query = {
            "$or": [
                {"provider_id": company_owner_id},
                {"operator_id": {"$in": operator_ids}}
            ]
        }
    else:
        # Operador solo ve servicios donde participó
        query = {"operator_id": user_id}
    
    services = await _run_sync_call(lambda: list(services_collection.find(query, {"invoice_image": 0})))
    
    # Calcular métricas
    total_services = len(services)
    completed = len([s for s in services if s['status'] == 'paid'])
    pending = len([s for s in services if s['status'] in ['pending_review', 'approved', 'invoiced']])
    
    response = {
        "user_id": user_id,
        "role": user.get('provider_role', 'super_master'),
        "total_services": total_services,
        "completed_services": completed,
        "pending_services": pending,
        "rating": user.get('rating', 5.0),
        "is_available": user.get('isAvailable', False)
    }
    
    # Solo agregar datos financieros para el dueño/master
    if is_owner_role:
        paid_services = [s for s in services if s['status'] == 'paid']
        to_invoice = [s for s in services if s['status'] == 'approved']
        to_collect = [s for s in services if s['status'] == 'invoiced']
        
        def _amount_received(s):
            if s.get('paid_without_invoice') and s.get('amount_paid_to_provider') is not None:
                return s['amount_paid_to_provider']
            return s.get('net_total', 0)

        response.update({
            "total_earned": sum(_amount_received(s) for s in paid_services),
            "pending_amount": sum(s.get('net_total', 0) for s in to_invoice + to_collect),
            "to_invoice_count": len(to_invoice),
            "to_collect_count": len(to_collect),
            "team_size": len(operators) + 1 if 'operators' in dir() else 1
        })
    
    return response
