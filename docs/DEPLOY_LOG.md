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

- Fecha: 2026-03-22
- Entorno: production (Vercel / frontend)
- Responsable: CTO (Cursor)
- Quality gate: PASS (`npm run gate:deploy` — vitest + vite build)
- Cambio: rutas admin anidadas (`AdminRoute` + `Outlet`) menos latencia al navegar; `BottomNavigation` sin barra cliente para admin + `goToHome` → `/admin`; Welcome copy panel dueño + barra aclaratoria; fix flash Welcome (`welcome-reveal` desde 1er frame); AdminDashboard “Ver portada pública” + subtítulo panel interno; `ProfileScreen` logout → `/welcome`; `.gitignore` `frontend/test-results/`.
- Resultado final: listo para push → merge a `main` y deploy Vercel

- Fecha: 2026-03-22
- Entorno: production (Vercel)
- Hallazgo: commit vacío en `main` puede dejar **Remote Build Cache** con bundle viejo (`index-*.js` sin `welcome-screen`); el `index.html` en GitHub seguía con `vite.svg` mientras el workspace ya tenía canonical + `maqgo_logo_clean.svg`.
- Acción: subir cambio **real** en `frontend/` (ej. `package.json` patch + `index.html` / `WelcomeScreen.jsx` alineados a `WELCOME_PANTALLA_FINAL.md`) y en Vercel **Redeploy → Clear build cache**.

- Fecha: 2026-03-20
- Entorno: production (Vercel, housekeeping)
- Responsable: CTO
- Cambio: eliminado en Vercel el proyecto legado **`frontend`** (`frontend-rho-vert-88.vercel.app`); producción sigue en proyecto **`maqgo`** → `https://maqgo.vercel.app`.
- Resultado final: OK (sin impacto en repo; URL histórica ya no resuelve)

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
- URL inspect deploy: https://vercel.com/maqgo-apps-projects/frontend/3kR3d78yAsTQqYK4TqAbq6hBCtdQ (proyecto Vercel legado `frontend`; inspección actual: Dashboard → **maqgo**)

## Referencia Vercel (operativa; revisión dependencias repo 2026-03-20)

- **Proyecto activo:** `maqgo` → `https://maqgo.vercel.app` (repo `maqgo-app/Maqgo`). Código y ejemplos de env usan **solo** `maqgo.vercel.app`.
- **Proyecto legado (eliminado 2026-03-20):** `frontend` / `frontend-rho-vert-88.vercel.app` — borrado en dashboard Vercel; la URL ya no debe usarse. Si algo externo (Google/Supabase/etc.) aún la tenía whitelist-eada, conviene limpiarla cuando aparezca un error.
