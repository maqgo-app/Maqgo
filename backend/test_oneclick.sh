#!/bin/bash
# Script para probar la pasarela OneClick de Transbank
# Requiere: backend corriendo (ej. http://localhost:8002)
# Usa: BASE="http://TU_URL/api/payments/oneclick" si usas ngrok

BASE="${BACKEND_URL:-http://localhost:8002}/api/payments/oneclick"

echo "=== 1. Iniciar inscripción ==="
echo "POST $BASE/start"
# Si usas ngrok, define TBK_RETURN_URL en .env (ej. https://xxx.ngrok.io/api/payments/oneclick/confirm-return)
RESP=$(curl -s -X POST "$BASE/start" \
  -H "Content-Type: application/json" \
  -d '{"username":"test_user","email":"test@ejemplo.cl"}')
echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"

# Extraer url_webpay si existe
URL_WEBPAY=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('url_webpay',''))" 2>/dev/null)
if [ -n "$URL_WEBPAY" ]; then
  echo ""
  echo ">>> Abre esta URL en el navegador para completar la inscripción:"
  echo "$URL_WEBPAY"
  echo ""
  echo "Tras completar, Transbank redirigirá a confirm-return y verás el tbk_user."
  echo "Usa ese tbk_user para el paso 3 (authorize)."
else
  echo "Error: No se obtuvo url_webpay. Revisa credenciales en .env"
fi

echo ""
echo "=== 2. Confirmar inscripción (manual) ==="
echo "Transbank redirige automáticamente tras completar en url_webpay."
echo "Si tienes el TBK_TOKEN manualmente:"
echo "  curl -X POST \"$BASE/confirm?TBK_TOKEN=TU_TOKEN\""
echo ""

echo "=== 3. Autorizar cobro (ejemplo, tras tener tbk_user) ==="
echo "POST $BASE/authorize"
echo 'curl -X POST "'$BASE'/authorize" \'
echo '  -H "Content-Type: application/json" \'
echo '  -d '"'"'{"username":"test_user","tbk_user":"TBK_USER_AQUI","buy_order":"ORD-001","amount":1000}'"'"''
echo ""

echo "=== 4. Reembolso (ejemplo) ==="
echo 'curl -X POST "'$BASE'/refund" \'
echo '  -H "Content-Type: application/json" \'
echo '  -d '"'"'{"buy_order":"ORD-001","detail_buy_order":"ORD-001","amount":1000}'"'"''
