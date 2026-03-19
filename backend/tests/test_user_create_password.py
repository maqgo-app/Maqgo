"""UserCreate: campo password opcional con mínimo 8 caracteres."""
import os
import sys
import unittest

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

try:
    from pydantic import ValidationError
    from models.user import UserCreate  # noqa: E402
except ImportError:  # entorno sin venv / sin dependencias
    ValidationError = None
    UserCreate = None


class TestUserCreatePassword(unittest.TestCase):
    def setUp(self):
        if UserCreate is None or ValidationError is None:
            self.skipTest("Instala dependencias del backend (pydantic) o usa el venv del proyecto")

    def test_password_optional_omitted(self):
        u = UserCreate(role="client", name="Test", email="t@example.com")
        self.assertIsNone(u.password)

    def test_password_too_short(self):
        with self.assertRaises(ValidationError) as ctx:
            UserCreate(role="client", name="Test", email="t@example.com", password="short")
        msg = str(ctx.exception).lower()
        self.assertTrue("contraseña" in msg or "password" in msg or "8" in msg)

    def test_password_ok_min_length(self):
        u = UserCreate(role="client", name="Test", email="t@example.com", password="12345678")
        self.assertEqual(u.password, "12345678")


if __name__ == "__main__":
    unittest.main()
