# Engineering Operating Policy

Esta es la politica operativa oficial de ingenieria para MAQGO. Define como se ejecutan cambios en reglas de negocio, observabilidad y arquitectura.

## 1. Regla De Completitud

Ninguna regla de negocio se considera terminada si no cumple simultaneamente:

- Implementacion en codigo.
- Prueba automatizada que la valide.
- Documentacion en el documento oficial de reglas operativas correspondiente.

## 2. Alcance Del Nucleo Operativo

Esta politica aplica especialmente a cambios que afecten:

- Matching
- Avisos
- Servicios
- Operadores
- Pagos
- Cualquier otro flujo que impacte conversion, confianza, asignacion o cierre operativo

## 3. Secuencia Obligatoria

Para cualquier cambio que afecte el nucleo operativo, la secuencia obligatoria es:

1. Desarrollo
2. Tests automatizados
3. Smoke funcional
4. Canary, si la infraestructura lo permite
5. Si no existe canary, smoke manual controlado
6. Observacion mediante KPIs funcionales
7. Liberacion general

## 4. Bloqueo Arquitectonico

No se iniciaran cambios de arquitectura como:

- Event Log
- Projectors
- Nuevos consumidores
- Nuevas capas de proyeccion
- Automatizaciones estructurales

mientras exista una regla de negocio critica con inconsistencias conocidas.

## 5. Formato Obligatorio De Cada Cambio

Todo cambio debe indicar explicitamente:

- Que regla de negocio modifica
- Que prueba automatizada la valida
- Que KPI permitira verificarla en produccion
- Como sera validada: Smoke o Canary
- Si habilita o no el siguiente paso arquitectonico

## 6. Clasificacion Obligatoria De Prioridades

Antes de proponer cualquier `P0`, `P1` o `P2`, se debe indicar primero su categoria:

- Estabilizacion
- Observabilidad
- Arquitectura

No se mezclan categorias en una misma iteracion salvo que exista una dependencia tecnica demostrable.

## 7. Regla De Objetivo Por Iteracion

Cada iteracion debe declarar explicitamente su objetivo principal.

Formato recomendado:

```text
ITERACION N
Objetivo
ESTABILIZACION
No se aceptan cambios arquitectonicos.
```

```text
ITERACION N
Objetivo
OBSERVABILIDAD
No se modifican reglas de negocio.
```

```text
ITERACION N
Objetivo
ARQUITECTURA
No se aceptan nuevos P0 funcionales salvo bug critico.
```

## 8. Regla De Evidencia De Cierre

Antes de considerar terminado un `P0`, `P1` o `P2`, debe existir evidencia explicita de cierre.

Formato obligatorio:

```text
Categoria
Estabilizacion | Observabilidad | Arquitectura

Regla afectada
<nombre exacto de la regla>

Implementacion
OK | Pendiente | No aplica

Test automatizado
OK | Pendiente | No aplica

Smoke
OK | Pendiente | No aplica

Canary
OK | Pendiente | No aplica

KPIs observados
<lista de KPIs revisados>

Resultado
<sin regresiones | con hallazgos | bloqueado>

Estado
READY FOR MERGE | BLOCKED | NO READY
```

No se acepta como cierre una afirmacion informal como "creo que quedo". Debe existir evidencia.

## 9. KPIs Funcionales Minimos

Para cambios del nucleo operativo, priorizar instrumentacion y observacion de:

- `fill_rate`
- `assignment_time`
- `offers_sent`
- `offers_rejected`
- `offers_expired`
- `wave2_triggered`
- `wave3_triggered`
- `duplicate_no_arrival`
- `notifications_seen`
- `notifications_opened`
- `notifications_acknowledged`

## 10. Secuencia Actual Aprobada

La prioridad vigente del proyecto es:

- `P0` Estabilizacion: push limpio del conjunto ya validado
- `P0` Estabilizacion: smoke manual o canary controlado
- `P0` Observabilidad: instrumentacion de KPIs funcionales minimos
- `P1` Arquitectura: solo cuando lo anterior este estable, disenar e implementar un Event Log minimo con:
  - `OfferSent`
  - `ServiceConfirmed`
  - `OperatorAssigned`
  - `ServiceStarted`
  - `ServiceFinished`

## 11. Regla Permanente

No se propone una refactorizacion estructural si primero no se puede demostrar con pruebas y metricas que las reglas actuales estan estables.
