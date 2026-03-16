# Ejercicio: Desglose de Reserva Híbrida — Retroexcavadora 5h + 1 Día Posterior

## Reglas de visibilidad
| Actor | Ve | No ve |
|-------|-----|-------|
| **Cliente** | Su total a pagar, desglose de servicio, tarifa MAQGO (10%) | — |
| **Proveedor** | Su desglose (servicio, bonificación, traslado), subtotal, monto a recibir, monto a facturar | Monto cobrado al cliente, % comisión MAQGO, estructura de tarifa MAQGO |
| **MAQGO** | Todo | — |

---

## Escenario
- **Maquinaria:** Retroexcavadora (cobro por hora)
- **Hoy:** 5 horas con sobrecargo por servicio inmediato
- **Día posterior:** 1 día adicional (8 horas estándar)
- **Proveedor:** Precio base $80.000/hr, traslado $35.000
- **Cliente:** Necesita factura (SÍ)

---

## 1. Cálculo del costo del servicio (subtotal proveedor)

### 1.1 Multiplicador por hora inmediata
| Horas | Multiplicador | Sobreprecio |
|-------|---------------|-------------|
| 4     | 1.20          | +20%        |
| **5** | **1.175**     | **+17.5%**  |
| 6     | 1.15          | +15%        |
| 7     | 1.125         | +12.5%      |
| 8     | 1.10          | +10%        |

Para 5 horas hoy → multiplicador = **1.175**

### 1.2 Día de hoy (5 horas)
| Concepto | Cálculo | Monto (CLP) |
|---------|---------|-------------|
| Base (sin sobrecargo) | 80.000 × 5 | 400.000 |
| Con multiplicador inmediato | 80.000 × 5 × 1.175 | **470.000** |
| Bonificación alta demanda | 470.000 - 400.000 | 70.000 |

### 1.3 Día adicional (1 día = 8h)
Los días adicionales no llevan sobrecargo (tarifa normal).

| Concepto | Cálculo | Monto (CLP) |
|---------|---------|-------------|
| Servicio día adicional | 80.000 × 8 × 1 | **640.000** |

### 1.4 Traslado
La retroexcavadora requiere traslado (lowboy).

| Concepto | Monto (CLP) |
|---------|-------------|
| Traslado | **35.000** |

### 1.5 Subtotal bruto (base para comisiones)
| Concepto | Monto (CLP) |
|----------|-------------|
| Hoy (5h con sobrecargo) | 470.000 |
| Día adicional (8h) | 640.000 |
| Traslado | 35.000 |
| **Subtotal neto** | **1.145.000** |

---

## 2. Lo que paga el cliente (MAQGO factura al cliente)

### 2.1 Opción A: Cliente **NO** necesita factura
- Tarifa MAQGO: 10% + IVA sobre subtotal
- Comisión neta: 1.145.000 × 0.10 = **114.500**
- IVA comisión (19%): 114.500 × 0.19 = **21.755**
- Tarifa MAQGO total: 114.500 + 21.755 = **136.255**

| Concepto | Monto (CLP) |
|----------|-------------|
| Subtotal proveedor | 1.145.000 |
| Tarifa MAQGO (10% + IVA) | 136.255 |
| **Total a pagar** | **1.281.255** |

### 2.2 Opción B: Cliente **SÍ** necesita factura
- Base para IVA: subtotal + comisión neta MAQGO = 1.145.000 + 114.500 = **1.259.500**
- IVA 19% sobre base: 1.259.500 × 0.19 = **239.305**
- Total con factura: 1.259.500 + 239.305 = **1.498.805**

| Concepto | Monto (CLP) |
|----------|-------------|
| Subtotal (neto) | 1.145.000 |
| Tarifa MAQGO (10% neto) | 114.500 |
| IVA 19% (sobre base facturable) | 239.305 |
| **Total facturado al cliente** | **1.498.805** |

**En este ejercicio usamos la Opción B (con factura).**  
Total que paga el cliente: **$1.498.805**

---

## 3. Lo que recibe el proveedor (proveedor factura a MAQGO)

### 3.1 Descuento MAQGO (10% + IVA)
| Concepto | Cálculo | Monto (CLP) |
|----------|---------|-------------|
| Tarifa MAQGO (10%) | 1.145.000 × 0.10 | 114.500 |
| IVA tarifa (19%) | 114.500 × 0.19 | 21.755 |
| **Total descuento** | | **136.255** |

### 3.2 Neto al proveedor
| Concepto | Monto (CLP) |
|----------|-------------|
| Subtotal bruto | 1.145.000 |
| Menos: Tarifa MAQGO (10% + IVA) | -136.255 |
| **Lo que recibe el proveedor** | **1.008.745** |

---

## 4. Flujo de facturación (modelo Cabify/Uber)

| Actor | Acción | Monto |
|-------|--------|-------|
| **Cliente** | Paga a MAQGO | $1.566.933 |
| **MAQGO** | Factura al cliente (total del servicio) | $1.566.933 |
| **Proveedor** | Factura a MAQGO (por su neto) | $1.008.745 |
| **MAQGO** | Paga al proveedor (tras recibir su factura) | $1.008.745 |

---

## 5. Desglose por pantalla del flujo

### 5.1 Cliente — Confirmación
```
Servicio hoy (5h) + bonificación        470.000
1 día adicional (8h)                    640.000
Traslado                                 35.000
────────────────────────────────────────────
Subtotal                              1.145.000
Tarifa MAQGO (10%)                       114.500
IVA 19% (base facturable)                 239.305
────────────────────────────────────────────
TOTAL A PAGAR                         1.498.805
```

### 5.2 Cliente — Pantalla de pago
- Total cobrado: $1.498.805  
- Datos de facturación: si necesita factura → MAQGO los usa para emitir la factura al cliente.

### 5.3 Proveedor — Solicitud recibida
*(El proveedor NO ve porcentajes ni estructura de comisión MAQGO)*
```
Valor del servicio                      1.145.000
────────────────────────────────────────────
TOTAL A RECIBIR                       1.008.745
```

### 5.4 Proveedor — Servicio finalizado (voucher)
El proveedor **nunca** ve: monto cobrado al cliente, ni estructura de comisión MAQGO.
```
TU DESGLOSE:
  Servicio (5h)                          470.000
  Bonificación alta demanda                70.000
  1 día adicional (8h)                   640.000
  Traslado                                35.000
  ────────────────────────────────────────────
  Subtotal                             1.145.000

Factura a MAQGO por:
  Monto a facturar                      1.008.745

RECIBIRÁS: 1.008.745
```

### 5.5 Proveedor — Subir factura
*(El proveedor NO ve tarifa MAQGO ni monto cliente)*
```
TU DESGLOSE · Factura a MAQGO por:
  Servicio (5h)                          470.000
  Bonificación                            70.000
  Día adicional (8h)                     640.000
  Traslado                                35.000
  ────────────────────────────────────────────
  Monto a facturar                     1.008.745

Datos de MAQGO para facturar:
  Razón Social: MAQGO SpA
  RUT: 76.248.124-3
  Giro: Plataforma de servicios...
  Dirección: Santiago, Chile

💰 Recibirás 1.008.745 — Pago en 3 días hábiles
```

---

## 6. Información interna MAQGO (el proveedor NUNCA la ve)

| Concepto | Cálculo | Monto (CLP) |
|----------|---------|-------------|
| Total cobrado al cliente | (con factura) | **1.498.805** |
| Tarifa MAQGO al proveedor (10%) | 1.145.000 × 0.10 | 114.500 |
| IVA tarifa (19%) | 114.500 × 0.19 | 21.755 |
| Descuento total al proveedor | | 136.255 |

---

## 7. Resumen MAQGO

| Concepto | Monto (CLP) |
|----------|-------------|
| Cliente paga | 1.498.805 |
| Proveedor recibe | 1.008.745 |
| Tarifa MAQGO (cliente 10%+IVA) | 136.255 |
| Tarifa MAQGO (proveedor 10%+IVA) | 136.255 |
| **Total ingresos MAQGO** | **272.510** |
| IVA retenido (si aplica) | Variable según régimen |

---

## 8. Horarios de la reserva (ejemplo)

| Período | Horas | Tarifa | Fecha ejemplo |
|---------|-------|--------|---------------|
| Hoy (inmediato) | 5h | Con sobrecargo 17.5% | Martes 10 feb |
| Día adicional | 8h | Tarifa normal | Miércoles 11 feb |
| **Total horas** | **13h** | | |

---

## 9. Checklist del flujo completo

1. **Cliente** selecciona retro, 5h hoy + 1 día adicional  
2. **Cliente** elige ubicación y proveedor  
3. **Cliente** confirma → ve total $1.566.933 (con factura)  
4. **Cliente** completa datos de facturación (para MAQGO)  
5. **Cliente** registra tarjeta y paga  
6. **Proveedor** recibe solicitud → ve solo "Valor 1.145.000" y "Total a recibir 1.008.745"  
7. **Proveedor** acepta y realiza hoy 5h + mañana 8h  
8. **Proveedor** termina servicio → ve voucher con su desglose y $1.008.745 (sin tarifa ni % MAQGO)  
9. **Proveedor** sube factura a MAQGO por $1.008.745  
10. **MAQGO** factura al cliente por $1.566.933  
11. **MAQGO** paga al proveedor en 3 días hábiles  

---

## 10. Componente ServiceDetailBreakdown

Uso del componente reutilizable que desglosa todo:

```jsx
import ServiceDetailBreakdown from '../components/ServiceDetailBreakdown';

// Vista cliente (desglose completo)
<ServiceDetailBreakdown
  service={{
    serviceAmount: 470000,
    bonusAmount: 70000,
    transportAmount: 35000,
    additionalDays: 1,
    additionalCost: 640000,
    todayHours: 5
  }}
  variant="client"
  needsInvoice={true}
/>

// Vista proveedor (sin total cliente ni % MAQGO)
<ServiceDetailBreakdown
  service={{
    serviceAmount: 470000,
    bonusAmount: 70000,
    transportAmount: 35000,
    additionalDays: 1,
    additionalCost: 640000,
    net_total: 1008745
  }}
  variant="provider"
/>

// Vista admin (todo incl. info interna MAQGO)
<ServiceDetailBreakdown
  service={{ ... }}
  variant="admin"
  needsInvoice={true}
/>
```

---

## 11. Tabla de datos completa (referencia interna)

| Concepto | Cliente ve | Proveedor ve | Cálculo |
|----------|------------|--------------|---------|
| Servicio hoy (5h) | 470.000 | 470.000 | 80.000 × 5 × 1.175 |
| Bonificación | 70.000 | 70.000 | 470.000 - 400.000 |
| Día adicional (8h) | 640.000 | 640.000 | 80.000 × 8 |
| Traslado | 35.000 | 35.000 | 35.000 |
| Subtotal | 1.145.000 | 1.145.000 | suma |
| Tarifa MAQGO (10% + IVA) | 136.255 | — | 1.145.000 × 0.10 × 1.19 |
| IVA factura (19%) | 239.305 | — | (1.145.000 + 114.500) × 0.19 |
| **Total cliente** | **1.498.805** | **—** | — |
| Tarifa MAQGO (10% + IVA) | — | — | 1.145.000 × 0.10 × 1.19 = 136.255 |
| **Total proveedor** | — | **1.008.745** | 1.145.000 - 136.255 |
