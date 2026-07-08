# MAQGO — Lista de Cierre (Solo Coder vs Builder)

Objetivo final: un usuario puede pasar de **Cliente → Proveedor → Operador** sin sentir que cambió de aplicación.

## Roles

### Solo Coder (implementa)
- Implementa cambios aprobados.
- Mantiene cambios pequeños y verificables.
- No “mejora” por gusto: solo lo que bloquea la unificación y el cierre.

### Builder (certifica)
- No implementa.
- Certifica con evidencia visual en **producción**.
- Declara “Congelado” solo cuando cumple Definition of Done.

## Definición de Done (por bloque)

Un bloque queda **Congelado** cuando:
- Las pantallas incluidas se ven y se sienten iguales entre roles (layout/jerarquía/espaciado/tipografía/estados).
- Los flujos críticos navegan correctamente (back/deeplinks/footer/header).
- No hay copy técnico/placeholder.
- La evidencia en producción permite afirmar: “no siento cambio de aplicación”.

## Evidencia obligatoria (Builder)

Por pantalla (Desktop + Mobile):
- URL final
- Captura/registro visual de la pantalla en producción
- Si hubo corrección: Antes → Después → Comparación con marcado

## Prioridades

P0 = bloquea cierre.
P1 = mejora de calidad sin bloquear el cierre.

---

# P0 — Bloques de cierre

## 1) Unificar Operador con Cliente (P0)

**Alcance**: todas las pantallas de Operador deben usar el mismo estándar visual que Cliente.

- Misma estructura de layout
- Mismos componentes base
- Misma tipografía y jerarquía
- Mismos espaciados
- Mismos CTAs
- Mismos estados
- Mismos loaders
- Mismos errores
- Mismos empty states

**Criterio de congelación**: “Operador” queda congelado.

**Recomendación (significativa)**
- Problema: Operador hoy se percibe como “otra app” por divergencias visuales y de componentes.
- Beneficio esperado: consistencia premium; menos fricción cognitiva; mayor confianza operacional.
- Impacto en usuarios:
  - Cliente: mejora indirecta (producto coherente, menos errores de interpretación).
  - Proveedor/Operador: menos confusión durante ejecución; onboarding mental más rápido.
  - Admin: menor carga de soporte por inconsistencias.
- Impacto operacional: menor tasa de errores por mal entendimiento de CTAs/estados.
- Complejidad técnica: media (unificación de layout + refactor de pantallas existentes).
- Riesgos: regressions de navegación/estados si se toca más de lo necesario; mezcla de rol en footer.
- Prioridad recomendada: P0.

## 2) Unificar Proveedor con Cliente (P0)

Mismas reglas del bloque 1.

**Criterio de congelación**: “Proveedor” queda congelado.

**Recomendación (significativa)**
- Problema: Proveedor puede divergir del estándar Cliente, rompiendo percepción de “un solo producto”.
- Beneficio esperado: consistencia premium transversal; mejor conversión y confianza.
- Impacto en usuarios:
  - Proveedor: operación más rápida y segura.
  - Cliente: experiencia más coherente en cambios de estado.
  - Operador: reduce discrepancias en coordinación interna.
  - Admin: reduce “casos borde” visuales.
- Impacto operacional: menos tickets por “no encuentro el botón / cambió el flujo”.
- Complejidad técnica: media.
- Riesgos: tocar flujos sensibles (aceptación/assignación) si no se delimita a UI.
- Prioridad recomendada: P0.

## 3) Centro de Avisos (P0)

**Foco**: lógica y comportamiento (no rediseño estético).

Debe verificar:
- Todos los avisos relevantes llegan y se muestran.
- Clasificación: accionables / informativos / operativos.
- Doble clic cuando corresponde.
- Apertura de detalle.
- Navegación correcta.
- Mismo diseño para los tres roles.

**Criterio de congelación**: “Avisos” queda congelado.

**Recomendación (significativa)**
- Problema: Avisos es el centro operacional; si falla, se rompe confianza y coordinación.
- Beneficio esperado: fuente única y confiable; menos bypass; más automation.
- Impacto en usuarios:
  - Cliente: claridad del estado y próximos pasos.
  - Proveedor/Operador: coordinación operacional sin llamadas.
  - Admin: auditoría y trazabilidad.
- Impacto operacional: reduce fallos silenciosos; habilita operación aun si Push falla.
- Complejidad técnica: alta (eventos, dedupe, navegación, estados, detalle).
- Riesgos: duplicación de avisos, navegaciones rotas, notificaciones “fantasma”.
- Prioridad recomendada: P0.

## 4) Estados del servicio (P0)

Revisar uno por uno y exigir igualdad entre Cliente/Operador/Proveedor:
- Confirmado
- Asignado
- En Ruta
- Llegada
- Activo
- Últimos 30
- Finalizado
- Historial

**Criterio de congelación**: “Estados” quedan congelados.

**Recomendación (significativa)**
- Problema: estados inconsistentes generan decisiones incorrectas y pérdida de confianza.
- Beneficio esperado: lectura inmediata del estado; menor error humano.
- Impacto en usuarios:
  - Todos: reduce incertidumbre (“¿qué toca ahora?”).
  - Admin: menos reclamos por mala interpretación.
- Impacto operacional: menos incidentes operacionales y soporte.
- Complejidad técnica: media-alta (muchas pantallas, múltiples roles).
- Riesgos: cambios visuales pueden ocultar información crítica si no se valida con evidencia.
- Prioridad recomendada: P0.

## 5) Componentes comunes (P0)

Eliminar duplicación y unificar:
- ServiceHeader
- Countdown
- CTA Card
- Info Card
- Status Badge
- Progress
- Bottom Sheet
- Dialog
- Confirmation

**Recomendación (significativa)**
- Problema: duplicación = divergencia inevitable y costo alto de corrección.
- Beneficio esperado: consistencia garantizada; cambios más rápidos y seguros.
- Impacto en usuarios: menos inconsistencias visuales y de comportamiento.
- Impacto operacional: reduce regresiones; acelera cierre.
- Complejidad técnica: media (refactor con riesgo acotable por PRs pequeños).
- Riesgos: romper props/variantes si no hay contrato claro.
- Prioridad recomendada: P0.

## 6) Navegación (P0)

Verificar:
- Footer
- Back
- Header
- Deep links
- Avisos
- Historial

**Recomendación (significativa)**
- Problema: navegación inconsistente se siente como “otra app” y dispara abandono.
- Beneficio esperado: continuidad; menos pérdida de contexto.
- Impacto en usuarios: reducción de fricción y errores.
- Impacto operacional: menos tickets “no encuentro…”.
- Complejidad técnica: media.
- Riesgos: loops de redirect por gates de rol/sesión.
- Prioridad recomendada: P0.

## 7) Copys (P0)

Eliminar definitivamente:
- Inglés
- Textos técnicos
- Placeholders
- Lorem ipsum
- `endTime`
- Nombres internos

**Recomendación (significativa)**
- Problema: copy técnico reduce confianza y percepción premium.
- Beneficio esperado: confianza, claridad y conversión.
- Impacto en usuarios: menos dudas; menos “esto está en beta”.
- Impacto operacional: menos contactos a soporte.
- Complejidad técnica: baja-media.
- Riesgos: cambiar copy puede afectar comprensión si no se valida por rol.
- Prioridad recomendada: P0.

## 8) Responsive (P0)

Validar:
- Desktop
- Tablet
- Mobile

**Recomendación (significativa)**
- Problema: quiebres responsive = sensación inmediata de “producto roto”.
- Beneficio esperado: premium consistente en cualquier dispositivo.
- Impacto en usuarios: reduce abandono.
- Impacto operacional: menos incidencias por UI inaccesible.
- Complejidad técnica: media.
- Riesgos: arreglos locales que introducen inconsistencias en otras pantallas.
- Prioridad recomendada: P0.

---

# P1 — Calidad (no bloquea cierre)

## 9) Accesibilidad (P1)

- Contraste
- Tamaños
- Foco
- Teclado
- Lectores

**Recomendación (significativa)**
- Problema: usuarios quedan fuera o fallan en tareas críticas.
- Beneficio esperado: robustez, cumplimiento y UX premium.
- Impacto en usuarios: mayor completitud del mercado.
- Impacto operacional: menos soporte por “no puedo clicar/ver”.
- Complejidad técnica: media.
- Riesgos: none funcionales si se hace incremental; riesgo es no testear.
- Prioridad recomendada: P1.

## 10) Limpieza (P1)

Eliminar:
- Pantallas legacy
- Componentes sin uso
- CSS muerto
- Imports muertos
- Rutas antiguas

**Recomendación (significativa)**
- Problema: deuda técnica y rutas “fantasma” frenan estabilidad.
- Beneficio esperado: menor superficie de bugs; builds más limpios.
- Impacto en usuarios: indirecto (menos regresiones).
- Impacto operacional: reduce tiempo de mantenimiento.
- Complejidad técnica: media.
- Riesgos: eliminar algo aún usado por una ruta edge.
- Prioridad recomendada: P1.

---

# Última certificación (Builder)

Recorrer MAQGO completo como:
1) Cliente
2) Proveedor
3) Operador

Sin buscar bugs ni código. Solo responder:

> “¿En algún momento siento que cambié de aplicación?”

Si la respuesta es **SI**: identificar exactamente el punto de ruptura.

Si la respuesta es **NO**: declarar MAQGO **visualmente unificado**.

