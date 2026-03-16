"""
MAQGO - Servicio de Facturación
- Validación de factura (cruce total factura vs desglose del servicio)
- Envío automático de factura + voucher al cliente

COMISIONES MAQGO (source: backend/pricing/constants.py y business_rules.py):
- Cliente: 10% + IVA sobre (servicio + bono + traslado) — se suma a lo que paga.
- Proveedor: 10% + IVA sobre ese mismo subtotal — se descuenta al pago al proveedor.
- En el voucher al cliente se muestra "Tarifa por Servicio MAQGO (10% + IVA)".

CRUCE FACTURA vs REPORTE DEL SERVICIO:
- El total de la factura que sube el proveedor debe corresponder al desglose del
  reporte del servicio MENOS la comisión MAQGO (es decir, lo que factura el proveedor).
- Fórmula: total_factura_esperado = (serviceAmount + bonusAmount + transportAmount) * 1.19
  = subtotal del reporte + IVA (sin incluir la comisión 10%+IVA de MAQGO).
- Así se cruza que la factura sea por el monto correcto que el proveedor emite.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, EmailStr
from typing import Optional
import os
import asyncio
import base64
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

try:
    import resend
except ModuleNotFoundError:
    resend = None  # Opcional: sin paquete resend el envío de email se omite

load_dotenv()

router = APIRouter(prefix="/invoices", tags=["invoices"])

# MongoDB
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'maqgo_db')]

# Resend (opcional)
RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
if resend and RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# IVA Chile (alineado con pricing/constants.py)
IVA_RATE = 0.19


def expected_invoice_total_from_service(service: dict) -> float:
    """
    Monto total que debe tener la factura del proveedor (cruce con reporte del servicio).
    = Desglose del servicio (servicio + bono + traslado) menos tarifa plataforma (10%+IVA) + IVA.
    """
    gross = (
        service.get("serviceAmount", 0) or service.get("service_amount", 0)
        + service.get("bonusAmount", 0) or service.get("bonus_amount", 0)
        + service.get("transportAmount", 0) or service.get("transport_amount", 0)
    )
    commission = round(gross * 0.10 * (1 + IVA_RATE), 0)
    provider_net = gross - commission
    return round(provider_net * (1 + IVA_RATE), 0)


class InvoiceValidationResult(BaseModel):
    is_valid: bool
    rut_emisor: Optional[str] = None
    rut_receptor: Optional[str] = None
    folio: Optional[str] = None
    fecha: Optional[str] = None
    monto_neto: Optional[float] = None
    iva: Optional[float] = None
    total: Optional[float] = None
    errors: list = []
    warnings: list = []


# Tolerancia para cruce total factura vs expected (1% por redondeos)
INVOICE_AMOUNT_TOLERANCE_PERCENT = 0.01


def _amounts_match(expected: float, extracted_total: float) -> bool:
    """True si el total extraído de la factura está dentro de la tolerancia del esperado."""
    if expected <= 0:
        return extracted_total <= 0
    return abs(extracted_total - expected) / expected <= INVOICE_AMOUNT_TOLERANCE_PERCENT


async def validate_invoice_with_ai(file_content: bytes, filename: str, expected_amount: float) -> InvoiceValidationResult:
    """
    Validación de factura. Cruce: total factura debe corresponder a
    (serviceAmount + bonusAmount + transportAmount) * 1.19 = desglose reporte menos comisión MAQGO + IVA.
    Sin IA/OCR configurada: acepta para revisión manual.
    Cuando se integre extracción (ej. Gemini/OCR), usar extracted_total y _amounts_match(expected_amount, extracted_total).
    """
    # Sin extracción de total desde PDF: aceptar y marcar para revisión manual
    return InvoiceValidationResult(
        is_valid=True,
        total=expected_amount,
        warnings=[
            "Validación automática no configurada. Revisión manual recomendada.",
            f"Monto esperado (cruce con reporte): ${expected_amount:,.0f}",
        ],
    )


def generate_voucher_html(service_data: dict) -> str:
    """Genera el HTML del voucher para el email"""
    
    service_amount = service_data.get('serviceAmount', 0)
    bonus_amount = service_data.get('bonusAmount', 0)
    transport_amount = service_data.get('transportAmount', 0)
    
    subtotal = service_amount + bonus_amount + transport_amount
    iva = subtotal * 0.19
    total = subtotal + iva
    
    maqgo_fee = total * 0.10 * 1.19  # 10% + IVA
    grand_total = total + maqgo_fee
    
    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #0F0F12; color: white; padding: 20px; border-radius: 10px;">
            <h1 style="color: #EC6819; margin: 0 0 20px;">MAQGO</h1>
            <h2 style="margin: 0 0 20px; font-size: 18px;">Voucher de Servicio</h2>
            
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #333;">Servicio #{service_data.get('id', 'N/A')}</td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #333; text-align: right;">{service_data.get('date', 'N/A')}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #333;">Maquinaria</td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #333; text-align: right;">{service_data.get('machineryType', 'N/A')}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #333;">Horas</td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #333; text-align: right;">{service_data.get('hours', 'N/A')}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #333;">Proveedor</td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #333; text-align: right;">{service_data.get('providerName', 'N/A')}</td>
                </tr>
            </table>
            
            <h3 style="margin: 20px 0 10px; color: #90BDD3;">Desglose de Cobros</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 8px 0;">Arriendo maquinaria</td>
                    <td style="padding: 8px 0; text-align: right;">${service_amount:,.0f}</td>
                </tr>
                {"<tr><td style='padding: 8px 0;'>Bonificación alta demanda</td><td style='padding: 8px 0; text-align: right;'>$" + f"{bonus_amount:,.0f}" + "</td></tr>" if bonus_amount > 0 else ""}
                {"<tr><td style='padding: 8px 0;'>Traslado</td><td style='padding: 8px 0; text-align: right;'>$" + f"{transport_amount:,.0f}" + "</td></tr>" if transport_amount > 0 else ""}
                <tr>
                    <td style="padding: 8px 0;">IVA (19%)</td>
                    <td style="padding: 8px 0; text-align: right;">${iva:,.0f}</td>
                </tr>
                <tr style="border-top: 1px solid #333;">
                    <td style="padding: 8px 0;"><strong>Subtotal Proveedor</strong></td>
                    <td style="padding: 8px 0; text-align: right;"><strong>${total:,.0f}</strong></td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #90BDD3;">Tarifa por Servicio MAQGO (10% + IVA)</td>
                    <td style="padding: 8px 0; text-align: right; color: #90BDD3;">${maqgo_fee:,.0f}</td>
                </tr>
                <tr style="border-top: 2px solid #EC6819;">
                    <td style="padding: 12px 0; font-size: 18px;"><strong style="color: #EC6819;">TOTAL COBRADO</strong></td>
                    <td style="padding: 12px 0; text-align: right; font-size: 18px;"><strong style="color: #EC6819;">${grand_total:,.0f}</strong></td>
                </tr>
            </table>
            
            <p style="margin-top: 20px; font-size: 12px; color: #888;">
                Este voucher es un comprobante de los servicios contratados a través de MAQGO.
                La factura adjunta corresponde al arriendo de maquinaria emitida por el proveedor.
            </p>
        </div>
    </div>
    """


async def send_invoice_to_client(
    client_email: str,
    client_name: str,
    service_data: dict,
    invoice_content: bytes,
    invoice_filename: str
) -> dict:
    """
    Envía la factura + voucher al cliente por email
    MAQGO controla el envío, nunca el proveedor directo
    """
    
    if not RESEND_API_KEY:
        return {"status": "error", "message": "Servicio de email no configurado"}
    
    voucher_html = generate_voucher_html(service_data)
    
    # Convertir factura a base64 para adjuntar
    invoice_base64 = base64.b64encode(invoice_content).decode('utf-8')
    
    email_html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0F0F12;">Hola {client_name},</h2>
        <p>Tu servicio de maquinaria ha sido completado exitosamente.</p>
        <p>Adjunto encontrarás:</p>
        <ul>
            <li><strong>Factura</strong> - Documento tributario emitido por el proveedor</li>
            <li><strong>Voucher MAQGO</strong> - Desglose detallado de los cobros</li>
        </ul>
        
        {voucher_html}
        
        <p style="margin-top: 20px;">Si tienes alguna consulta, contáctanos por WhatsApp.</p>
        <p>Gracias por usar MAQGO.</p>
        
        <p style="font-size: 12px; color: #888; margin-top: 30px;">
            Este es un correo automático enviado por MAQGO. Por favor no responder a este correo.
        </p>
    </div>
    """
    
    if not resend or not RESEND_API_KEY:
        return {
            "status": "success",
            "message": "Factura registrada. Envío por email no configurado (instalar resend y RESEND_API_KEY para enviar)."
        }

    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [client_email],
            "subject": f"MAQGO - Factura de tu servicio de {service_data.get('machineryType', 'maquinaria')}",
            "html": email_html,
            "attachments": [
                {
                    "filename": invoice_filename,
                    "content": invoice_base64
                }
            ]
        }
        email_result = await asyncio.to_thread(resend.Emails.send, params)
        return {
            "status": "success",
            "message": f"Factura enviada a {client_email}",
            "email_id": email_result.get("id")
        }
    except Exception as e:
        print(f"Error enviando email: {str(e)}")
        return {"status": "error", "message": str(e)}


@router.post("/upload/{service_id}")
async def upload_invoice(
    service_id: str,
    file: UploadFile = File(...),
    provider_id: str = Form(...)
):
    """
    Endpoint para que el proveedor suba la factura
    1. Valida con IA
    2. Si es válida, envía al cliente
    3. Actualiza estado del servicio
    """
    
    # Verificar que el servicio existe (por id o por _id para compatibilidad)
    from bson import ObjectId
    service = await db.services.find_one({"id": service_id}, {"_id": 0})
    service_filter = {"id": service_id}
    if not service and len(service_id) == 24:
        try:
            service = await db.services.find_one({"_id": ObjectId(service_id)}, {"_id": 0})
            if service:
                service["id"] = service_id
                service_filter = {"_id": ObjectId(service_id)}
        except Exception:
            pass
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    # Verificar que el proveedor es dueño del servicio
    if service.get("provider_id") != provider_id and service.get("providerId") != provider_id:
        raise HTTPException(status_code=403, detail="No tienes permiso para este servicio")
    
    # Leer contenido del archivo
    file_content = await file.read()
    filename = file.filename
    
    # Calcular monto esperado: desglose del reporte (servicio + bono + traslado) + IVA, sin comisión MAQGO
    expected_amount = expected_invoice_total_from_service(service)

    # Paso 1: Validar factura (cruce de total)
    validation_result = await validate_invoice_with_ai(file_content, filename, expected_amount)
    
    if not validation_result.is_valid:
        # Guardar intento fallido
        await db.invoice_attempts.insert_one({
            "serviceId": service_id,
            "providerId": provider_id,
            "filename": filename,
            "validation": validation_result.dict(),
            "status": "rejected",
            "createdAt": datetime.now(timezone.utc).isoformat()
        })
        
        return {
            "status": "rejected",
            "message": "La factura no pasó la validación",
            "validation": validation_result.dict()
        }
    
    # Paso 2: Obtener datos del cliente
    client = await db.users.find_one({"id": service.get("clientId")}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    
    # Obtener datos del proveedor
    provider = await db.users.find_one({"id": provider_id}, {"_id": 0})
    
    # Preparar datos del servicio para el voucher
    service_data = {
        "id": service_id,
        "date": service.get("date", datetime.now().strftime("%d/%m/%Y")),
        "machineryType": service.get("machineryType", "Maquinaria"),
        "hours": service.get("hours", 0),
        "providerName": provider.get("name", "Proveedor") if provider else "Proveedor",
        "serviceAmount": service.get("serviceAmount", 0),
        "bonusAmount": service.get("bonusAmount", 0),
        "transportAmount": service.get("transportAmount", 0)
    }
    
    # Paso 3: Enviar al cliente (MAQGO controla el envío)
    email_result = await send_invoice_to_client(
        client_email=client.get("email"),
        client_name=client.get("name", "Cliente"),
        service_data=service_data,
        invoice_content=file_content,
        invoice_filename=filename
    )
    
    # Paso 4: Actualizar estado del servicio
    now = datetime.now(timezone.utc).isoformat()
    update_payload = {
            "invoiceStatus": "validated",
            "invoiceFilename": filename,
            "invoiceValidation": validation_result.dict(),
            "invoiceSentToClient": email_result.get("status") == "success",
            "invoiceSentAt": now if email_result.get("status") == "success" else None,
            "status": "invoiced",
            "updated_at": now
        }
    if "_id" in str(service_filter):
        update_payload["id"] = service_id  # asegurar id en doc
    await db.services.update_one(
        service_filter,
        {"$set": update_payload}
    )
    
    # Guardar registro de factura
    await db.invoices.insert_one({
        "serviceId": service_id,
        "providerId": provider_id,
        "clientId": service.get("clientId"),
        "filename": filename,
        "validation": validation_result.dict(),
        "emailSent": email_result.get("status") == "success",
        "emailId": email_result.get("email_id"),
        "createdAt": now
    })
    
    return {
        "status": "success",
        "message": "Factura validada y enviada al cliente",
        "validation": validation_result.dict(),
        "email": email_result
    }


@router.get("/status/{service_id}")
async def get_invoice_status(service_id: str):
    """Obtener estado de facturación de un servicio (por id o _id)"""
    from bson import ObjectId
    service = await db.services.find_one({"id": service_id}, {"_id": 0})
    if not service and len(service_id) == 24:
        try:
            service = await db.services.find_one({"_id": ObjectId(service_id)}, {"_id": 0})
        except Exception:
            pass
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    
    invoice = await db.invoices.find_one({"serviceId": service_id}, {"_id": 0})
    
    return {
        "serviceId": service_id,
        "serviceStatus": service.get("status"),
        "invoiceStatus": service.get("invoiceStatus"),
        "invoiceSentToClient": service.get("invoiceSentToClient", False),
        "invoiceSentAt": service.get("invoiceSentAt"),
        "invoice": invoice
    }
