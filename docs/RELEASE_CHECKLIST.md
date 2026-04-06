# Checklist de release — MAQGO (MVP)

## Principio (prioridad absoluta)

**Lo más importante es comprobar que todo funciona de verdad** en los flujos que tocan usuarios y dinero. El resto (papeles, tags, docs) apoya eso; no al revés.

- **“A la perfección” en MVP** = *sin errores en los caminos críticos* (auth, reserva, tarjeta/Transbank, matching, cobro cuando aplica), con **tests automatizados en verde** donde existan y **smoke manual** explícito antes de soltar a prod.
- Si algo falla en verificación: **no release** hasta corregir o revertir.

**Referencias técnicas:** `PRODUCCION.md`, `MODELOS_DEPLOY.md`, `MONITOREO_MINIMO_PROD.md`, `VALIDACION_TRANSBANK_ONECLICK.md`, `SEGURIDAD_SECRETOS.md`.

---

## 1. Verificación funcional (obligatoria antes de producción)

Hacer en **preview/staging** o en prod solo si el cambio es trivial y ya pasó CI.

### Automatizado (rápido, no negociable si el repo lo tiene)

- [ ] **CI verde** (GitHub Actions / quality gate) en la rama que deploya.
- [ ] **Frontend:** `cd frontend && npm run build` y `npm run test:unit`.
- [ ] **Backend:** tests del área tocada o suite acordada por el equipo.

### Manual — cliente (embudo reserva)

- [ ] **Login** (SMS / flujo actual) sin 401 silenciosos ni bucles.
- [ ] **Ubicación + proveedores + confirmación (P5):** totales coherentes, navegación OK.
- [ ] **Tarjeta (P6):** registro OneClick; **sin cobro indebido** en este paso; vuelta desde Transbank según entorno.
- [ ] **Tras enviar solicitud:** estado “buscando proveedor” sin errores obvios en red/consola.
- [ ] Si el release tocó **pagos post-aceptación:** un camino feliz verificado (sandbox o primer caso vigilado).

### Manual — proveedor

- [ ] **Login** proveedor.
- [ ] **Ver solicitud entrante** y **aceptar o rechazar** sin error de API (matching según reglas vigentes).

### Manual — admin (solo si el deploy lo toca)

- [ ] Panel crítico accesible según `ADMIN_INSTRUCCIONES.md`.

**Criterio:** si cualquier ítem crítico falla → **bloquear release**.

---

## 2. Entorno y seguridad (debe estar bien para que lo anterior sea válido)

Sin esto, la “verificación” puede ser falsa (p. ej. front apuntando al API equivocado).

- [ ] **API URL** del front = backend canónico (`CHECKLIST_SPLIT_WWW_API.md` / modelo actual).
- [ ] **CORS** incluye el origen público del cliente.
- [ ] **Mongo / Redis:** BD y credenciales correctas; no mezclar staging con prod.
- [ ] **JWT / OTP:** alineado si el cambio tocó auth.
- [ ] **Transbank:** modo comercio correcto; URLs HTTPS de retorno. Ver `ONECLICK.md`.
- [ ] **Sin secretos** en el repo; variables solo en el panel del host. `SEGURIDAD_SECRETOS.md`.
- [ ] **Diff revisado** en zonas sensibles (auth, pagos, datos personales).

---

## 3. Deploy y post-deploy

- [ ] **Ventana** acordada si hay riesgo.
- [ ] **Deploy log** / nota interna (fecha, commit, responsable) — útil para rollback.
- [ ] **Migraciones** aplicadas si existen; plan de rollback claro.
- [ ] **Post-deploy (1ª hora):** home/API responden; logs sin pico de 5xx; Transbank vigilado si hubo cambio de comercio/certificado.
- [ ] **Rollback:** commit anterior identificado; saber cómo revertir en Vercel/Railway.

---

## 4. Cierre

- [ ] Verificación de la **§1** completada (o bloqueo explícito).
- [ ] Comunicación a quien corresponda si el cambio es visible para usuarios.

---

## Notas MVP

- Perfección absoluta en todos los edge cases no es requisito; **sí** perfección en **flujos críticos** listados arriba.
- Más detalle de proceso: `QA_Y_LANZAMIENTO.md`.
