# PEC — Catálogo de tarjetas de prueba Transbank (Oneclick/Webpay)

## Qué hace
- Mantiene un catálogo persistente de tarjetas oficiales de prueba (ambiente integración).
- Refresca desde fuente oficial y registra hash/version.
- Selecciona automáticamente tarjeta según escenario.
- Registra evidencia de cada prueba (tarjeta enmascarada, escenario, esperado/obtenido, buy_order/token_tail).

## Fuente oficial
- https://www.transbankdevelopers.cl/documentacion/como_empezar

## Endpoints (admin)
- `GET /api/admin/transbank/test-cards/status`
- `POST /api/admin/transbank/test-cards/refresh`
- `GET /api/admin/transbank/test-cards/pick?scenario=...`
- `POST /api/admin/transbank/test-runs?scenario=...&expected=...&obtained=...&buy_order=...&token=...`

## Escenarios soportados (v1)
- `inscription_approved` / `inscription_rejected`
- `payment_approved` / `payment_rejected`
- `payment_approved_debit` / `payment_rejected_debit`
- `payment_approved_prepaid` / `payment_rejected_prepaid`
- `reject_by_max_amount`

