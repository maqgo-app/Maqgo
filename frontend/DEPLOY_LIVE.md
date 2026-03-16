# Checklist para ir a producción (Live)

## 1. Variables de entorno en Vercel

En **Vercel → Project → Settings → Environment Variables** añade:

| Variable | Valor | Entorno |
|----------|-------|---------|
| `REACT_APP_BACKEND_URL` | `https://api.maqgo.cl` | Production, Preview |

(Sin barra final en la URL)

## 2. Configuración del proyecto en Vercel

- **Root Directory:** `frontend` (o `Maqgo1-main/frontend` si aplica)
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

## 3. CORS en el backend

En Railway (o donde esté el backend), la variable `CORS_ORIGINS` debe incluir:
```
https://www.maqgo.cl,https://maqgo.cl,https://maqgo.vercel.app
```

## 4. Verificar build local

```bash
cd frontend
npm install
npm run build
```

Si compila sin errores, el deploy en Vercel debería funcionar.

## 5. Después del deploy

- Probar flujo completo: Welcome → Registro → Cliente → Maquinaria → Ubicación → Proveedores
- Probar "Continuar sin tarjeta (modo demo)" hasta el final
- Verificar que el mapa no permita zoom excesivo
