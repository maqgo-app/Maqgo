# QA: Toggle "Toca para conectarte" (Disponibilidad Proveedor)

## Pantallas afectadas

| Pantalla | Ruta | Texto | Endpoint |
|----------|------|-------|----------|
| ProviderHomeScreen | `/provider/home` | "Toca para conectarte" | `PATCH /api/users/{userId}` |
| ProviderAvailability | `/provider/availability` | "Activa tu disponibilidad" | `PUT /api/users/{userId}/availability` |
| OperatorHomeScreen | `/operator/home` | "Toca para activarte" | `PATCH /api/users/{userId}` |

## Fuente de verdad

- **Backend**: Al montar (Inicio), se sincroniza con `GET /api/users/{userId}` → `isAvailable`.
- **localStorage**: Fallback cuando el backend no responde (offline/demo).

## Flujo de prueba

### 1. Con backend activo y usuario real

1. Iniciar backend: `cd backend && uvicorn server:app --reload`
2. Iniciar frontend: `cd frontend && npm run dev`
3. Registrar como proveedor (SMS real o demo 123456)
4. Completar onboarding hasta ProviderHomeScreen
5. Tocar el botón → debe mostrar "Te conectaste"

### 2. Modo demo (backend caído o userId de fallback)

Si `userId` empieza con `provider-`, `demo-` o `operator-`:
- No se llama al backend
- Muestra "Te conectaste (modo demo)"

### 3. Sin sesión (userId vacío)

- Muestra: "Debes iniciar sesión para conectarte. Cierra sesión y vuelve a entrar."

### 4. Sesión expirada (404)

- Revierte el toggle
- Muestra: "Tu sesión expiró. Cierra sesión e inicia sesión nuevamente."

### 5. Sin conexión

- Mantiene el toggle en "Disponible"
- Muestra: "Te conectaste. No se pudo sincronizar (sin conexión)."

## Checklist QA

- [ ] Backend corriendo + usuario real → conecta OK
- [ ] Backend caído + userId demo → modo demo OK
- [ ] Sin userId → mensaje de sesión
- [ ] 404 (usuario no existe) → revierte y mensaje claro
- [ ] Sin red → mantiene estado local, mensaje informativo

## Debug

En consola del navegador:
```js
// Ver userId actual
localStorage.getItem('userId')

// Simular modo demo
localStorage.setItem('userId', 'demo-' + Date.now())
```
