/**
 * Genera iconos PWA, favicon.ico y og-image.png desde el PNG embebido en maqgo_logo_clean.svg.
 * Ejecutar: node scripts/generate-pwa-assets.mjs
 * No está enlazado a npm run build ni a postinstall. En CI/Vercel: solo con ALLOW_PWA_ASSETS (ejecución explícita).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const svgPath = path.join(publicDir, 'maqgo_logo_clean.svg');
const iconsDir = path.join(publicDir, 'icons');

const BG = { r: 16, g: 16, b: 16, alpha: 1 };

if ((process.env.VERCEL || process.env.CI) && !process.env.ALLOW_PWA_ASSETS) {
  console.error(
    'generate-pwa-assets: en CI/Vercel ejecutar solo con ALLOW_PWA_ASSETS=1 (explícito).'
  );
  process.exit(1);
}

async function extractEmbeddedPng() {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const m = svg.match(/data:image\/png;base64,([^"]+)/);
  if (!m) throw new Error('No embedded PNG in maqgo_logo_clean.svg');
  return Buffer.from(m[1], 'base64');
}

async function main() {
  fs.mkdirSync(iconsDir, { recursive: true });
  const source = await extractEmbeddedPng();

  const fitSquare = (size) =>
    sharp(source)
      .resize(size, size, {
        fit: 'contain',
        background: BG,
        position: 'centre',
      })
      .png({ compressionLevel: 9 });

  await fitSquare(192).toFile(path.join(iconsDir, 'icon-192.png'));
  await fitSquare(512).toFile(path.join(iconsDir, 'icon-512.png'));
  await fitSquare(32).toFile(path.join(iconsDir, 'icon-32.png'));

  // OG 1200x630 — logo centrado, mismo fondo
  const ogW = 1200;
  const ogH = 630;
  const logoMaxW = Math.round(ogW * 0.55);
  const logoMaxH = Math.round(ogH * 0.65);
  const resizedLogo = await sharp(source)
    .resize(logoMaxW, logoMaxH, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  const meta = await sharp(resizedLogo).metadata();
  const lw = meta.width || logoMaxW;
  const lh = meta.height || logoMaxH;
  const left = Math.max(0, Math.round((ogW - lw) / 2));
  const top = Math.max(0, Math.round((ogH - lh) / 2));

  await sharp({
    create: {
      width: ogW,
      height: ogH,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: resizedLogo, left, top }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDir, 'og-image.png'));

  const buf16 = await sharp(source).resize(16, 16, { fit: 'contain', background: BG }).png().toBuffer();
  const buf32 = await sharp(source).resize(32, 32, { fit: 'contain', background: BG }).png().toBuffer();
  const ico = await toIco([buf32, buf16]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), ico);

  console.log('OK: icons/icon-192.png, icons/icon-512.png, icons/icon-32.png, og-image.png, favicon.ico');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
