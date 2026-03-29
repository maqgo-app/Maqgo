#!/usr/bin/env node
/**
 * Post-build: comprueba que el artefacto de producción existe y es coherente.
 * (La ausencia de copys demo en UI con flags de prod se valida en npm run test:guardrails.)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const indexHtml = path.join(distDir, 'index.html');

function fail(msg) {
  console.error(`verify:build — ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(indexHtml)) {
  fail('dist/index.html no existe tras npm run build.');
}

const assetsDir = path.join(distDir, 'assets');
if (!fs.existsSync(assetsDir)) {
  fail('dist/assets no existe tras npm run build.');
}

const jsCount = fs.readdirSync(assetsDir).filter((n) => n.endsWith('.js')).length;
if (jsCount < 1) {
  fail('No hay bundles .js en dist/assets (build incompleto).');
}

console.log(`verify:build — OK (dist/index.html + ${jsCount} JS en dist/assets)`);
process.exit(0);
