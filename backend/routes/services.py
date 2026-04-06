"""
Rutas para gestión de servicios y facturación
Estados: pending_review → approved → invoiced → paid

RBAC:
- Dueño (owner): Ve todos los servicios con datos financieros completos
- Operador (operator): Solo ve datos operacionales (sin comisiones, facturas, etc.)
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Depends
from pydantic import BaseModel

from auth_dependency import get_current_admin, get_current_user
from security.policy import AccessPolicy
from typing import Optional, List
from datetime import datetime, timedelta
from bson import ObjectId
import base64

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

# Estados posibles
STATUSES = ['pending_review', 'approved', 'invoiced', 'paid', 'disputed']

@router.post("/create")
async def create_service(service: ServiceCreate, current_user: dict = Depends(get_current_user)):
    """Crear servicio al finalizar trabajo - Pago Ágil (24h)"""
    AccessPolicy.assert_provider_scope_sync(db, current_user, service.provider_id)
    from pricing.business_rules import AUTO_APPROVAL_HOURS
    result = services_collection.insert_one({
        **service.dict(),
        "status": "pending_review",
        "review_deadline": datetime.utcnow() + timedelta(hours=AUTO_APPROVAL_HOURS),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "invoice_number": None,
        "invoice_image": None,
        "paid_at": None,
        "admin_notes": None,
    })
    service_id_str = str(result.inserted_id)
    # Mantener "id" igual a _id para que invoices (upload por archivo) pueda buscar por id
    services_collection.update_one(
        {"_id": result.inserted_id},
        {"$set": {"id": service_id_str}}
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
    AccessPolicy.assert_provider_scope_sync(db, current_user, provider_id)
    # Obtener usuario para determinar permisos
    user = users_collection.find_one({"id": provider_id}, {"_id": 0})
    
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
    
    services = list(services_collection.find(
        query,
        {"invoice_image": 0}  # Excluir imagen para listar
    ).sort("created_at", -1))
    
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
    if not AccessPolicy.can_access_service_sync(db, current_user, service_id):
        raise HTTPException(status_code=403, detail="No autorizado para este servicio")
    service = services_collection.find_one({"_id": ObjectId(service_id)})
    
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    
    if service['status'] != 'approved':
        raise HTTPException(status_code=400, detail="El servicio no está aprobado para facturar")
    
    now = datetime.utcnow()
    update_data = {
        "status": "invoiced",
        "invoice_number": invoice.invoice_number,
        "invoice_uploaded_at": now,
        "updated_at": now
    }
    
    if invoice.invoice_image:
        update_data["invoice_image"] = invoice.invoice_image
    
    services_collection.update_one(
        {"_id": ObjectId(service_id)},
        {"$set": update_data}
    )
    
    return {
        "success": True,
        "message": "Factura registrada. Pago en 2 días hábiles."
    }

@router.get("/{service_id}")
async def get_service(service_id: str, current_user: dict = Depends(get_current_user)):
    """Obtener detalle de un servicio"""
    if not AccessPolicy.can_access_service_sync(db, current_user, service_id):
        raise HTTPException(status_code=403, detail="No autorizado para este servicio")
    service = services_collection.find_one({"_id": ObjectId(service_id)})
    
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
async def get_investor_snapshot(_: dict = Depends(get_current_admin)):
    """
    Resumen único para pitch / data room interno: usuarios, volumen, economía unitaria y ritmo semanal.
    Misma base de datos y lógica de finanzas que el dashboard admin.
    """
    finances = _admin_compute_finances()
    stats = _admin_compute_stats()
    wow = _admin_week_over_week()
    total_clients = users_collection.count_documents(
        {"$or": [{"role": "client"}, {"roles": "client"}]}
    )
    total_providers = users_collection.count_documents(
        {"$or": [{"role": "provider"}, {"roles": "provider"}]}
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
    _: dict = Depends(get_current_admin),
):
    """
    Dashboard MAQGO: stats y finanzas globales; listado paginado según `status`.
    Evita cargar toda la colección en memoria ni enviar megabytes al front.
    """
    list_filter = _admin_list_filter(status)
    total_for_filter = services_collection.count_documents(list_filter)

    stats = _admin_compute_stats()
    finances = _admin_compute_finances()
    sla = _admin_compute_sla_metrics()
    week_comparison = _admin_week_over_week()

    services = list(
        services_collection.find(list_filter, {"invoice_image": 0})
        .sort("created_at", -1)
        .skip(offset)
        .limit(limit)
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
async def update_service_status(service_id: str, update: ServiceUpdate, _: dict = Depends(get_current_admin)):
    """Admin: actualizar estado de servicio"""
    if update.status not in STATUSES:
        raise HTTPException(status_code=400, detail=f"Estado inválido. Usar: {STATUSES}")
    
    # Obtener servicio actual para notificaciones
    current_service = services_collection.find_one({"_id": ObjectId(service_id)})
    
    update_data = {
        "status": update.status,
        "updated_at": datetime.utcnow()
    }
    
    if update.admin_notes:
        update_data["admin_notes"] = update.admin_notes
    
    if update.status == 'approved':
        update_data["approved_at"] = datetime.utcnow()
    
    if update.status == 'paid':
        update_data["paid_at"] = datetime.utcnow()
        # MAQGO debe facturar el total al cliente dentro del mes
        update_data["maqgo_client_invoice_pending"] = True
    
    result = services_collection.update_one(
        {"_id": ObjectId(service_id)},
        {"$set": update_data}
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
                    provider = users_collection.find_one({"id": provider_id}, {"phone": 1, "owner_id": 1})
                    if provider:
                        if provider.get('owner_id'):
                            owner = users_collection.find_one({"id": provider["owner_id"]}, {"phone": 1})
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
                    provider = users_collection.find_one({"id": provider_id}, {"phone": 1, "owner_id": 1})
                    if provider:
                        if provider.get('owner_id'):
                            owner = users_collection.find_one({"id": provider["owner_id"]}, {"phone": 1})
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
async def pay_without_invoice(service_id: str, _: dict = Depends(get_current_admin)):
    """
    Admin: Pagar al proveedor sin factura (Opción B - Retención IVA).
    MAQGO retiene el IVA (19%) que el proveedor no facturó para cubrir la diferencia fiscal.
    Proveedor recibe: net_total * 0.81 (neto sin IVA).
    Solo aplicable cuando status es 'approved' (proveedor no subió factura).
    """
    service = services_collection.find_one({"_id": ObjectId(service_id)})
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
    result = services_collection.update_one(
        {"_id": ObjectId(service_id)},
        {
            "$set": {
                "status": "paid",
                "paid_at": datetime.utcnow(),
                "maqgo_client_invoice_pending": True,
                "paid_without_invoice": True,
                "retention_amount": retention_amount,
                "amount_paid_to_provider": amount_paid_to_provider,
                "updated_at": datetime.utcnow(),
            }
        }
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
async def mark_client_invoiced(service_id: str, _: dict = Depends(get_current_admin)):
    """
    Admin: Marcar que MAQGO ya facturó el total al cliente.
    Se usa cuando el servicio está pagado y MAQGO emitió la factura al cliente dentro del mes.
    """
    result = services_collection.update_one(
        {"_id": ObjectId(service_id)},
        {
            "$set": {
                "maqgo_client_invoice_pending": False,
                "maqgo_client_invoiced_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
        }
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return {"success": True, "message": "Cliente facturado por MAQGO"}


@router.get("/admin/{service_id}/invoice-image")
async def get_invoice_image(service_id: str, _: dict = Depends(get_current_admin)):
    """Admin: obtener imagen de factura"""
    service = services_collection.find_one(
        {"_id": ObjectId(service_id)},
        {"invoice_image": 1}
    )
    
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    
    return {"invoice_image": service.get('invoice_image')}


@router.get("/provider/{provider_id}/summary")
async def get_provider_summary(
    provider_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Generar resumen de ganancias para el proveedor.
    Útil para el resumen semanal por WhatsApp.
    """
    AccessPolicy.assert_provider_scope_sync(db, current_user, provider_id)
    from datetime import datetime, timedelta
    
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Todos los servicios del proveedor
    all_services = list(services_collection.find({"provider_id": provider_id}))
    
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
    operator = users_collection.find_one({"id": operator_id}, {"_id": 0})
    if not operator:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    if operator.get('provider_role') != 'operator':
        raise HTTPException(status_code=400, detail="El usuario no es un operador")
    owner_id = operator.get('owner_id')
    if not owner_id:
        raise HTTPException(status_code=400, detail="Operador sin dueño asignado")

    # service_requests confirmados del dueño sin operador asignado
    pending = list(service_requests_collection.find(
        {
            "providerId": owner_id,
            "status": "confirmed",
            "$or": [{"operator_id": {"$exists": False}}, {"operator_id": None}]
        },
        {"_id": 0, "id": 1, "clientName": 1, "clientId": 1, "location": 1, "machineryType": 1, "status": 1, "totalAmount": 1}
    ).sort("offerSentAt", -1))
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
    Asigna operator_id y pasa estado a en_route.
    """
    AccessPolicy.assert_self_or_admin(current_user, operator_id)
    operator = users_collection.find_one({"id": operator_id}, {"_id": 0})
    if not operator or operator.get('provider_role') != 'operator':
        raise HTTPException(status_code=403, detail="No tienes permiso para aceptar servicios")
    owner_id = operator.get('owner_id')
    if not owner_id:
        raise HTTPException(status_code=403, detail="Operador sin dueño asignado")

    # Asignar operador en service_request (id es string uuid)
    result = service_requests_collection.update_one(
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
                "operator_assigned_at": datetime.utcnow().isoformat(),
                "status": "en_route"
            }
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
    owner = users_collection.find_one({"id": owner_id}, {"_id": 0})
    
    if not owner or owner.get('provider_role') not in ['owner', None]:
        raise HTTPException(status_code=403, detail="Solo el dueño puede ver servicios del equipo")
    
    # Obtener IDs de todos los operadores
    operators = list(users_collection.find(
        {"owner_id": owner_id, "provider_role": "operator"},
        {"id": 1, "_id": 0}
    ))
    operator_ids = [op['id'] for op in operators]
    
    # Buscar servicios del dueño y sus operadores
    services = list(services_collection.find(
        {
            "$or": [
                {"provider_id": owner_id},
                {"operator_id": {"$in": operator_ids}}
            ]
        },
        {"invoice_image": 0}
    ).sort("created_at", -1))
    
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
    user = users_collection.find_one({"id": user_id}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    is_owner_role = is_owner_or_master(user)
    
    # Determinar qué servicios consultar
    if is_owner_role:
        # Dueño/Master ve todos los servicios de la empresa y los de sus operadores
        company_owner_id = get_company_owner_id(user)
        operators = list(users_collection.find(
            {"owner_id": company_owner_id, "provider_role": "operator"},
            {"id": 1, "_id": 0}
        ))
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
    
    services = list(services_collection.find(query, {"invoice_image": 0}))
    
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
