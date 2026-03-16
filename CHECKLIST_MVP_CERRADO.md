# MVP MAQGO — CERRADO ✅

**Fecha de cierre:** Febrero 2025

---

## Resumen

El MVP de MAQGO está **cerrado**. Los flujos principales están implementados y operativos para demostración: cliente, proveedor, admin y facturación con desglose correcto.

---

## Alcance entregado

### Cliente
- [x] Registro/Login con SMS (demo: 123456)
- [x] Reserva inmediata y programada
- [x] Selección de maquinaria (10 tipos)
- [x] Ver proveedores disponibles
- [x] Confirmación con desglose de precios (servicio, bonificación, traslado, tarifa MAQGO, IVA)
- [x] Tracking de llegada
- [x] Timer 30 minutos
- [x] Rating bidireccional
- [x] Historial de servicios

### Proveedor
- [x] Onboarding completo
- [x] Registro de maquinaria con fotos
- [x] Toggle de disponibilidad
- [x] Recepción de solicitudes (60s countdown)
- [x] Alerta con sonido/vibración
- [x] Flujo en camino → llegada → servicio activo → finalizar
- [x] Desglose de ganancias (con tarifa plataforma descontada)
- [x] Voucher de servicio con desglose para facturar
- [x] Descarga PDF del voucher
- [x] Subir factura a MAQGO
- [x] Rating a clientes
- [x] Historial de trabajos
- [x] Cliente anonimizado como "Cliente MAQGO" (anti-bypass)

### Admin
- [x] Dashboard con servicios (pending_review, approved, invoiced, paid, disputed)
- [x] Aprobar / Disputar servicios
- [x] Ver facturas subidas
- [x] Marcar como pagado
- [x] Auto-aprobación a las 6 h (Pago Ágil)

### Facturación
- [x] Desglose correcto: Servicio + Bonificación + Traslado
- [x] Menos tarifa plataforma (10%+IVA)
- [x] Subtotal neto a facturar
- [x] IVA (19%)
- [x] Total a facturar (con IVA)
- [x] Validación en backend: `(subtotal - comisión) × 1.19`
- [x] Datos MAQGO para facturar (razón social, RUT, giro, dirección)
- [x] ID de transacción obligatorio en factura

### Reglas de negocio
- [x] Comisión cliente: 10% + IVA
- [x] Comisión proveedor: 10% + IVA
- [x] Colación 1hr para servicios ≥6hrs
- [x] Regla 30 minutos de acceso
- [x] Garantía precio/ETA
- [x] Sin contacto directo (anti-bypass)

---

## Conocido / pos-MVP

| Item | Estado | Nota |
|------|--------|------|
| Mis Cobros API | 🔶 Mock | Fallback a datos demo si falla la API |
| Unificar rutas de subida de factura | Pendiente | Dos rutas: services vs invoices |
| Identificador servicio (id vs _id) | Pendiente | Revisar en rutas de invoices |
| Twilio | ✅ Real | SMS y WhatsApp reales cuando credenciales configuradas |
| MercadoPago | Mock | Pagos reales pendientes |
| Google Maps | Mock | Ubicación/mapa pendiente |

---

## Cómo correr

```bash
# Backend
cd backend && uvicorn server:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend && npm install && npm run dev
```

- Frontend: http://localhost:5174
- API: http://localhost:8000/api/

---

**MVP MAQGO cerrado** — Maquinaria pesada donde la necesites 🚜
