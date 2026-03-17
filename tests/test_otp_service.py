"""
MAQGO - Tests OTP Service (Redis + AWS SNS)
Prueba send_otp y verify_otp con Redis y SNS mockeados.
"""

import sys
import os
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))


class TestOTPServiceSend:
    """Tests para send_otp"""

    @patch.dict(os.environ, {
        'REDIS_URL': 'redis://localhost:6379',
        'AWS_ACCESS_KEY_ID': 'test',
        'AWS_SECRET_ACCESS_KEY': 'test',
    }, clear=False)
    @patch('services.otp_service._get_redis')
    @patch('services.otp_service._send_sms_sns')
    def test_send_otp_success(self, mock_sns, mock_redis):
        """Envío exitoso: Redis guarda OTP, SNS envía SMS"""
        mock_r = MagicMock()
        mock_r.get.return_value = "0"
        mock_r.ttl.return_value = 600
        mock_pipe = MagicMock()
        mock_r.pipeline.return_value = mock_pipe
        mock_redis.return_value = mock_r
        mock_sns.return_value = (True, None)

        from services.otp_service import send_otp

        result = send_otp('+56912345678', 'sms')

        assert result['success'] is True
        assert result.get('demo_mode') is False
        mock_pipe.setex.assert_called()
        mock_sns.assert_called_once()
        msg = mock_sns.call_args[0][1]
        assert 'Tu código MAQGO es:' in msg
        assert len(msg.split()[-1]) == 6  # código de 6 dígitos

    @patch.dict(os.environ, {'REDIS_URL': ''}, clear=False)
    def test_send_otp_no_redis(self):
        """Sin Redis: retorna error"""
        from services.otp_service import send_otp

        result = send_otp('+56912345678', 'sms')

        assert result['success'] is False
        assert 'REDIS_URL' in result.get('error', '')

    @patch.dict(os.environ, {
        'REDIS_URL': 'redis://localhost:6379',
        'AWS_ACCESS_KEY_ID': 'test',
        'AWS_SECRET_ACCESS_KEY': 'test',
    }, clear=False)
    @patch('services.otp_service._get_redis')
    @patch('services.otp_service._send_sms_sns')
    def test_send_otp_rate_limit(self, mock_sns, mock_redis):
        """Rate limit: máx 3 OTP por número cada 10 min"""
        mock_r = MagicMock()
        mock_r.get.side_effect = lambda k: "3" if "rate" in str(k) else "0"
        mock_r.ttl.return_value = 120
        mock_redis.return_value = mock_r

        from services.otp_service import send_otp

        result = send_otp('+56912345678', 'sms')

        assert result['success'] is False
        assert 'Demasiados intentos' in result.get('error', '')
        mock_sns.assert_not_called()

    @patch.dict(os.environ, {
        'REDIS_URL': 'redis://localhost:6379',
        'AWS_ACCESS_KEY_ID': 'test',
        'AWS_SECRET_ACCESS_KEY': 'test',
    }, clear=False)
    @patch('services.otp_service._get_redis')
    @patch('services.otp_service._send_sms_sns')
    def test_send_otp_whatsapp_not_supported(self, mock_sns, mock_redis):
        """WhatsApp no soportado: retorna error"""
        from services.otp_service import send_otp

        result = send_otp('+56912345678', 'whatsapp')

        assert result['success'] is False
        assert 'WhatsApp' in result.get('error', '')
        mock_sns.assert_not_called()


class TestOTPServiceVerify:
    """Tests para verify_otp"""

    @patch.dict(os.environ, {
        'REDIS_URL': 'redis://localhost:6379',
        'AWS_ACCESS_KEY_ID': 'test',
    }, clear=False)
    @patch('services.otp_service._get_redis')
    def test_verify_otp_valid(self, mock_redis):
        """Código correcto: valid=True"""
        mock_r = MagicMock()
        mock_r.get.side_effect = lambda k: {'otp:+56912345678': '123456', 'otp_attempts:+56912345678': '0'}.get(k)
        mock_r.ttl.return_value = 200
        mock_redis.return_value = mock_r

        from services.otp_service import verify_otp

        result = verify_otp('+56912345678', '123456')

        assert result['success'] is True
        assert result['valid'] is True
        mock_r.delete.assert_called()

    @patch.dict(os.environ, {
        'REDIS_URL': 'redis://localhost:6379',
        'AWS_ACCESS_KEY_ID': 'test',
    }, clear=False)
    @patch('services.otp_service._get_redis')
    def test_verify_otp_invalid(self, mock_redis):
        """Código incorrecto: valid=False"""
        mock_r = MagicMock()
        mock_r.get.side_effect = lambda k: {'otp:+56912345678': '123456', 'otp_attempts:+56912345678': '0'}.get(k)
        mock_r.ttl.return_value = 200
        mock_redis.return_value = mock_r

        from services.otp_service import verify_otp

        result = verify_otp('+56912345678', '999999')

        assert result['success'] is True
        assert result['valid'] is False
        assert 'incorrecto' in result.get('error', '').lower()

    @patch.dict(os.environ, {
        'REDIS_URL': 'redis://localhost:6379',
        'AWS_ACCESS_KEY_ID': 'test',
    }, clear=False)
    @patch('services.otp_service._get_redis')
    def test_verify_otp_expired(self, mock_redis):
        """OTP expirado: valid=False"""
        mock_r = MagicMock()
        mock_r.get.return_value = None
        mock_redis.return_value = mock_r

        from services.otp_service import verify_otp

        result = verify_otp('+56912345678', '123456')

        assert result['success'] is True
        assert result['valid'] is False
        assert 'expirado' in result.get('error', '').lower()

    @patch.dict(os.environ, {
        'REDIS_URL': 'redis://localhost:6379',
        'AWS_ACCESS_KEY_ID': 'test',
    }, clear=False)
    @patch('services.otp_service._get_redis')
    def test_verify_otp_too_many_attempts(self, mock_redis):
        """Demasiados intentos: valid=False"""
        mock_r = MagicMock()
        mock_r.get.side_effect = lambda k: {'otp:+56912345678': '123456', 'otp_attempts:+56912345678': '3'}.get(k)
        mock_redis.return_value = mock_r

        from services.otp_service import verify_otp

        result = verify_otp('+56912345678', '123456')

        assert result['success'] is True
        assert result['valid'] is False
        assert 'intentos' in result.get('error', '').lower()

    def test_verify_otp_invalid_format(self):
        """Código con formato inválido"""
        from services.otp_service import verify_otp

        result = verify_otp('+56912345678', '12345')
        assert result['valid'] is False

        result = verify_otp('+56912345678', 'abc123')
        assert result['valid'] is False


class TestOTPServiceHelpers:
    """Tests para helpers"""

    def test_normalize_phone(self):
        """Formato E.164 para Chile"""
        from services.otp_service import _normalize_phone

        assert _normalize_phone('912345678') == '+56912345678'
        assert _normalize_phone('56912345678') == '+56912345678'
        assert _normalize_phone('+56912345678') == '+56912345678'

    @patch.dict(os.environ, {'REDIS_URL': 'redis://x', 'AWS_ACCESS_KEY_ID': 'x'}, clear=False)
    def test_is_otp_configured_true(self):
        """Configurado cuando Redis y AWS están"""
        from services.otp_service import is_otp_configured
        assert is_otp_configured() is True

    @patch.dict(os.environ, {'REDIS_URL': '', 'AWS_ACCESS_KEY_ID': ''}, clear=False)
    def test_is_otp_configured_false_no_redis(self):
        """No configurado sin Redis"""
        from services.otp_service import is_otp_configured
        assert is_otp_configured() is False
