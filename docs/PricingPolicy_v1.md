# Política de Precios MAQGO v1

**Reglas de negocio** para cálculo de precios y comisiones.

---

## Comisiones MAQGO

| Actor | Comisión | Descripción |
|-------|----------|-------------|
| **Cliente** | 10% + IVA | Tarifa por Servicio. Se suma al subtotal (servicio + bono + traslado). |
| **Proveedor** | 10% + IVA | Tarifa por Servicio. Se descuenta del subtotal al pago. |

- IVA Chile: 19%
- El cliente paga: subtotal + (10% comisión) + (IVA sobre comisión)
- El proveedor recibe: subtotal − (10% comisión) − (IVA sobre comisión)

---

## Multiplicadores reserva inmediata (por horas)

| Horas | Multiplicador | Sobreprecio |
|-------|---------------|-------------|
| 4 | 1.20 | +20% |
| 5 | 1.175 | +17.5% |
| 6 | 1.15 | +15% |
| 7 | 1.125 | +12.5% |
| 8 | 1.10 | +10% |

---

## Maquinaria

- **Por hora:** retroexcavadora, excavadora, bulldozer, motoniveladora, compactadora, minicargador, grúa
- **Por viaje:** camión pluma, camión aljibe, camión tolva
- **Traslado:** aplica a maquinaria por hora (lowboy). No aplica a camiones.

---

*Fuente de verdad para `backend/pricing/constants.py` y `frontend/src/utils/pricing.js`*
