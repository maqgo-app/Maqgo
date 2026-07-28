# OneClick Certification Support Toolkit

Soporte reusable para certificacion Transbank OneClick con tarjetas de prueba.

## Estructura

- `cases/`: casos automatizados de certificacion.
- `runners/`: wrappers shell para ejecutar y validar casos.
- `poc/`: exploraciones reutilizables del formulario y flujo Webpay/OneClick.
- `docs/`: documentacion operativa de certificacion.

## Salida

- La evidencia generada se mantiene en `backend/qa-artifacts/transbank-cert/`.
- Este toolkit no incluye logs, HAR, traces ni otros artefactos generados en ejecucion.
