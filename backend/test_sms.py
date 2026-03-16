#!/usr/bin/env python3
"""
Prueba de envío SMS vía Twilio.
Uso: TWILIO_TO=+56912345678 python test_sms.py
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / '.env')

# Número destino: TWILIO_TO, argumento, o +56994336579 por defecto
to = os.environ.get('TWILIO_TO') or (sys.argv[1] if len(sys.argv) > 1 else None) or '+56994336579'

# Formato E.164 si viene sin +
if not to.startswith('+'):
    to = f"+56{to.replace(' ', '')}" if to.startswith('9') else f"+{to}"

print(f"Enviando SMS a {to}...")

from communications import send_sms_otp, DEMO_MODE

result = send_sms_otp(to, channel='sms')

if result.get('success'):
    if result.get('demo_mode'):
        print(f"✅ Modo demo: no se envió SMS real. Usa código: {result.get('message', '123456')}")
    else:
        print(f"✅ SMS enviado: {result.get('status', 'OK')}")
else:
    print(f"❌ Error: {result.get('error', 'Desconocido')}")
    if not os.environ.get('TWILIO_ACCOUNT_SID'):
        print("   → Revisa que TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_SMS_FROM estén en .env")
    sys.exit(1)
