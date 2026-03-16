# MAQGO – Instrucciones para probar (Admin, Cliente, Proveedor)

## Ubicación del proyecto

```
Respaldo Maqgo1-main4/          ← Raíz del workspace
└── Maqgo1-main/
    ├── backend/     ← Backend (puerto 8002)
    └── frontend/    ← Frontend (puerto 5174)
```

---

## Paso 1: Reiniciar el Backend

1. Abre una **terminal** (Terminal, iTerm, etc.).
2. Ve a la carpeta del backend. **Desde la raíz del workspace:**
   ```bash
   cd Maqgo1-main/backend
   ```
   *(Si ya estás en Maqgo1-main: `cd backend`)*

3. Activa el entorno virtual (si existe):
   ```bash
   source venv/bin/activate
   ```
   *(En Windows: `venv\Scripts\activate`)*

4. Inicia el backend:
   ```bash
   python -m uvicorn server:app --host 0.0.0.0 --port 8002 --reload
   ```

5. **Espera** hasta ver algo como:
   ```
   Uvicorn running on http://0.0.0.0:8002
   ```

6. **Deja esta terminal abierta.** No la cierres mientras pruebas.

**Probar que el backend responde:** Abre en el navegador: http://localhost:8002/api/  
Deberías ver un JSON con `"status": "operational"`.

---

## Paso 2: Reiniciar el Frontend

1. Abre **otra terminal** (nueva ventana o pestaña).
2. Ve a la carpeta del frontend. **Desde la raíz del workspace:**
   ```bash
   cd Maqgo1-main/frontend
   ```

3. Inicia el frontend:
   ```bash
   npm run dev
   ```

4. **Espera** hasta ver algo como:
   ```
   Local: http://localhost:5174/
   ```

5. Se abrirá el navegador en http://localhost:5174  
   Si no, ábrelo manualmente.

6. **Deja esta terminal abierta.** No la cierres mientras pruebas.

---

## Paso 3: Crear usuarios de prueba (solo la primera vez)

1. Abre **otra terminal**.
2. Ve al backend. **Desde la raíz del workspace:**
   ```bash
   cd Maqgo1-main/backend
   ```

3. Ejecuta el seed:
   ```bash
   python seed_demo_users.py
   ```

4. Deberías ver:
   ```
   ✅ Creado: cliente@demo.cl (client)
   ✅ Creado: proveedor@demo.cl (provider)
   ✅ Creado: admin@maqgo.cl (admin)
   ```

**Credenciales creadas:**

| Rol      | Email              | Contraseña  |
|----------|--------------------|-------------|
| Admin    | admin@maqgo.cl     | maqgo2024   |
| Cliente  | cliente@demo.cl    | demo123     |
| Proveedor| proveedor@demo.cl  | demo123     |

---

## Paso 4: Probar Admin

1. En el navegador, ve a: http://localhost:5174
2. Pulsa **"Ya tengo cuenta"**
3. Inicia sesión:
   - Email: `admin@maqgo.cl`
   - Contraseña: `maqgo2024`
4. Deberías entrar al **panel de administración** (servicios, usuarios, precios).
5. Navega por las pestañas: Servicios, Usuarios, Precios, Informes.

---

## Paso 5: Probar Cliente

1. Cierra sesión (o abre una ventana de incógnito).
2. Ve a: http://localhost:5174
3. Pulsa **"Arrendar maquinaria"** (o "Empezar sin cuenta").
4. Sigue el flujo: selecciona maquinaria, horas, ubicación.
5. Para probar con sesión: **"Ya tengo cuenta"** → `cliente@demo.cl` / `demo123`.

---

## Paso 6: Probar Proveedor

1. Cierra sesión (o ventana de incógnito).
2. Ve a: http://localhost:5174
3. Pulsa **"Ofrecer mi maquinaria"** (o "Ya tengo cuenta").
4. Inicia sesión: `proveedor@demo.cl` / `demo123`
5. Deberías ver el **panel del proveedor** (solicitudes, disponibilidad, historial).

---

## Resumen rápido

| Qué hacer        | Dónde              | Comando |
|------------------|--------------------|---------|
| Backend          | `Maqgo1-main/backend`  | `python -m uvicorn server:app --host 0.0.0.0 --port 8002 --reload` |
| Frontend         | `Maqgo1-main/frontend` | `npm run dev` |
| Crear usuarios   | `Maqgo1-main/backend`  | `python seed_demo_users.py` |
| Probar API       | Navegador          | http://localhost:8002/api/ |
| Probar app       | Navegador          | http://localhost:5174 |

---

## Si algo falla

- **"El servidor no responde"** → El backend no está corriendo. Vuelve al Paso 1.
- **"Puerto en uso"** → Algo ya usa el puerto. Cierra la otra app o usa otro puerto.
- **"Usuario no encontrado"** → Ejecuta de nuevo el Paso 3 (`seed_demo_users.py`).
- **MongoDB** → El backend usa MongoDB. Si no lo tienes, instálalo o usa un servicio en la nube (MongoDB Atlas).
