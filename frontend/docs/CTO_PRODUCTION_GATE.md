# CTO — Production gate (MAQGO frontend)

Documento de **criterio de salida** antes de considerar un deploy “cerrado” a producción (Vercel/Railway u otro).  
Ámbito inmediato: **Welcome + navegación post-login admin**; el mismo patrón aplica a releases mayores.

---

## 1. Gate automatizado (obligatorio en CI o local pre-merge)

Ejecutar en la raíz del frontend:

```bash
npm run gate:deploy
```

Equivale a: **`vitest run` + `vite build`**. Si falla → **no deploy**.

> **Nota:** `npm run lint` no forma parte del gate hasta que el repo esté limpio globalmente; seguir ejecutándolo en PRs y reducir deuda con el tiempo.

---

## 2. Smoke manual (staging o preview URL)

| # | Caso | Criterio de éxito |
|---|------|-------------------|
| 1 | `https://maqgo.vercel.app/` y `/welcome` | Misma pantalla; sin flash blanco inicial; desktop ≥768px fondo exterior negro + marco |
| 2 | CTA **Arrendar** sin sesión | Va a `/login` con redirect a cliente |
| 3 | Login **admin** (API real) | Respuesta con `role`/`roles` admin → **`/admin`** |
| 4 | Login cliente / proveedor | Home coherente con rol |
| 5 | Welcome **con sesión** | Footer “Mi cuenta” → home por rol; sin “Regístrate” duplicado |
| 6 | Welcome **sin sesión admin** | No aparece enlace Admin en footer |
| 7 | `/admin` sin permisos | `AdminRoute` bloquea (no datos sensibles) |
| 8 | Móvil viewport corto | CTAs y footer usables (sin solapamiento crítico) |

**E2E opcional (Playwright):** `PLAYWRIGHT_BASE_URL=<preview> npm run test:e2e` — spec en `qa-artifacts/desktop-qa.spec.js`.

---

## 3. Seguridad (recordatorio)

- La UI **no** autoriza: **backend + `AdminRoute` + API** son la fuente de verdad.
- No exponer secretos en el bundle; variables sensibles solo servidor.

---

## 4. Documentación de producto

- Welcome congelada: `WELCOME_PANTALLA_FINAL.md` (v1 producción).
- Desktop visual: `WELCOME_DESKTOP_VISUAL_SPEC.md`.

---

## 5. Sign-off (rellenar en release)

| Campo | Valor |
|-------|--------|
| **Release / commit** | |
| **gate:deploy** | ☐ OK |
| **Smoke §2** | ☐ OK (quién: ) |
| **Fecha** | |
| **CTO / responsable** | |

---

*Última revisión: alineado con `npm run gate:deploy` en `package.json`.*
