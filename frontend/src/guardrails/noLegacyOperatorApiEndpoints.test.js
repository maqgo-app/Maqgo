import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (!e.isFile()) continue;
    if (!/\.(js|jsx|ts|tsx)$/.test(e.name)) continue;
    out.push(full);
  }
  return out;
}

const runProdUiGuard =
  String(process.env.VITE_IS_PRODUCTION || '').toLowerCase() === 'true' &&
  String(process.env.VITE_ENABLE_DEMO_MODE || '').toLowerCase() !== 'true';

describe.skipIf(!runProdUiGuard)('Guardrail: no legacy operator API endpoints', () => {
  it('does not reference /api/services/operator in frontend/src', () => {
    const srcDir = path.join(process.cwd(), 'src');
    const files = walk(srcDir);
    const offenders = [];
    const self = path.normalize(path.join(process.cwd(), 'src/guardrails/noLegacyOperatorApiEndpoints.test.js'));
    for (const f of files) {
      if (path.normalize(f) === self) continue;
      const txt = fs.readFileSync(f, 'utf8');
      if (txt.includes('/api/services/operator')) {
        offenders.push(path.relative(process.cwd(), f));
      }
    }
    expect(offenders).toEqual([]);
  });
});
