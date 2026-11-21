import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE, parseHash } from '../src/app/router';

describe('parseHash', () => {
  it.each([
    ['', DEFAULT_ROUTE],
    ['#', DEFAULT_ROUTE],
    ['#/translate', '/translate'],
    ['#/translate?t=SOS', '/translate'],
    ['#/nope', DEFAULT_ROUTE],
  ])('%s → %s', (hash, route) => expect(parseHash(hash)).toBe(route));
});
