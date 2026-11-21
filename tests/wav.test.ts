import { describe, expect, it } from 'vitest';
import { encodeWav } from '../src/audio/wav';

describe('encodeWav', () => {
  it('writes a 16-bit mono PCM header and clamps samples', () => {
    const buf = encodeWav(new Float32Array([0, 1, -1, 2]), 12000);
    const v = new DataView(buf);
    const tag = (o: number) => String.fromCharCode(...new Uint8Array(buf, o, 4));
    expect(buf.byteLength).toBe(44 + 8);
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(tag(36)).toBe('data');
    expect(v.getUint32(24, true)).toBe(12000);
    expect(v.getUint16(34, true)).toBe(16);
    expect([0, 1, 2, 3].map((i) => v.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 32767]);
  });
});
