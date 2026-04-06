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
    expect(forgot).toContain('Cambiar contraseña');
    expect(forgot).not.toMatch(/pr[oó]ximamente/i);
  });

  it('Entrada cliente: /register redirige a login (OTP); sin RegisterScreen', () => {
    const app = read('App.jsx');
    expect(app).toMatch(/path="\/register"/);
    expect(app).toMatch(/Navigate to="\/login"/);
    expect(app).not.toMatch(/screens\/RegisterScreen\.jsx/);
  });

  it('Sin pantalla legacy select-channel en el router (redirect solo vercel + main.jsx)', () => {
    const app = read('App.jsx');
    const main = read('main.jsx');
    expect(app).not.toMatch(/path="\/select-channel"/);
    expect(app).not.toMatch(/path="\/provider\/select-channel"/);
    expect(main).toMatch(/\/select-channel/);
    expect(read('../vercel.json')).toMatch(/"source": "\/select-channel"/);
  });

  it('RoleSelection: fusiona cuenta por teléfono y password opcional', () => {
    const src = read('screens/RoleSelection.js');
    expect(src).toMatch(/\.\.\.\(pwd && \{ password: pwd \}\)/);
    expect(src).toMatch(/navigate\('\/login'/);
  });

  it('Búsqueda proveedor: ruta usa alias SearchingProvider → una sola implementación', () => {
    const app = read('App.jsx');
    const alias = read('screens/client/SearchingProvider.js');
    const impl = read('screens/client/SearchingProviderScreen.js');
    expect(app).toMatch(/path="\/client\/searching"/);
    expect(app).toMatch(/screens\/client\/SearchingProvider['"]\)/);
    expect(alias).toMatch(/export \{ default \} from '\.\/SearchingProviderScreen'/);
    expect(impl).toMatch(/Preparando búsqueda/);
    expect(impl).toMatch(/maqgo-spin-searching/);
  });
});
