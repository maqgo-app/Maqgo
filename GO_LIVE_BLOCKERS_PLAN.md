# GO LIVE — Plan para cerrar bloqueantes (NO-GO)

Contexto: este plan cierra **exclusivamente** los bloqueantes GO-LIVE vigentes.

Restricciones (obligatorias)
- No implementar nuevas funcionalidades.
- No modificar UX / diseño.
- No modificar flujos.
- No abrir nuevos frentes.

Bloqueantes GO-LIVE (vigentes)
1) `npm ci` (frontend)
2) Onboarding proveedor P3 → P4 (E2E smoke)
3) Tests OTP (backend)

Fuera de alcance GO-LIVE (decisión cerrada)
- Avisos (HUB) = Prototipo DEV / Roadmap post Go-Live (NO remover `import.meta.env.DEV`, NO exponer rutas, NO agregar navegación/CTA/footer).

---

## FASE 1 — VALIDACIÓN (causa raíz / esfuerzo / riesgo / dependencias)

### 1) `npm ci` (frontend)
- Causa raíz
  - `package.json` y `package-lock.json` están desincronizados. El error reportado fue: `Missing: lucide-react@0.451.0 from lock file`.
  - Evidencia: ejecución local de `npm ci` en `frontend/` falla con EUSAGE.
- Esfuerzo estimado
  - Bajo (≤ 30 min).
- Riesgo
  - Bajo.
  - Riesgo principal: cambios colaterales en el lockfile si hay dependencias no deterministas; se mitiga revisando diff del lock.
- Dependencias
  - Node >= 20.
  - Acceso a registry NPM.

### 2) Onboarding proveedor P3 → P4 (E2E smoke)
- Causa raíz
  - El test E2E intenta completar un input inexistente (`transport-input`) y no llena el campo requerido real.
  - En la pantalla, los inputs reales son `data-testid=transport-input-same-commune|same-region|other-region`.
  - El bloqueo observado coincide con validación de mínimos de traslado (“Completa \"Dentro de la misma comuna\" desde …”).
  - Evidencia técnica:
    - Test que falla esperando `/provider/operator-data` luego del click: `frontend/qa-artifacts/smoke-provider-onboarding.spec.js` (línea donde hace `getByTestId('transport-input')` y luego `toHaveURL(/\/provider\/operator-data/)`).
    - IDs reales de inputs: `frontend/src/screens/provider/MachinePhotosPricingScreen.jsx` usa `data-testid={\`transport-input-${field.key}\`}` con keys `same-commune|same-region|other-region`.
- Esfuerzo estimado
  - Bajo (≤ 30–60 min) si se corrige solo el test.
- Riesgo
  - Bajo.
  - Riesgo principal: false-positive si el test se ajusta pero existe otro bloqueo real de navegación; se mitiga validando que el test llegue y renderice “Datos del Operador” y que no exista alerta.
- Dependencias
  - Playwright chromium instalado.
  - `npm run build` + `vite preview` (o `PLAYWRIGHT_E2E_SKIP_BUILD=true` según práctica actual).

### 3) Tests OTP (backend)
- Causa raíz
  - Los tests usan `mock_r.get.return_value = "0"` (string truthy) para todas las keys, lo que hace que el código OTP sea interpretado como “OTP existente” y se active la rama de `OTP_REUSED` antes de ejecutar `pipeline.setex(...)`.
  - En producción el OTP almacenado siempre es de 6 dígitos, por lo que el valor "0" no es representativo y rompe la intención del test.
  - Evidencia:
    - `backend/services/otp_service.py`: si `existing` es truthy y `ttl_existing > 0`, retorna `reused=True` antes de `pipe.setex(...)`.
    - `tests/test_otp_service.py`: mocks actuales devuelven "0" para `otp_key`.
- Esfuerzo estimado
  - Bajo (≤ 60 min) ajustando mocks para que `otp_key` devuelva `None` y el rate key simule conteo real.
- Riesgo
  - Bajo.
  - Riesgo principal: que los tests estén “encontrando” un bug real (p.ej., detección de OTP existente) y el cambio de tests lo oculte; se mitiga agregando asserts explícitos de que `otp_key` es `None` en el setup y validando el mensaje SMS contiene OTP 6 dígitos.
- Dependencias
  - `pytest` + dependencias python.


### Avisos (HUB) — Roadmap / Post Go-Live
- Estado
  - NO-GO para producción (prototipo DEV). Veredicto cerrado: no se incluye como bloqueante GO-LIVE.

---

## FASE 2 — PLAN DE CORRECCIÓN (ordenado por menor riesgo / mayor impacto)

### Paso A (P0) — Arreglar `npm ci`
- Acción
  - Regenerar/actualizar `frontend/package-lock.json` para que incluya `lucide-react@0.451.0` y quede consistente con `frontend/package.json`.
- Justificación
  - Desbloquea CI y reproducibilidad.

### Paso B (P0) — Arreglar E2E smoke proveedor (P3→P4)
- Acción
  - Ajustar el test `smoke-provider-onboarding.spec.js` para llenar el campo correcto: `transport-input-same-commune` (y, si aplica, `same-region` / `other-region` según validación).
  - Mantener objetivo del test: “Continuar no crashea” y navega a `/provider/operator-data`.
- Justificación
  - Evita un falso NO-GO en el quality gate y valida que el onboarding sigue navegable.

### Paso C (P0) — Arreglar tests OTP
- Acción
  - Ajustar mocks en `tests/test_otp_service.py` para que `otp_key` retorne `None` (sin OTP existente), y que el rate limit se simule solo sobre `otp_rate:*`.
  - Asegurar que el test valida que `pipeline.setex` se llama para OTP e intentos y que el SMS contiene 6 dígitos.
- Justificación
  - Restaura confiabilidad del suite unitario de OTP.


Nota
- No hay pasos de corrección para Avisos en este documento: queda fuera del Go-Live actual.

---

## FASE 3 — CRITERIO GO (evidencia requerida)

### 1) GO — `npm ci`
- Evidencia requerida
  - `cd frontend && npm ci` termina con exit code 0.
  - Pipeline “Quality Gate” (o equivalente) pasa el step de instalación (mismo comando).

### 2) GO — Onboarding proveedor P3 → P4
- Evidencia requerida
  - `npx playwright test qa-artifacts/smoke-provider-onboarding.spec.js` pasa 5/5 tests.
  - En particular el caso “Fotos y tarifas → Datos del Operador” navega a `/provider/operator-data` y renderiza heading correspondiente (sin alertas).

### 3) GO — OTP tests
- Evidencia requerida
  - `python3 -m pytest tests/test_otp_service.py -q` pasa 100%.
  - Suite mínima backend usada en el gate pasa completa (incluyendo `tests/test_pricing_unit.py`, `tests/test_scenarios_simulation.py`, `tests/test_all_machinery_qa.py`).


## Veredicto Go-Live (actual)

Estado actual: **NO-GO**

Condición para declarar **GO**
- 1) `npm ci` pasa.
- 2) E2E smoke proveedor P3→P4 pasa.
- 3) Tests OTP pasan.
