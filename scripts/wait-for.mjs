// Wait (up to 3 minutes) for a file to exist, then exit. Used to order test servers.
import { existsSync } from 'node:fs';
const file = process.argv[2];
const until = Date.now() + 180_000;
while (!existsSync(file)) {
  if (Date.now() > until) {
    console.error(`wait-for: ${file} never appeared`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 500));
}
