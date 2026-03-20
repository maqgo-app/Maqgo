/**
 * Smoke tests: aseguran que los arreglos de auth/registro sigan en el código fuente.
 * (Sin React Testing Library; leen archivos para CI rápido.)
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Recuperación / registro / rol', () => {
  it('ForgotPasswordScreen: existe flujo real con envío de código y nueva contraseña', () => {
    const app = read('App.jsx');
    const forgot = read('screens/ForgotPasswordScreen.jsx');
    expect(app).toMatch(/\/forgot-password/);
    expect(forgot).toContain('password-reset/request');
    expect(forgot).toContain('password-reset/confirm');
    expect(forgot).toContain('Restablecer contraseña');
    expect(forgot).toContain('Guardar nueva contraseña');
    expect(forgot).not.toMatch(/pr[oó]ximamente/i);
  });

  it('RegisterScreen: pide contraseña (mín. 8) y la guarda en registerData', () => {
    const src = read('screens/RegisterScreen.jsx');
    expect(src).toMatch(/register-password/);
    expect(src).toMatch(/validatePassword\(form\.password/);
    expect(src).toMatch(/localStorage\.setItem\('registerData'/);
  });

  it('RoleSelection: envía password al crear usuario y exige clave tras OTP', () => {
    const src = read('screens/RoleSelection.js');
    expect(src).toMatch(/\.\.\.\(pwd && \{ password: pwd \}\)/);
    expect(src).toMatch(/phoneVerified && pwd\.length < 8/);
  });
});
