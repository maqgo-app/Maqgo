# Solo API (sin SPA). Para servir también el frontend en el mismo host, usar el Dockerfile en la raíz del repo.
FROM python:3.12-slim

# Transbank Oneclick integration WAF:
# WAF permite tráfico cuando llega con fingerprint compatible a `curl`.
# Instalamos `curl` en la imagen para que el runtime backend use el mismo
# transporte en vez de `requests`.
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
