# Política de Notificaciones MAQGO

## Principios

1. **WhatsApp** = canal externo único (llega aunque la app esté cerrada)
2. **In-app** = feedback inmediato cuando el usuario está viendo la pantalla (banner, sonido, vibración)
3. **Sin duplicar** = un evento = una notificación externa (no WhatsApp + Push para lo mismo)
4. **Solo lo esencial** = notificar cuando hay acción requerida o información crítica

## Matriz por rol

### CLIENTE

| Evento | WhatsApp | In-app |
|--------|----------|--------|
| Solicitud enviada | ✓ | - |
| Proveedor aceptó | ✓ | ✓ |
| Operador llegando (500m) | ✓ | ✓ (banner, sonido) |
| Operador llegó | ✓ | ✓ |
| Servicio finalizado | ✓ | ✓ |

### PROVEEDOR / TITULAR

| Evento | WhatsApp | In-app |
|--------|----------|--------|
| Nueva solicitud | ✓ | ✓ |
| Solicitud aceptada | - | ✓ |
| Solicitud expirada | ✓ | - |

### OPERADOR

| Evento | WhatsApp | In-app |
|--------|----------|--------|
| Asignado a servicio | ✓ | ✓ |

## Reglas de implementación

- **WhatsApp**: enviar solo cuando el evento es crítico o requiere acción
- **In-app**: siempre que el usuario esté en la pantalla relevante (feedback visual/auditivo)
- **No usar** Push del navegador para eventos ya cubiertos por WhatsApp (evita saturación)
