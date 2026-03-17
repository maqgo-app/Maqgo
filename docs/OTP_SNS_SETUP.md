# OTP con Redis + AWS SNS – Guía a prueba de tontos

Reemplaza Twilio para códigos de verificación. Costo: **~$6-10 por 1000 SMS** vs **~$74 con Twilio**.

**Nota:** El backend ya incluye `redis` en `requirements.txt`. Si despliegas en Railway/Render, se instalará automáticamente.

---

## Qué necesitas (en orden)

1. **Cuenta en Upstash** (Redis gratis)
2. **Cuenta en AWS** (SNS para SMS)
3. **Variables de entorno** en tu backend (Railway, Render, etc.)

---

## Paso 1: Redis (Upstash)

### 1.1 Crear cuenta
- Entra a **https://upstash.com**
- Regístrate (gratis, con email o Google)

### 1.2 Crear base de datos Redis
1. En el dashboard, clic en **Create Database**
2. Nombre: `maqgo-otp`
3. Región: elige la más cercana (ej. `us-east-1`)
4. Tipo: **Regional** (gratis)
5. Clic en **Create**

### 1.3 Obtener la URL
1. En la base de datos creada, entra a **REST API**
2. Copia la **UPSTASH_REDIS_REST_URL** o la **Connection string**
3. Formato típico: `redis://default:XXXXX@xxx.upstash.io:6379`
4. **Guárdala** en un archivo de texto (la necesitas en el Paso 3)

---

## Paso 2: AWS SNS (envío de SMS)

### 2.1 Crear cuenta AWS
- Entra a **https://aws.amazon.com**
- Clic en **Create an AWS Account**
- Completa el registro (tarjeta de crédito, pero el free tier no cobra por bajo uso)

### 2.2 Crear usuario IAM (para MAQGO)
1. En la consola AWS, busca **IAM**
2. **Users** → **Create user**
3. Nombre: `maqgo-sns`
4. **Next** → en Permissions, **Attach policies directly**
5. Busca y selecciona **AmazonSNSFullAccess**
6. **Next** → **Create user**

### 2.3 Crear Access Key
1. Entra al usuario `maqgo-sns`
2. Pestaña **Security credentials**
3. **Access keys** → **Create access key**
4. Uso: **Application running outside AWS**
5. **Next** → **Create access key**
6. **Copia y guarda**:
   - **Access key ID** (ej. `AKIA...`)
   - **Secret access key** (solo se muestra una vez)

### 2.4 Habilitar SMS en SNS
1. En la consola AWS, busca **SNS**
2. **Text messaging (SMS)** → **Sandbox** o **Production**
3. Para Chile, SNS soporta envío directo (no hace falta número propio en muchos casos)
4. Si te piden verificar un número, verifica tu celular en **Sandbox destination phone numbers**

---

## Paso 3: Configurar variables en tu backend

### 3.1 Dónde configurarlas
- **Railway**: Project → tu servicio → **Variables**
- **Render**: Dashboard → tu servicio → **Environment**
- **Otro**: archivo `.env` en producción

### 3.2 Variables a agregar

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `REDIS_URL` | `redis://default:XXX@xxx.upstash.io:6379` | La URL de Upstash del Paso 1.3 |
| `AWS_ACCESS_KEY_ID` | `AKIA...` | Access Key del Paso 2.3 |
| `AWS_SECRET_ACCESS_KEY` | `tu_secret_key` | Secret Key del Paso 2.3 |
| `AWS_REGION` | `us-east-1` | Región donde creaste el Redis (o la misma que SNS) |

### 3.3 Ejemplo completo

```
REDIS_URL=redis://default:AXyz123AbC@us1-xxx-12345.upstash.io:6379
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYxxxxx
AWS_REGION=us-east-1
```

### 3.4 Verificar
1. Reinicia tu backend (Railway/Render lo hace al guardar variables)
2. Llama a `GET /api/communications/status`
3. Deberías ver `"otp_sns_configured": true`

---

## Paso 4: Probar

1. Abre la app MAQGO
2. Regístrate o inicia sesión con un número real
3. En la pantalla de verificación, pide **Reenviar código**
4. Deberías recibir un SMS con el formato: **"Tu código MAQGO es: 123456"**

---

## Errores frecuentes

| Error | Qué hacer |
|-------|-----------|
| `OTP service not configured` | Revisa que `REDIS_URL`, `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` estén definidos |
| `AWS credentials not configured` | Crea el Access Key en IAM y ponlo en las variables |
| `Demasiados intentos. Intenta en X minutos` | Rate limit: máx 3 códigos por número cada 10 min. Espera o usa otro número de prueba |
| `Error al enviar SMS` | Revisa que el usuario IAM tenga `AmazonSNSFullAccess` y que el número esté en formato +56912345678 |
| SMS no llega | En AWS SNS Sandbox, verifica el número destino en "Sandbox destination phone numbers" |

---

## Costos aproximados

| Servicio | 1000 OTP/mes |
|----------|--------------|
| Upstash Redis (free tier) | $0 |
| AWS SNS (Chile) | ~$6-10 |
| **Total** | **~$6-10** |
| Twilio (antes) | ~$74 |

---

## Resumen rápido

1. Upstash → crear Redis → copiar `REDIS_URL`
2. AWS → IAM → crear usuario con SNS → crear Access Key
3. Backend → Variables: `REDIS_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
4. Reiniciar backend y probar
5. Si no llega SMS: verificar número en SNS Sandbox (si aplica)
