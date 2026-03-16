# MAQGO — Resumen completo de cambios y estado final

## Cómo ejecutar la app

```bash
# Backend
cd Maqgo1-main/backend && source venv/bin/activate && uvicorn server:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd Maqgo1-main/frontend && npm run dev
```

**URL:** http://localhost:5173 (o el puerto que asigne Vite)

---

## 1. Pantalla de bienvenida (WelcomeScreen)

### Hero
| Elemento | Contenido |
|----------|------------|
| Logo | MAQGO |
| Etiqueta | **ARRIENDO BAJO DEMANDA** (naranja, uppercase) |
| Título | **Maquinaria en tu obra.** <br> **Hoy.** (naranja) |
| Subtítulo | Si hay disponibilidad, en un rato. Inmediato o programado. Sin contratos. |

### Social proof
- **Con datos:** X+ clientes · X+ proveedores · X+ servicios
- **Sin datos:** La obra no espera. MAQGO tampoco.

### CTAs
| Rol | Icono | Texto principal | Subtexto |
|-----|-------|-----------------|----------|
| **Cliente** | Target/crosshair | Soy cliente | En tu obra en minutos. Buscar → Reservar → Listo. |
| **Proveedor** | Casa | Soy proveedor | Recibe solicitudes en tiempo real. Acepta según tu disponibilidad. |
| **Operador** | Persona | Soy operador | Ingresar código → Unirme al equipo → Recibir asignaciones. |

### Footer
- ¿Dudas? Habla con el Asistente
- FAQ · Términos · Privacidad · Admin

---

## 2. Archivos modificados

### Frontend
| Archivo | Cambio |
|---------|--------|
| `WelcomeScreen.jsx` | Hero, CTAs, social proof, copy tipo Uber |
| `ConfirmServiceScreen.js` | "Tarifa por Servicio" (sin %) |
| `ServiceDetailBreakdown.js` | "Tarifa por Servicio", "Menos tarifa por servicio" |
| `PaymentResultScreen.js` | Tarifa sin % |
| `FAQScreen.js` | Tarifa por servicio sin mencionar % |
| `MaqgoComponents.jsx` | Términos: tarifa por servicio |
| `PrivacyScreen.js` | "tarifa por servicio" |
| `TermsScreen.js` | "tarifa por servicio" |
| `ProviderVerifiedScreen.js` | Redirige a `/provider/data` tras SMS |
| `ProviderServiceFinishedScreen.js` | "Descuento tarifa por servicio" |
| `RequestReceived.js` | "Descuento tarifa por servicio" |
| `UploadInvoiceScreen.js` | "Menos tarifa por servicio" |
| `ServiceVoucher.js` | "Menos tarifa por servicio" |
| `voucherPdf.js` | "Menos tarifa por servicio" |
| `commissions.js` | Labels: "Tarifa por Servicio", "IVA" (sin %) |
| `App.jsx` | Props setUserRole/setUserId a ProviderVerifiedScreen |
| `index.html` | Título: Maquinaria pesada donde la necesites |

### Backend
| Archivo | Cambio |
|---------|--------|
| `public_stats.py` | Nuevo endpoint `/api/public/stats` |
| `server.py` | Registro del router public_stats |

---

## 3. Rutas principales

| Ruta | Pantalla |
|------|----------|
| `/` | WelcomeScreen |
| `/client/home` | Cliente - Inicio |
| `/provider/register` | Registro proveedor |
| `/provider/data` | Datos empresa (onboarding directo tras SMS) |
| `/operator/join` | Unirse con código |

---

## 4. Iconografía

| Rol | Icono | Razón |
|-----|-------|-------|
| Cliente | Target/crosshair | Ubicación, destino (obra) |
| Proveedor | Casa | Empresa, negocio |
| Operador | Persona | Individuo que opera la máquina |

---

## 5. Tarifa por servicio (sin % comisión)

En toda la app se usa **"Tarifa por Servicio"** y no se muestra el porcentaje de comisión (10% cliente, 10% proveedor).

---

## 6. Flujo proveedor

Tras verificar SMS → va directo a **ProviderDataScreen** (datos empresa) en lugar de ProviderHome. Reduce abandono en onboarding.

---

*Documento generado — MAQGO 2025*
