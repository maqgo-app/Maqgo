import asyncio

import pytest

from services.machines_service import create_machine, normalize_machine_payload, serialize_machine, update_machine


def test_normalize_machine_payload_license_plate_formats_4_letters_2_digits() -> None:
    doc = normalize_machine_payload(
        {
            "machineryType": "camion_aljibe",
            "licensePlate": "ab cd12",
            "brand": "X",
            "model": "Y",
            "year": "2022",
        },
        "prov_1",
    )
    assert doc["licensePlate"] == "ABCD-12"
    assert doc["license_plate"] == "ABCD-12"


def test_normalize_machine_payload_license_plate_formats_2_letters_4_digits() -> None:
    doc = normalize_machine_payload(
        {
            "machineryType": "camion_aljibe",
            "licensePlate": "aa1234",
            "brand": "X",
            "model": "Y",
            "year": "2022",
        },
        "prov_1",
    )
    assert doc["licensePlate"] == "AA-1234"


def test_normalize_machine_payload_license_plate_compacts_other_formats() -> None:
    doc = normalize_machine_payload(
        {
            "machineryType": "camion_aljibe",
            "licensePlate": "xx-1",
            "brand": "X",
            "model": "Y",
            "year": "2022",
        },
        "prov_1",
    )
    assert doc["licensePlate"] == "XX1"


def test_normalize_machine_payload_keeps_multiple_real_operators_and_marks_one_primary() -> None:
    doc = normalize_machine_payload(
        {
            "machineryType": "retroexcavadora",
            "licensePlate": "ABCD12",
            "operators": [
                {"nombre": "Ana", "apellido": "Pérez", "rut": "11.111.111-1", "phone": "+56 9 9123 4567"},
                {"name": "Luis Soto", "phone": "+56 9 9876 5432", "isPrimary": True},
            ],
        },
        "prov_1",
    )
    assert len(doc["operators"]) == 2
    assert sum(1 for op in doc["operators"] if op.get("isPrimary")) == 1
    assert doc["primaryOperatorId"] == doc["operators"][1]["id"]


def test_normalize_machine_payload_single_operator_becomes_primary() -> None:
    doc = normalize_machine_payload(
        {
            "machineryType": "retroexcavadora",
            "licensePlate": "ABCD12",
            "operators": [
                {"name": "Ana Perez", "phone": "+56 9 9876 5432"},
            ],
        },
        "prov_1",
    )
    assert len(doc["operators"]) == 1
    assert doc["operators"][0]["isPrimary"] is True
    assert doc["primaryOperatorId"] == doc["operators"][0]["id"]


def test_normalize_machine_payload_falls_back_to_first_operator_when_none_marked() -> None:
    doc = normalize_machine_payload(
        {
            "machineryType": "retroexcavadora",
            "licensePlate": "ABCD12",
            "operators": [
                {"name": "Ana Perez", "phone": "+56 9 9876 5432"},
                {"name": "Luis Soto", "phone": "+56 9 9123 4567"},
            ],
        },
        "prov_1",
    )
    assert len(doc["operators"]) == 2
    assert doc["operators"][0]["isPrimary"] is True
    assert doc["operators"][1]["isPrimary"] is False
    assert doc["primaryOperatorId"] == doc["operators"][0]["id"]


def test_normalize_machine_payload_discards_placeholder_operators_and_drafts_machine() -> None:
    doc = normalize_machine_payload(
        {
            "machineryType": "retroexcavadora",
            "licensePlate": "ABCD12",
            "operators": [
                {"name": "Operador RC"},
                {"name": "Operador"},
            ],
            "published": True,
            "available": True,
            "status": "active",
        },
        "prov_1",
    )
    assert doc["operators"] == []
    assert doc["published"] is False
    assert doc["available"] is False
    assert doc["status"] == "draft"


def test_serialize_machine_sanitizes_operator_payload_for_public_responses() -> None:
    machine = serialize_machine(
        {
            "id": "mach_1",
            "machineryType": "retroexcavadora",
            "licensePlate": "ABCD-12",
            "operators": [
                {"name": "Operador RC", "id": "op-onboarding-1"},
                {"name": "Ana Perez", "phone": "+56 9 9876 5432", "isPrimary": True},
            ],
            "primaryOperatorId": "op-onboarding-1",
        }
    )
    assert machine is not None
    assert machine["operatorCount"] == 1
    assert machine["primaryOperatorId"] == machine["operators"][0]["id"]
    assert machine["operators"][0]["name"] == "Ana Perez"


def test_serialize_machine_exposes_operatorless_machine_as_draft() -> None:
    machine = serialize_machine(
        {
            "id": "mach_2",
            "machineryType": "retroexcavadora",
            "licensePlate": "ABCD-34",
            "operators": [{"name": "Operador RC", "id": "op-onboarding-2"}],
            "available": True,
            "published": True,
            "status": "active",
        }
    )
    assert machine is not None
    assert machine["operators"] == []
    assert machine["operatorCount"] == 0
    assert machine["available"] is False
    assert machine["published"] is False
    assert machine["status"] == "draft"


class _DummyMachinesCollection:
    async def create_index(self, *args, **kwargs):
        return None

    async def find_one(self, *args, **kwargs):
        return None

    async def update_one(self, *args, **kwargs):
        return None

    async def insert_one(self, *args, **kwargs):
        return None


class _DummyUsersCollection:
    async def find_one(self, *args, **kwargs):
        return None

    async def update_one(self, *args, **kwargs):
        return None


class _DummyDb:
    def __init__(self):
        self.machines = _DummyMachinesCollection()
        self.users = _DummyUsersCollection()

    async def list_collection_names(self):
        return ["machines", "users"]


def test_create_machine_rejects_machine_without_real_operator() -> None:
    db = _DummyDb()
    with pytest.raises(ValueError, match="al menos un operador real asignado"):
        asyncio.run(
            create_machine(
                db,
                "prov_1",
                {
                    "machineryType": "retroexcavadora",
                    "licensePlate": "ABCD12",
                    "operators": [{"name": "Operador RC"}],
                },
            )
        )


def test_create_machine_rejects_machine_with_operator_missing_rut_id_phone() -> None:
    db = _DummyDb()
    with pytest.raises(ValueError, match="al menos un operador real asignado"):
        asyncio.run(
            create_machine(
                db,
                "prov_1",
                {
                    "machineryType": "retroexcavadora",
                    "licensePlate": "ABCD12",
                    "operators": [{"nombre": "Claudio", "apellido": "Valle"}],
                },
            )
        )


def test_create_machine_accepts_operator_with_valid_rut_without_phone() -> None:
    created = {}
    inserted = {}

    class _InsertMachinesCollection(_DummyMachinesCollection):
        async def insert_one(self, doc, *args, **kwargs):
            inserted.update(doc)
            created.update(doc)
            return None

    class _ActiveUsersCollection(_DummyUsersCollection):
        async def find_one(self, query, *args, **kwargs):
            qid = query.get("id") or query.get("userId")
            if qid and str(qid).startswith("op-rut-"):
                return {
                    "id": qid,
                    "rut": "11.111.111-1",
                    "phone": "+56912345678",
                    "status": "active",
                    "visible_status": "active",
                    "provider_role": "operator",
                    "roles": ["operator"],
                    "name": "Claudio Valle",
                }
            return None

    class _InsertDb(_DummyDb):
        def __init__(self):
            super().__init__()
            self.machines = _InsertMachinesCollection()
            self.users = _ActiveUsersCollection()

    db = _InsertDb()
    result = asyncio.run(
        create_machine(
            db,
            "prov_1",
            {
                "machineryType": "retroexcavadora",
                "licensePlate": "AABB-11",
                "brand": "Tracam",
                "model": "1969",
                "year": "1969",
                "capacityM3": 0.5,
                "operators": [
                    {
                        "nombre": "Claudio",
                        "apellido": "Valle",
                        "rut": "11.111.111-1",
                        "isPrimary": True,
                        "phone": None,
                    }
                ],
                "pricePerHour": 150,
                "transportCost": 100,
                "available": True,
                "published": True,
                "status": "active",
            },
        )
    )
    assert result is not None
    ops = result.get("operators")
    assert isinstance(ops, list) and len(ops) == 1
    op = ops[0]
    assert "111111111" in str(op.get("rut", "")).replace(".", "").replace("-", "")
    assert str(op.get("id", "")).startswith("op-rut-")
    primary = result.get("primaryOperatorId")
    assert isinstance(primary, str) and primary.startswith("op-rut-")
    from services.machines_service import machine_has_real_assigned_operator

    assert machine_has_real_assigned_operator(result) is True


def test_create_machine_accepts_operator_with_phone_only() -> None:
    class _InsertMachines2(_DummyMachinesCollection):
        async def insert_one(self, doc, *args, **kwargs):
            return None

    class _ActiveUsers2(_DummyUsersCollection):
        async def find_one(self, query, *args, **kwargs):
            qid = query.get("id") or query.get("userId")
            if qid and str(qid).startswith("op-phone-"):
                return {
                    "id": qid,
                    "phone": "+56998765432",
                    "status": "active",
                    "visible_status": "active",
                    "provider_role": "operator",
                    "roles": ["operator"],
                    "name": "Ana Perez",
                }
            return None

    class _InsertDb2(_DummyDb):
        def __init__(self):
            super().__init__()
            self.machines = _InsertMachines2()
            self.users = _ActiveUsers2()

    db = _InsertDb2()
    result = asyncio.run(
        create_machine(
            db,
            "prov_1",
            {
                "machineryType": "retroexcavadora",
                "licensePlate": "BBCC-22",
                "operators": [
                    {"name": "Ana Perez", "phone": "+56 9 9876 5432", "isPrimary": True}
                ],
            },
        )
    )
    from services.machines_service import machine_has_real_assigned_operator

    assert machine_has_real_assigned_operator(result) is True
    assert len(result["operators"]) == 1


def test_create_machine_accepts_operator_with_stable_raw_id_only() -> None:
    class _InsertMachines3(_DummyMachinesCollection):
        async def insert_one(self, doc, *args, **kwargs):
            return None

    class _ActiveUsers3(_DummyUsersCollection):
        async def find_one(self, query, *args, **kwargs):
            qid = query.get("id") or query.get("userId")
            if qid == "usr_real_operator_id":
                return {
                    "id": "usr_real_operator_id",
                    "phone": "+56900000000",
                    "rut": "12.345.678-9",
                    "status": "active",
                    "visible_status": "active",
                    "provider_role": "operator",
                    "roles": ["operator"],
                    "name": "Luis Soto",
                }
            return None

    class _InsertDb3(_DummyDb):
        def __init__(self):
            super().__init__()
            self.machines = _InsertMachines3()
            self.users = _ActiveUsers3()

    db = _InsertDb3()
    result = asyncio.run(
        create_machine(
            db,
            "prov_1",
            {
                "machineryType": "camion_aljibe",
                "licensePlate": "CCDD-33",
                "operators": [
                    {
                        "id": "usr_real_operator_id",
                        "name": "Luis Soto",
                        "isPrimary": True,
                    }
                ],
            },
        )
    )
    from services.machines_service import machine_has_real_assigned_operator

    assert machine_has_real_assigned_operator(result) is True
    assert len(result["operators"]) == 1


def test_create_machine_rejects_placeholder_operators() -> None:
    db = _DummyDb()
    with pytest.raises(ValueError, match="al menos un operador real asignado"):
        asyncio.run(
            create_machine(
                db,
                "prov_1",
                {
                    "machineryType": "bulldozer",
                    "licensePlate": "DDEE-44",
                    "operators": [{"name": "Sin operador", "rut": "11.111.111-1"}],
                },
            )
        )


def test_update_machine_rejects_machine_without_real_operator() -> None:
    existing = {
        "id": "mach_1",
        "provider_id": "prov_1",
        "machineryType": "retroexcavadora",
        "licensePlate": "ABCD-12",
        "operators": [{"name": "Ana Perez", "phone": "+56 9 9876 5432", "isPrimary": True}],
    }

    class _UpdateMachinesCollection(_DummyMachinesCollection):
        async def find_one(self, query, *args, **kwargs):
            if query.get("id") == "mach_1":
                return existing
            return None

    class _UpdateDb(_DummyDb):
        def __init__(self):
            super().__init__()
            self.machines = _UpdateMachinesCollection()

    db = _UpdateDb()
    with pytest.raises(ValueError, match="al menos un operador real asignado"):
        asyncio.run(
            update_machine(
                db,
                "mach_1",
                {
                    "operators": [{"name": "Operador"}],
                },
            )
        )
