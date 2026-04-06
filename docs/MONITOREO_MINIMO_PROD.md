# Monitoreo mínimo en producción (MVP)

## Dónde mirar

- **Railway** (o host del API): logs del servicio backend, reinicios inesperados, uso de memoria/CPU en picos.
- **GitHub / despliegue**: último deploy exitoso, branch correcta (p. ej. `main`).

## Qué vigilar (sin observabilidad enterprise)

| Señal | Acción |
|--------|--------|
| Muchos **5xx** seguidos en `/api/*` | Revisar logs, variables de entorno, Mongo disponible. |
| **429** en auth/SMS | Rate limit esperado; si masivo, posible abuso o bug de reintentos en el cliente. |
| Errores **Transbank** / callback | Revisar `TBK_*`, URLs de retorno y logs de `payment` / `oneclick`. |
| Servicio **caído** | Health del contenedor, `MONGO_URL`, crash al arrancar. |

## Rutina sugerida

- Tras cada deploy: smoke manual con [QA_FUNNEL_CLIENTE.md](./QA_FUNNEL_CLIENTE.md) (al menos pasos 1–3).
- Semanal: ojeada de logs y estado del servicio en el panel del host.
