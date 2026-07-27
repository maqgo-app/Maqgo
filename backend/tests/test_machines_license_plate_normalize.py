from services.machines_service import normalize_machine_payload, serialize_machine


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
                {"nombre": "Ana", "apellido": "Pérez", "rut": "11.111.111-1"},
                {"name": "Luis Soto", "phone": "+56 9 9876 5432", "isPrimary": True},
            ],
        },
        "prov_1",
    )
    assert len(doc["operators"]) == 2
    assert sum(1 for op in doc["operators"] if op.get("isPrimary")) == 1
    assert doc["primaryOperatorId"] == doc["operators"][1]["id"]


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
