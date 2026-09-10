/**
 * Prints one of the repo's browser-console snippets and, where the platform has a
 * clipboard tool, copies it too.
 *
 *   node scripts/print-console-snippet.mjs load-test-data.js
 *
 * The app has no server and no database — its state lives in the browser's localStorage
 * and IndexedDB — so "load data" and "reset data" cannot be done from the terminal. The
 * closest thing is handing you the snippet ready to paste, which is what this does.
 */

import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/print-console-snippet.mjs <file.js>');
  process.exit(1);
}

const body = readFileSync(join(ROOT, file), 'utf8');

/** Best-effort clipboard — a missing tool is not a failure, the snippet is printed anyway. */
const copy = text => new Promise(resolve => {
  const cmd = process.platform === 'win32' ? ['clip', []]
            : process.platform === 'darwin' ? ['pbcopy', []]
            : ['xclip', ['-selection', 'clipboard']];
  try {
    const proc = spawn(cmd[0], cmd[1], { stdio: ['pipe', 'ignore', 'ignore'] });
    proc.on('error', () => resolve(false));
    proc.on('close', code => resolve(code === 0));
    proc.stdin.end(text);
  } catch {
    resolve(false);
  }
});

const copied = await copy(body);

console.log('');
console.log(`── ${file} ──`.padEnd(78, '─'));
console.log(body.trimEnd());
console.log(''.padEnd(78, '─'));
console.log(copied
  ? '\nCopied to your clipboard. Open the app (npm run dev → http://localhost:9002),'
  : '\nCopy the block above. Open the app (npm run dev → http://localhost:9002),');
console.log('open DevTools (F12) → Console, paste, press Enter.\n');
