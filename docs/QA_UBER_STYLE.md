# QA MAQGO — enfoque tipo “mobility app” (Uber-like)

Objetivo: **pocos tests lentos, muchos rápidos**, y **caminos críticos** siempre verificados antes de producción: identidad, reserva, pago, y ausencia de regresiones visibles.

## 1. Pirámide

| Capa | Qué es | Cuándo | Comando (frontend) |
|------|--------|--------|---------------------|
| **Unit + guardrails** | Lógica pura, invariantes (ej. demo off en prod UI) | Cada PR / CI | `npm run test:unit` · `npm run test:guardrails` |
| **Build** | Bundle coherente, assets | Cada PR | `npm run verify:build` |
| **E2E Playwright** | Flujos reales en navegador (preview + mocks de API) | Release / nightly / antes de deploy sensible | `npm run test:e2e` |
| **Manual / staging** | SMS real, Transbank, mapas, latencia | Pre-prod o checklist acotado | Ver §3 |

Gate mínimo recomendado en CI: `npm run gate:deploy` (unit + guardrails + verify:build). E2E opcional en CI si hay tiempo; **obligatorio** antes de cambios en auth, pagos o embudo.

## 2. Caminos críticos (P0)

Deben tener **automatización** o procedimiento escrito con criterio de paso/fallo.

1. **Identidad:** login por celular → OTP (o sesión) sin error de UI; sin Bearer colado en `/api/auth/login-sms/*`.
2. **Cliente — embudo:** P1 maquinaria → … → P6 pago (al menos: navegación + guards + CTA visible donde aplique layout split).
3. **Pagos / checkout:** no regresión en guard de rutas (`/client/card`, `/client/confirm`, facturación).
4. **Proveedor / operador:** al menos smoke de pantallas clave (onboarding sellado si aplica).

Referencias en repo:

- `frontend/qa-artifacts/smoke-auth-flow.spec.js`
- `frontend/qa-artifacts/checkout-navigation.spec.js`
- `frontend/qa-artifacts/smoke-critical-paths.spec.js` (crítico unificado: login SMS mock + CTA embudo)

## 3. Checklist manual corto (staging / pre-prod)

Ejecutar en **móvil real** o emulador con red real:

- [ ] SMS de login llega y el código verifica (no solo mock).
- [ ] Ubicación: autocompletado / comuna no queda tapado por el CTA inferior.
- [ ] Transbank / resultado de pago (flujo de prueba del proveedor).
- [ ] Refresco en mitad de embudo: no bucle ni pérdida de paso crítico.

## 4. Principios (por qué “tipo Uber”)

- **Un fallo en P0 bloquea** el release hasta tener fix o rollback.
- **Tests E2E** no sustituyen contract tests del backend; mockean API para velocidad y estabilidad.
- **Sin secretos** en specs: URLs y datos son de ejemplo o mocks.

## 5. Scripts útiles

```bash
cd frontend
npm run gate:deploy
npm run test:e2e
npm run test:e2e:critical
PLAYWRIGHT_SELLADO_FULL=1 npm run test:e2e   # multi-proyecto (opcional)
```

## 6. Mejora continua

- Nuevo endpoint público de auth → actualizar `isPublicAuthRequestUrl` en `src/utils/api.js` y un test que falle si falta.
- Nueva pantalla P0 → añadir caso en `qa-artifacts/` o checklist §3.
