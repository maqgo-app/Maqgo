# Documentación MAQGO

Guías de soporte e integración.

| Documento | Descripción |
|-----------|-------------|
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Checklist ejecutable antes/después de deploy a producción (MVP) |
| [IA_CERTIFICACION_ASISTIDA.md](IA_CERTIFICACION_ASISTIDA.md) | Marco de certificación asistida por IA + criterio de “pass” + responsable |
| [DEFINICION_PRODUCCION_LIVE.md](DEFINICION_PRODUCCION_LIVE.md) | Qué cuenta como “liberado en prod” cuando maqgo.cl está live (commit + Vercel + Railway) |
| [QA_Y_LANZAMIENTO.md](QA_Y_LANZAMIENTO.md) | QA sin fricción: diagnóstico antes de cambios, checklist lanzamiento, velocidad de mejoras |
| [LIMPIEZA_Y_FUENTE_UNICA.md](LIMPIEZA_Y_FUENTE_UNICA.md) | Qué no versionar, fuente única, deployments en rojo en GitHub |
| [OTP_SNS_SETUP.md](OTP_SNS_SETUP.md) | Redis + AWS SNS para OTP (recuperar contraseña, verificación SMS; Railway) |
| [GOOGLE_MAPS_SETUP.md](GOOGLE_MAPS_SETUP.md) | Configuración de Google Maps / Places API |
| [ONECLICK.md](ONECLICK.md) | Integración Transbank OneClick Mall |
| [PricingPolicy_v1.md](PricingPolicy_v1.md) | Política de precios |
| [REGLA_PROVEEDOR_SIN_FACTURA.md](REGLA_PROVEEDOR_SIN_FACTURA.md) | Regla de negocio: proveedor sin factura |
| [POLITICA_NOTIFICACIONES.md](POLITICA_NOTIFICACIONES.md) | Política de notificaciones |
| [FLUJO_RESERVA_ACTUAL.md](FLUJO_RESERVA_ACTUAL.md) | Flujo de reserva actual |
| [UX_GUIDE.md](UX_GUIDE.md) | Guía de experiencia de usuario |

---

## Mantenimiento de documentación

**Regla:** Los docs deben reflejar el estado actual del código. Al cambiar flujos, APIs o configuraciones:

1. **Actualizar** el doc correspondiente (fecha en cabecera: `> Última actualización: mes año`).
2. **Eliminar** el doc si ya no aplica (ej. flujo deprecado, integración reemplazada).
3. **No dejar** docs obsoletos; si hay dudas, actualizar o borrar.

**Docs a revisar cuando cambies:**
- Flujo cliente → `FLUJO_RESERVA_ACTUAL.md`
- Rutas/back → `bookingFlow.js` + `FLUJO_RESERVA_ACTUAL.md`
- Setup/run → `CORRER.md`, `README.md`
- Integraciones → `GOOGLE_MAPS_SETUP.md`, `ONECLICK.md`
