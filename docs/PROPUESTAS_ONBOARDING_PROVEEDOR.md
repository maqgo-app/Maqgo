# Propuestas de mejora: Onboarding Proveedor

Propuestas concretas para reducir fricción en el flujo de 6 pasos.

---

## Situación actual

- Registro (nombre, email, celular, contraseña) + verificación SMS
- 6 pasos: Empresa → Máquina → Fotos → Tarifas → Operador → Revisión
- Persistencia en localStorage (puede retomar)
- Progreso visible ("Paso X de 6")

---

## Propuesta 1: Agrupar Máquina + Fotos (5 pasos)

**Cambio:** Unificar `MachineDataScreen` y `MachinePhotosScreen` en un solo paso.

- **Ventaja:** Un paso menos, flujo más rápido.
- **Implementación:**
  - En `MachineDataScreen`, añadir sección de fotos al final (o tabs: "Datos" | "Fotos").
  - Eliminar ruta `/provider/machine-photos` como paso independiente.
  - Actualizar `ProviderOnboardingProgress` a 5 pasos.
  - Ajustar navegación en `MachineDataScreen` (Continuar → pricing) y `PricingScreen` (Volver → machine-data).

---

## Propuesta 2: Operador opcional en primer onboarding

**Cambio:** Permitir "Agregar operador después" y saltar al Review.

- **Ventaja:** Proveedor que opera solo puede terminar más rápido.
- **Implementación:**
  - En `OperatorDataScreen`, añadir botón "Lo agrego después".
  - Si elige eso, guardar `operators: []` y navegar a Review.
  - En Review, mostrar mensaje "Puedes agregar operadores desde Perfil → Equipo".

---

## Propuesta 3: Phone-first (largo plazo)

**Cambio:** Pedir solo celular al inicio; el resto después de verificar.

- **Flujo:** Welcome → Celular → SMS → ¿Nuevo? → Nombre/email mínimos → /provider/data.
- **Ventaja:** Alineado con Uber/Didi; menos abandono en registro.
- **Esfuerzo:** Refactor de `ProviderRegisterScreen` y flujo de auth.

---

## Prioridad sugerida

| # | Propuesta              | Esfuerzo | Impacto |
|---|------------------------|----------|---------|
| 1 | Agrupar Máquina + Fotos | Medio    | Alto    |
| 2 | Operador opcional      | Bajo     | Medio   |
| 3 | Phone-first            | Alto     | Alto    |

Recomendación: implementar **1** y **2** en el corto plazo; evaluar **3** para siguiente iteración.
