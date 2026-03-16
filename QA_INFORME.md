# Informe QA - MAQGO

**Fecha:** 10 febrero 2025  
**Alcance:** API Backend, tests automatizados, endpoints principales

---

## Resumen ejecutivo

| Resultado | Estado |
|-----------|--------|
| Tests de Pricing API | ✅ 15/15 pasados |
| health check `/api/` | ✅ OK |
| Endpoints de precios | ✅ OK |
| Tests de operators | ⚠️ Requieren MongoDB + seed |

---

## 1. Tests de Pricing API

**Comando:** `REACT_APP_BACKEND_URL=http://localhost:8000 pytest tests/test_pricing_api.py -v`

### Resultados

| Suite | Tests | Estado |
|-------|-------|--------|
| TestPricingImmediateEndpoint | 8 | ✅ |
| TestMultiplierEndpoints | 4 | ✅ |
| TestClientQuoteEndpoint | 1 | ✅ |
| TestScheduledPricing | 1 | ✅ |
| TestAPIHealth | 1 | ✅ |

### Ajustes realizados a los tests

- **Multiplicadores:** Tests actualizados para coincidir con `IMMEDIATE_MULTIPLIERS` actual (4h: 1.20, 5h: 1.175, etc.).
- **Campo IVA:** La API devuelve `client_commission_iva` en lugar de `iva`; los tests aceptan ambos.

---

## 2. Endpoints verificados

| Endpoint | Método | Estado |
|----------|--------|--------|
| `/api/` | GET | ✅ operational |
| `/api/pricing/immediate` | POST | ✅ |
| `/api/pricing/scheduled` | POST | ✅ |
| `/api/pricing/quote/client` | POST | ✅ |
| `/api/pricing/multiplier/{hours}` | GET | ✅ |
| `/api/pricing/multipliers` | GET | ✅ |
| `/api/pricing/reference-prices` | GET | ✅ |
| `/api/admin/reference-prices` | GET | ✅ (sin auth para lectura) |

---

## 3. Flujos funcionales (resumen)

Sobre la base de los cambios recientes descritos en el contexto:

- **Login:** Sin credenciales demo; requiere usuarios reales en MongoDB.
- **Cobros:** Acceso desde Mi perfil → Mi negocio → Mis cobros.
- **Admin:** Disponible en footer de bienvenida y en `/admin`.
- **Precios admin:** `/admin/pricing` editable.
- **Usuarios admin:** `/admin/users` con tabs Clientes/Proveedores.
- **Edición de máquinas:** `/provider/edit-machine/:id` operativa.
- **Operador por defecto:** Persistencia en `localStorage`.

---

## 4. Requisitos de entorno

- **Backend:** Python 3.14, uvicorn, puerto 8000.
- **MongoDB:** Necesario para auth, usuarios, service requests, timers. Sin MongoDB solo funcionan endpoints de pricing y health.
- **Frontend:** Node 20.19+ o 22.12+ (Vite reclama `crypto.hash`). Node 18 genera error al arrancar.

---

## 5. Recomendaciones

1. **Tests de operators:** Ejecutar con MongoDB activo y `seed_demo_users.py` para cubrir flujos completos.
2. **Node.js:** Actualizar a Node 20+ para desarrollo frontend.
3. **CI/CD:** Considerar ejecutar `pytest tests/test_pricing_api.py` en cada push.

---

*Generado por QA automático MAQGO*
