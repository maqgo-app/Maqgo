#!/usr/bin/env python3
"""
MAQGO - Stress test Frontend a 1000 requests concurrentes
Sirve el frontend con: npm run preview (puerto 4173) o npm run dev (5173)
Ejecutar: python scripts/stress_frontend_1000.py
Usa requests + ThreadPoolExecutor (sin dependencias extra).
"""
import time
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

BASE = os.environ.get('STRESS_FRONTEND_URL', 'http://localhost:4173')
N_REQUESTS = 1000
MAX_WORKERS = 100

PATHS = ['/', '/index.html', '/login', '/client/home', '/provider/register']


def hit(i: int) -> int:
    path = PATHS[i % len(PATHS)]
    url = f"{BASE.rstrip('/')}{path}"
    try:
        r = requests.get(url, timeout=15)
        return r.status_code
    except Exception:
        return -1


def run_stress():
    print(f"\n{'='*60}")
    print(f"MAQGO - STRESS FRONTEND 1000")
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
            if status == 200:
                results['ok'] += 1
            else:
                results['err'] += 1

    elapsed = time.perf_counter() - start

    print("RESULTADOS:")
    print(f"  Total: {N_REQUESTS}")
    print(f"  OK (200): {results['ok']}")
    print(f"  Errores: {results['err']}")
    print(f"  Por status: {results['statuses']}")
    print(f"  Tiempo: {elapsed:.2f}s")
    print(f"  RPS: {N_REQUESTS/elapsed:.0f} req/s")
    print(f"{'='*60}\n")
    return results


if __name__ == '__main__':
    run_stress()
