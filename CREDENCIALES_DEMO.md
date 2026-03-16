# Credenciales de Prueba MAQGO

## Login (email + contraseña)

| Rol       | Email             | Contraseña |
|-----------|-------------------|------------|
| **Cliente**   | cliente@demo.cl   | demo123    |
| **Proveedor** | proveedor@demo.cl | demo123    |
| **Admin**     | admin@maqgo.cl    | maqgo2024  |

## Código de enrolamiento operador

Para unirse como operador (flujo "Soy operador" → "Unirme con código de equipo"):

| Código  | Empresa           | Válido hasta |
|---------|-------------------|--------------|
| **DEMO01** | Transportes Silva | 1 año        |

## SMS de verificación

- **Modo demo** (sin Twilio): usa el código **123456**
- **SMS real**: configura Twilio en `backend/.env` (ver abajo)

---

## Tarjetas de prueba (Transbank integración)

**Configuración para evitar timeout:** Transbank redirige al usuario a `confirm-return`. El backend debe responder rápido. En `backend/.env`:
- `TBK_RETURN_URL` debe ser una URL **pública** (ngrok) cuando pruebas desde celular o dispositivo externo. Ej: `TBK_RETURN_URL=https://tu-tunel.ngrok.io/api/payments/oneclick/confirm-return`
- `REACT_APP_BACKEND_URL` en el frontend debe apuntar al mismo backend (ngrok si usas túnel)

Para pruebas con Transbank real en ambiente de integración (`TBK_DEMO_MODE=false` + ngrok):

| Tipo        | Número              | CVV  | Fecha  | Resultado   |
|-------------|---------------------|------|--------|-------------|
| **VISA**    | 4051 8856 0044 6623 | 123  | Cualquiera | ✅ Aprobada |
| **AMEX**    | 3700 0000 0002 032  | 1234 | Cualquiera | ✅ Aprobada |
| **Prepago VISA** | 4051 8860 0005 6590 | 123 | Cualquiera | ✅ Aprobada |
| **MASTERCARD** | 5186 0595 5959 0568 | 123 | Cualquiera | ❌ Rechazada |
| **Prepago MASTERCARD** | 5186 1741 1062 9480 | 123 | Cualquiera | ❌ Rechazada |

**Autenticación 3D Secure (si aparece):**
- RUT: **11.111.111-1**
- Clave: **123**

**Redcompra (débito):**
| Número              | Resultado   |
|---------------------|-------------|
| 4051 8842 3993 7763 | ✅ Aprobada |
| 4511 3466 6003 7060 | ✅ Aprobada |
| 5186 0085 4123 3829 | ❌ Rechazada |

*Fuente: [Transbank Developers](https://www.transbankdevelopers.cl/documentacion/como_empezar#ambientes)*

## Configurar Twilio para SMS real

Para que Twilio envíe SMS reales, agrega tus credenciales en `backend/.env`:

### Opción A: SMS directo (número Twilio)

1. Crea cuenta en [console.twilio.com](https://console.twilio.com)
2. Obtén: **Account SID**, **Auth Token** (Dashboard)
3. Compra o usa un número en Phone Numbers → Manage → Buy a number
4. En `backend/.env`:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=tu_auth_token
TWILIO_SMS_FROM=+1234567890
```

### Opción B: Twilio Verify (recomendado)

1. En Twilio Console → Verify → Services → Create
2. Copia el **Service SID** (empieza con VA)
3. En `backend/.env` agrega además:

```
TWILIO_VERIFY_SERVICE=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Prioridad:** Si las 3 variables (SID, Token, From o Verify) están llenas, Twilio envía SMS reales. Sin credenciales, usa código demo **123456**.

**Pruebas:** Cuentas trial solo envían a números verificados. Twilio Console → Phone Numbers → Manage → Verified Caller IDs → Add your number (+56...).
