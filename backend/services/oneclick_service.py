import os
import requests
from dotenv import load_dotenv

load_dotenv()

TBK_ENV = os.getenv("TBK_ENV", "integration")

if TBK_ENV == "production":
    BASE_URL = "https://webpay3g.transbank.cl"
else:
    BASE_URL = "https://webpay3gint.transbank.cl"

TBK_PARENT_COMMERCE_CODE = os.getenv("TBK_PARENT_COMMERCE_CODE")
TBK_CHILD_COMMERCE_CODE = os.getenv("TBK_CHILD_COMMERCE_CODE")
TBK_API_KEY_SECRET = os.getenv("TBK_API_KEY_SECRET")
TBK_RETURN_URL = os.getenv("TBK_RETURN_URL")

# Timeout para evitar bloqueos indefinidos (Transbank suele responder en 2-5 s)
# Si no hay timeout, una API lenta puede causar "timeout" percibido por el usuario
TBK_REQUEST_TIMEOUT = 25

HEADERS = {
    "Tbk-Api-Key-Id": TBK_PARENT_COMMERCE_CODE or "",
    "Tbk-Api-Key-Secret": TBK_API_KEY_SECRET or "",
    "Content-Type": "application/json"
}


def _check_config():
    """Valida que las credenciales Transbank estén configuradas."""
    missing = []
    if not TBK_PARENT_COMMERCE_CODE:
        missing.append("TBK_PARENT_COMMERCE_CODE")
    if not TBK_CHILD_COMMERCE_CODE:
        missing.append("TBK_CHILD_COMMERCE_CODE")
    if not TBK_API_KEY_SECRET:
        missing.append("TBK_API_KEY_SECRET")
    if missing:
        raise ValueError(f"Faltan variables de entorno Transbank: {', '.join(missing)}. Agrega en .env")


def start_inscription(username: str, email: str, response_url: str = None):
    _check_config()
    url = f"{BASE_URL}/rswebpaytransaction/api/oneclick/v1.2/inscriptions"

    # Transbank debe poder alcanzar la URL de retorno. Con localhost no funciona.
    # Para pruebas locales: usa ngrok y define TBK_RETURN_URL en .env
    final_url = response_url or TBK_RETURN_URL or ""
    if final_url and "localhost" in final_url and TBK_RETURN_URL:
        final_url = TBK_RETURN_URL

    payload = {
        "username": username,
        "email": email,
        "response_url": final_url
    }

    response = requests.post(url, json=payload, headers=HEADERS, timeout=TBK_REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.json()


def confirm_inscription(token: str):
    _check_config()
    url = f"{BASE_URL}/rswebpaytransaction/api/oneclick/v1.2/inscriptions/{token}"

    response = requests.put(url, json={}, headers=HEADERS, timeout=TBK_REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.json()


def authorize_payment(username: str, tbk_user: str, buy_order: str, amount: int):
    _check_config()
    url = f"{BASE_URL}/rswebpaytransaction/api/oneclick/v1.2/transactions"

    payload = {
        "username": username,
        "tbk_user": tbk_user,
        "buy_order": buy_order,
        "details": [
            {
                "commerce_code": TBK_CHILD_COMMERCE_CODE,
                "buy_order": buy_order,
                "amount": amount
            }
        ]
    }

    response = requests.post(url, json=payload, headers=HEADERS, timeout=TBK_REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.json()


def refund_payment(buy_order: str, detail_buy_order: str, amount: int):
    """
    Reembolso / anulación parcial o total (OneClick Mall).
    buy_order: orden padre de la transacción (misma usada en authorize).
    detail_buy_order: orden del detalle tienda hija (puede coincidir con la padre en MAQGO).
    """
    _check_config()
    url = f"{BASE_URL}/rswebpaytransaction/api/oneclick/v1.2/transactions/{buy_order}/refunds"

    payload = {
        "commerce_code": TBK_CHILD_COMMERCE_CODE,
        "detail_buy_order": detail_buy_order,
        "amount": amount
    }

    response = requests.post(url, json=payload, headers=HEADERS, timeout=TBK_REQUEST_TIMEOUT)
    response.raise_for_status()
    data = response.json()
    rc = data.get("response_code", data.get("responseCode", -1))
    if rc != 0:
        raise ValueError(
            f"Transbank rechazó el reembolso: response_code={rc} body={data}"
        )
    return data
