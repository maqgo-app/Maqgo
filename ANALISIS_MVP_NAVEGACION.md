# Análisis MAQGO MVP – Mejoras y experiencia de navegación

Evaluación del estado actual y propuestas concretas para el MVP.

---

## 1. ¿Hay experiencia de navegación fluida?

**En general sí**, pero con huecos que pueden generar fricción.

### Lo que funciona bien
- **Bottom nav** por rol (Cliente: Inicio | Historial | Perfil; Proveedor: Inicio | Máquinas | Perfil; Operador: Inicio | Historial | Perfil)
- **Rutas claras** por flujo (client/*, provider/*, operator/*)
- **Redirección por sesión** en Welcome (ya logueado → home según rol)
- **ProviderProfile** como hub (Inicio, Mis máquinas, Cobros, Empresa, Banco, FAQ, Términos)
- **MyMachinesScreen** incluye su propia barra inferior para no perder contexto

### Fricciones detectadas

| Problema | Ubicación | Impacto |
|----------|-----------|---------|
| ~~"Soy Proveedor" no existe~~ | — | **Corregido:** "Soy Proveedor" está en RoleSelection (tras Empezar ahora → registro → verificación). El asistente ya describe el flujo correcto. |
| **window.confirm** | ClientHome | "¿Continuar reserva?" usa `confirm()` nativo; rompe look & feel |
| **Sin indicador de progreso** | Flujo reserva cliente | Maquinaria → Horas → Ubicación → Proveedores → Confirmar: muchas pantallas sin indicador visual |
| **FAQ/Terms/Privacy sin "volver" explícito** | FAQScreen, etc. | Usan `navigate(-1)`; si se llega directo (ej. desde asistente), el historial puede ser vacío o confuso |
| **noNavPaths** | /provider/machines, cobros, dashboard | App no muestra BottomNav; algunas pantallas sí usan su propia nav (MyMachines), otras pueden quedar sin salida clara |
| **Login no contempla operador** | LoginScreen | Solo redirige a client o provider home; operadores usan /operator/join con código |

---

## 2. Mejoras propuestas para el MVP

### Prioridad alta

#### 2.1 ~~Corregir inconsistencia "Soy Proveedor"~~ ✅ Hecho

El flujo real es: Empezar ahora → registro → verificación → **RoleSelection** (ahí aparece "Soy Proveedor"). El asistente fue actualizado para describir este flujo correctamente. No se modificó la UI.

#### 2.2 Sustituir window.confirm en ClientHome

Usar `AlertDialog` (o componente similar) en lugar de `window.confirm` para "¿Continuar reserva?".

#### 2.3 Indicador de progreso en reserva cliente

Añadir una barra o dots (maqgo-dots) en el flujo:
- Maquinaria → Horas → Ubicación → Proveedores → Confirmar

Mostrar el paso actual (ej. 3 de 5).

### Prioridad media

#### 2.4 Volver desde FAQ/Terms/Privacy

Si `navigate(-1)` deja al usuario sin salida (historial vacío), añadir fallback:

```js
const goBack = () => {
  if (window.history.length > 1) navigate(-1);
  else navigate('/');  // o según rol: /client/home, /provider/home
};
```

#### 2.5 Login y operadores

Si un operador intenta login con email/password, definir explícitamente la redirección (por ejemplo a `/operator/home` o a un mensaje que indique usar el código en `/operator/join`).

#### 2.6 Transiciones entre pantallas

Añadir transiciones suaves (fade-in) al cambiar de ruta para mejorar la sensación de fluidez.

### Prioridad baja

#### 2.7 Revisar rutas duplicadas

- `/provider/request` y `/provider/request-received` → mismo componente
- `/provider/cobros`, `/provider/my-services`, `/provider/dashboard` → mismo componente

Unificar o simplificar para evitar duplicados y confusión.

#### 2.8 Breadcrumb en pantallas profundas

En pantallas como `/provider/profile/empresa`, `/provider/profile/banco`, mostrar un breadcrumb mínimo (ej. Perfil > Empresa).

---

## 3. Flujos principales (resumen)

### Cliente – Reservar maquinaria

```
Welcome → (login/register) → ClientHome 
  → Inicio HOY: Machinery → Hours → Location → Providers → Confirm → Billing → Card → ...
  → Programar: Calendar → Machinery → ...
```

Puntos de mejora: indicador de progreso, confirm sin `window.confirm`.

### Proveedor – Registro

```
Welcome → Empezar ahora → Register → SelectChannel → VerifySMS → Verified 
  → RoleSelection ("Soy Proveedor") → Provider/data → machine-data → photos → pricing 
  → operator-data → review → ProviderHome
```

Flujo correcto: "Soy Proveedor" aparece en RoleSelection tras el registro. El asistente describe este flujo.

### Operador

```
Welcome → "Soy operador (tengo código)" → OperatorJoin (código 6 dígitos) → OperatorHome
```

Este flujo está bien separado y es coherente.

---

## 4. Resumen ejecutivo

| Área | Estado | Acción prioritaria |
|------|--------|--------------------|
| Navegación cliente | Buena | Indicador de progreso en reserva |
| Navegación proveedor | Buena | Copy del asistente ajustado al flujo real (Empezar → RoleSelection) |
| Navegación operador | Buena | — |
| Diálogos | Mejorable | Reemplazar window.confirm por AlertDialog |
| Rutas legales (FAQ, etc.) | Aceptable | Fallback de "volver" si history está vacío |
| Consistencia asistente | ✅ Corregido | Instrucciones alineadas con el flujo real |

La base de navegación es sólida. La inconsistencia "Soy Proveedor" en el asistente ya fue corregida (copy alineado con el flujo real). Pendiente: sustituir `window.confirm` por un diálogo coherente con el diseño.
