import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from services.provider_activation_service import is_provider_activation_complete


def test_provider_activation_complete_without_location_when_company_is_ready():
    user = {
        "onboarding_completed": True,
        "providerData": {
            "businessName": "Empresa Demo",
            "rut": "12.345.678-9",
            "address": "Av. Siempre Viva 123",
            "bankData": {
                "bank": "Banco Estado",
                "accountType": "vista",
                "accountNumber": "12345678",
                "holderName": "Empresa Demo",
                "holderRut": "12.345.678-9",
            },
        },
        "machineData": {
            "machineryType": "retroexcavadora",
            "licensePlate": "ABCD12",
        },
        "operators": [{"id": "op-1", "name": "Operador Uno"}],
    }

    assert is_provider_activation_complete(user) is True
