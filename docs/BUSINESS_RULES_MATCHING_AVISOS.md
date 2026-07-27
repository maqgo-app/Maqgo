# Reglas Congeladas: Matching y Avisos

Este brief resume reglas de negocio ya aprobadas y vigentes en MAQGO. Su objetivo es servir como base para futuras emisiones de `service_events` y proyectores, sin reabrir decisiones ya cerradas.

## Matching

- Pool maximo por solicitud: 5 proveedores.
- Ola 1: se contactan los primeros 3 proveedores elegibles.
- Ola 2: tras `PRIMARY_RESPONSE_WINDOW`, se agrega el proveedor 4 si sigue siendo elegible.
- Ola 3: tras `SECONDARY_RESPONSE_WINDOW`, se agrega el proveedor 5 si sigue siendo elegible.
- First accept wins: el primer proveedor que acepta bloquea la oportunidad para el resto.
- Cuando un proveedor gana, las ofertas pendientes del resto quedan superseded.
- Si no hay proveedores elegibles o se agotan los intentos permitidos, la solicitud pasa a `no_providers_available`.

## Elegibilidad de Proveedor

- Solo participan proveedores activos y disponibles.
- Un proveedor con servicio activo no puede recibir una nueva oferta.
- La maquinaria debe tener operador real asignado para poder publicarse y participar en matching.
- Una maquinaria puede tener varios operadores, pero exactamente uno principal.
- Un operador puede estar asociado a varias maquinarias.

## Avisos al Cliente

- `search_expanded`: se envía cuando el sistema amplía la busqueda en rotacion.
- `assigned` y `confirmed`: se materializan segun el avance real del servicio y el rol activo.
- `payment_failed`: se informa cuando la confirmacion falla por pago.
- Las notificaciones deben respetar segmentacion por `audience_role`.

## No Llegada

- El control aplica a servicios `confirmed` y `en_route` sin llegada registrada.
- Si se supera el umbral efectivo de demora, se envian alertas al cliente en:
  - 120 minutos
  - 180 minutos
  - 240 minutos
- Cada alerta debe persistirse una sola vez por servicio para evitar duplicados.
- Las ventanas protegidas por incidentes descuentan tiempo efectivo antes de disparar alertas.

## Llegada y Auto Start

- Si el proveedor confirma llegada y la llegada queda verificada, el servicio puede permanecer en `confirmed` o `en_route` mientras espera accion del cliente.
- Si el cliente no autoriza ingreso y han pasado 30 minutos desde la llegada verificada, el servicio entra en `in_progress` por auto start.
- El auto start debe registrarse como hecho operativo y avisar al cliente.

## Base para Event Log

- Los futuros `service_events` deben representar hechos ocurridos, no estados calculados.
- Cada evento debe respetar estas reglas congeladas antes de alimentar Hub, Push, Timeline, Growth AI o auditoria.
