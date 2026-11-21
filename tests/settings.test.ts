import { describe, expect, it } from 'vitest';
import { DEFAULTS, decodeShare, encodeShare, sanitize } from '../src/app/settings';

describe('sanitize', () => {
  it('fills defaults from nothing', () => {
    expect(sanitize(undefined)).toEqual(DEFAULTS);
    expect(sanitize('junk')).toEqual(DEFAULTS);
  });

  it('clamps and rounds numbers', () => {
    const s = sanitize({ charWpm: 99, effWpm: 99, pitch: 1234, volume: 0.333 });
    expect(s.charWpm).toBe(60);
    expect(s.effWpm).toBe(60);
    expect(s.pitch).toBe(1200);
    expect(s.volume).toBeCloseTo(0.35);
  });

  it('keeps effective speed at or below character speed', () => {
    expect(sanitize({ charWpm: 12, effWpm: 20 }).effWpm).toBe(12);
  });

  it('rejects bad enums and types', () => {
    const s = sanitize({ spacing: 'fast', sound: 'yes', charWpm: 'NaN' });
    expect(s.spacing).toBe('standard');
    expect(s.sound).toBe(true);
    expect(s.charWpm).toBe(DEFAULTS.charWpm);
  });
});

describe('share links', () => {
  it('round-trips message and sound settings', () => {
    const s = sanitize({ charWpm: 25, effWpm: 12, spacing: 'farnsworth', pitch: 700, extended: true });
    const q = encodeShare('text', 'CQ DE G4ABC & <SK>', s);
    const back = decodeShare(q);
    expect(back.mode).toBe('text');
    expect(back.text).toBe('CQ DE G4ABC & <SK>');
    expect(sanitize({ ...DEFAULTS, ...back.settings })).toMatchObject({
      charWpm: 25, effWpm: 12, spacing: 'farnsworth', pitch: 700, extended: true,
    });
  });

  it('leaves out the effective speed for standard spacing', () => {
    expect(encodeShare('morse', '...', DEFAULTS)).not.toContain('e=');
  });

  it('ignores queries without a message', () => {
    expect(decodeShare('c=20')).toEqual({});
    expect(decodeShare('')).toEqual({});
  });
});
