#!/usr/bin/env python3
"""
MAQGO - Stress test Backend a 1000 requests concurrentes
Ejecutar con backend corriendo: python scripts/stress_backend_1000.py
Usa requests + ThreadPoolExecutor (sin dependencias extra).
"""
import time
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

BASE = os.environ.get('STRESS_BACKEND_URL', 'http://localhost:8000')
N_REQUESTS = 1000
MAX_WORKERS = 100

ENDPOINTS = [
    ('GET', '/api/'),
    ('GET', '/api/public/stats'),
    ('POST', '/api/pricing/immediate', {
        'machinery_type': 'retroexcavadora',
        'base_price_hr': 45000,
        'hours': 4,
        'transport_cost': 25000,
        'is_immediate': True
    }),
    ('GET', '/api/pricing/reference-prices'),
]


def hit(i: int) -> int:
    e = ENDPOINTS[i % len(ENDPOINTS)]
    url = f"{BASE.rstrip('/')}{e[1]}"
    try:
        if e[0] == 'GET':
            r = requests.get(url, timeout=10)
        else:
            r = requests.post(url, json=e[2] if len(e) == 3 else {}, timeout=10)
        return r.status_code
    except Exception:
        return -1


def run_stress():
    print(f"\n{'='*60}")
    print(f"MAQGO - STRESS BACKEND 1000")
    print(f"{'='*60}")
    print(f"Base URL: {BASE}")
    print(f"Requests: {N_REQUESTS} concurrentes")
    print(f"{'='*60}\n")

    start = time.perf_counter()
    results = {'ok': 0, 'err': 0, 'statuses': {}}

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = [ex.submit(hit, i) for i in range(N_REQUESTS)]
        for f in as_completed(futures):
            status = f.result()
            results['statuses'][status] = results['statuses'].get(status, 0) + 1
            if 200 <= status < 400:
                results['ok'] += 1
            else:
                results['err'] += 1

    elapsed = time.perf_counter() - start

    print("RESULTADOS:")
    print(f"  Total: {N_REQUESTS}")
    print(f"  OK (2xx/3xx): {results['ok']}")
    print(f"  Errores: {results['err']}")
    print(f"  Por status: {results['statuses']}")
    print(f"  Tiempo: {elapsed:.2f}s")
    print(f"  RPS: {N_REQUESTS/elapsed:.0f} req/s")
    print(f"{'='*60}\n")
    return results


if __name__ == '__main__':
    run_stress()
