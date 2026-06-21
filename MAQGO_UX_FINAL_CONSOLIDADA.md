# MAQGO — UX Final Consolidada (Cliente)

Este documento consolida **una única definición UX final** usando **exclusivamente** lo ya producido durante los últimos días (documentos + pantallas existentes + prototipos UI internos).

Restricciones (obligatorias)
- No implementar.
- No crear nuevas pantallas.
- No crear nuevas ideas.
- No proponer una tercera arquitectura.

---

## FASE 1 — Inventario completo

### A) Documentos (hace dos días)
- `.trae/documents/PRD_Propuesta_UX_Pantallas_Historicas_Avisos_SinChat.md`
- `.trae/documents/Arquitectura_Tecnica_Propuesta_UX_Avisos_SinChat.md`
- `.trae/documents/Diseno_Paginas_Propuesta_UX_Avisos_SinChat.md`

### B) Documentos (hoy) relacionados a UX / flujo cliente / avisos / notificaciones
Documentos en `.trae/documents/` detectados en el repo:
- **Avisos (producto/diseño/arquitectura)**
  - `.trae/documents/PRD_Hub_Avisos_Unico.md`
  - `.trae/documents/Arquitectura_Tecnica_Hub_Avisos.md`
  - `.trae/documents/Diseno_Paginas_Hub_Avisos.md`
- **Flujo cliente (estados/pantallas)**
  - `.trae/documents/PRD_UI_3_Pantallas_Estados_Servicio_Cliente.md`
  - `.trae/documents/Arquitectura_Tecnica_UI_3_Pantallas_Estados_Servicio_Cliente.md`
  - `.trae/documents/Diseno_UI_3_Pantallas_Estados_Servicio_Cliente.md`
  - `.trae/documents/Diseno_Pantalla_Reserva_Confirmada.md`
- **Propuesta UX sin chat (consolidación previa)**
  - `.trae/documents/PRD_Propuesta_UX_Pantallas_Historicas_Avisos_SinChat.md`
  - `.trae/documents/Arquitectura_Tecnica_Propuesta_UX_Avisos_SinChat.md`
  - `.trae/documents/Diseno_Paginas_Propuesta_UX_Avisos_SinChat.md`

### C) Prototipos UI (hoy, solo DEV)
Prototipos internos para comparación visual (mock, sin backend):
- `frontend/src/screens/client/AvisosHubScreen.jsx` (ruta DEV: `/client/avisos`)
- `frontend/src/screens/client/AvisosHubCardBasedScreen.jsx` (ruta DEV: `/client/avisos-cards`)

Pantallazos comparativos:
- `frontend/public/qa-screenshots-history/avisos-hub/avisos-hub.png`
- `frontend/public/qa-screenshots-history/avisos-hub/avisos-hub-cards.png`

### D) Pantallas históricas existentes (implementadas hoy en producción)
Rutas y archivos actuales del flujo cliente (post-pago):
- **Servicio confirmado**: `/client/service-confirmed` → `frontend/src/screens/client/ServiceConfirmed.js`
- **Operador asignado**: `/client/assigned` → `frontend/src/screens/client/MachineryAssignedScreen.js`
- **Operador en camino**: `/client/en-route` → `frontend/src/screens/client/ClientEnRouteScreen.js`
- **Operador llegó**: `/client/provider-arrived` → `frontend/src/screens/client/ProviderArrivedScreen.js`
- **Servicio en curso**: `/client/service-active` → `frontend/src/screens/client/ServiceActiveScreen.js`
- **Servicio finalizado**: `/client/service-finished` → `frontend/src/screens/client/ServiceFinishedScreen.jsx`
- **Valoración**: `/client/rate` → `frontend/src/screens/client/RateService.js`

---

## FASE 2 — Comparación

### A) Propuesta UX “pantallas históricas + avisos + sin chat” (3 docs base)
| Elemento | Qué problema resolvía | Qué aportaba | Qué sigue válido | Qué quedó obsoleto | Qué fue mejorado después |
|---|---|---|---|---|---|
| PRD Propuesta UX sin chat | Quitar dependencia de conversación para entender el servicio | Flujo cliente claro + reglas sin chat | Mantener navegación actual; comunicación vía avisos; foco en estados | Lenguaje interno en algunos textos | Se detalló mejor el HUB y se prototipó visualmente |
| Arquitectura técnica propuesta | Evitar dispersión de “mensajes” en múltiples lugares | Un único lugar para ver eventos | Punto único de “Avisos” | Detalles técnicos exceden esta definición UX final | Se consolidó el diseño visual del HUB con prototipos |
| Diseño de páginas propuesta | Falta de consistencia visual/jerárquica entre pantallas | Sistema de cards, jerarquía clara, continuidad | Tokens visuales, estructura de cards, sensación de avance | Notas de implementación (no aplican en este documento) | Se contrastó con el look del centro de avisos actual |

### B) HUB de Avisos (3 docs) vs prototipos UI (hoy)
| Elemento | Qué problema resolvía | Qué aportaba | Qué sigue válido | Qué quedó obsoleto | Qué fue mejorado después |
|---|---|---|---|---|---|
| PRD HUB Avisos | El chat mezclaba conversación y estado | Un registro único de eventos del servicio | Lista/timeline, leído/no leído, criticidad, confirmación en avisos críticos | Términos técnicos en copy | Los prototipos ajustan jerarquía y legibilidad |
| Diseño HUB Avisos | Falta de una presentación consistente de eventos | Agrupación por fecha, filtros y detalle | Agrupar por “Hoy/Anteriores”, filtros, detalle de aviso | Tokens no coinciden con paleta MAQGO histórica | Prototipo “timeline” respeta mejor la estética histórica |
| Prototipo AvisosHubScreen | Comparar una experiencia premium de timeline | Jerarquía clara, lectura rápida, sensación “app premium” | Timeline + agrupación + detalle | Es mock y no refleja datos reales todavía | Se generó versión comparativa basada en cards actuales |
| Prototipo AvisosHubCardBasedScreen | Comparar con lo que ya existe hoy | Reuso visual del sistema actual de cards | Consistencia con “Avisos” actual (cards) | Menos “sensación de timeline” | Se mantiene como referencia de consistencia visual |

### C) Pantallas existentes (producción) del flujo cliente
| Pantalla existente | Qué problema resolvía | Qué aporta | Qué sigue válido | Qué quedó obsoleto | Qué fue mejorado después |
|---|---|---|---|---|---|
| Payment Result (`/client/payment-result`) | Cerrar el pago con claridad y dar siguiente paso | Confirmación + resumen económico + CTA al seguimiento | Debe seguir siendo el puente post-pago | Mensajes tipo “te avisaremos” (cuando existan) | Alineación de lenguaje a “Avisos” |
| Servicio confirmado (`/client/service-confirmed`) | Confirmación dedicada | “Tranquilidad” post-pago | Su intención es válida | Duplicidad con “operador asignado” si se separa | Se consolida su rol como pantalla 1 definitiva |
| Operador asignado (`/client/assigned`) | Primer estado operativo | Mapa + datos operativos | Debe existir como experiencia de seguimiento | Separación artificial vs “en camino” | Se consolida como “Seguimiento del Servicio” con estados internos |
| En camino (`/client/en-route`) | Mostrar traslado | Mapa + ETA | El estado es válido | Pantalla separada genera duplicidad | Se consolida como estado interno del seguimiento |
| Llegó (`/client/provider-arrived`) | Hito crítico en obra | Confirmación operativa | Debe existir como estado visible | Como pantalla separada es redundante si se integra | Se consolida como estado interno del seguimiento |
| En curso (`/client/service-active`) | Visualizar ejecución | Inicio/tiempo/estado | Debe existir | Copy “operacional frío” | Se ajusta lenguaje premium |
| Finalizado (`/client/service-finished`) | Cierre + resumen | Resumen completo | Debe existir | Copy “operacional frío” | Se usa como referencia histórica |
| Valoración (`/client/rate`) | Cierre de satisfacción/calidad | Estrellas + comentario | Debe existir | N/A | Se mantiene |

---

## FASE 3 — Reglas nuevas obligatorias (aplicadas en esta consolidación)

Reglas de experiencia
- El footer actual no se rediseña: misma navegación, posiciones e iconografía.
- No existe chat ni mensajería libre: sin burbujas, sin conversaciones.
- La comunicación al cliente se expresa mediante: Centro de Avisos + push + sonidos + vibración + email/SMS cuando aplique.

Reglas de información (privacidad)
- No mostrar empresa proveedora ni información comercial.

Reglas visuales
- Inspiración directa en pantallas históricas: sistema de cards, espaciados, jerarquía, sensación de avance.

Reglas de lenguaje
- Lenguaje premium y claro para el cliente.
- Evitar terminología interna (ej.: “fuente de verdad”, “sistema transversal”) y copy frío.

---

## FASE 4 — Flujo cliente definitivo (de “Procesando Pago” a “Valoración”)

Flujo consolidado (sin crear pantallas nuevas)
1. **Procesando Pago** (pantalla existente del flujo de pago)
2. **Servicio Confirmado** (pantalla independiente)
3. **Seguimiento del Servicio** (pantalla independiente con 2 estados internos)
   - Operador asignado
   - Operador en camino
4. **Operador llegó** (pantalla independiente)
5. **Servicio en Curso** (pantalla independiente)
6. **Servicio Finalizado** (pantalla independiente)
7. **Valoración** (pantalla independiente)

Decisiones A/B (pantalla vs estado interno)
- **Servicio Confirmado: Pantalla independiente.**
  - Justificación: es el momento de mayor ansiedad del cliente; requiere un “OK” claro + resumen.
- **Operador asignado/en camino: Estados internos dentro de “Seguimiento del Servicio”.**
  - Justificación: comparten el mismo espacio mental (seguimiento operativo). Mantener una sola experiencia evita duplicidad visual.
- **Operador llegó: Pantalla independiente.**
  - Justificación: cambia el objetivo mental de seguimiento a control operacional/seguridad (verificación de identidad + autorización de ingreso + gestión de espera).
- **Servicio en curso: Pantalla independiente.**
  - Justificación: cambia el objetivo mental (de seguimiento de llegada a ejecución del trabajo).
- **Servicio finalizado: Pantalla independiente.**
  - Justificación: cambia a resumen y cierre.
- **Valoración: Pantalla independiente.**
  - Justificación: cierre de satisfacción, separación clara del resumen.

---

## FASE 5 — Matriz de contenido por estado/pantalla

---

## Jerarquía oficial de información MAQGO (congelada)

Esta sección es la **referencia oficial** de jerarquía para implementación y QA.
No define contenido nuevo: solo fija qué domina la pantalla y el orden visual obligatorio.

### Servicio Confirmado
- Bloque dominante: Estado de confirmación (hito + certeza).
- Bloque secundario: Próximo paso inmediato (qué viene después).
- Bloque terciario: Resumen corto (equipo/operador/cobro) + últimos avisos.
- Orden visual obligatorio: Estado → Próximo paso → Resumen corto → Últimos avisos.

### Seguimiento — Asignado
- Bloque dominante: Estado actual (Asignado) + instrucción operativa (“qué preparar ahora”).
- Bloque secundario: Identificación operativa (operador/datos de acceso) + equipo reservado.
- Bloque terciario: Últimos avisos + mapa/ETA si aún no aporta decisión inmediata.
- Orden visual obligatorio: Estado/instrucción → Identificación+equipo → (Mapa/ETA si aplica) → Últimos avisos.

### Seguimiento — En Camino
- Bloque dominante: Progreso del traslado (mapa/ETA como señal principal de avance).
- Bloque secundario: Estado “En camino” + resumen compacto de operador y equipo.
- Bloque terciario: Últimos avisos + acciones operativas (solo si existen y son relevantes).
- Orden visual obligatorio: Mapa/ETA → Estado+resumen compacto → (Acciones si aplican) → Últimos avisos.

### Operador llegó
- Bloque dominante: Confirmación de llegada + acción inmediata (ingreso/portería).
- Bloque secundario: Identificación para acceso (RUT/patente) + equipo reservado.
- Bloque terciario: Últimos avisos.
- Orden visual obligatorio: Estado+acción inmediata → Identificación+equipo → Últimos avisos.

### Servicio En Curso
- Bloque dominante: Estado “En curso” + tiempo (inicio/transcurrido) para certeza de ejecución.
- Bloque secundario: Resumen operativo compacto (equipo + operador).
- Bloque terciario: Últimos avisos.
- Orden visual obligatorio: Estado+tiempo → Resumen operativo → Últimos avisos.

### Servicio Finalizado
- Bloque dominante: Confirmación de cierre + resumen del servicio (qué se ejecutó).
- Bloque secundario: Resumen económico (total/costos) para cierre transparente.
- Bloque terciario: Últimos avisos (cierre/cobro) como trazabilidad final.
- Orden visual obligatorio: Estado+resumen servicio → Resumen económico → Últimos avisos.

### Valoración
- Bloque dominante: Pregunta + estrellas.
- Bloque secundario: Comentario opcional.
- Bloque terciario: Confirmación de envío (post-acción).
- Orden visual obligatorio: Estrellas → Comentario → CTA enviar → Confirmación.

> Nota: “Equipo Reservado” se mantiene como bloque estándar en todas las pantallas operativas.

### 1) Servicio Confirmado (pantalla)
- Información principal
  - Confirmación visual fuerte (estado + tranquilidad)
  - Próximo paso claro (“qué ocurre ahora”)
- Información secundaria
  - Equipo reservado (maquinaria, especificación, ubicación, fecha/hora, duración)
  - Operador asignado (solo datos útiles: nombre y, si existe, calificación; sin empresa). Fotografía: no respaldada hoy.
  - Resumen económico
  - Últimos avisos (2–3 eventos recientes)
- CTA
  - Ir a seguimiento del servicio
- Avisos visibles
  - Confirmación de reserva
  - Operador asignado (si ya ocurrió)
- Elementos eliminados
  - Chat / mensajería
  - Empresa proveedora

### 2) Operador asignado (estado interno: Seguimiento del Servicio)
- Información principal
  - Estado actual + “qué preparar” para la llegada
- Información secundaria
  - Operador (nombre + RUT/patente para portería; calificación si existe). Fotografía: no respaldada hoy.
  - Equipo reservado
  - Últimos avisos
- CTA
  - Ver Centro de Avisos
- Avisos visibles
  - Operador asignado
  - Cambios relevantes (demora/incidencia si aplica)
- Elementos eliminados
  - Conversación
  - Datos comerciales del proveedor

### 3) Operador en camino (estado interno: Seguimiento del Servicio)
- Información principal
  - Mapa + ETA (distancia restante: no respaldada hoy)
- Información secundaria
  - Operador (identificación operativa) + equipo reservado
  - Últimos avisos
- CTA
  - Acciones operativas vigentes (ej.: reportar incidencia si corresponde)
- Avisos visibles
  - Inicio de traslado
  - Demora/incidente si aplica
- Elementos eliminados
  - Chat

### 4) Operador llegó (pantalla)
- Información principal
  - Confirmación de llegada y acción siguiente (ingreso a obra)
- Información secundaria
  - Operador (RUT/patente)
  - Últimos avisos
- CTA
  - Confirmar/autorizar ingreso (si corresponde)
- Avisos visibles
  - Llegada registrada
- Elementos eliminados
  - Chat

### 5) Servicio en curso (pantalla)
- Información principal
  - Estado “en curso” + hora de inicio + tiempo transcurrido
- Información secundaria
  - Operador + equipo reservado
  - Últimos avisos
- CTA
  - Ver Centro de Avisos
- Avisos visibles
  - Servicio iniciado
  - Incidencias operativas si se reportan
- Elementos eliminados
  - Chat

### 6) Servicio finalizado (pantalla)
- Información principal
  - Confirmación de finalización + resumen del servicio
- Información secundaria
  - Equipo reservado + operador + ubicación + inicio/término + duración efectiva
  - Resumen económico (servicio/costos/total)
  - Últimos avisos
- CTA
  - Evaluar servicio
- Avisos visibles
  - Servicio finalizado
  - Cobro procesado
- Elementos eliminados
  - Chat

### 7) Valoración (pantalla)
- Información principal
  - Estrellas + comentario
- Información secundaria
  - Confirmación de envío
- CTA
  - Enviar evaluación
- Avisos visibles
  - (Opcional) recordatorio “evaluación pendiente” como aviso
- Elementos eliminados
  - Cualquier conversación

---

## FASE 6 — Centro de Avisos definitivo (consolidación)

### Qué se mantiene (de lo ya producido)
- Timeline/lista con **agrupación por fecha** (Hoy / Anteriores).
- Filtros visibles: **Todos / Sin leer / Críticos**.
- Detalle de aviso (modal) con: título, fecha/hora, actor (Sistema/Operador/Cliente), cuerpo.
- Marcar como leído al abrir detalle.
- Confirmación (“Entendido”) solo cuando el aviso requiere acción.

### Qué se consolida (entre “timeline” y “cards”)
- Se mantiene la lectura tipo **timeline** (mejor sensación de progreso).
- Se mantiene el **sistema de cards** y su consistencia visual (mejor familiaridad).
- Resultado: lista timeline con ítems en cards (rail/indicador por criticidad).

### Configuración de notificaciones (obligatorio en esta consolidación)
En la parte superior del Centro de Avisos debe existir un bloque de **Configuración de notificaciones**:
- Estado: “Push activadas” / “Push desactivadas”.
- Acción: activar/desactivar (según permisos del dispositivo).

Estado actual (técnico)
- La capacidad de push existe (API + suscripción/permiso), pero este bloque de configuración dentro del Centro de Avisos aún no existe en producción.

### Estructura final (sin pantallas nuevas)
El Centro de Avisos existe como **una única pantalla** accesible desde el flujo (sin inventar navegación nueva):
1. Header
2. Configuración de notificaciones
3. Controles (filtros)
4. Lista (Hoy / Anteriores)
5. Detalle (modal)

---

## FASE 7 — Matriz definitiva de notificaciones

> Esta matriz consolida lo que ya se definió y lo que el sistema hoy soporta como canales (push, sonido, vibración, email/SMS cuando aplique). No introduce nuevos eventos fuera de los ya listados.

| Evento | Criticidad | Push | Sonido | Vibración | Email | SMS |
|---|---:|---|---|---|---|---|
| Reserva confirmada | Alta | Sí (evento `confirmed`) | Sí | Sí | No | No |
| Operador asignado | Media | Parcial (se refleja con `confirmed` → estado) | Sí | Sí | No | No |
| Operador inició traslado | Alta | No (no hay evento backend dedicado hoy) | Parcial (solo UI) | Parcial (solo UI) | No | No |
| Operador llegó | Alta | Sí (evento `arrival`) | Sí | Sí | No | No |
| Demora reportada | Media | Parcial (hay `incident`, depende de integración) | Parcial | Parcial | No | No |
| Incidencia crítica | Crítica | Parcial (según implementación de incidentes) | Parcial | Parcial | No (hoy) | No (hoy) |
| Servicio iniciado | Alta | Sí (evento `started`) | Sí | Sí | Parcial (solo en auto-start) | No |
| Servicio finalizado | Alta | Sí (evento `finished`) | Sí | Sí | No | No |
| Evaluación pendiente | Media | No (hoy) | No | No | No (hoy) | No |

Notas de trazabilidad
- Push soporta explícitamente: `confirmed`, `arrival`, `started`, `finished`.
- Email existe hoy solo para casos acotados (p. ej. auto-start).
- SMS existe hoy principalmente para OTP/ingreso, no como canal post-pago.

---

## Anexo — Trazabilidad (capacidades reales hoy)

Esta tabla valida qué partes del documento están respaldadas por capacidades reales actuales.

| Elemento | Existe hoy | Regla de negocio | Soporte técnico actual | Frecuencia actual | Impacto de eliminarlo |
|---|---|---|---|---|---|
| ETA | Parcial | Experiencia cliente; requisito operacional | Frontend: sí; Backend: parcial | Estático (por evento); simulación en QA/DEMO | Baja–Media |
| Mapa | Parcial | Experiencia cliente; trazabilidad visual | Frontend: sí (mapa); Backend: no tracking real | Simulado / no tiempo real | Media |
| Distancia restante | No | Experiencia cliente | No | N/A | Baja |
| Nombre operador | Sí | Identificación; seguridad | Backend: sí; Frontend: sí | Por evento | Media |
| Fotografía operador | No | Identificación/confianza | No | N/A | Baja |
| Calificación operador | Parcial | Experiencia cliente/confianza | Frontend: sí si viene; Backend: parcial | Estático | Baja–Media |
| RUT operador | Parcial | Identificación; portería | Backend: sí; Frontend: sí si viene | Por evento | Media |
| Patente | Parcial | Identificación; portería | Backend: sí; Frontend: sí si viene | Por evento | Media |
| Últimos avisos | Parcial | Trazabilidad; experiencia cliente | Frontend: sí (tarjeta); Backend: no feed | Manual/por pantalla | Baja–Media |
| Centro de avisos | No (en prod) | Trazabilidad; reemplazo de chat | Mock/DEV: sí; Prod: no | N/A | Alta (como objetivo), pero hoy no rompe prod |
| Push notifications | Parcial | Continuidad operativa | Backend: sí; Frontend: sí | Por evento | Media–Alta |
| Sonidos | Sí | Experiencia cliente/alerta | Frontend: sí | Por evento/pantalla | Media |
| Vibración | Sí | Experiencia cliente/alerta | Frontend: sí | Por evento/pantalla | Media |
| Email | Parcial | Respaldo de comunicación | Backend: sí (acotado) | Por evento + jobs | Baja–Media |
| SMS | Parcial | Control de acceso (OTP) | Backend: sí (OTP) | Por acción | Media (login); post-pago depende |
| Operador asignado | Sí | Seguimiento operativo | Frontend: sí; Backend: sí (confirmed) | Por evento | Alta |
| Operador en camino | Parcial | Seguimiento | Frontend: sí (estado UI); Backend: no status | Manual/simulado | Baja–Media |
| Operador llegó | Parcial | Hito crítico/portería | Backend: sí (arrival); Frontend: sí | Por evento | Alta |
| Servicio en curso | Sí | Ejecución | Backend: sí (in_progress); Frontend: sí | Por evento | Alta |
| Servicio finalizado | Sí | Cierre/trazabilidad | Backend: sí (finished); Frontend: sí | Por evento | Alta |

---

## Entregable final

Esta definición consolida:
- Un flujo cliente definitivo sin pantallas adicionales.
- Un “Seguimiento del Servicio” con estados internos (asignado/en camino).
- Un Centro de Avisos único con filtros, agrupación por fecha, detalle, y configuración de notificaciones.

Lista para implementar sin rediseñar el footer, sin reintroducir chat y respetando privacidad del proveedor.
