import json
import os
import requests


def main():
    base_url = (
        "https://webpay3g.transbank.cl"
        if os.getenv("TBK_ENV", "integration") == "production"
        else "https://webpay3gint.transbank.cl"
    )
    url = f"{base_url}/rswebpaytransaction/api/oneclick/v1.2/inscriptions"
    headers = {
        "Tbk-Api-Key-Id": os.getenv("TBK_API_KEY_ID", "").strip()
        or os.getenv("TBK_PARENT_COMMERCE_CODE", "").strip(),
        "Tbk-Api-Key-Secret": os.getenv("TBK_API_KEY_SECRET", "").strip()
        or os.getenv("TBK_API_KEY", "").strip(),
        "Content-Type": "application/json",
        "Accept": "*/*",
        "User-Agent": "curl/8.7.1",
    }
    username = os.getenv("TBK_TEST_USERNAME", "").strip()
    email = os.getenv("TBK_TEST_EMAIL", "").strip()
    response_url = os.getenv("TBK_RETURN_URL", "").strip()
    if not username or not email or not response_url:
        raise SystemExit(
            "Faltan variables TBK_TEST_USERNAME, TBK_TEST_EMAIL y/o TBK_RETURN_URL "
            "(se eliminaron defaults fake/hardcodeados)."
        )
    payload = {
        "username": username,
        "email": email,
        "response_url": response_url,
    }

    s = requests.Session()
    s.trust_env = False
    print("REQ_URL", url)
    print("REQ_HEADERS", json.dumps(headers, ensure_ascii=False))
    print("REQ_BODY", json.dumps(payload, ensure_ascii=False))
    r = s.post(url, headers=headers, json=payload, timeout=10)
    print("RES_STATUS", r.status_code)
    print("RES_HEADERS", json.dumps(dict(r.headers), ensure_ascii=False))
    print("RES_BODY", r.text)


if __name__ == "__main__":
    main()
