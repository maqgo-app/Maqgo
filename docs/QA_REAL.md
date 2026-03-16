# QA Real – MAQGO

Guía para pruebas con datos reales (SMS, login, operadores, flujos completos).

---

## 1. Preparación

### Backend y Frontend
```bash
# Terminal 1 - Backend
cd Maqgo1-main/backend
source venv/bin/activate
python3 -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 - Frontend
cd Maqgo1-main/frontend
npm run dev
```

### Base de datos y usuarios demo
```bash
cd Maqgo1-main/backend
python3 seed_demo_users.py
```

### Twilio (SMS real)
En `backend/.env`:
```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_SMS_FROM=+1...
```
Tu número debe estar en Twilio → Verified Caller IDs.

---

## 2. Credenciales de prueba

| Rol       | Email             | Contraseña |
|-----------|-------------------|------------|
| Cliente   | cliente@demo.cl   | demo123    |
| Proveedor | proveedor@demo.cl | demo123    |
| Admin     | admin@maqgo.cl    | maqgo2024  |

**Operador:** Código **DEMO01** (ejecutar `seed_demo_users.py` antes; se marca como usado tras cada join).

---

## 3. Escenarios QA real

### A. Registro + SMS real
1. Inicio → "Empezar ahora"
2. Completar datos (nombre, celular, email)
3. Elegir SMS → Enviar código
4. **Verificar:** Llega SMS real al celular
5. Ingresar código recibido → Verificar

### B. Login con credenciales
1. Inicio → "Ya tengo cuenta"
2. Email: `cliente@demo.cl` / Contraseña: `demo123`
3. **Verificar:** Entra al home del cliente

### C. Operador – Enrolamiento
1. Ejecutar `python3 seed_demo_users.py` (crea/resetea DEMO01)
2. Inicio → "Soy operador" → "Unirme con código de equipo"
3. Código: **DEMO01**
4. Completar nombre, RUT, celular → Unirme
5. **Verificar:** Pantalla de éxito, vinculado a Transportes Silva

### D. Flujo cliente completo (inmediato)
1. Login cliente o "Arrendar maquinaria"
2. Maquinaria → Horas → Ubicación
3. Elegir proveedor → Confirmar → Pago (modo demo OneClick)
4. **Verificar:** SearchingProviderScreen → PaymentResultScreen → MachineryAssignedScreen

### E. Admin
1. Login: `admin@maqgo.cl` / `maqgo2024`
2. **Verificar:** Panel admin, pestañas Servicios, Usuarios, etc.

---

## 4. Checklist rápido pre-deploy

- [ ] SMS real llega al celular
- [ ] Login cliente, proveedor, admin funcionan
- [ ] Código DEMO01 une operador (tras ejecutar seed)
- [ ] Flujo arriendo inmediato completo sin errores
- [ ] OneClick demo completa (o Transbank real si configurado)

---

## 5. Tests automatizados

```bash
./scripts/run_qa.sh
# o con checklist manual:
./scripts/run_qa.sh --full
```

---

*Ver también: `docs/QA_REGRESSION_CHECKLIST.md` para regresión detallada.*
