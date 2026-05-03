# Modelos de deploy MAQGO

**MVP:** priorizar **estabilidad** con **inversión mínima** (un dominio canónico, un stack gestionado, sin multi-servicio hasta que haga falta). Pagos, auth y datos no se recortan. Regla de proyecto: `.cursor/rules/mvp-estabilidad-inversion-minima.mdc`.

| | **Split (recomendado si ya tenés API en Railway)** | **Unificado (un solo contenedor)** |
|---|---------------------------------------------------|-------------------------------------|
| **Usuario entra** | `https://www.maqgo.cl` | `https://www.maqgo.cl` |
| **API** | `https://api2.maqgo.cl` (u otro host) | Mismo origen: `https://www.maqgo.cl/api` |
| **Front build** | `REACT_APP_BACKEND_URL=https://api2.maqgo.cl` | `REACT_APP_BACKEND_URL=https://www.maqgo.cl` |
| **Backend** | `FRONTEND_URL=https://www.maqgo.cl`, `CORS_ORIGINS` incluye `https://www.maqgo.cl` | Igual + `TBK_RETURN_URL` con `https://www.maqgo.cl` |
| **Infra** | Front (ej. Vercel) + API (Railway `backend/`) | Railway con `Dockerfile` raíz + `static/` |

Checklists: [CHECKLIST_SPLIT_WWW_API.md](CHECKLIST_SPLIT_WWW_API.md) · [CHECKLIST_WWW_MAQGO_CL.md](CHECKLIST_WWW_MAQGO_CL.md) (unificado).
