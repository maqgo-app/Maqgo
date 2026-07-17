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

    def test_operator_join_codigo_inexistente(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.users = MagicMock()
        mock_db.invitations.find_one = AsyncMock(side_effect=[None, None])
        operators.db = mock_db

        with self.assertRaises(HTTPException) as ctx:
            _run(operators.use_invitation(operators.InvitationUse(code="ZZZZZZ")))

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Código inexistente")

    def test_operator_join_codigo_ya_utilizado(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.users = MagicMock()
        mock_db.invitations.find_one = AsyncMock(
            side_effect=[None, {"code": "ABC123", "status": "used"}]
        )
        operators.db = mock_db

        with self.assertRaises(HTTPException) as ctx:
            _run(operators.use_invitation(operators.InvitationUse(code="ABC123")))

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Código ya utilizado")

    def test_operator_join_codigo_para_gerentes(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.users = MagicMock()
        mock_db.invitations.find_one = AsyncMock(
            side_effect=[None, {"code": "MST999", "status": "pending", "invite_type": "master"}]
        )
        operators.db = mock_db

        with self.assertRaises(HTTPException) as ctx:
            _run(operators.use_invitation(operators.InvitationUse(code="MST999")))

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Este código es para Gerentes")

    def test_operator_join_codigo_expirado_por_status(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.users = MagicMock()
        mock_db.invitations.find_one = AsyncMock(
            side_effect=[None, {"code": "EXP111", "status": "expired"}]
        )
        operators.db = mock_db

        with self.assertRaises(HTTPException) as ctx:
            _run(operators.use_invitation(operators.InvitationUse(code="EXP111")))

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Código expirado")

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
            _run(operators.use_invitation(operators.InvitationUse(code="BAD777")))

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
                "operator_rut": self._valid_rut(),
                "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
            }
        )
        mock_db.invitations.update_one = AsyncMock()
        mock_db.users.insert_one = AsyncMock(side_effect=DuplicateKeyError("dup"))
        mock_db.users.find_one = AsyncMock(return_value={"name": "Owner"})
        operators.db = mock_db

        with self.assertRaises(HTTPException) as ctx:
            _run(operators.use_invitation(operators.InvitationUse(code="DUP123")))

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("registro duplicado", str(ctx.exception.detail).lower())

    def test_master_join_codigo_inexistente(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.users = MagicMock()
        mock_db.invitations.find_one = AsyncMock(side_effect=[None, None])
        operators.db = mock_db

        with self.assertRaises(HTTPException) as ctx:
            _run(operators.use_master_invitation(operators.MasterInvitationUse(code="ZZZZZZ")))

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Código inexistente")

    def test_master_join_codigo_no_es_para_masters(self):
        mock_db = MagicMock()
        mock_db.invitations = MagicMock()
        mock_db.users = MagicMock()
        mock_db.invitations.find_one = AsyncMock(
            side_effect=[None, {"code": "OPR111", "status": "pending", "invite_type": "operator"}]
        )
        operators.db = mock_db

        with self.assertRaises(HTTPException) as ctx:
            _run(operators.use_master_invitation(operators.MasterInvitationUse(code="OPR111")))

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Este código no es para Gerentes")

    def test_master_join_codigo_expirado(self):
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
            _run(operators.use_master_invitation(operators.MasterInvitationUse(code="MEXP1")))

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Código expirado")


if __name__ == "__main__":
    unittest.main()
