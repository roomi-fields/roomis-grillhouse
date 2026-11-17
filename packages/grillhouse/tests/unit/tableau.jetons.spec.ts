// A count of tokens as the board writes it (`k` of scripts/tableau.mjs): thousands, millions,
// billions, each with its unit, a count never written as a thousand of a smaller one.
//
// Small tests: a pure function.
import { describe, expect, it } from 'vitest';
import { k } from '../../scripts/tableau.mjs';

describe('un compte de jetons au tableau', () => {
  it('under a thousand, the count itself; then thousands and millions', () => {
    expect(k(512)).toBe('512');
    expect(k(40_000)).toBe('40 k');
    expect(k(3_140_000)).toBe('3,1 M');
  });
  it('a billion and more is written in G', () => {
    expect(k(1_000_000_000)).toBe('1,0 G');
    expect(k(1_240_000_000)).toBe('1,2 G');
    expect(k(12_340_000_000)).toBe('12,3 G');
  });
  it('a count that would round to a thousand of its unit takes the next one', () => {
    expect(k(999_600)).toBe('1,0 M');
    expect(k(999_960_000)).toBe('1,0 G');
    expect(k(999_400_000)).toBe('999,4 M');
  });
});
