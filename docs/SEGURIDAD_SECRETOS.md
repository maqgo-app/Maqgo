# Secretos y variables de entorno

## Reglas

- **Nunca** commitear `.env`, claves API, PEM, tokens JWT reales ni dumps de base de datos.
- El repo usa `.gitignore` para `.env` y variantes; usar siempre **`.env.example`** sin valores secretos reales.
- **Rotación:** si una clave se expuso (chat, captura, repo público), rotarla en el proveedor (Google, Transbank, Mongo Atlas, etc.) y actualizar solo en el host (Railway/Vercel), no en el historial de Git.

## Comprobación local (antes de push)

```bash
# Desde la raíz del repo Maqgo
git ls-files | grep -E '\.env$|\.pem$' || true
# Solo deberían aparecer archivos .example o plantillas, no .env de producción
```

Si alguna vez se subió un secreto por error: rotar credencial, **y** considerar `git filter-repo` o soporte de GitHub para secret scanning; no es suficiente “borrar en el siguiente commit”.

## Automatización recomendada en GitHub

- Activar **Dependabot** para actualizaciones automáticas de dependencias (`npm`, `pip`, `github-actions`).
- Mantener un workflow de **Security** con:
  - `dependency-review-action` en Pull Requests.
  - `CodeQL` para análisis estático de Python y JavaScript/TypeScript.
- Revisar y resolver alertas de la pestaña **Security** de GitHub antes de mergear.
