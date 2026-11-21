import { baseCall, continentOf, countryOf, zoneOf } from './zones';

/** One contact in your log. Times are ISO strings (UTC). */
export interface LogEntry {
  call: string;
  at: string;
  band: string;
  /** MHz */
  freq?: number;
  mode: 'CW';
  rstSent: string;
  rstRcvd: string;
  name?: string;
  qth?: string;
  /** What you sent and received beyond the report, e.g. a serial or a zone. */
  exchSent?: string;
  exchRcvd?: string;
  state?: string;
  zone?: number;
  country?: string;
  /** Which part of the app it came from, or 'import'. */
  source: string;
  contest?: string;
}

const LOG_LIMIT = 5000;

export function addToLog(log: LogEntry[], e: LogEntry): LogEntry[] {
  const full: LogEntry = {
    ...e,
    call: e.call.toUpperCase(),
    country: e.country ?? countryOf(e.call)?.country,
    zone: e.zone ?? zoneOf(e.call) ?? undefined,
  };
  return [...log, full].slice(-LOG_LIMIT);
}

// ------------------------------------------------------------------ ADIF

const tag = (name: string, value: string | number | undefined) => {
  if (value === undefined || value === '') return '';
  const v = String(value);
  return `<${name}:${v.length}>${v} `;
};
const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
const hm = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}`;

/** ADIF 3 text (.adi), readable by most logging programs. */
export function toAdif(log: readonly LogEntry[], now = new Date()): string {
  const head = `Morse Code log export, ${now.toISOString()}\n${tag('ADIF_VER', '3.1.4')}${tag('PROGRAMID', 'MORSE-CODE')}<EOH>\n`;
  const rows = log.map((e) => {
    const d = new Date(e.at);
    return (
      tag('CALL', e.call) +
      tag('QSO_DATE', ymd(d)) +
      tag('TIME_ON', hm(d)) +
      tag('BAND', e.band) +
      tag('FREQ', e.freq?.toFixed(4)) +
      tag('MODE', e.mode) +
      tag('RST_SENT', e.rstSent) +
      tag('RST_RCVD', e.rstRcvd) +
      tag('NAME', e.name) +
      tag('QTH', e.qth) +
      tag('STX_STRING', e.exchSent) +
      tag('SRX_STRING', e.exchRcvd) +
      tag('STATE', e.state) +
      tag('CQZ', e.zone) +
      tag('COUNTRY', e.country) +
      tag('CONTEST_ID', e.contest) +
      tag('COMMENT', e.source === 'import' ? undefined : `Morse Code app: ${e.source}`) +
      '<EOR>'
    );
  });
  return head + rows.join('\n') + '\n';
}

/** Parse ADIF text. Unknown fields are ignored; records without a call are skipped. */
export function fromAdif(text: string): LogEntry[] {
  const body = text.includes('<EOH>') || text.includes('<eoh>') ? text.split(/<eoh>/i)[1] : text;
  const out: LogEntry[] = [];
  let rec: Record<string, string> = {};
  const re = /<([A-Za-z_0-9]+)(?::(\d+)(?::[A-Za-z])?)?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const name = m[1].toUpperCase();
    if (name === 'EOR') {
      if (rec.CALL) out.push(fromRecord(rec));
      rec = {};
      continue;
    }
    const len = m[2] ? Number(m[2]) : 0;
    rec[name] = body.slice(re.lastIndex, re.lastIndex + len);
    re.lastIndex += len;
  }
  return out;
}

function fromRecord(r: Record<string, string>): LogEntry {
  const d = r.QSO_DATE ?? '19700101';
  const t = (r.TIME_ON ?? '0000').padEnd(6, '0');
  const at = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6)));
  const zone = r.CQZ ? Number(r.CQZ) : undefined;
  return {
    call: r.CALL.toUpperCase(),
    at: Number.isNaN(at.getTime()) ? new Date(0).toISOString() : at.toISOString(),
    band: (r.BAND ?? '').toLowerCase(),
    freq: r.FREQ ? Number(r.FREQ) : undefined,
    mode: 'CW',
    rstSent: r.RST_SENT ?? '',
    rstRcvd: r.RST_RCVD ?? '',
    name: r.NAME || undefined,
    qth: r.QTH || undefined,
    exchSent: r.STX_STRING || undefined,
    exchRcvd: r.SRX_STRING || undefined,
    state: r.STATE || undefined,
    zone: zone && Number.isFinite(zone) ? zone : zoneOf(r.CALL) ?? undefined,
    country: r.COUNTRY || countryOf(r.CALL)?.country,
    source: 'import',
    contest: r.CONTEST_ID || undefined,
  };
}

// ------------------------------------------------------------------ awards

export interface Awards {
  /** Countries (our table plus any named in imported logs). */
  countries: string[];
  /** CQ zones 1–40. */
  zones: number[];
  /** US states. */
  states: string[];
  continents: string[];
  contacts: number;
  uniqueCalls: number;
}

/** What you've worked, for DXCC-, WAZ-, WAS- and WAC-style tallies. */
export function awards(log: readonly LogEntry[], usStates: readonly string[]): Awards {
  const countries = new Set<string>();
  const zones = new Set<number>();
  const states = new Set<string>();
  const continents = new Set<string>();
  const calls = new Set<string>();
  for (const e of log) {
    calls.add(baseCall(e.call));
    const country = e.country ?? countryOf(e.call)?.country;
    if (country) countries.add(country);
    const z = e.zone ?? zoneOf(e.call);
    if (z && z >= 1 && z <= 40) zones.add(z);
    if (e.state && usStates.includes(e.state.toUpperCase())) states.add(e.state.toUpperCase());
    const cont = continentOf(e.call);
    if (cont) continents.add(cont);
  }
  return {
    countries: [...countries].sort(),
    zones: [...zones].sort((a, b) => a - b),
    states: [...states].sort(),
    continents: [...continents].sort(),
    contacts: log.length,
    uniqueCalls: calls.size,
  };
}

/** Is this call already in the log for this band (and contest, if given)? */
export const isDupe = (log: readonly LogEntry[], call: string, band: string, contest?: string) =>
  log.some((e) => baseCall(e.call) === baseCall(call) && e.band === band && (contest === undefined || e.contest === contest));
