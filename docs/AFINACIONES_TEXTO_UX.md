# Afinaciones texto / UX – Flujo Cliente y Proveedor

Revisión pantalla a pantalla. Cada ítem es una propuesta concreta para afinar textos o UX.

---

## FLUJO CLIENTE

### 1. ClientHome (Arrendar maquinaria)
| # | Dónde | Actual | Propuesta | Motivo |
|---|--------|--------|-----------|--------|
| C1 | Subtítulo tarjeta Inicio HOY | "Servicio prioritario · Disponibilidad inmediata · Paga solo al confirmar" | "Disponibilidad inmediata · Paga solo cuando un operador acepte" | Más claro: cuándo se cobra. |
| C2 | Modal reserva en progreso | "¿Deseas continuar donde quedaste?" | "¿Continuar con esta reserva?" | Más corto y directo. |
| C3 | Botón secundario modal | "Nuevo arriendo" | "Empezar de cero" | Deja claro que se borra el avance. |

### 2. MachinerySelection (Selecciona el tipo de maquinaria)
| # | Dónde | Actual | Propuesta | Motivo |
|---|--------|--------|-----------|--------|
| C4 | Texto bajo título | "Puedes elegir más de un tipo de maquinaria" | "Toca cada tipo para sumarlo; vuelve a tocar para quitarlo" | Explica el comportamiento multi-selección. |
| C5 | Botón con una seleccionada | "Ver opciones" | "Ver opciones (1 seleccionada)" | Consistencia con "2 seleccionadas" y refuerza multi-selección. |

### 3. HoursSelectionScreen (¿Cuántas horas necesitas?)
| # | Dónde | Actual | Propuesta | Motivo |
|---|--------|--------|-----------|--------|
| C6 | Badge | "⚡ INICIO HOY" | "Inicio hoy" (sin emoji en texto accesible) | Mejor para lectores de pantalla; el ícono ya da contexto visual. |
| C7 | Botón | "Continuar" | "Siguiente: ubicación" | Indica qué viene después. |

### 4. UrgencySelectionScreen (¿Cuándo lo necesitas?)
| # | Dónde | Actual | Propuesta | Motivo |
|---|--------|--------|-----------|--------|
| C8 | Subtítulo bajo maquinaria | "Valor viaje · Sin costo de traslado" | "Pago por viaje · Sin costo de traslado" | "Pago por viaje" más claro que "valor viaje". |
| C9 | Botón | "Continuar" | "Siguiente: ubicación" | Misma idea que C7. |

### 5. ServiceLocationScreen (¿Dónde necesitas el servicio?)
| # | Dónde | Actual | Propuesta | Motivo |
|---|--------|--------|-----------|--------|
| C10 | Subtítulo | "Ingresa la dirección para encontrar proveedores cercanos" | "Dirección y comuna para mostrar proveedores cerca de tu obra" | Enfatiza obra + comuna. |
| C11 | Caja info abajo | "Mostraremos los 5 mejores proveedores según precio y cercanía." | "Verás hasta 5 proveedores ordenados por mejor precio y cercanía." | Más activo y claro. |
| C12 | Botón | "Ver proveedores disponibles" | "Ver proveedores" | Más corto; el contexto ya es claro. |

### 6. ProviderOptionsScreen (Los 5 mejores proveedores)
| # | Dónde | Actual | Propuesta | Motivo |
|---|--------|--------|-----------|--------|
| C13 | Título | "Los 5 mejores proveedores" | "Proveedores disponibles" | Si hay menos de 5, el "5" puede confundir. |
| C14 | Subtítulo | "Ordenados por mejor precio y cercanía" | "Ordenados por precio y cercanía" | Evitar repetir "mejor" con el título. |
| C15 | Caja naranja (factura) | "Si pides factura, se suma IVA en Confirmar." | "Si pides factura, se suma IVA en la siguiente pantalla." | "Confirmar" puede leerse como verbo. |

### 7. ConfirmServiceScreen (Confirmar)
| # | Dónde | Actual | Propuesta | Motivo |
|---|--------|--------|-----------|--------|
| C16 | Llegada estimada | "Llegada estimada: X min" | "Llegada aprox.: X min" | "Aprox." refuerza que es estimado. |
| C17 | Botón principal | "Enviar solicitud" | "Enviar solicitud (sin cobro aún)" | Refuerza que no se cobra hasta aceptar. |
| C18 | Ubicación · Cambiar | Solo "Cambiar" | "Cambiar ubicación" | Más explícito. |

### 8. SearchingProviderScreen (Buscando proveedor)
| # | Dónde | Actual | Propuesta | Motivo |
|---|--------|--------|-----------|--------|
| C19 | Sin elegibles | "No hubo disponibilidad para comenzar hoy" | "Nadie disponible para iniciar hoy" | Más directo. |
| C20 | Botón | "Ver otras opciones" | "Volver a proveedores" | Deja claro la acción. |

---

## FLUJO PROVEEDOR

### 9. ProviderHomeScreen (Inicio proveedor)
| # | Dónde | Actual | Propuesta | Motivo |
|---|--------|--------|-----------|--------|
| P1 | Texto bajo toggle | "Las solicitudes inmediatas pagan hasta +20% más" | **Corregido:** "más" (había typo "mรs"). | Ya aplicado. |
| P2 | Toggle desconectado | "Toca para conectarte" | "Activa para recibir solicitudes" | Más orientado a la acción. |
| P3 | Botón demo | "Simular solicitud entrante (Demo)" | "Recibir solicitud de prueba" | Más corto y claro. |
| P4 | Perfil incompleto | "Completa tu perfil para recibir pagos" | "Completa datos bancarios para recibir pagos" | Específico. |

### 10. RequestReceivedScreen (Solicitud recibida)
| # | Dónde | Actual | Propuesta | Motivo |
|---|--------|--------|-----------|--------|
| P5 | Label ETA | "Llegar en" | "Tiempo estimado hasta la obra" | Deja claro que es hasta la obra. |
| P6 | Ganancia | "Tu ganancia total" | "Tu ganancia (neta)" | Aclara que es lo que recibe. |
| P7 | Botón rechazar | "Rechazar" | "Rechazar solicitud" | Más explícito. |
| P8 | Botón aceptar | "¡Aceptar!" | "Aceptar y continuar" | Tono consistente con el resto. |

### 11. EnRouteScreen (En camino)
| # | Dónde | Actual | Propuesta | Motivo |
|---|--------|--------|-----------|--------|
| P9 | Al reportar incidente | `alert('Incidente reportado. El cliente ha sido notificado.')` | Usar toast o mensaje en pantalla (no `alert`) | Mejor UX que un modal del sistema. |
| P10 | handleOpenMaps | Mismo `alert` que incidente | No mostrar ese alert al abrir mapas; solo al reportar incidente | Evitar mensaje incorrecto al abrir Waze/Maps. |

### 12. Otras pantallas proveedor
| # | Dónde | Actual | Propuesta | Motivo |
|---|--------|--------|-----------|--------|
| P11 | SelectOperatorScreen | "Confirmar y continuar" | "Asignar operador y continuar" | Deja claro qué se confirma. |
| P12 | ProviderServiceFinishedScreen | "Continuar sin evaluar" | "Omitir evaluación" | Más corto. |

---

## Resumen por prioridad

- **Alta (claridad / errores):** C1, C15, C17, P1 (ya aplicado), P9, P10.
- **Media (consistencia y tono):** C4, C5, C7, C9, C13, C16, P2, P6, P7, P8.
- **Baja (pulido):** C2, C3, C6, C10, C11, C12, C18, C19, C20, P3, P4, P11, P12.

Si quieres, puedo aplicar en el código solo las de **alta**, o todas las que indiques por número (ej. C1, C4, P5, P9).