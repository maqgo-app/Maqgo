# QA artifacts (Playwright)

- Specs: flujos E2E contra **preview** de Vite (`playwright.config.js`); la API se **mockea** salvo que indiques otra cosa.
- Guía de enfoque (prioridades, checklist manual, scripts): [`../../docs/QA_UBER_STYLE.md`](../../docs/QA_UBER_STYLE.md).
- Helper de rutas API: `_helpers/mocks.js` (añadir aquí mocks de endpoints nuevos usados en pantallas P0).

Comandos:

```bash
npm run test:e2e
npx playwright test qa-artifacts/smoke-critical-paths.spec.js
```
