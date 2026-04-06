# Solución de problemas: Onboarding Proveedor (paso 6)

## Si el error persiste después de los cambios

### 1. Caché del navegador
El navegador puede estar usando archivos JavaScript antiguos.

**Qué hacer:**
- **Chrome/Edge:** `Ctrl+Shift+R` (Windows) o `Cmd+Shift+R` (Mac)
- O: DevTools (F12) → pestaña Network → marcar "Disable cache" → recargar

### 2. Caché de Vite (modo desarrollo)
Si usas `npm run dev`, Vite guarda caché en `node_modules/.vite`.

**Qué hacer:**
```bash
# Detener el servidor (Ctrl+C), luego:
rm -rf node_modules/.vite
npm run dev
```

### 3. Reiniciar el servidor de desarrollo
Los cambios en imports a veces no se aplican bien con hot reload.

**Qué hacer:**
- Detener el servidor (`Ctrl+C`)
- Volver a ejecutar `npm run dev`

### 4. Probar con build de producción
Para descartar problemas del modo desarrollo:

```bash
npm run build
npx serve dist
```

Luego abre la URL que muestre `serve` (ej. http://localhost:3000).

---

## Cambios aplicados en el código

1. **providerOnboarding.js** – Módulo independiente para rutas de onboarding (sin depender de bookingFlow).
2. **ProviderHomeScreen** – Import directo en App (no lazy) para evitar errores de chunks.
3. **ErrorBoundary** – Se resetea al cambiar de ruta (`key={location.pathname}`).
4. **Botón "Volver"** – En la pantalla de error, permite volver atrás sin recargar.

Si tras estos pasos el error continúa, indica el mensaje exacto que aparece en la pantalla de error (o en la consola del navegador, F12 → Console).
