# Certificación asistida por IA — MAQGO (MVP)

**Objetivo:** acercarte a un estándar de “listo para producción” **sin** confundir asistencia de IA con una auditoría legal o un sello de terceros. La IA **aumenta confianza y velocidad**; la **decisión final** la toma un humano con prueba en entorno real.

---

## 1. Qué significa “certificación asistida por IA” aquí

| Capa | Qué aporta | Límite |
|------|------------|--------|
| **IA (Cursor / revisión de código)** | Detecta riesgos en diffs, sugiere checklist, mantiene docs alineados, puede proponer tests. | No ve Vercel/Railway ni secretos; no ejecuta TBK/SMS reales en tu cuenta. |
| **Automatización (CI + scripts repo)** | `quality-gate.sh`, GitHub Actions, tests unitarios, build. | No cubre todo el flujo usuario ni integraciones externas sin E2E. |
| **Humano (dueño de release)** | Smoke en Preview o Prod, cuenta de prueba, revisión de logs, “sí deployo”. | Único que asume responsabilidad operativa. |

**Definición operativa:** release **certificable (asistido por IA)** = las tres capas anteriores completadas según este documento **o** ítems pendientes explícitos con dueño y fecha.

---

## 2. Flujo mínimo (orden recomendado)

### Paso A — Repo (IA + local / CI)

- [ ] Rama que va a prod **verde en CI** (o `./scripts/quality-gate.sh` local si no hay CI).
- [ ] Revisión de cambios en zonas sensibles: **auth, pagos, datos personales, CORS** (IA puede ayudar en el PR; humano confirma).
- [ ] Sin secretos en el diff (`SEGURIDAD_SECRETOS.md`).

### Paso B — Entorno (humano + documentación)

- [ ] Variables en **Vercel** y **Railway** alineadas con `PRODUCCION.md` / `MODELOS_DEPLOY.md`.
- [ ] `CORS_ORIGINS` y URLs de retorno TBK coherentes con el dominio canónico.

### Paso C — Verificación funcional (humano; IA arma la lista)

Seguir **`RELEASE_CHECKLIST.md` §1** (cliente: embudo + tarjeta; proveedor: solicitud).  
Opcional: IA genera una **lista de 10 minutos** personalizada si pegás el diff o “qué pantallas toqué”.

### Paso D — Post-deploy (humano)

- [ ] Health básico (web + API).
- [ ] Logs sin pico de 5xx en la primera hora (`MONITOREO_MINIMO_PROD.md`).
- [ ] Registro en `DEPLOY_LOG.md` (fecha, commit, responsable).

---

## 3. Criterio de “pass” (texto para el dueño de release)

Rellenar en el PR o en el canal interno:

```
Certificación asistida IA — MAQGO
- CI / quality-gate: [ OK / N/A + motivo ]
- Revisión sensibles (auth/pagos): [ OK / pendiente ]
- Smoke manual (RELEASE_CHECKLIST §1): [ OK / pendiente ]
- Vercel/Railway revisados: [ OK ]
- Post-deploy (logs/health): [ OK / pendiente ]

Responsable: __________  Fecha: __________
```

Si algo crítico queda **pendiente**, el estado es **no certificado** hasta cerrarlo.

---

## 4. Qué la IA puede hacer por tí en cada release

- Releer **diff** y señalar riesgos (seguridad, regresiones, async).
- Mantener **checklists** (`RELEASE_CHECKLIST.md`) y este marco.
- Proponer **casos de prueba** según archivos tocados (ej. “tocaste `CardPaymentScreen` → validar P6 + retorno TBK”).
- **No** sustituye: acceso al panel, prueba de pago real, ni decisión de negocio.

---

## 5. Relación con otros docs

- **`RELEASE_CHECKLIST.md`** — qué ejecutar antes/después del deploy.  
- **`QA_Y_LANZAMIENTO.md`** — proceso y velocidad de mejoras.  
- **`PRODUCCION.md`** — variables y modo LIVE.

---

> **Resumen en una línea:** la IA te acerca a una **certificación operativa** (criterios claros + menos olvidos); la **certificación real** es: *checklist + CI + humo + dueño que firma*.
