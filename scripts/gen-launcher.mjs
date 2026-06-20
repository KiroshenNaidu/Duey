// Regenerates Android launcher icons from public/iconNew.png — a full-bleed,
// adaptive-ready source (textured background + centered star).
// Run: node scripts/gen-launcher.mjs
import sharp from 'sharp';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const SRC = resolve(root, 'public/iconNew.png');
const out = (p) => resolve(root, p);

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

// Single knob: how far to center-crop into the source. 1.0 = whole image,
// higher = more zoomed-in (bigger star). 2.4 places the star in the adaptive
// safe zone, un-clipped on circular launcher masks.
const ICON_ZOOM = 2.0;

// Center-cropped + zoomed source at `size`x`size` (full-bleed, texture to edges).
async function zoomed(size) {
  const meta = await sharp(SRC).metadata();
  const base = Math.min(meta.width, meta.height);
  const crop = Math.round(base / ICON_ZOOM);
  const left = Math.round((meta.width - crop) / 2);
  const top = Math.round((meta.height - crop) / 2);
  return sharp(SRC)
    .extract({ left, top, width: crop, height: crop })
    .resize(size, size, { kernel: 'lanczos3' });
}

async function full(size) {
  return (await zoomed(size)).webp({ quality: 95 }).toBuffer();
}

// Empty transparent layer (adaptive foreground — the icon lives in the background).
async function transparent(size) {
  return sharp({ create: { width: size, height: size, channels: 4, background: TRANSPARENT } }).webp({ quality: 95 }).toBuffer();
}

// Circle-cropped zoomed source for the legacy round icon.
async function round(size) {
  const base = await (await zoomed(size)).png().toBuffer();
  const r = size / 2;
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`);
  return sharp(base).composite([{ input: mask, blend: 'dest-in' }]).webp({ quality: 95 }).toBuffer();
}

async function write(path, buf) { await sharp(buf).toFile(out(path)); }

const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

async function main() {
  for (const [name, m] of Object.entries(DPI)) {
    const dir = `android/app/src/main/res/mipmap-${name}`;
    const legacy = Math.round(48 * m);    // 48..192
    const adaptive = Math.round(108 * m); // 108..432
    await write(`${dir}/ic_launcher.webp`, await full(legacy));
    await write(`${dir}/ic_launcher_round.webp`, await round(legacy));
    await write(`${dir}/ic_launcher_background.webp`, await full(adaptive));        // full-bleed zoomed icon
    await write(`${dir}/ic_launcher_foreground.webp`, await transparent(adaptive)); // empty
  }
  console.log(`Launcher icons generated from iconNew.png (zoom ${ICON_ZOOM}).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
