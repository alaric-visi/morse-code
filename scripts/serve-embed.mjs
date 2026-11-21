// A tiny static server for the embedding tests and for trying the hand-off locally:
//   /morse/…  the standalone build (dist/) served from a sub-path, as on the real site
//   /lib/…    the embeddable library (dist-lib/)
//   /         a pretend host page (e2e/host/index.html) that mounts the library
// Usage: node scripts/serve-embed.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const port = Number(process.argv[2] ?? 4320);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json', '.svg': 'image/svg+xml' };
const MOUNTS = [
  ['/morse/', 'dist'],
  ['/lib/', 'dist-lib'],
  ['/', 'e2e/host'],
];

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const [prefix, dir] = MOUNTS.find(([p]) => path.startsWith(p)) ?? [];
  let rel = normalize(path.slice(prefix.length)).replace(/^(\.\.[/\\])+/, '');
  if (rel === '' || rel === '.' || rel.endsWith('/')) rel = join(rel, 'index.html');
  try {
    const body = await readFile(join(dir, rel));
    res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}).listen(port, () => console.log(`embed server on http://localhost:${port}`));
