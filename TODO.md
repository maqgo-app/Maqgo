# TODO – Maqgo (revisión del código)

Lista de TODOs encontrados en el código del proyecto (frontend/src y backend, sin dependencias).

---

## Frontend

| Archivo | Línea | Descripción |
|---------|--------|-------------|
| `frontend/src/screens/operator/OperatorJoinScreen.js` | 315 | **Implementar cámara** – El botón de subir foto/documento del operador tiene `onClick` vacío con comentario `TODO: Implementar cámara`. |

---

## Backend

| Archivo | Línea | Descripción |
|---------|--------|-------------|
| `backend/routes/admin_reports.py` | 302 | **Integrar con Resend** cuando esté activo (envío de reportes por email). |
| `backend/routes/abandonment.py` | 121 | **Integrar con servicio de email real** para notificar abandono de carrito. |
| `backend/routes/services.py` | 276 | **Obtener teléfono del proveedor** de la BD y llamar `notify_service_approved_for_invoice`. |
| `backend/services/timer_service.py` | 155 | **Enviar notificación** a cliente y proveedor (últimos 30 min de servicio). |
| `backend/services/timer_service.py` | 219 | **Enviar notificación de servicio finalizado** a cliente y proveedor. |
| `backend/services/payment_service.py` | 74 | **Integración real con Transbank OneClick** (cobro con tarjeta). |

---

## Resumen por prioridad sugerida

1. **Pago / producto:** Integración real Transbank OneClick (`payment_service.py`).
2. **Comunicación:** Emails (Resend, abandono, notificaciones de timer).
3. **Operador:** Cámara en OperatorJoinScreen (subir documento/foto).
4. **Proveedor:** Notificación aprobado para factura con teléfono desde BD (`services.py`).

---

*Generado a partir de búsqueda de `TODO`/`FIXME` en el repo. No se incluyen comentarios donde "TODO" es texto en español (ej. "IVA sobre TODO").*
