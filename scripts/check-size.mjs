// Fails the build if the JavaScript needed for the first screen grows past the budget.
// "First load" = the entry chunk plus everything it imports statically (modulepreload),
// read from the built index.html. Lazy chunks (Listen, QSO, Shack, Radio) don't count.
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET_KB = 150;
const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const first = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const size = (f) => gzipSync(readFileSync(join(dist, f))).length / 1024;
const firstKb = first.reduce((a, f) => a + size(f), 0);
const lazy = readdirSync(join(dist, 'assets'))
  .filter((f) => f.endsWith('.js') && !first.includes(`assets/${f}`))
  .map((f) => `${f} ${size(`assets/${f}`).toFixed(1)} KB`);
console.log(`size: first load ${firstKb.toFixed(1)} KB gzipped (budget ${BUDGET_KB} KB) — ${first.join(', ')}`);
console.log(`size: lazy chunks: ${lazy.join('; ') || 'none'}`);
if (firstKb > BUDGET_KB) {
  console.error(`size: over budget by ${(firstKb - BUDGET_KB).toFixed(1)} KB`);
  process.exit(1);
}
