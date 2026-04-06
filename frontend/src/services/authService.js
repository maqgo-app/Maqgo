import BACKEND_URL from '@/utils/api';
import { getDeviceId } from '@/utils/deviceId';

/**
 * Pregunta al backend si hace falta OTP para este usuario/teléfono/dispositivo.
 * Respuesta: { require_otp: boolean }
 */
export async function checkDevice(user_id, phone_number) {
  const device_id = getDeviceId();

  const res = await fetch(`${BACKEND_URL}/api/auth/check-device`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id,
      phone_number,
      device_id,
    }),
  });

  return res.json();
}
