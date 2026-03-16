"""
Rutas para gestión de servicios y facturación
Estados: pending_review → approved → invoiced → paid

RBAC:
- Dueño (owner): Ve todos los servicios con datos financieros completos
- Operador (operator): Solo ve datos operacionales (sin comisiones, facturas, etc.)
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Depends
from pydantic import BaseModel

from auth_dependency import get_current_admin
from typing import Optional, List
from datetime import datetime, timedelta
from bson import ObjectId
import os
import base64

router = APIRouter(prefix="/services", tags=["services"])

# MongoDB connection
from pymongo import MongoClient
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'maqgo')
client = MongoClient(MONGO_URL)
db = client[DB_NAME]
services_collection = db['services']
service_requests_collection = db['service_requests']
users_collection = db['users']

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
async def create_service(service: ServiceCreate):
    """Crear servicio al finalizar trabajo - Pago Ágil (24h)"""
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
    user_role: Optional[str] = Query(None, description="Rol del usuario: owner/operator")
):
    """
    Obtener historial de servicios del proveedor.
    
    RBAC:
    - Si user_role=operator: Solo muestra datos operacionales (sin financieros)
    - Si user_role=owner o no se especifica: Muestra todo
    """
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
async def submit_invoice(service_id: str, invoice: InvoiceSubmit):
    """Proveedor sube factura"""
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
async def get_service(service_id: str):
    """Obtener detalle de un servicio"""
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

@router.get("/admin/all")
async def get_all_services(_: dict = Depends(get_current_admin)):
    """Dashboard MAQGO: obtener todos los servicios"""
    services = list(services_collection.find(
        {},
        {"invoice_image": 0}
    ).sort("created_at", -1))
    
    for service in services:
        service['_id'] = str(service['_id'])
        if 'created_at' in service:
            service['created_at'] = service['created_at'].isoformat()
        if 'review_deadline' in service:
            service['review_deadline'] = service['review_deadline'].isoformat()
    
    # Contar por estado
    # maqgo_to_invoice: pagados al proveedor donde MAQGO debe facturar al cliente (dentro del mes)
    maqgo_to_invoice = [
        s for s in services
        if s['status'] == 'paid' and s.get('maqgo_client_invoice_pending', True)
    ]
    stats = {
        "pending_review": sum(1 for s in services if s['status'] == 'pending_review'),
        "approved": sum(1 for s in services if s['status'] == 'approved'),
        "invoiced": sum(1 for s in services if s['status'] == 'invoiced'),
        "paid": sum(1 for s in services if s['status'] == 'paid'),
        "disputed": sum(1 for s in services if s['status'] == 'disputed'),
        "maqgo_to_invoice": len(maqgo_to_invoice),
        "total": len(services)
    }
    
    return {"services": services, "stats": stats}

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
                # TODO: Obtener teléfono del proveedor de la BD y llamar notify_service_approved_for_invoice
                import logging
                logging.info(f"GATILLO: Servicio {service_id} aprobado. Notificar proveedor para facturar a MAQGO ${net_amount}")
            
            # Cuando se paga → Notificar pago realizado
            if update.status == 'paid' and current_service.get('status') == 'invoiced':
                invoice_number = current_service.get('invoice_number', 'N/A')
                net_amount = current_service.get('net_total', 0)
                
                import logging
                logging.info(f"GATILLO: Servicio {service_id} pagado. Notificar proveedor: ${net_amount}")
                
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
async def get_provider_summary(provider_id: str):
    """
    Generar resumen de ganancias para el proveedor.
    Útil para el resumen semanal por WhatsApp.
    """
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
async def get_available_services_for_operator(operator_id: str):
    """
    Servicios disponibles para que un operador acepte.
    Usa service_requests: solicitudes confirmadas del dueño (providerId = owner_id)
    que aún no tienen operador asignado.
    """
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
async def operator_accept_service(operator_id: str, service_id: str):
    """
    Operador acepta un servicio disponible (service_request confirmado del dueño).
    Asigna operator_id y pasa estado a en_route.
    """
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
async def get_team_services(owner_id: str):
    """
    Para el dueño: obtener todos los servicios de su equipo.
    Incluye servicios propios y de todos sus operadores.
    """
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
async def get_dashboard_data(user_id: str):
    """
    Obtener datos del dashboard según rol.
    - Owner: métricas financieras completas
    - Operator: solo métricas operacionales
    """
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
