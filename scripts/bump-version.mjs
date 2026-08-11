// Bumps the version in package.json — the single source of truth that next.config.ts
// inlines as NEXT_PUBLIC_APP_VERSION and android/app/build.gradle turns into
// versionName + versionCode (major*10000 + minor*100 + patch).
//
// Runs automatically at the front of `npm run sync:android`, so every APK you build
// carries a versionCode Play Store will accept as new. Run it by hand for the bigger
// jumps: `npm run version:minor` / `npm run version:major`.
//
// Deliberately not `npm version` — that one also commits and tags, and refuses to run
// on a dirty tree, which is exactly the wrong behaviour mid-build.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RELEASE_TYPES = ['patch', 'minor', 'major'];

const releaseType = process.argv[2] ?? 'patch';
if (!RELEASE_TYPES.includes(releaseType)) {
  console.error(`bump-version: expected one of ${RELEASE_TYPES.join(' | ')}, got "${releaseType}"`);
  process.exit(1);
}

const pkgPath = join(dirname(dirname(fileURLToPath(import.meta.url))), 'package.json');
const raw = readFileSync(pkgPath, 'utf8');

// Match the version field textually rather than round-tripping through JSON.parse +
// JSON.stringify, so the file keeps its exact formatting and key order and the diff
// stays a single line.
const versionField = /("version"\s*:\s*")(\d+)\.(\d+)\.(\d+)(")/;
const match = raw.match(versionField);
if (!match) {
  console.error('bump-version: no "version": "x.y.z" field found in package.json');
  process.exit(1);
}

const [, prefix, majorStr, minorStr, patchStr, suffix] = match;
let [major, minor, patch] = [majorStr, minorStr, patchStr].map(Number);

if (releaseType === 'major') { major += 1; minor = 0; patch = 0; }
else if (releaseType === 'minor') { minor += 1; patch = 0; }
else { patch += 1; }

const from = `${majorStr}.${minorStr}.${patchStr}`;
const to = `${major}.${minor}.${patch}`;

writeFileSync(pkgPath, raw.replace(versionField, `${prefix}${to}${suffix}`), 'utf8');

const versionCode = major * 10000 + minor * 100 + patch;
console.log(`bump-version: ${from} → ${to}  (${releaseType} · android versionCode ${versionCode})`);
