// One-off icon generator: builds PWA, favicon, and Android launcher icons
// from public/starIcon.png. Run: node scripts/gen-icons.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const SRC = resolve(root, 'public/starIcon.png');
const BG = { r: 0x16, g: 0x18, b: 0x1c, alpha: 1 }; // #16181C app background
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

const out = (p) => resolve(root, p);
async function ensure(p) { await mkdir(dirname(p), { recursive: true }); }

// Resized star as a PNG buffer at `inner` px (lanczos upscale from 136px source).
async function star(inner) {
  return sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT, kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

// Star centered on a `size` canvas; star occupies `ratio` of the canvas.
async function composed(size, ratio, background, { round = false, webp = false } = {}) {
  const inner = Math.round(size * ratio);
  const s = await star(inner);
  let img = sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: s, gravity: 'center' }]);
  if (round) {
    const r = size / 2;
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`);
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]);
  }
  return webp ? img.webp({ quality: 95 }).toBuffer() : img.png().toBuffer();
}

async function transparent(size, ratio, { webp = false } = {}) {
  const buf = await composed(size, ratio, TRANSPARENT, { webp });
  return buf;
}

async function write(path, buf) { await ensure(out(path)); await sharp(buf).toFile(out(path)); }

const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

async function main() {
  // ---- PWA icons (public/) ----
  await write('public/icon-192.png', await transparent(192, 0.92));
  await write('public/icon-512.png', await transparent(512, 0.92));
  await write('public/icon-maskable-512.png', await composed(512, 0.6, BG)); // safe-zone padded

  // ---- Web favicons (public/) ----
  await write('public/favicon-16.png', await transparent(16, 1.0));
  await write('public/favicon-32.png', await transparent(32, 1.0));
  await write('public/apple-touch-icon.png', await composed(180, 0.82, BG));

  // ---- Android launcher icons ----
  for (const [name, m] of Object.entries(DPI)) {
    const dir = `android/app/src/main/res/mipmap-${name}`;
    const legacy = Math.round(48 * m);   // 48..192
    const fg = Math.round(108 * m);      // 108..432
    await write(`${dir}/ic_launcher.webp`, await composed(legacy, 0.82, BG, { webp: true }));
    await write(`${dir}/ic_launcher_round.webp`, await composed(legacy, 0.82, BG, { round: true, webp: true }));
    await write(`${dir}/ic_launcher_foreground.webp`, await transparent(fg, 0.58, { webp: true }));
    await write(`${dir}/ic_launcher_background.webp`, await composed(fg, 1.0, BG, { webp: true }));
  }

  console.log('Icons generated.');
}

main().catch((e) => { console.error(e); process.exit(1); });
