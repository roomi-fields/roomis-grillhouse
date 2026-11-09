// A measure of time plays at night, at rest: the day is always loaded. The kernel's CPU pressure
// (/proc/pressure/cpu, line `some`, `avg10`) is read by scripts/mesure/pression.mjs, and the wait
// for rest ends at the first reading under the threshold. The duration reporter and the
// configurations, played in a project of trial, are the night's
// (packages/grillhouse-essais/tests/temps-au-repos.nuit.spec.ts).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { attendreLeRepos, lirePression } from '../../scripts/mesure/pression.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'temps-au-repos-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// The content of /proc/pressure/cpu for a pressure <some> (avg10, in %).
const pression = (some: number) =>
  `some avg10=${some.toFixed(2)} avg60=0.00 avg300=0.00 total=1\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n`;
const CHARGE = 90;
const REPOS = 1;

describe('the reading of the pressure', () => {
  it('reads avg10 of the line some, in %', () => {
    const f = path.join(ESSAIS, 'p');
    writeFileSync(f, pression(31.25));
    expect(lirePression(f)).toBe(31.25);
  });
  it('gives null for a file absent or unreadable', () => {
    expect(lirePression(path.join(ESSAIS, 'absent'))).toBeNull();
    const f = path.join(ESSAIS, 'faux');
    writeFileSync(f, 'rien\n');
    expect(lirePression(f)).toBeNull();
  });
});

describe('the wait for rest', () => {
  // A clock and a pressure of trial: each sleep moves the clock; the pressure follows <suite>.
  const essai = (suite: (t: number) => number | null, borneMs: number) => {
    let t = 0;
    const lignes: string[] = [];
    const repos = attendreLeRepos({
      lire: () => suite(t),
      maintenant: () => t,
      dormir: (ms: number) => {
        t += ms;
      },
      limite: borneMs,
      dire: (l: string) => lignes.push(`${t} ${l}`),
    });
    return { repos, lignes, t };
  };
  it('returns at once at rest, without a line', () => {
    expect(essai(() => REPOS, 60_000)).toEqual({ repos: true, lignes: [], t: 0 });
  });
  it('waits while the pressure stays at or above the threshold, one line per 30 s at most, each with the pressure', () => {
    const e = essai(t => (t < 95_000 ? 40 : REPOS), 15 * 60_000);
    expect(e.repos).toBe(true);
    expect(e.t).toBeGreaterThanOrEqual(95_000);
    expect(e.lignes).toHaveLength(4);
    const instants = e.lignes.map(l => Number(l.split(' ')[0]));
    for (let i = 1; i < instants.length; i++) {
      expect(instants[i] - instants[i - 1]).toBeGreaterThanOrEqual(30_000);
    }
    for (const l of e.lignes) {
      expect(l).toContain('40.0 %');
    }
  });
  it('gives up at its bound', () => {
    const e = essai(() => CHARGE, 15 * 60_000);
    expect(e.repos).toBe(false);
    expect(e.t).toBeGreaterThanOrEqual(15 * 60_000);
    expect(e.lignes.length).toBeLessThanOrEqual(31);
  });
  it('a pressure that does not read ends the wait, and says so', () => {
    const e = essai(() => null, 60_000);
    expect(e.repos).toBe(true);
    expect(e.lignes.join('\n')).toMatch(/illisible/);
  });
});
