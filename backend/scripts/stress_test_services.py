#!/usr/bin/env python3
"""
MAQGO - Simulación masiva de servicios (FASE 2)
Simula 100 servicios con distintos comportamientos.
Usa lógica productiva (servicios, DB) sin modificar código existente.
"""
import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta

# Agregar backend al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

from motor.motor_asyncio import AsyncIOMotorClient
import aiohttp

# Configuración
BASE_URL = os.environ.get('STRESS_TEST_BASE_URL', 'http://localhost:8000/api')
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'maqgo_db')
STRESS_PREFIX = 'stress_'

from pricing.business_rules import CONFIRMED_NO_ARRIVAL_TIMEOUT_MINUTES

# Coordenadas Santiago (para mark-arrival dentro de 500m)
JOB_LAT, JOB_LNG = -33.4372, -70.6506
ARRIVAL_LAT, ARRIVAL_LNG = -33.4365, -70.6510  # ~100m de distancia


async def ensure_test_data(db):
    """Crea clientes y proveedores de prueba si no existen."""
    now = datetime.now(timezone.utc).isoformat()
    created = 0

    for i in range(120):
        cid = f"{STRESS_PREFIX}client_{i}"
        if not await db.users.find_one({'id': cid}):
            await db.users.insert_one({
                'id': cid,
                'name': f'Cliente Stress {i}',
                'email': f'stress_{i}@test.maqgo.cl',
                'role': 'client',
                'createdAt': now,
            })
            created += 1

    for i in range(120):
        pid = f"{STRESS_PREFIX}provider_{i}"
        if not await db.users.find_one({'id': pid}):
            await db.users.insert_one({
                'id': pid,
                'name': f'Proveedor Stress {i}',
                'role': 'provider',
                'machineryType': 'excavadora',
                'hourlyRate': 150000,
                'isAvailable': True,
                'location': {'lat': JOB_LAT + (i * 0.0001), 'lng': JOB_LNG, 'address': f'Test {i}'},
                'createdAt': now,
            })
            created += 1

    return created


async def create_and_accept(session: aiohttp.ClientSession, base: str, db, client_id: str, provider_id: str) -> dict | None:
    """Crea servicio y acepta. Retorna el servicio o None si falla."""
    create_payload = {
        'clientId': client_id,
        'clientName': 'Cliente Stress',
        'clientEmail': f'{client_id}@test.maqgo.cl',
        'location': {'lat': JOB_LAT, 'lng': JOB_LNG, 'address': 'Obra Stress Test'},
        'basePrice': 150000,
        'transportFee': 0,
        'workdayAccepted': True,
        'selectedProviderId': provider_id,
    }
    async with session.post(f'{base}/service-requests', json=create_payload) as r:
        if r.status != 200:
            return None
        data = await r.json()
    sid = data.get('id')
    if not sid:
        return None
    async with session.put(f'{base}/service-requests/{sid}/accept', json={'providerId': provider_id}) as r2:
        if r2.status != 200:
            return None
    return {'id': sid, 'clientId': client_id, 'providerId': provider_id}


async def run_scenario_1(session: aiohttp.ClientSession, base: str, db, n: int) -> list:
    """30 servicios: create, confirm, mark-arrival, auto_start, finish."""
    results = []
    for i in range(n):
        cid = f"{STRESS_PREFIX}client_{i}"
        pid = f"{STRESS_PREFIX}provider_{i + 200}"  # Proveedores distintos
        await db.users.update_one({'id': pid}, {'$set': {'isAvailable': True}})
        svc = await create_and_accept(session, base, db, cid, pid)
        if not svc:
            continue
        async with session.post(f"{base}/service-requests/{svc['id']}/mark-arrival",
                               json={'lat': ARRIVAL_LAT, 'lng': ARRIVAL_LNG}) as r:
            if r.status != 200:
                continue
        # Backdate arrival 31 min para auto_start
        await db.service_requests.update_one(
            {'id': svc['id']},
            {'$set': {'arrivalDetectedAt': (datetime.now(timezone.utc) - timedelta(minutes=31)).isoformat()}}
        )
        results.append(svc['id'])
    return results


async def run_scenario_2(session: aiohttp.ClientSession, base: str, db, n: int) -> list:
    """15 servicios: confirm, mark-arrival, esperar auto_start (sin start manual)."""
    results = []
    for i in range(n):
        cid = f"{STRESS_PREFIX}client_{i + 30}"
        pid = f"{STRESS_PREFIX}provider_{i + 210}"
        await db.users.update_one({'id': pid}, {'$set': {'isAvailable': True}})
        svc = await create_and_accept(session, base, db, cid, pid)
        if not svc:
            continue
        async with session.post(f"{base}/service-requests/{svc['id']}/mark-arrival",
                               json={'lat': ARRIVAL_LAT, 'lng': ARRIVAL_LNG}) as r:
            if r.status != 200:
                continue
        await db.service_requests.update_one(
            {'id': svc['id']},
            {'$set': {'arrivalDetectedAt': (datetime.now(timezone.utc) - timedelta(minutes=31)).isoformat()}}
        )
        results.append(svc['id'])
    return results


async def run_scenario_3(session: aiohttp.ClientSession, base: str, db, n: int) -> list:
    """10 servicios: confirm, cancelar antes de 90 min."""
    results = []
    for i in range(n):
        cid = f"{STRESS_PREFIX}client_{i + 45}"
        pid = f"{STRESS_PREFIX}provider_{i + 220}"
        await db.users.update_one({'id': pid}, {'$set': {'isAvailable': True}})
        svc = await create_and_accept(session, base, db, cid, pid)
        if not svc:
            continue
        async with session.put(f"{base}/service-requests/{svc['id']}/cancel", json={}) as r:
            if r.status == 200:
                results.append(svc['id'])
    return results


async def run_scenario_4(session: aiohttp.ClientSession, base: str, db, n: int) -> list:
    """15 servicios: confirm, esperar >90 min, cancelar (20% fee)."""
    results = []
    for i in range(n):
        cid = f"{STRESS_PREFIX}client_{i + 55}"
        pid = f"{STRESS_PREFIX}provider_{i + 230}"
        await db.users.update_one({'id': pid}, {'$set': {'isAvailable': True}})
        svc = await create_and_accept(session, base, db, cid, pid)
        if not svc:
            continue
        # Backdate confirmedAt 91 min
        await db.service_requests.update_one(
            {'id': svc['id']},
            {'$set': {'confirmedAt': (datetime.now(timezone.utc) - timedelta(minutes=91)).isoformat()}}
        )
        async with session.put(f"{base}/service-requests/{svc['id']}/cancel", json={}) as r:
            if r.status == 200:
                results.append(svc['id'])
    return results


async def run_scenario_5(session: aiohttp.ClientSession, base: str, db, n: int) -> list:
    """10 servicios: confirm, mark-arrival, intentar cancelar (debe bloquear)."""
    results = []
    for i in range(n):
        cid = f"{STRESS_PREFIX}client_{i + 70}"
        pid = f"{STRESS_PREFIX}provider_{i + 240}"
        await db.users.update_one({'id': pid}, {'$set': {'isAvailable': True}})
        svc = await create_and_accept(session, base, db, cid, pid)
        if not svc:
            continue
        async with session.post(f"{base}/service-requests/{svc['id']}/mark-arrival",
                               json={'lat': ARRIVAL_LAT, 'lng': ARRIVAL_LNG}) as r:
            if r.status != 200:
                continue
        async with session.put(f"{base}/service-requests/{svc['id']}/cancel", json={}) as r2:
            detail = (await r2.json()).get('detail', '') if r2.status == 400 else ''
            if r2.status == 400 and 'operador ha llegado' in detail:
                results.append(svc['id'])
    return results


async def run_scenario_6(session: aiohttp.ClientSession, base: str, db, n: int) -> list:
    """20 servicios: confirm, no arrival, no cancelación, esperar timeout automático."""
    results = []
    for i in range(n):
        cid = f"{STRESS_PREFIX}client_{i + 80}"
        pid = f"{STRESS_PREFIX}provider_{i + 250}"
        await db.users.update_one({'id': pid}, {'$set': {'isAvailable': True}})
        svc = await create_and_accept(session, base, db, cid, pid)
        if not svc:
            continue
        # Backdate confirmedAt para que timeout dispare
        await db.service_requests.update_one(
            {'id': svc['id']},
            {'$set': {'confirmedAt': (datetime.now(timezone.utc) - timedelta(minutes=CONFIRMED_NO_ARRIVAL_TIMEOUT_MINUTES + 1)).isoformat()}}
        )
        results.append(svc['id'])
    return results


async def run_timer_check(session: aiohttp.ClientSession, base: str) -> dict:
    """Ejecuta verificación de timers."""
    async with session.post(f'{base}/service-requests/timers/check') as r:
        return await r.json() if r.status == 200 else {}




async def finish_services(session: aiohttp.ClientSession, base: str, db, service_ids: list):
    """Finaliza servicios in_progress o last_30."""
    for sid in service_ids:
        svc = await db.service_requests.find_one({'id': sid}, {'_id': 0, 'status': 1})
        if svc and svc.get('status') in ('in_progress', 'last_30'):
            await session.put(f"{base}/service-requests/{sid}/finish", json={})


async def main():
    print("=" * 60)
    print("MAQGO - Simulación masiva de servicios (100 servicios)")
    print("=" * 60)

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # Datos de prueba
    created = await ensure_test_data(db)
    print(f"Usuarios de prueba: {created} nuevos (o ya existían)")

    base = BASE_URL

    async with aiohttp.ClientSession() as session:
        print("\nEjecutando escenarios...")
        s1 = await run_scenario_1(session, base, db, 30)
        print(f"  Escenario 1 (30 normales): {len(s1)} creados+arrival")
        s2 = await run_scenario_2(session, base, db, 15)
        print(f"  Escenario 2 (15 auto_start): {len(s2)} creados+arrival")
        s3 = await run_scenario_3(session, base, db, 10)
        print(f"  Escenario 3 (10 cancel <90min): {len(s3)} cancelados")
        s4 = await run_scenario_4(session, base, db, 15)
        print(f"  Escenario 4 (15 cancel >90min + fee): {len(s4)} cancelados con fee")
        s5 = await run_scenario_5(session, base, db, 10)
        print(f"  Escenario 5 (10 bloqueo cancel): {len(s5)} bloqueos")
        s6 = await run_scenario_6(session, base, db, 20)
        print(f"  Escenario 6 (20 timeout): {len(s6)} creados para timeout")

        print("\nEjecutando timers (auto_start, timeout, finished)...")
        timer_result = await run_timer_check(session, base)
        print(f"  Timer: {timer_result}")

        # Segunda pasada de timers por si hay más
        await asyncio.sleep(1)
        await run_timer_check(session, base)

        # Finalizar servicios in_progress (escenarios 1 y 2)
        to_finish = s1 + s2
        await finish_services(session, base, db, to_finish)

    # Consultar resultados desde DB
    pipeline = [
        {'$match': {'clientId': {'$regex': f'^{STRESS_PREFIX}'}}},
        {'$group': {'_id': '$status', 'count': {'$sum': 1}}},
        {'$sort': {'count': -1}}
    ]
    by_status = list(await db.service_requests.aggregate(pipeline).to_list(None))

    total_fee = await db.service_requests.aggregate([
        {'$match': {'clientId': {'$regex': f'^{STRESS_PREFIX}'}}},
        {'$group': {'_id': None, 'total': {'$sum': {'$ifNull': ['$cancelationFee', 0]}}}}
    ]).to_list(None)
    total_cancelation_fee = total_fee[0]['total'] if total_fee else 0

    finished_count = await db.service_requests.count_documents({
        'clientId': {'$regex': f'^{STRESS_PREFIX}'},
        'status': 'finished'
    })

    auto_start_count = await db.service_requests.count_documents({
        'clientId': {'$regex': f'^{STRESS_PREFIX}'},
        'events': {'$elemMatch': {'type': 'auto_start'}}
    })

    block_count = await db.service_requests.count_documents({
        'clientId': {'$regex': f'^{STRESS_PREFIX}'},
        'arrivalDetectedAt': {'$exists': True, '$ne': None},
        'status': 'confirmed'  # Siguen confirmed porque cancel fue bloqueado
    })

    print("\n" + "=" * 60)
    print("RESULTADOS FINALES")
    print("=" * 60)
    print("\nConteo por status:")
    for s in by_status:
        print(f"  {s['_id']}: {s['count']}")
    print(f"\nTotal cancelationFee acumulado: ${total_cancelation_fee:,.0f} CLP")
    print(f"Total servicios finished: {finished_count}")
    print(f"Total auto_start ejecutados: {auto_start_count}")
    print(f"Total bloqueos de cancelación (confirmed con arrival): {block_count}")

    # Estados inconsistentes
    inconsistent = []
    if block_count != 10:
        inconsistent.append(f"Bloqueos esperados 10, obtenidos {block_count}")
    if finished_count != 45:  # 30 + 15
        inconsistent.append(f"Finished esperados 45 (30+15), obtenidos {finished_count}")
    cancelled_with_fee = next((s['count'] for s in by_status if s['_id'] == 'cancelled_with_fee'), 0)
    if cancelled_with_fee != 15:
        inconsistent.append(f"cancelled_with_fee esperados 15, obtenidos {cancelled_with_fee}")
    cancelled_no_arrival = next((s['count'] for s in by_status if s['_id'] == 'cancelled_no_arrival'), 0)
    if cancelled_no_arrival != 20:
        inconsistent.append(f"cancelled_no_arrival esperados 20, obtenidos {cancelled_no_arrival}")

    if inconsistent:
        print("\n⚠️  ESTADOS INCONSISTENTES:")
        for inc in inconsistent:
            print(f"  - {inc}")
    else:
        print("\n✅ Sin inconsistencias detectadas.")

    client.close()


if __name__ == '__main__':
    asyncio.run(main())
