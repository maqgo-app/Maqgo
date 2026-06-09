from __future__ import annotations

from typing import Any, Dict


def _has_value(value: Any) -> bool:
    return value is not None and str(value).strip() != ""


def is_provider_activation_complete(user: Dict[str, Any]) -> bool:
    if not isinstance(user, dict):
        return False
    if user.get("onboarding_completed") is not True:
        return False
    provider_data = user.get("providerData") or {}
    machine_data = user.get("machineData") or {}
    bank_data = (provider_data or {}).get("bankData") or {}
    operators = user.get("operators") or []
    if not isinstance(operators, list) or len(operators) == 0:
        md_ops = (machine_data or {}).get("operators") if isinstance(machine_data, dict) else None
        operators = md_ops if isinstance(md_ops, list) else []

    if not _has_value((provider_data or {}).get("businessName")):
        return False
    if not _has_value((provider_data or {}).get("rut")):
        return False
    if not _has_value((machine_data or {}).get("machineryType")):
        return False
    if not _has_value((machine_data or {}).get("licensePlate")):
        return False
    if not isinstance(operators, list) or len(operators) == 0:
        return False

    required_bank = ["bank", "accountType", "accountNumber", "holderName", "holderRut"]
    if not isinstance(bank_data, dict) or not all(_has_value(bank_data.get(k)) for k in required_bank):
        return False

    return True


def is_provider_activation_complete_for_machine(provider: Dict[str, Any], machine_data: Dict[str, Any]) -> bool:
    if not isinstance(provider, dict) or not isinstance(machine_data, dict):
        return False
    tmp = dict(provider)
    tmp["machineData"] = machine_data
    return is_provider_activation_complete(tmp)
