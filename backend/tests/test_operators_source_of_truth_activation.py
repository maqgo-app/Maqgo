import os
import sys
import unittest
import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock


BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)


try:
    from fastapi import HTTPException
    from pymongo.errors import DuplicateKeyError
    from routes import operators
except Exception:  # entorno sin dependencias
    HTTPException = None
    DuplicateKeyError = None
    operators = None


def _run(coro):
    return asyncio.run(coro)


class TestOperatorsActivationSourceOfTruth(unittest.TestCase):
    def setUp(self):
        if operators is None or HTTPException is None:
            self.skipTest("Instala dependencias del backend (fastapi/pymongo) o usa el venv del proyecto")
        self._orig_db = operators.db

    def tearDown(self):
        if operators is not None:
            operators.db = self._orig_db

    def _valid_rut(self, body="12345678"):
        v = operators._calculate_rut_verifier(body)
        return f"12.345.678-{v}"

    def test_operator_join_invitation_not_found(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.users = MagicMock()
        mock_db.invitations.find_one = AsyncMock(side_effect=[None, None])
        operators.db = mock_db

        with self.assertRaises(HTTPException) as ctx:
            _run(operators.use_invitation(operators.InvitationUse(token="ZZZZZZ")))

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Invitación no encontrada")

    def test_operator_join_invitation_already_used(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.users = MagicMock()
        mock_db.invitations.find_one = AsyncMock(
            side_effect=[None, {"code": "ABC123", "status": "used"}]
        )
        operators.db = mock_db

        with self.assertRaises(HTTPException) as ctx:
            _run(operators.use_invitation(operators.InvitationUse(token="ABC123")))

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Invitación ya utilizada")

    def test_operator_join_invitation_for_managers(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.users = MagicMock()
        mock_db.invitations.find_one = AsyncMock(
            side_effect=[None, {"code": "MST999", "status": "pending", "invite_type": "master"}]
        )
        operators.db = mock_db

        with self.assertRaises(HTTPException) as ctx:
            _run(operators.use_invitation(operators.InvitationUse(token="MST999")))

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Esta invitación es para Gerentes")

    def test_operator_join_invitation_expired_by_status(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.users = MagicMock()
        mock_db.invitations.find_one = AsyncMock(
            side_effect=[None, {"code": "EXP111", "status": "expired"}]
        )
        operators.db = mock_db

        with self.assertRaises(HTTPException) as ctx:
            _run(operators.use_invitation(operators.InvitationUse(token="EXP111")))

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invitación expirada")

    def test_operator_join_invitacion_expiracion_invalida(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.users = MagicMock()
        mock_db.invitations.find_one = AsyncMock(
            return_value={
                "code": "BAD777",
                "status": "pending",
                "owner_id": "owner",
                "operator_name": "Op",
                "operator_rut": self._valid_rut(),
            }
        )
        operators.db = mock_db

        with self.assertRaises(HTTPException) as ctx:
            _run(operators.use_invitation(operators.InvitationUse(token="BAD777")))

        self.assertEqual(ctx.exception.status_code, 500)
        self.assertEqual(ctx.exception.detail, "Error interno: invitación con expiración inválida")

    def test_operator_join_duplicate_key(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.users = MagicMock()
        mock_db.invitations.find_one = AsyncMock(
            return_value={
                "code": "DUP123",
                "status": "pending",
                "invite_type": "operator",
                "owner_id": "owner",
                "operator_name": "Op",
                "operator_phone": "+56911111111",
                "operator_rut": self._valid_rut(),
                "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
                "target_user_id": "op-1",
            }
        )
        mock_db.invitations.update_one = AsyncMock()
        mock_db.users.update_one = AsyncMock(side_effect=DuplicateKeyError("dup"))
        mock_db.users.find_one = AsyncMock(return_value={"name": "Owner"})
        operators.db = mock_db

        with self.assertRaises(HTTPException) as ctx:
            _run(operators.use_invitation(operators.InvitationUse(token="DUP123")))

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("registro duplicado", str(ctx.exception.detail).lower())

    def test_ensure_pending_team_user_reuses_existing_inactive_identity(self):
        mock_db = MagicMock()
        mock_db.users = MagicMock()
        mock_find_cursor = MagicMock()
        mock_find_cursor.to_list = AsyncMock(
            return_value=[
                {
                    "id": "op-existing",
                    "owner_id": "owner-1",
                    "provider_role": "operator",
                    "name": "Juan Soto",
                    "phone": "+56911111111",
                    "rut": self._valid_rut(),
                    "rut_norm": operators._normalize_rut(self._valid_rut()),
                    "status": "inactive",
                }
            ]
        )
        mock_db.users.find.return_value = mock_find_cursor
        mock_db.users.update_one = AsyncMock()
        mock_db.users.find_one = AsyncMock(
            return_value={
                "id": "op-existing",
                "owner_id": "owner-1",
                "provider_role": "operator",
                "name": "Juan Soto",
                "phone": "+56911111111",
                "rut": self._valid_rut(),
                "rut_norm": operators._normalize_rut(self._valid_rut()),
                "status": "pending_activation",
                "activationCode": "ABC123",
            }
        )
        operators.db = mock_db

        result = _run(
            operators._ensure_pending_team_user(
                owner_id="owner-1",
                provider_role="operator",
                name="Juan Soto",
                phone="+56911111111",
                rut=self._valid_rut(),
                invitation_code="ABC123",
            )
        )

        self.assertEqual(result["id"], "op-existing")
        self.assertEqual(result["status"], "pending_activation")
        mock_db.users.insert_one.assert_not_called()
        mock_db.users.update_one.assert_awaited()

    def test_operator_join_reuses_target_user_id_instead_of_creating_new_identity(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.users = MagicMock()
        mock_db.invitations.find_one = AsyncMock(
            return_value={
                "code": "ABC123",
                "status": "pending",
                "invite_type": "operator",
                "owner_id": "owner-1",
                "operator_name": "Juan Soto",
                "operator_phone": "+56911111111",
                "operator_rut": self._valid_rut(),
                "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
                "target_user_id": "op-existing",
            }
        )
        mock_db.invitations.update_one = AsyncMock()
        mock_db.users.update_one = AsyncMock()
        mock_db.users.find_one = AsyncMock(
            side_effect=[
                {
                    "id": "op-existing",
                    "owner_id": "owner-1",
                    "provider_role": "operator",
                    "name": "Juan Soto",
                    "phone": "+56911111111",
                    "rut": self._valid_rut(),
                    "rut_norm": operators._normalize_rut(self._valid_rut()),
                    "status": "pending_activation",
                },
                {"name": "Transportes Sur"},
            ]
        )
        mock_db.users.insert_one = AsyncMock()
        operators.db = mock_db

        result = _run(operators.use_invitation(operators.InvitationUse(token="ABC123")))

        self.assertTrue(result["success"])
        self.assertEqual(result["operator_id"], "op-existing")
        mock_db.users.insert_one.assert_not_called()
        mock_db.users.update_one.assert_awaited()
        mock_db.invitations.update_one.assert_awaited()

    def test_master_join_invitation_not_found(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.users = MagicMock()
        mock_db.invitations.find_one = AsyncMock(side_effect=[None, None])
        operators.db = mock_db

        with self.assertRaises(HTTPException) as ctx:
            _run(operators.use_master_invitation(operators.MasterInvitationUse(token="ZZZZZZ")))

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Invitación no encontrada")

    def test_master_join_invitation_not_for_managers(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.users = MagicMock()
        mock_db.invitations.find_one = AsyncMock(
            side_effect=[None, {"code": "OPR111", "status": "pending", "invite_type": "operator"}]
        )
        operators.db = mock_db

        with self.assertRaises(HTTPException) as ctx:
            _run(operators.use_master_invitation(operators.MasterInvitationUse(token="OPR111")))

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Esta invitación no es para Gerentes")

    def test_master_join_invitation_expired(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.users = MagicMock()
        mock_db.invitations.find_one = AsyncMock(
            return_value={
                "code": "MEXP1",
                "status": "pending",
                "invite_type": "master",
                "owner_id": "owner",
                "master_name": "A",
                "master_last_name": "B",
                "master_rut": self._valid_rut(),
                "master_phone": "+56911111111",
                "expires_at": datetime.now(timezone.utc) - timedelta(days=1),
            }
        )
        mock_db.invitations.update_one = AsyncMock()
        operators.db = mock_db

        with self.assertRaises(HTTPException) as ctx:
            _run(operators.use_master_invitation(operators.MasterInvitationUse(token="MEXP1")))

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invitación expirada")

    def test_cancel_pending_invitation_uses_token(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.invitations.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))
        operators.db = mock_db
        original_assert_owner_scope = operators.AccessPolicy.assert_owner_scope
        operators.AccessPolicy.assert_owner_scope = MagicMock()

        try:
            result = _run(
                operators.cancel_invitation(
                    token="TOK123",
                    owner_id="owner-1",
                    current_user={"id": "owner-1", "owner_id": "owner-1"},
                )
            )
        finally:
            operators.AccessPolicy.assert_owner_scope = original_assert_owner_scope

        self.assertTrue(result["success"])
        mock_db.invitations.delete_one.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
