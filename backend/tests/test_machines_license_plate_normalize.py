from services.machines_service import normalize_machine_payload


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
