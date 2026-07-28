import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from routes.users import _is_provider_activation_complete


def test_operator_can_pass_reduced_activation_gate():
    user = {
        "id": "op-1",
        "role": "provider",
        "provider_role": "operator",
        "owner_id": "owner-1",
    }

    assert _is_provider_activation_complete(user) is True


def test_master_with_owner_id_still_requires_full_activation():
    user = {
        "id": "master-1",
        "role": "provider",
        "provider_role": "master",
        "owner_id": "owner-1",
    }

    assert _is_provider_activation_complete(user) is False
