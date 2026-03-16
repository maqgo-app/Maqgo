# MAQGO – Instrucciones de desarrollo

Guía para correr backend, frontend y avanzar en modo prueba.

---

## 1. Requisitos previos

- **Node.js** 18+
- **Python** 3.10+
- **MongoDB** corriendo (`brew services start mongodb-community`)
- **ngrok** (solo si usas Transbank real en local)

---

## 2. Backend

### Iniciar

```bash
cd "/Users/tomasvillalta/Desktop/Repositorios Github/Respaldo Maqgo1-main4/Maqgo1-main/backend"
source venv/bin/activate
uvicorn server:app --port 8000
```

### Cargar datos demo (primera vez o al resetear)

```bash
cd "/Users/tomasvillalta/Desktop/Repositorios Github/Respaldo Maqgo1-main4/Maqgo1-main/backend"
source venv/bin/activate
python seed_demo_users.py
```

---

## 3. Frontend

```bash
cd "/Users/tomasvillalta/Desktop/Repositorios Github/Respaldo Maqgo1-main4/Maqgo1-main/frontend"
npm install
npm run dev
```

Abre **http://localhost:5174**

---

## 4. Modo prueba – Configuración en `backend/.env`

Para avanzar sin SMS ni Transbank reales:

```env
# SMS: modo demo (código siempre 123456)
MAQGO_DEMO_MODE=true

# Transbank: modo demo (salta pantalla de Transbank)
TBK_DEMO_MODE=true
```

### Códigos en modo demo

| Paso              | Código / Acción                          |
|-------------------|------------------------------------------|
| Verificación SMS  | **123456**                               |
| Registro tarjeta  | Se salta Transbank, continúa directo     |

---

## 5. Credenciales de prueba (cuando quieras probar real)

### Twilio (SMS real)

1. Cuenta en [console.twilio.com](https://console.twilio.com)
2. En `backend/.env`:

```env
MAQGO_DEMO_MODE=false
TWILIO_ACCOUNT_SID=ACxxxxxxxx...
TWILIO_AUTH_TOKEN=xxxxxxxx...
TWILIO_SMS_FROM=+18625792356
```

3. En Twilio → Verified Caller IDs: agrega tu número (+56994336579)

### Transbank OneClick (tarjeta real en integración)

1. Credenciales en [Transbank Developers](https://www.transbankdevelopers.cl/)
2. En `backend/.env`:

```env
TBK_DEMO_MODE=false
TBK_PARENT_COMMERCE_CODE=tu_codigo
TBK_CHILD_COMMERCE_CODE=tu_codigo_hijo
TBK_API_KEY_SECRET=tu_api_key
TBK_RETURN_URL=https://TU-NGROK.ngrok.io/api/payments/oneclick/confirm-return
```

3. Exponer backend con ngrok:

```bash
ngrok http 8000
```

4. Copiar la URL de ngrok a `TBK_RETURN_URL`

### Tarjetas de prueba Transbank

- [Documentación Transbank – Tarjetas de prueba](https://www.transbankdevelopers.cl/documentacion/como_empezar#ambientes)

---

## 6. Flujo de prueba completo

1. **http://localhost:5174** → Empezar ahora
2. Registro → nombre, apellido, email, celular
3. Enviar código SMS → usar **123456**
4. Verificación → ingresar **123456**
5. Elegir rol → Cliente
6. Maquinaria → Horas → Ubicación
7. Seleccionar proveedor → Confirmar
8. Datos facturación (si aplica) → Continuar
9. Registrar tarjeta → email + Registrar (modo demo continúa directo)
10. Buscando proveedores → esperar o probar como proveedor

### Probar como proveedor

- Login: **proveedor@demo.cl** / **demo123**
- Ver solicitud entrante y aceptar

---

## 7. Resumen de comandos

| Acción        | Comando |
|---------------|---------|
| Backend       | `cd backend && source venv/bin/activate && uvicorn server:app --port 8000` |
| Frontend      | `cd frontend && npm run dev` |
| Seed demo     | `cd backend && python seed_demo_users.py` |
| Reiniciar backend | Ctrl+C y volver a ejecutar uvicorn |

---

## 8. Puertos

| Servicio | Puerto | URL |
|----------|--------|-----|
| Backend  | 8000   | http://localhost:8000 |
| Frontend | 5174   | http://localhost:5174 |
