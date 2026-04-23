#!/usr/bin/env python3
"""
Prueba de envío SMS OTP vía LabsMobile (backend communications).
Uso: LABSMOBILE_TO=+56912345678 python test_sms.py
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

def main() -> int:
    load_dotenv(Path(__file__).parent / ".env")

    to = os.environ.get("LABSMOBILE_TO") or (sys.argv[1] if len(sys.argv) > 1 else None) or "+56994336579"
    if not to.startswith("+"):
        to = f"+56{to.replace(' ', '')}" if to.startswith("9") else f"+{to}"

    print(f"Enviando SMS a {to}...")

    from communications import send_sms_otp

    result = send_sms_otp(to, channel="sms")

    if result.get("success"):
        if result.get("demo_mode"):
            print(f"✅ Modo demo: no se envió SMS real. Usa código: {result.get('message', '123456')}")
        else:
            print(f"✅ SMS enviado: {result.get('status', 'OK')}")
        return 0

    print(f"❌ Error: {result.get('error', 'Desconocido')}")
    if not os.environ.get("LABSMOBILE_API_TOKEN"):
        print("   → Revisa que LABSMOBILE_USERNAME, LABSMOBILE_API_TOKEN y LABSMOBILE_SENDER estén en .env")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
