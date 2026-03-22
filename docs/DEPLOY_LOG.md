# Bitacora de Deploy MAQGO

Regla operativa: no se despliega sin quality gate en verde y validacion final.

## Plantilla de registro

- Fecha:
- Entorno: staging | production
- Responsable:
- Commit/Version:
- Quality gate: PASS | FAIL
- Pre-deploy: PASS | FAIL
- Health check backend (`/api/`):
- Smoke test frontend:
- Riesgos observados:
- Resultado final: DEPLOY OK | ROLLBACK

## Historial

- Fecha: 2026-03-20
- Entorno: production
- Responsable: CTO (Cursor)
- Cambio: URL canónica pública **https://maqgo.vercel.app** en `index.html` (canonical, og:url, og:image, twitter:image), `manifest.json` (`id`, `scope`, `background_color`), docs y `.env.production.example`.
- Resultado final: configuración alineada al dominio Vercel principal

- Fecha: 2026-03-19
- Entorno: production
- Responsable: CTO (Cursor)
- Commit/Version: workspace local (sin commit de release en este paso)
- Quality gate: PASS
- Pre-deploy: PASS
- Health check backend (`/api/`): OK en validacion local; deploy backend bloqueado por autenticacion Railway
- Smoke test frontend: Deploy Vercel exitoso
- Riesgos observados: deuda de lint frontend (modo advisory), backend pendiente en Railway
- Resultado final: DEPLOY PARCIAL OK (frontend)
- URL frontend production: https://maqgo.vercel.app (alias principal; histórico: frontend-rho-vert-88.vercel.app)
- Backend deploy intento: `npx @railway/cli up` -> Unauthorized (requiere `railway login`)

- Fecha: 2026-03-19
- Entorno: production
- Responsable: CTO (Cursor)
- Commit/Version: workspace local (hotfix WelcomeScreen + abandonment rule)
- Quality gate: PASS (build frontend OK)
- Pre-deploy: PASS parcial (lint global en modo advisory)
- Health check backend (`/api/`): sin cambios de backend en este release
- Smoke test frontend: Deploy Vercel exitoso y alias actualizado
- Riesgos observados: backend Railway aun pendiente por autenticacion CLI
- Resultado final: DEPLOY OK (frontend hotfix)
- URL frontend production: https://maqgo.vercel.app
- URL inspect deploy: https://vercel.com/maqgo-apps-projects/frontend/3kR3d78yAsTQqYK4TqAbq6hBCtdQ
