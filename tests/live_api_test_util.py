"""
Solo suite pytest en repo: base URL para pegarle a un API local o staging.
No se usa en runtime de www.maqgo.cl.
"""

from __future__ import annotations

import os

import requests


def base_url() -> str:
    return (
        os.environ.get('MAQGO_LIVE_API_TEST_URL', '').strip()
        or os.environ.get('REACT_APP_BACKEND_URL', '').strip()
        or 'http://127.0.0.1:8000'
    ).rstrip('/')


def is_available() -> bool:
    if os.environ.get('MAQGO_SKIP_LIVE_API_TESTS', '').strip().lower() in ('1', 'true', 'yes'):
        return False
    try:
        r = requests.get(f'{base_url()}/api/health', timeout=1.5)
        return r.status_code == 200
    except Exception:
        return False
