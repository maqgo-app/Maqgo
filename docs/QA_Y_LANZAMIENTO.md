# QA, diagnóstico previo y acelerar mejoras

> **Objetivo:** saber *qué falta para lanzar*, *no romper lo existente*, y *implementar más rápido* sin depender solo de “confianza en el último chat”.  
> No exige contratar QA full-time al inicio: exige **proceso + checklist + CI + una carpeta/rama canónica**.

---

## 1. Roles (mínimo viable)

| Rol | Quién puede ser | Qué hace |
|-----|-----------------|----------|
| **Dueño de release** | Tú / lead | Decide si algo va a prod y registra deploy (`docs/DEPLOY_LOG.md` si aplica). |
| **Revisor de cambio** | La misma persona o par en rotación | Antes de merge: checklist §3 + abrir **Preview Vercel**. |
| **CI (automático)** | GitHub Actions | `Quality Gate` en PR/push a `main`: build + tests (ver `.github/workflows/quality-gate.yml`). |

---

## 2. Regla de oro: una sola verdad

- **Un solo árbol de código** conectado a Vercel/Railway (en este monorepo: **`Maqgo1-main`** en la raíz del repo que deployás).
- **No editar en paralelo** otra copia del front (ej. carpetas duplicadas fuera de ese repo) salvo migración explícita.
- **Todo lo que debe verse en prod** = **commit en la rama de producción** (normalmente `main`) + push.  
  Si no está en Git en esa rama, **Vercel no puede mostrarlo**.

**Diagnóstico rápido cuando “no se ve el cambio”:**

1. Vercel → último deployment **Ready** → anotar **commit SHA** y **rama**.
2. En local: `git fetch && git log -1 --oneline origin/main` → debe coincidir (o `main` debe contener ese commit).
3. `git status` → si hay cambios sin commit, **no están en ningún deploy**.

---

## 3. Antes de **nuevos cambios** (diagnóstico en 10 min)

Responder por escrito (Notion/Linear/comentario de PR):

| # | Pregunta | Si “no” → acción |
|---|----------|------------------|
| 1 | ¿La rama de prod (`main`) está verde en GitHub Actions? | Arreglar build/tests antes de acumular features. |
| 2 | ¿El front en Vercel usa el **mismo repo y Root Directory** que estás editando? | Alinear en Vercel → Settings → General. |
| 3 | ¿`REACT_APP_BACKEND_URL` (o equivalente) en Vercel apunta al API correcto? | Ver `docs/PRODUCCION.md`. |
| 4 | ¿Hay un **Preview** del PR para probar UI sin tocar prod? | Abrir PR; usar URL de preview. |
| 5 | ¿Este cambio toca pagos, auth, OTP o datos sensibles? | Revisión extra + prueba manual del flujo end-to-end. |

---

## 4. Definition of Done (mejora de producto / UI)

Una mejora **no está hecha** hasta:

- [ ] Código **mergeado** a la rama que deploya prod (o PR aprobado con preview OK).
- [ ] **Build frontend** pasa local o en CI: `cd frontend && npm run build`.
- [ ] **Vercel Preview** (o prod si es trivial) muestra el comportamiento esperado.
- [ ] Anotar en el PR/commit **qué pantalla** tocar para validar (ruta, rol cliente/proveedor).

Opcional pero recomendado:

- [ ] `npm run lint` sin errores nuevos (hoy el workflow puede ser permisivo en lint; ideal endurecer cuando el repo esté limpio).
- [ ] Tests unitarios si el cambio es lógica pura (`npm run test:unit`).

---

## 5. Qué nos puede faltar para **lanzar** (checklist ejecutivo)

Cruzar con **`docs/PRODUCCION.md`** (fuente detallada). Resumen:

| Área | Qué suele faltar | Dónde ver |
|------|------------------|-----------|
| Front | Variables de entorno en Vercel, build con URL API real | `PRODUCCION.md` § Frontend |
| Back | `CORS_ORIGINS`, secrets, modo demo vs real | `PRODUCCION.md` § Backend |
| Pagos / SMS | Modo producción, credenciales, límites | `PRODUCCION.md`, `OTP_SNS_SETUP.md` |
| Observabilidad | Logs Railway, errores 5xx, alertas mínimas | Panel Railway + Vercel |

**Antes de un lanzamiento “grande”:** ejecutar `./scripts/quality-gate.sh` (frontend) y `./scripts/deploy-cto.sh` (orquesta + `pre-deploy` si hay venv); detalle en `PRODUCCION.md`.

---

## 6. Cómo avanzar **más rápido** en mejoras (sin multiplicar roturas)

1. **PRs chicos** — un objetivo por PR (ej. solo Welcome + CSS). Más fácil de revisar y de revertir.
2. **Preview obligatorio** — no mergear UI sin abrir el link de Vercel del PR.
3. **Congelar “carpetas duplicadas”** — todo cambio va al repo/carpeta que deployás; borrar o archivar duplicados cuando sea seguro.
4. **Feature flags** — si algo es riesgoso, ocultar detrás de env `VITE_*` / config hasta validar en preview.
5. **E2E selectivo** — ya tenéis Playwright (`npm run test:e2e`); ampliar solo para flujos críticos (login, reserva feliz), no para cada pixel.

---

## 7. ¿Hace falta contratar QA?

**No al principio** si cumplís §2–§4. **Sí** cuando:

- Hay releases semanales con varios flujos de pago/onboarding, o
- Necesitás matrices de navegadores/dispositivos formales.

Hasta entonces: **checklist + CI + preview + una rama prod clara** dan el 80 % del control.

---

## Documentos relacionados

- `docs/PRODUCCION.md` — checklist producción LIVE y variables.
- `.github/workflows/quality-gate.yml` — lo que ya corre en cada push/PR.
- `docs/DEPLOY_LOG.md` — registro de despliegues (si el equipo lo usa).

---

> **Última actualización:** marzo 2026 — alinear con cambios de deploy o CI.
