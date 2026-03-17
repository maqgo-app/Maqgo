# Deploy desde terminal – paso a paso

## 1. Abrir la terminal
- En Cursor: **Terminal** → **New Terminal** (o `` Ctrl+` ``)

## 2. Ir a la carpeta del proyecto
```bash
cd Maqgo1-main
```

## 3. Ver qué cambió
```bash
git status
```

## 4. Agregar todos los cambios
```bash
git add .
```

## 5. Hacer el commit (guardar con un mensaje)
```bash
git commit -m "fix: correcciones deploy y flujo de reserva"
```

## 6. Subir a GitHub (push)
```bash
git push
```

## 7. Listo
Vercel detectará el push y hará el deploy automáticamente en 1–2 minutos.

---

**Si pide usuario/contraseña:** usa un Personal Access Token de GitHub, no tu contraseña normal.
