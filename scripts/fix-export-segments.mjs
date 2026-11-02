// Repairs the per-segment prefetch files `next build` writes into out/ on Windows.
//
// Next 16 exports one data file per route segment and the client router fetches it as
// `out/history/__next.history.__PAGE__.txt` — the segment path flattened with dots. The
// exporter builds that name from `path.relative()`, which returns BACKSLASHES on Windows,
// and only replaces forward slashes, so `path.join` turns the leftover `\` into a real
// folder: `out/history/__next.history/__PAGE__.txt`. Every segment prefetch then 404s and
// the router silently falls back to the full payload — no visible break, but the History
// warm-up in prefetch.ts never lands. (Checked on next@16.4.3: export/index.js,
// collectSegmentPaths + convertSegmentPathToStaticExportFilename.)
//
// This moves each nested file to the dotted name the client asks for. It runs after every
// `next build` in package.json. On a build that is already correct (Linux/macOS, or a fixed
// Next) there are no `__next.*` folders and it does nothing.

import { readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const outDir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'out');
let moved = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('__next.')) flatten(full, dir);
    else walk(full);
  }
}

// `history/__next.history/__PAGE__.txt` -> `history/__next.history.__PAGE__.txt`
function flatten(segmentDir, parent) {
  const files = [];
  (function collect(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) collect(p);
      else files.push(p);
    }
  })(segmentDir);
  for (const file of files) {
    const flat = relative(parent, file).split(sep).join('.');
    renameSync(file, join(parent, flat));
    moved++;
  }
  rmSync(segmentDir, { recursive: true, force: true });
}

if (statSync(outDir, { throwIfNoEntry: false })?.isDirectory()) {
  walk(outDir);
  console.log(`fix-export-segments: ${moved} segment file${moved === 1 ? '' : 's'} renamed`);
} else {
  console.error('fix-export-segments: no out/ directory — run next build first');
  process.exit(1);
}
