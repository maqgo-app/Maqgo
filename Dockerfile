# MAQGO: frontend (Vite) + API (FastAPI) en un solo contenedor.
# Uso: en Railway → Root Directory = raíz del repo, Dockerfile = Dockerfile (este archivo).
# Build-arg PUBLIC_API_BASE = URL pública donde vivirá este servicio (mismo host que sirve /api).
# Ejemplo: https://www.maqgo.cl (sin barra final).

FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ARG PUBLIC_API_BASE=https://www.maqgo.cl
ENV REACT_APP_BACKEND_URL=${PUBLIC_API_BASE}
ENV VITE_BACKEND_URL=${PUBLIC_API_BASE}
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY --from=frontend-build /app/frontend/dist ./static
EXPOSE 8000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
