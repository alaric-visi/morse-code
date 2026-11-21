#!/usr/bin/env node
/**
 * Fails if any raw colour (hex, rgb(), hsl()) appears in src/ outside
 * src/styles/tokens.css. Every colour must come from a --mc-* token.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ALLOWED = new Set(['src/styles/tokens.css']);
const COLOUR = /#[0-9a-fA-F]{3,8}\b(?![-\w])|\b(?:rgba?|hsla?|oklch|lab|lch)\(/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(css|tsx?|html)$/.test(name)) yield p;
  }
}

const problems = [];
for (const file of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, file);
  if (ALLOWED.has(rel)) continue;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const m of line.matchAll(COLOUR)) problems.push(`${rel}:${i + 1}: ${m[0]}  ${line.trim().slice(0, 80)}`);
    });
}

if (problems.length) {
  console.error(`Raw colours outside tokens.css (use a --mc-* token):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('tokens: ok — no raw colours outside src/styles/tokens.css');
