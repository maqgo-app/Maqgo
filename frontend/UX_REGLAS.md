# Reglas de UX MAQGO (estilo Uber · mínima fricción · máxima conversión)

## Guardado y restauración de datos
- **Al avanzar**: siempre guardar en `localStorage` (o `safeStorage`) los datos del paso antes de navegar al siguiente.
- **Al montar cada pantalla**: leer de `localStorage` y usar como valor inicial de los estados (inputs, selección). Así, si el usuario **retrocede**, los campos aparecen **autocompletados** con lo que ya ingresó.
- **No volver a pedir** lo que ya se capturó: nombre, RUT, dirección, comuna, email, maquinaria, horas, etc. deben persistir durante todo el flujo de reserva/onboarding.

## Progreso numerado
- En el flujo de reserva cliente se muestra **"Paso X de N"** y el nombre del paso actual (Maquinaria, Horas, Ubicación, Proveedores, Confirmar, Pago) para que el usuario sepa en qué punto está y cuánto falta.

## Un solo CTA principal por pantalla
- Cada pantalla debe tener **una acción principal** muy clara (botón naranja / destacado). Acciones secundarias (volver, cancelar) visibles pero no compiten con la principal.

## Registro e inscripción
- **Cliente**: mínimo necesario para reservar; el resto se pide solo cuando hace falta (ej. facturación).
- **Proveedor**: inscripción simple; fotos: **1 frontal obligatoria**, lateral y trasera opcionales; preferir **cámara en línea** (`capture`) para no sacar del flujo.

## Notificaciones
- No saturar: notificar solo en hitos clave (asignación, llegada a obra **una sola vez**, servicio terminado). Evitar mensajes repetidos por el mismo evento.
