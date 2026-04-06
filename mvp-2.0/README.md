# MVP 2.0 — Backlog (post-MVP)

Esta carpeta concentra **mejoras de mayor esfuerzo o alcance**, fuera del ciclo actual de producto estable (MVP). No sustituye a `docs/` operativo; sirve para no perder decisiones y priorizar cuando haya tracción o requisito claro.

## Criterio (alineado al repo)

- Subir complejidad solo cuando volumen, incidentes recurrentes o regulación lo justifiquen.
- No duplicar plataformas ni “enterprise” sin métrica.

## Alcance MVP 1.0 (lanzamiento — congelado para reducir riesgo)

- **Login y sesión**: identidad por **celular** (SMS / OTP) y flujos ya integrados en la app.
- **Recuperación de cuenta**: regla de producto **mantener recuperación por SMS** como camino oficial en MVP (olvido de clave / identificación por teléfono). Correo queda **beta / no bloqueante** para el go-live.
- **Cuándo se exige de nuevo OTP en login** (no por “cada X horas”): por **riesgo** — dispositivo nuevo o no confiable, señales de contexto (p. ej. país / user agent respecto al último login conocido), o demasiados intentos fallidos de código. Con dispositivo de confianza y sin señales de riesgo, el login puede completarse **sin** nuevo SMS (comportamiento implementado en backend + `trusted_devices`).
- **Post‑lanzamiento**: endurecer recuperación por email, pruebas de entregabilidad (SPF/DKIM) y auth híbrido según la lista de abajo.

## Ideas registradas (orden no priorizado)

- **Auth híbrido**: tras teléfono verificado, enrolamiento opcional con **email verificado + contraseña** para reducir costo SMS recurrente; OTP en alto riesgo (nuevo dispositivo, país, anomalías). Incluye **recuperación por email como camino de producción** cuando haya métrica o reclamo de soporte.
- **Trusted devices**: modelo explícito en `backend/models/trusted_device.py` integrado al 100 % con `user_agent`, auditoría y revocación por usuario/admin.
- **Sesiones**: política explícita de invalidación (logout remoto, lista de dispositivos) si el negocio lo exige.
- **Observabilidad**: métricas de login, SMS, y errores Transbank sin sobredimensionar antes de tiempo.

## Cómo usar

- Añadir aquí notas cortas o enlaces a issues/PRs cuando se archive una idea grande.
- Al arrancar fase “2.0”, mover ítems concretos a `docs/` o tickets y borrar o marcar como hecho.
