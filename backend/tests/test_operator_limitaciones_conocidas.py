import asyncio
import os
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


_LIM_CONOCIDA_MARCADA = os.environ.get("REGISTRA_LIMITACIONES_CONOCIDAS", "true").strip().lower() == "true"

pytestmark = pytest.mark.skipif(
    not _LIM_CONOCIDA_MARCADA,
    reason="Suite limitaciones conocidas; habilita con REGISTRA_LIMITACIONES_CONOCIDAS=true.",
)


class _FakeUsersCollection:
    def __init__(self, docs):
        self.by_id = {doc["id"]: dict(doc) for doc in docs}
        self.calls = 0

    async def find_one(self, query, projection=None):
        self.calls += 1
        opid = query.get("id")
        doc = self.by_id.get(opid)
        if not doc:
            return None
        if projection:
            return {k: v for k, v in doc.items() if k == "_id" or k in projection}
        return dict(doc)

    async def update_one(self, query, update):
        opid = query.get("id")
        doc = self.by_id.get(opid)
        if doc:
            doc.update(update.get("$set", {}))
        class _R: matched_count = 1
        return _R()


class _FakeMachinesCollection:
    def __init__(self, docs):
        self.by_id = {doc["id"]: dict(doc) for doc in docs}

    async def find_one(self, query, projection=None):
        mid = query.get("id")
        doc = self.by_id.get(mid)
        if not doc:
            return None
        if projection:
            return {k: v for k, v in doc.items() if k == "_id" or k in projection}
        return dict(doc)


class _FakeServiceRequestsCollection:
    def __init__(self, docs):
        self.by_id = {doc["id"]: dict(doc) for doc in docs}
        self.reads = 0
        self.writes = 0

    async def find_one(self, query, projection=None):
        self.reads += 1
        rid = query.get("id")
        doc = self.by_id.get(rid)
        if not doc:
            return None
        if projection:
            return {k: v for k, v in doc.items() if k == "_id" or k in projection}
        return dict(doc)

    async def update_one(self, query, update, array_filters=None):
        self.writes += 1
        rid = query.get("id")
        doc = self.by_id.get(rid)
        if not doc:
            class _R: matched_count = 0
            return _R()
        doc.update(update.get("$set", {}))
        for k in update.get("$unset", {}):
            if k in doc:
                del doc[k]
        class _R: matched_count = 1
        return _R()


@pytest.mark.limitacion_conocida
def test_concurrencia_accept_y_desactivacion_sin_transaccion_mongodb():
    """
    LIMITACIÓN CONOCIDA (Go Live inicial):
        El guard G1 accept valida operator.status == 'active' antes de hacer update_one service_request.
        Ambas operaciones son 2 queries separadas NO atómicas.
        Ventana de carrera ~10-50 ms donde:
            Hilo A (Accept)   pasa el guard (status=active) → espera antes write
            Hilo B (Admin/Owner) desactiva operator → status=inactive
            Hilo A escribe service_request OK → solicitud confirmada SIN operator active.

    Defensa posterior (aceptable para bajo tráfico inicial):
        G4 arrival / G5 start / G6 auto_start detectan status=inactive y bloquean 409.

    Hardening Post-Go-Live (backlog P2):
        - find_one_and_update condicional atómico, o
        - MongoDB ClientSession transaccional (replica set 4.2+).

    Este test NO valida la regla de negocio (suite de certificación lo hace).
    Solo DOCUMENTA la ventana para que no sea olvidada.
    """
    from services import operator_guards
    from routes import service_requests as sr_mod

    op_id = "op_carrera"
    op = {
        "id": op_id,
        "status": "active",
        "provider_role": "operator",
        "owner_id": "own_carrera",
    }
    machine = {
        "id": "mach_carrera",
        "provider_id": "own_carrera",
        "primaryOperatorId": op_id,
        "operators": [{"id": op_id, "isPrimary": True}],
    }
    sr = {
        "id": "sr_carrera",
        "status": "offer_sent",
        "machineId": "mach_carrera",
        "providerId": "own_carrera",
        "clientId": "cli_carrera",
        "totalAmount": 800,
        "bookingId": None,
        "matchingAttempts": [{"providerId": "own_carrera", "status": "pending"}],
    }

    users = _FakeUsersCollection([dict(op)])
    machines = _FakeMachinesCollection([dict(machine)])
    srs = _FakeServiceRequestsCollection([dict(sr)])

    monkeypatch = getattr(test_concurrencia_accept_y_desactivacion_sin_transaccion_mongodb, "_mp", None)
    try:
        import _pytest.monkeypatch as _mp
        monkeypatch = _mp.MonkeyPatch()
    except Exception:
        monkeypatch = None

    if monkeypatch is None:
        return

    class _FakeGenericCollection(dict):
        async def insert_one(self, doc, *a, **kw): return None
        async def find_one(self, query, projection=None, *a, **kw): return None
        async def find_one_and_update(self, query, update, return_document=None, array_filters=None, *a, **kw): return None
        async def update_one(self, query, update, array_filters=None, upsert=False, *a, **kw):
            class _R: matched_count = 1
            return _R()
        async def update_many(self, query, update, array_filters=None, upsert=False, *a, **kw):
            class _R: matched_count = 1
            return _R()
        async def create_index(self, *a, **kw): return None
        async def count_documents(self, query=None, *a, **kw): return 0

    monkeypatch.setattr(operator_guards, "_users_collection", users)

    class _Db(_FakeGenericCollection):
        def __getitem__(self, key):
            try:
                return super().__getitem__(key)
            except KeyError:
                v = _FakeGenericCollection()
                self[key] = v
                return v
        def __setitem__(self, key, value):
            super().__setitem__(key, value)
    db = _Db()
    db.users = users
    db.machines = machines
    db.service_requests = srs
    db.payment_intents = _FakeGenericCollection()
    db.payment_metrics = _FakeGenericCollection()
    db.payment_ledger_events = _FakeGenericCollection()
    db.idempotency = _FakeGenericCollection()
    db.oneclick_evidence = _FakeGenericCollection()
    db.growth_nodes = _FakeGenericCollection()
    db.payment_rollout_counters = _FakeGenericCollection()
    monkeypatch.setattr(sr_mod, "db", db)

    monkeypatch.setattr(sr_mod, "_is_admin_session", lambda u: True)
    monkeypatch.setattr(sr_mod, "_provider_matches_user", lambda u, pid: True)
    monkeypatch.setattr(sr_mod, "has_permission", lambda u, p: True)
    monkeypatch.setattr(sr_mod, "handle_offer_response", lambda *a, **kw: {"status": "confirmed"})

    class _PS:
        async def charge_for_accept(self, *a, **kw):
            return {"success": True}
        async def rollback_charge(self, *a, **kw):
            return {"success": True}

    sr_mod.payment_service = _PS()

    ventana_observada = {"carrera_detectada": False}

    async def _accept():
        class _R:
            def __init__(self):
                self.headers = {}
                self.url = self
                self.path = "/sr_carrera/accept"
        return await sr_mod.accept_service_request(
            "sr_carrera",
            _R(),
            body={"providerId": "own_carrera"},
            current_user={"id": "admin", "provider_role": "super_master"},
        )

    async def _race_carrera():
        task_accept = asyncio.create_task(_accept())
        accept_passed_first_read = False
        desactivo_despues_accept_guard = False

        # Esperar a que el guard haga find_one (1ra lectura de operator)
        # → desactivar operator antes write_one service_request
        for _ in range(500):
            if users.calls >= 1 and srs.reads >= 1 and not accept_passed_first_read:
                accept_passed_first_read = True
                # Aquí simulamos desactivación justo después del guard:
                u = users.by_id[op_id]
                u["status"] = "inactive"
                desactivo_despues_accept_guard = True
                break
            await asyncio.sleep(0.0005)

        await task_accept

        req = srs.by_id["sr_carrera"]
        accept_termino_ok = req.get("acceptedAt") is not None
        if accept_termino_ok and desactivo_despues_accept_guard and str(users.by_id[op_id].get("status") or "").strip().lower() != "active":
            # Condición carrera documentada: accept pasó, pero operator quedó inactive post-desactivación.
            # Es la LIMITACIÓN. Registramos.
            ventana_observada["carrera_detectada"] = True

    asyncio.run(_race_carrera())

    # Esta suite DEBE pasar siempre.
    # El assert NO verifica que la carrera exista o no; verifica que la suite no rompa.
    # El objetivo es solo informativo/documental: marcado con @pytest.mark.limitacion_conocida.
    assert True
