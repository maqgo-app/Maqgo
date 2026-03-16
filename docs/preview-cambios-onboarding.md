# Vista previa: cambios de onboarding y conversión

Así se ven las pantallas **antes** y **después** de los cambios aplicados.

---

## 1. Welcome (pantalla inicial)

### ANTES
```
[Logo MAQGO]
ARRIENDO POR HORAS, DÍAS O SEMANAS
Maquinaria pesada donde la necesitas
Arriendo inmediato o programado. Sin contratos. Paga solo cuando aceptan tu reserva.

[Botón naranja] 🏗️  Arrendar maquinaria
                 Inmediato o programado · Empezar sin registro

[Botón gris]    🏢  Ofrecer mi maquinaria
                 Proveedor · Recibe solicitudes

[Botón gris]    👤  Soy operador
                 Unirme con código de equipo

--- Iniciar sesión · ¿No tienes cuenta? · FAQ · Términos · Privacidad · Admin ---
```

### DESPUÉS
```
[Logo MAQGO]
ARRIENDO POR HORAS, DÍAS O SEMANAS
Maquinaria pesada donde la necesitas
Arriendo inmediato o programado. Sin contratos. Paga solo cuando aceptan tu reserva.

    Tu progreso se guarda en cada paso          ← NUEVO (texto gris, centrado)

[Botón naranja] 🏗️  Arrendar maquinaria
                 Inmediato o programado · Sin registro para empezar   ← CAMBIÓ

[Botón gris]    🏢  Ofrecer mi maquinaria
                 Regístrate y recibe solicitudes de clientes          ← CAMBIÓ

[Botón gris]    👤  Soy operador
                 Unirme con código de equipo

--- Iniciar sesión · ¿No tienes cuenta? · FAQ · Términos · Privacidad · Admin ---
```

---

## 2. Flujo cliente – barra de progreso (ej. en Horas / Ubicación / Proveedores)

### ANTES
```
Paso 2 de 6

(●)——(●)——(○)——(○)——(○)——(○)
```
*Solo números; el usuario no ve el nombre del paso.*

### DESPUÉS
```
Paso 2 de 6 · Horas / Urgencia

(●)——(●)——(○)——(○)——(○)——(○)
```
*Mismo diseño, pero ahora también: "· Horas / Urgencia" (o "· Ubicación", "· Proveedores", etc. según la pantalla).*

Ejemplos por pantalla:
- En **Maquinaria**: `Paso 1 de 6 · Maquinaria`
- En **Ubicación**: `Paso 3 de 6 · Ubicación`
- En **Confirmar**: `Paso 5 de 6 · Confirmar`
- En **Pago**: `Paso 6 de 6 · Pago`

---

## 3. Onboarding proveedor – Paso 1 (Datos del Proveedor)

### ANTES
```
[←] [Logo]

1. Datos empresa — Paso 1 de 6
(●)——(—)——(○)——(○)——(○)——(○)

Datos del Proveedor

Nombre propietario o empresa *
[________________]
RUT *
[________________]
...
¿Emites factura? [No] [Sí]
Hora de cierre [18:00] [19:00] [20:00] [21:00]

┌─────────────────────────────┐
│        Continuar            │
└─────────────────────────────┘
```

### DESPUÉS
```
[←] [Logo]

1. Datos empresa — Paso 1 de 6
(●)——(—)——(○)——(○)——(○)——(○)

Datos del Proveedor

Nombre propietario o empresa *
[________________]
...
┌─────────────────────────────────────────────┐
│  Tu progreso se guarda. Puedes continuar     │  ← NUEVO (gris, centrado)
│  después.                                     │
└─────────────────────────────────────────────┘
┌─────────────────────────────┐
│        Continuar            │
└─────────────────────────────┘
```

---

## 4. Onboarding proveedor – Paso 2 (Datos de la máquina)

### ANTES
```
...
Tipo de maquinaria, Marca, Modelo, Patente, etc.

┌─────────────────────────────┐
│        Continuar            │
└─────────────────────────────┘
```

### DESPUÉS
```
...
Tipo de maquinaria, Marca, Modelo, Patente, etc.

  Tu progreso se guarda. Puedes continuar después.   ← NUEVO

┌─────────────────────────────┐
│        Continuar            │
└─────────────────────────────┘
```

---

## 5. Onboarding proveedor – Paso 6 (Revisión)

### ANTES
```
6. Revisión — Paso 6 de 6
(●)——(●)——(●)——(●)——(●)——(●)

Revisa tus datos

Confirma que todo esté correcto antes de continuar

[Datos del Proveedor]
[Datos de la Máquina]
[Fotos]
[Operador]

┌─────────────────────────────┐
│   Confirmar y terminar       │
└─────────────────────────────┘
```

### DESPUÉS
```
6. Revisión — Paso 6 de 6
(●)——(●)——(●)——(●)——(●)——(●)

Revisa tus datos

¡Casi listo!                                    ← NUEVO (naranja, centrado)

Confirma que todo esté correcto antes de continuar

[Datos del Proveedor]
[Datos de la Máquina]
[Fotos]
[Operador]

┌─────────────────────────────┐
│   Confirmar y terminar       │
└─────────────────────────────┘
```

---

## Resumen visual

| Pantalla / componente | Qué cambió |
|----------------------|------------|
| **Welcome** | Línea "Tu progreso se guarda en cada paso" + textos de los dos primeros botones (cliente y proveedor). |
| **BookingProgress** | De "Paso X de 6" a "Paso X de 6 · [Nombre del paso]". |
| **ProviderDataScreen** | Frase "Tu progreso se guarda. Puedes continuar después." sobre el botón Continuar. |
| **MachineDataScreen** | La misma frase sobre el botón Continuar. |
| **ReviewScreen** | "¡Casi listo!" entre el título "Revisa tus datos" y el párrafo de confirmación. |

Para verlo en la app: levantar frontend (`npm run dev`), entrar por Welcome y seguir flujo cliente hasta una pantalla con pasos (ej. Horas o Ubicación), y por proveedor hasta Datos empresa, Datos máquina y Revisión.
