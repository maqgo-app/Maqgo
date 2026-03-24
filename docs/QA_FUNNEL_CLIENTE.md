# QA rápido — embudo cliente (Welcome → pago)

Ejecutar en **staging** o producción antes de un deploy crítico. Marcar ✅/❌.

1. **Welcome** → iniciar sesión o registro; sin bucles infinitos ni pantallas en blanco prolongadas.
2. **Login / registro + SMS** → código llega o flujo demo; llegada a **rol cliente** y **home cliente**.
3. **Nueva reserva** → maquinaria → horas o urgencia (según tipo) → **ubicación** (dirección + comuna válida) → **proveedores** cargan.
4. **Confirmar** → totales coherentes → **facturación** (si aplica) → **pago** (Transbank/Webpay o demo según entorno).
5. Tras pago (o demo): pantalla de resultado o búsqueda **sin error 500** en red; sesión cliente sigue válida.

**Fallo:** anotar URL, hora, usuario de prueba (sin datos reales de clientes) y respuesta de red o captura.
