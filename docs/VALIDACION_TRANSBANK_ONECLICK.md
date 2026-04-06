# Validación OneClick Mall — MAQGO

**Comercio:** MAQGO · **Producto:** Webpay OneClick · **Fecha:** _______________

## 1. Flujo

`start` → Webpay → banco → `confirm` → `authorize`

## 2. Caso exitoso

| Campo | Contenido |
|--------|-----------|
| buy_order | Único, alfanumérico, ≤26 caracteres |
| token | Inscripción (`start`); uso único en `confirm` |
| tbk_user | Devuelto por `confirm` |
| confirm | `response_code = 0` |
| authorize | `response_code = 0` |

## 3. Caso rechazado

| Campo | Contenido |
|--------|-----------|
| buy_order | Mismo criterio |
| confirm | `response_code = -96` |
| authorize | No ejecutado (sin `tbk_user` válido) |
| Evidencia | Sin llamada a `authorize` / sin `TBK_REQ` a autorización tras `confirm` con -96 |

## 4. Logs (`TBK_DEBUG_HTTP=true`)

- **TBK_REQ:** método, URL, headers, cuerpo → Transbank  
- **TBK_RES:** status HTTP y cuerpo  
- **Timestamps:** correlación por `buy_order` y orden `TBK_REQ` → `TBK_RES`

## 5. Referencia API

- `GET …/api/payments/oneclick/confirm-return?TBK_TOKEN=…`
- `POST …/api/payments/oneclick/confirm`
- `POST …/api/payments/oneclick/authorize`
