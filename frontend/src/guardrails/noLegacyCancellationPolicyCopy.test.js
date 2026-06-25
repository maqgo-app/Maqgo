import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runProdUiGuard =
  import.meta.env.VITE_IS_PRODUCTION === 'true' &&
  import.meta.env.VITE_MAQGO_ENV === 'production' &&
  import.meta.env.VITE_ENABLE_DEMO_MODE !== 'true';

const FORBIDDEN = [
  /Operador en obra:\s*60%/i,
  /Operador en camino:\s*40%/i,
  /Despu[eé]s de asignad[oa]:\s*20%/i,
  /60%\s+del\s+servicio/i,
];

async function readFileText(relPath) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const full = path.resolve(__dirname, '..', relPath);
  return await fs.readFile(full, 'utf8');
}

describe.skipIf(!runProdUiGuard)('producción: sin copys legacy de cancelación', () => {
  it('no contiene copys legacy en pantallas cliente críticas', async () => {
    const files = [
      'screens/client/CancelServiceScreen.js',
      'screens/client/ProviderArrivedScreen.js',
    ];

    for (const f of files) {
      const text = await readFileText(f);
      for (const re of FORBIDDEN) {
        expect(text, `${f} no debe contener: ${re}`).not.toMatch(re);
      }
    }
  });
});

