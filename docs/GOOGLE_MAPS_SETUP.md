# Google Maps – Setup para MAQGO

Guía paso a paso para activar el autocompletado de direcciones (Places API).

---

## Paso 1: Crear proyecto en Google Cloud

1. Entra a **https://console.cloud.google.com**
2. Inicia sesión con tu cuenta Google
3. Clic en el selector de proyectos (arriba) → **New Project**
4. Nombre: `MAQGO` (o el que prefieras)
5. **Create**

---

## Paso 2: Habilitar APIs

1. **APIs & Services** → **Library** (o **Enabled APIs & services**)
2. Busca y habilita:
   - **Maps JavaScript API**
   - **Places API**

---

## Paso 3: Crear API Key

1. **APIs & Services** → **Credentials**
2. **Create Credentials** → **API Key**
3. Se crea la key. Copia el valor (ej: `AIzaSy...`)

---

## Paso 4: Restringir la API Key (recomendado)

1. En **Credentials**, haz clic en la API key que creaste
2. **Application restrictions** → **HTTP referrers**
3. Añade:
   - `https://maqgo.vercel.app/*`
   - `https://*.vercel.app/*` (para previews)
   - `http://localhost:*` (para desarrollo)

4. **API restrictions** → **Restrict key**
5. Selecciona solo: **Maps JavaScript API** y **Places API**
6. **Save**

---

## Paso 5: Activar facturación (Google Cloud)

Google requiere una cuenta de facturación activa para usar Maps, pero da **US$ 200/mes** de crédito gratis. Con eso cubres miles de búsquedas.

1. **Billing** → **Link a billing account** (o crear uno)
2. Añade tarjeta (no se cobra si no superas el crédito)
3. Configura **Budget alerts** si quieres (ej: alerta a US$ 50)

---

## Paso 6: Configurar en Vercel

1. Entra a **https://vercel.com** → tu proyecto MAQGO
2. **Settings** → **Environment Variables**
3. **Add New**:
   - **Name:** `VITE_GOOGLE_MAPS_API_KEY`
   - **Value:** tu API key (ej: `AIzaSy...`)
   - **Environment:** Production (y Preview si quieres)

4. **Save**

---

## Paso 7: Redeploy

1. En Vercel → **Deployments**
2. Último deploy → **⋮** (tres puntos) → **Redeploy**

---

## Paso 8: Probar

1. Abre **maqgo.vercel.app**
2. Flujo cliente → Inmediata → Maquinaria → Horas → **Ubicación**
3. En el campo de dirección deberías ver: "Escribe la dirección para buscar..."
4. Escribe una dirección (ej: "Providencia 123") y verás sugerencias de Google

---

## Variable local (desarrollo)

En `frontend/.env`:

```
VITE_GOOGLE_MAPS_API_KEY=tu_api_key_aqui
```

---

## Costo

- **Crédito gratis:** US$ 200/mes
- **Places Autocomplete:** ~10.000 solicitudes gratis/mes
- **Costo típico MAQGO:** US$ 0/mes mientras no superes el crédito

---

## Resumen

| Paso | Acción |
|------|--------|
| 1 | Crear proyecto en Google Cloud |
| 2 | Habilitar Maps JavaScript API y Places API |
| 3 | Crear API Key |
| 4 | Restringir key (HTTP referrers + APIs) |
| 5 | Activar facturación (crédito gratis) |
| 6 | Añadir `VITE_GOOGLE_MAPS_API_KEY` en Vercel |
| 7 | Redeploy |
| 8 | Probar en maqgo.vercel.app |
