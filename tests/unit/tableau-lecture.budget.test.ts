// The budget of the board's reading of a long transcript (grillhouse-3uv.44, critère 5): the
// session of the supervisor, tens of megabytes, is read where the board stopped, its reading kept
// in the board's cache file; with that cache warm, a measure after a line is appended stays of the
// order of ten milliseconds.
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lireVivant } from '../../scripts/tableau.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-lecture-budget-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = '/depot';
const TAILLE = 34_625_121;
const BUDGET = 50;
const l = (o: object) => JSON.stringify(o);
const DEBUT = Date.parse('2026-10-07T08:00:00Z');
const ligne = (i: number) =>
  l({
    type: i % 40 === 0 ? 'user' : 'assistant',
    timestamp: new Date(DEBUT + i * 1000).toISOString(),
    ...(i % 40 === 0
      ? { origin: { kind: 'human' }, message: { content: `Message ${i}` } }
      : {
          message: {
            id: `m${i}`,
            content: [{ type: 'text', text: 'x'.repeat(900) }],
            usage: { input_tokens: 3, output_tokens: 2, cache_read_input_tokens: 100 },
          },
        }),
  });

describe('3uv.44 critère 5 : a long transcript is measured in tens of milliseconds once the cache is warm', () => {
  it('3uv.44 critère 5 : the session of the supervisor, 34.6 MB, one line appended: cache read, measure and cache written within the budget', () => {
    const home = mkdtempSync(path.join(ESSAIS, 'home-'));
    const d = path.join(home, '.claude/projects/-depot');
    mkdirSync(d, { recursive: true });
    const f = path.join(d, 'superviseur.jsonl');
    const lignes: string[] = [];
    let taille = 0;
    let i = 0;
    while (taille < TAILLE) {
      const x = ligne(i++);
      lignes.push(x);
      taille += Buffer.byteLength(x) + 1;
    }
    writeFileSync(f, `${lignes.join('\n')}\n`);
    const lire = (cache: Record<string, unknown>) =>
      lireVivant({ racine: RACINE, home, prefix: 'demo', maintenant: Date.now(), ps: '', cache });
    const chaud: Record<string, unknown> = {};
    lire(chaud);
    const fichierDuCache = JSON.stringify(chaud);
    appendFileSync(f, `${ligne(i)}\n`);
    const debut = performance.now();
    const cache = JSON.parse(fichierDuCache) as Record<string, unknown>;
    const v = lire(cache).find(x => x.agent === 'superviseur') as { jetons: number } | undefined;
    JSON.stringify(cache);
    const duree = performance.now() - debut;
    expect(v?.jetons).toBeGreaterThan(0);
    expect(duree).toBeLessThan(BUDGET);
  }, 60_000);
});
