import { MAX_WPM, MIN_WPM } from '../core/timing';
import { START_LEVEL, clampLevel, KOCH } from './koch';
import { reviveCard, type Cards } from './srs';
import { emptyStat, type Confusion, type Stats } from './stats';
import type { LogEntry } from './logbook';

export const COPY_LENGTHS = [15, 30, 60, 120] as const;
export type CopySeconds = (typeof COPY_LENGTHS)[number];

export interface CourseSettings {
  /** Characters are always sent at this speed. */
  charWpm: number;
  /** Farnsworth overall speed (≤ charWpm). */
  effWpm: number;
  copySeconds: CopySeconds;
}

export interface SessionLog {
  /** ISO time it finished. */
  at: string;
  /** Local day, YYYY-MM-DD. */
  day: string;
  level: number;
  /** Time spent in the session, seconds. */
  seconds: number;
  charWpm: number;
  effWpm: number;
  copyAccuracy?: number;
  copyChars?: number;
  /** Did this session unlock a new character? */
  levelUp?: boolean;
}

/** Everything the course remembers. Plain JSON apart from FSRS dates. */
export interface Progress {
  v: 1;
  /** How many characters are unlocked (2 at lesson 1). */
  level: number;
  /** Characters whose introduction has been shown. */
  met: string[];
  /** Teaching cards opened. */
  read: string[];
  cards: Cards;
  stats: Stats;
  confusion: Confusion;
  sessions: SessionLog[];
  /** Local days with any practice, for the streak. */
  days: string[];
  settings: CourseSettings;
  /** Copy certificates earned: speed, accuracy and when. */
  certs: Cert[];
  /** Best speed reached on the QRQ ladder. */
  qrqBest: number;
  /** Your callsign, name and location, for simulated contacts and certificates. */
  operator: OperatorInfo;
  /** Your logbook: every simulated contact, plus anything imported. */
  log: LogEntry[];
  /** UK licence study: answers per question, and mock exam results. */
  licence: LicenceProgress;
}

export type LicenceLevel = 'F' | 'I' | 'Full';
export interface LicenceProgress {
  /** Question id → times answered right and wrong, and when last seen. */
  answers: Record<string, { right: number; wrong: number; at: string }>;
  mocks: { level: LicenceLevel; score: number; total: number; pass: number; seconds: number; at: string }[];
}

export interface Cert {
  wpm: number;
  accuracy: number;
  at: string;
}

export interface OperatorInfo {
  call: string;
  name: string;
  qth: string;
}

export const DEFAULT_COURSE: CourseSettings = { charWpm: 20, effWpm: 10, copySeconds: 60 };
const SESSION_LIMIT = 1000;

export const emptyProgress = (): Progress => ({
  v: 1,
  level: START_LEVEL,
  met: [],
  read: [],
  cards: {},
  stats: {},
  confusion: {},
  sessions: [],
  days: [],
  settings: { ...DEFAULT_COURSE },
  certs: [],
  qrqBest: 0,
  operator: { call: '', name: '', qth: '' },
  log: [],
  licence: { answers: {}, mocks: [] },
});

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
const KNOWN = new Set(KOCH);
const strings = (v: unknown, ok: (s: string) => boolean = () => true) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && ok(x)))] : [];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function sanitizeSettings(raw: unknown): CourseSettings {
  const r = isObj(raw) ? raw : {};
  const charWpm = Math.round(num(r.charWpm, MIN_WPM, MAX_WPM, DEFAULT_COURSE.charWpm));
  const copy = COPY_LENGTHS.includes(r.copySeconds as CopySeconds) ? (r.copySeconds as CopySeconds) : DEFAULT_COURSE.copySeconds;
  return { charWpm, effWpm: Math.round(num(r.effWpm, MIN_WPM, charWpm, Math.min(DEFAULT_COURSE.effWpm, charWpm))), copySeconds: copy };
}

/** Accept anything (old saves, a hand-edited export) and return a valid Progress. */
export function sanitizeProgress(raw: unknown): Progress {
  const r = isObj(raw) ? raw : {};
  const cards: Cards = {};
  if (isObj(r.cards)) for (const [id, c] of Object.entries(r.cards)) {
    const card = reviveCard(c);
    if (card) cards[id] = card;
  }
  const stats: Stats = {};
  if (isObj(r.stats)) for (const [ch, s] of Object.entries(r.stats)) {
    if (!isObj(s)) continue;
    const e = emptyStat();
    const seen = Math.round(num(s.seen, 0, 1e7, 0));
    stats[ch] = {
      seen,
      correct: Math.round(num(s.correct, 0, seen, 0)),
      recent: num(s.recent, 0, 1, e.recent),
      rtSum: num(s.rtSum, 0, 1e9, 0),
      rtCount: Math.round(num(s.rtCount, 0, 1e7, 0)),
    };
  }
  const confusion: Confusion = {};
  if (isObj(r.confusion)) for (const [sent, row] of Object.entries(r.confusion)) {
    if (!isObj(row)) continue;
    for (const [heard, n] of Object.entries(row)) {
      const c = Math.round(num(n, 0, 1e7, 0));
      if (c > 0) (confusion[sent] ??= {})[heard] = c;
    }
  }
  const sessions: SessionLog[] = Array.isArray(r.sessions)
    ? r.sessions.filter(isObj).flatMap((s) => {
        if (typeof s.at !== 'string' || typeof s.day !== 'string' || !DAY.test(s.day)) return [];
        return [{
          at: s.at,
          day: s.day,
          level: clampLevel(num(s.level, START_LEVEL, KOCH.length, START_LEVEL)),
          seconds: num(s.seconds, 0, 86400, 0),
          charWpm: num(s.charWpm, MIN_WPM, MAX_WPM, DEFAULT_COURSE.charWpm),
          effWpm: num(s.effWpm, MIN_WPM, MAX_WPM, DEFAULT_COURSE.effWpm),
          ...(typeof s.copyAccuracy === 'number' ? { copyAccuracy: num(s.copyAccuracy, 0, 1, 0) } : {}),
          ...(typeof s.copyChars === 'number' ? { copyChars: Math.round(num(s.copyChars, 0, 1e6, 0)) } : {}),
          ...(s.levelUp === true ? { levelUp: true } : {}),
        }];
      }).slice(-SESSION_LIMIT)
    : [];
  return {
    v: 1,
    level: clampLevel(num(r.level, START_LEVEL, KOCH.length, START_LEVEL)),
    met: strings(r.met, (s) => KNOWN.has(s)),
    read: strings(r.read),
    cards,
    stats,
    confusion,
    sessions,
    days: strings(r.days, (s) => DAY.test(s)).sort(),
    settings: sanitizeSettings(r.settings),
    certs: Array.isArray(r.certs)
      ? r.certs.filter(isObj).flatMap((c) =>
          typeof c.at === 'string' && typeof c.wpm === 'number'
            ? [{ wpm: Math.round(num(c.wpm, 1, 99, 5)), accuracy: num(c.accuracy, 0, 1, 0), at: c.at }]
            : [],
        )
      : [],
    qrqBest: Math.round(num(r.qrqBest, 0, 99, 0)),
    operator: sanitizeOperator(r.operator),
    log: sanitizeLog(r.log),
    licence: sanitizeLicence(r.licence),
  };
}

const LEVELS = new Set(['F', 'I', 'Full']);
function sanitizeLicence(raw: unknown): LicenceProgress {
  const r = isObj(raw) ? raw : {};
  const answers: LicenceProgress['answers'] = {};
  if (isObj(r.answers))
    for (const [id, a] of Object.entries(r.answers))
      if (/^[1-9][A-Z]\d{1,2}-(F|I|Full)-\d{1,2}$/.test(id) && isObj(a) && typeof a.at === 'string')
        answers[id] = { right: Math.round(num(a.right, 0, 1e5, 0)), wrong: Math.round(num(a.wrong, 0, 1e5, 0)), at: a.at };
  const mocks = Array.isArray(r.mocks)
    ? r.mocks.filter(isObj).flatMap((m) =>
        typeof m.level === 'string' && LEVELS.has(m.level) && typeof m.at === 'string'
          ? [{ level: m.level as LicenceLevel, score: Math.round(num(m.score, 0, 99, 0)), total: Math.round(num(m.total, 1, 99, 1)), pass: Math.round(num(m.pass, 0, 99, 0)), seconds: Math.round(num(m.seconds, 0, 86400, 0)), at: m.at }]
          : [],
      ).slice(-200)
    : [];
  return { answers, mocks };
}

function sanitizeLog(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 60) : undefined);
  return raw.filter(isObj).flatMap((e): LogEntry[] => {
    if (typeof e.call !== 'string' || typeof e.at !== 'string' || Number.isNaN(Date.parse(e.at))) return [];
    return [
      {
        call: e.call.toUpperCase().replace(/[^A-Z0-9/]/g, '').slice(0, 15),
        at: e.at,
        band: str(e.band) ?? '',
        freq: typeof e.freq === 'number' && Number.isFinite(e.freq) ? e.freq : undefined,
        mode: 'CW',
        rstSent: str(e.rstSent) ?? '',
        rstRcvd: str(e.rstRcvd) ?? '',
        name: str(e.name),
        qth: str(e.qth),
        exchSent: str(e.exchSent),
        exchRcvd: str(e.exchRcvd),
        state: str(e.state),
        zone: typeof e.zone === 'number' && Number.isFinite(e.zone) ? e.zone : undefined,
        country: str(e.country),
        source: str(e.source) ?? 'import',
        contest: str(e.contest),
      },
    ];
  }).slice(-5000);
}

/** Callsign: letters, digits and one optional /suffix. Name and QTH: Morse-sendable text. */
export function sanitizeOperator(raw: unknown): OperatorInfo {
  const r = isObj(raw) ? raw : {};
  // Leading spaces go and runs collapse, but a trailing space stays so you can type "MARY ANN".
  const clean = (v: unknown, re: RegExp, max: number) =>
    typeof v === 'string' ? v.toUpperCase().replace(re, '').replace(/^\s+/, '').replace(/\s{2,}/g, ' ').slice(0, max) : '';
  return {
    call: clean(r.call, /[^A-Z0-9/]/g, 12),
    name: clean(r.name, /[^A-Z ]/g, 16),
    qth: clean(r.qth, /[^A-Z0-9 ]/g, 20),
  };
}

export function addSession(p: Progress, s: SessionLog) {
  p.sessions.push(s);
  if (p.sessions.length > SESSION_LIMIT) p.sessions.splice(0, p.sessions.length - SESSION_LIMIT);
  if (!p.days.includes(s.day)) p.days.push(s.day);
}

// ------------------------------------------------------------------ export / import

const EXPORT_APP = 'morse-code';

export function exportProgress(p: Progress, now = new Date()): string {
  return JSON.stringify({ app: EXPORT_APP, kind: 'progress', v: 1, exportedAt: now.toISOString(), progress: p }, null, 2);
}

/** Parse an export file. Throws a readable Error when it isn't one. */
export function importProgress(text: string): Progress {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!isObj(data) || data.app !== EXPORT_APP || data.kind !== 'progress') {
    throw new Error("That file isn't a Morse Code progress export.");
  }
  return sanitizeProgress(data.progress);
}
