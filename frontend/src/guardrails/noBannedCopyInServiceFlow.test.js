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

const FORBIDDEN = [
  /activa notificaciones/iu,
  /activar notificaciones/iu,
  /más tarde/iu,
  /te avisaremos/iu,
  /te notificaremos/iu,
  /recibirás avisos por chat/iu,
  /chat interno/iu,
  /coordinación por chat/iu,
  /equipo maqgo/iu,
  /comunicación maqgo/iu,
];

describe.skipIf(!runProdUiGuard)('Guardrail: banned copy in service flow', () => {
  it('does not include forbidden copy in screens/service state components', () => {
    const roots = [
      path.join(process.cwd(), 'src/screens'),
      path.join(process.cwd(), 'src/components/serviceState'),
    ];

    const offenders = [];
    const self = path.normalize(path.join(process.cwd(), 'src/guardrails/noBannedCopyInServiceFlow.test.js'));

    for (const root of roots) {
      const files = fs.existsSync(root) ? walk(root) : [];
      for (const f of files) {
        if (path.normalize(f) === self) continue;
        const txt = fs.readFileSync(f, 'utf8');
        for (const re of FORBIDDEN) {
          if (re.test(txt)) {
            offenders.push(`${path.relative(process.cwd(), f)} :: ${String(re)}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

