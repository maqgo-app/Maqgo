# Instrucciones para activar el Admin de MAQGO

El panel de administración permite gestionar servicios, usuarios, precios de referencia e informes. Solo usuarios con rol `admin` pueden acceder.

---

## Requisitos previos

- **Backend** corriendo (puerto 8002 o el que uses)
- **MongoDB** conectado y accesible
- **Frontend** corriendo (puerto 5174 o el que uses)

---

## Paso 1: Crear el usuario admin

El admin **no se crea por registro** (el formulario solo permite clientes y proveedores). Hay que crearlo manualmente en la base de datos.

### Opción A: Usar el seed (desarrollo / primera vez)

Desde la raíz del proyecto:

```bash
cd Maqgo1-main/backend
source venv/bin/activate   # o venv\Scripts\activate en Windows
python seed_demo_users.py
```

Esto crea/actualiza el usuario admin con estas credenciales:

| Campo       | Valor          |
|------------|----------------|
| Email      | `admin@maqgo.cl` |
| Contraseña | `maqgo2024`    |
| Rol        | `admin`        |

---

### Opción B: Crear admin manualmente (producción / otro email)

Si quieres un admin con otro email o en producción sin ejecutar el seed:

1. Genera el hash de la contraseña con bcrypt (ejemplo en Python):

```python
import bcrypt
password = "tu_contraseña_segura"
hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
print(hashed)
```

2. Inserta el usuario en MongoDB (colección `users`):

```javascript
db.users.insertOne({
  "id": "admin-maqgo-001",   // único
  "name": "Admin MAQGO",
  "email": "admin@maqgo.cl",
  "phone": "999999999",
  "password": "<hash_bcrypt>",
  "role": "admin",
  "createdAt": new Date().toISOString(),
  "phoneVerified": true
});
```

O con `mongosh`:

```bash
mongosh "mongodb://localhost:27017/maqgo_db" --eval '
db.users.insertOne({
  id: "admin-maqgo-001",
  name: "Admin MAQGO",
  email: "admin@maqgo.cl",
  phone: "999999999",
  password: "<PEGA_AQUI_EL_HASH_BCRYPT>",
  role: "admin",
  createdAt: new Date().toISOString(),
  phoneVerified: true
});
'
```

---

## Paso 2: Iniciar sesión como admin

1. Abre la app: `http://localhost:5174` (o tu URL de producción)
2. Pulsa **"Ya tengo cuenta"**
3. Inicia sesión con:
   - **Email:** `admin@maqgo.cl`
   - **Contraseña:** `maqgo2024` (o la que hayas definido)
4. Serás redirigido automáticamente al **panel de administración** (`/admin`)

---

## Acceso directo al Admin

- En la pantalla de bienvenida hay un botón **"Admin"** en el footer (junto a FAQ, Términos, etc.)
- Si no estás logueado, te llevará a login y luego a `/admin`
- Si estás logueado como admin, entrarás directo al panel
- Si estás logueado como cliente o proveedor, verás "Acceso restringido"

---

## Rutas del panel Admin

| Ruta           | Descripción                    |
|----------------|--------------------------------|
| `/admin`       | Dashboard principal (servicios) |
| `/admin/users` | Lista de usuarios              |
| `/admin/pricing` | Precios de referencia        |

---

## Verificación rápida

```bash
# 1. Backend responde
curl http://localhost:8002/api/

# 2. Login admin (reemplaza si usas otro puerto)
curl -X POST http://localhost:8002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@maqgo.cl","password":"maqgo2024"}'
```

Si el login devuelve `"role":"admin"` y un `token`, el admin está activo.

---

## Producción

En producción, **no uses** las credenciales demo (`maqgo2024`). Crea un admin con contraseña fuerte usando la Opción B y cambia la contraseña si ya existía.

---

## Resumen rápido

1. `cd Maqgo1-main/backend && python seed_demo_users.py`
2. Ir a la app → "Ya tengo cuenta" → `admin@maqgo.cl` / `maqgo2024`
3. Acceso al panel Admin
