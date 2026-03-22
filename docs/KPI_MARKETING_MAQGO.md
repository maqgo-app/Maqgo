# KPI Marketing & Sales — MAQGO (adaptado desde modelo marketplace tipo Dogkas)

Nomenclatura: **nombre en español** + **sigla en inglés** entre paréntesis cuando aplique.

**Nota:** Dogkas = cuidadores + clientes + reservas. MAQGO = **proveedores/operadores** + **clientes** + **servicios/reservas** (arriendo con operador).

---

## 1. Stock y flujo por lado del marketplace

### 1.1 Lado oferta — Proveedores (equiv. “Cuidadores”)

| Métrica (ES) | Sigla | Definición MAQGO |
|--------------|-------|------------------|
| Stock proveedores inicial / final | — | Cuentas `role=provider` (o equivalente) activas al inicio/fin de semana. |
| Nuevos proveedores | — | Altas netas en la semana (registro completado + verificación si aplica). |
| Proveedores desconectados (baja / churn) | **Churn** (proveedor) | Cuentas que dejaron de estar activas (definir: sin login 90d, baja explícita, etc.). |
| Embudo registro proveedor | **Funnel** | Pasos típicos: email → datos → SMS verificado → **máquina publicada** (primer “aviso activo”). |
| Avisos activos por tipo | — | En Dogkas: alojamiento / guardería / paseo. En MAQGO: **por tipo de maquinaria** (y opcional “por hora” vs “por viaje”). |
| Stocks acumulados | — | Total emails capturados, registros iniciados, registros completos, **máquinas publicadas**. |

### 1.2 Lado demanda — Clientes

| Métrica (ES) | Sigla | Definición MAQGO |
|--------------|-------|------------------|
| Stock clientes inicial / final | — | Usuarios `role=client` activos. |
| Nuevos clientes | — | Altas netas en la semana. |
| Clientes desconectados (churn) | **Churn** (cliente) | Definir regla (inactividad / baja). |
| Embudo registro cliente | **Funnel** | Email → registro parcial → registro completo (OTP, RUT). |
| Stocks acumulados | — | Leads email, registros parciales, completos. |

---

## 2. Reservas / servicios (equiv. “Bookings”)

| Métrica (ES) | Sigla | Definición MAQGO |
|--------------|-------|------------------|
| Stock reservas / servicios (si aplica) | — | Servicios en curso o pipeline; en MAQGO suele ser **documentos en `services`** o solicitudes en `service_requests`. |
| Nuevas reservas en la semana | — | Primera reserva/servicio **creado** en la semana (definir: pago confirmado vs solicitud creada). |
| Reservas repetidas en la semana | — | Cliente que ya tenía ≥1 servicio previo y genera otro. |
| Cancelaciones / rechazos | — | Cancelaciones cliente vs rechazo proveedor (según estados en DB). |
| % repetidas / total reservas | **Repeat rate** | `repeat / total` en la semana. |
| Nº reservas por cliente (año) | — | Promedio anual (trailing 12 meses o cohorte). |
| % clientes antiguos que repiten (semana) | **Repeat cohort (weekly)** | De la base de clientes “activos históricos”, % que hizo una reserva en la semana. |

---

## 3. Gasto publicitario y eficiencia (equiv. “Paid Ads + CAC”)

| Métrica (ES) | Sigla | Definición MAQGO |
|--------------|-------|------------------|
| Gasto total publicidad pagada | — | **Separar por objetivo:** CLIENTES vs PROVEEDORES (como en Dogkas). |
| Desglose por canal | — | Google PMAX, Search, Demand Gen, Meta IG/FB — mismo esquema que Dogkas. |
| Moneda | — | USD + CLP con **FX fija** semanal (como tu hoja). |
| Costo de adquisición por cliente registrado | **CAC** (cliente, registro) | `Gasto marketing clientes / nuevos registros clientes completos`. |
| Costo de adquisición por proveedor registrado | **CAC** (proveedor, registro) | `Gasto marketing proveedores / nuevos registros proveedor completos`. |
| Costo de adquisición por reserva / servicio | **CAC** (por booking) | `Gasto marketing total (o por lado) / nuevas reservas atribuibles`. |
| Retorno del gasto publicitario | **ROAS** | `Ingreso atribuible (comisión MAQGO o GMV) / gasto ads`. Definir numerador una sola vez. |
| Valor de vida del cliente | **LTV** | Comisión MAQGO acumulada por cliente (o GMV) en ventana 12–24 meses; coherente con CAC. |

---

## 4. Qué es lo más importante para MAQGO (prioridad)

1. **CAC** por cliente y por proveedor (con embudo claro) — sin oferta no hay marketplace.  
2. **Repeat rate** y **nº reservas por cliente (año)** — sustentan LTV y pagan campañas.  
3. **Gasto por canal** + **ROAS** (o **MER** si mezclan canales) — para decidir recursos.  
4. **Churn** proveedor y cliente — alerta temprana de desequilibrio.  
5. **LTV** — cuando ya tengan 6–12 meses de historia; antes, estimar con repetición y ticket.

---

## 5. Implementación: hoja vs producto

- **Hoja semanal (como Dogkas):** sigue siendo la forma más rápida si el gasto ads vive en Google/Meta y el equipo lo copia semanalmente.  
- **Producto (admin / analytics):** útil para **stocks**, **embudos**, **reservas** y **churn** automáticos desde Mongo; **gasto ads** suele seguir viniendo de plataformas hasta integrar cost API.

**Regla de oro:** misma **definición de semana** (lun–dom vs calendario Chile) y mismo **FX** para comparar semanas entre sí.

---

*Documento de referencia; no reemplaza definiciones legales/contables de comisiones.*
