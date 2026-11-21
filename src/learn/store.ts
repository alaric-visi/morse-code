import { signal } from '@preact/signals';
import { createStore, get, set } from 'idb-keyval';
import { emptyProgress, sanitizeProgress, type Progress } from './progress';

/**
 * Course progress lives in IndexedDB (per origin). If IndexedDB is missing or
 * blocked, progress still works for the visit and `persistent` says so.
 */
const KEY = 'progress:v1';
let store: ReturnType<typeof createStore> | null = null;
try {
  store = typeof indexedDB !== 'undefined' ? createStore('morse-code', 'kv') : null;
} catch {
  store = null;
}

export const progress = signal<Progress | null>(null);
export const persistent = signal(true);

let loading: Promise<Progress> | null = null;

export function loadProgress(): Promise<Progress> {
  if (progress.value) return Promise.resolve(progress.value);
  loading ??= (async () => {
    let p = emptyProgress();
    try {
      if (!store) throw new Error('no IndexedDB');
      const raw = await get(KEY, store);
      if (raw) p = sanitizeProgress(raw);
    } catch {
      persistent.value = false;
    }
    progress.value = p;
    return p;
  })();
  return loading;
}

let saving = Promise.resolve();
async function persist(p: Progress) {
  if (!store) {
    persistent.value = false;
    return;
  }
  // Chain writes so they land in order.
  saving = saving.then(async () => {
    try {
      await set(KEY, p, store!);
    } catch {
      persistent.value = false;
    }
  });
  return saving;
}

/** Change progress: `fn` edits a copy, which is then shown and saved. */
export function updateProgress(fn: (p: Progress) => void) {
  const cur = progress.value ?? emptyProgress();
  const next = structuredClone(cur);
  fn(next);
  progress.value = next;
  return persist(next);
}

/** Replace progress entirely (import, reset). */
export function replaceProgress(p: Progress) {
  progress.value = p;
  return persist(p);
}
