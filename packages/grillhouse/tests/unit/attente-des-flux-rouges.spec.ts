// The wait of the supervisor (`npx grillhouse superviseur --attendre`, scripts/superviseur.mjs)
// gives a ticket the queue reopened for a red workflow of main (label `flux-rouge`) as a batch of
// its own, once, with the address of the run; a ticket taken up again or closed is no longer
// given. The tickets that bear the label and wait open are read by `fluxRouges` (bd by default,
// here a reading injected).
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { attendreUneQuestion, texteDesQuestions } from '../../scripts/superviseur.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'attente-des-flux-rouges-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const depot = () => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
  return racine;
};

interface Rouge {
  ticket: string;
  adresse: string;
}
const ADRESSE =
  'Deploy hosted server : https://github.com/demo/demo/actions/runs/9 (commit abc1234)';

const monde = (rouges: Rouge[] = []) => {
  const m = { rouges, lire: () => m.rouges };
  return m;
};

const attendre = async (racine: string, m: ReturnType<typeof monde>, ms = 1500) => {
  const fin = new AbortController();
  const minuteur = setTimeout(() => fin.abort(), ms);
  try {
    return await attendreUneQuestion({
      racine,
      fermes: () => new Set<string>(),
      pas: 50,
      signal: fin.signal,
      circuitsDe: () => Promise.resolve([]),
      fluxRouges: () => m.lire(),
    } as Parameters<typeof attendreUneQuestion>[0]);
  } finally {
    clearTimeout(minuteur);
  }
};

describe('un ticket rouvert par un flux de main rouge réveille le superviseur', () => {
  it('is given as a batch, its ticket and the address of the run', async () => {
    const m = monde([{ ticket: 'demo-1', adresse: ADRESSE }]);
    const q = (await attendre(depot(), m)) as { ticket: string; adresse?: string }[];
    expect(q.map(x => x.ticket)).toEqual(['demo-1']);
    expect(q[0]!.adresse).toBe(ADRESSE);
    const texte = texteDesQuestions(q as Parameters<typeof texteDesQuestions>[0]);
    expect(texte).toContain('demo-1');
    expect(texte).toContain('https://github.com/demo/demo/actions/runs/9');
  });

  it('appearing during the wait, ends it', async () => {
    const m = monde([]);
    const attente = attendre(depot(), m, 5000);
    await new Promise(r => setTimeout(r, 150));
    m.rouges = [{ ticket: 'demo-2', adresse: ADRESSE }];
    expect(((await attente) as { ticket: string }[]).map(x => x.ticket)).toEqual(['demo-2']);
  });

  it('is given once: the next wait does not give it again while it stands', async () => {
    const racine = depot();
    const m = monde([{ ticket: 'demo-1', adresse: ADRESSE }]);
    expect((await attendre(racine, m)) as unknown[]).toHaveLength(1);
    expect(await attendre(racine, m, 400)).toEqual([]);
  });

  it('a ticket taken up again or closed (no longer read) is not given', async () => {
    expect(await attendre(depot(), monde([]), 400)).toEqual([]);
  });

  it('a ticket that goes red again at another run is given again', async () => {
    const racine = depot();
    const m = monde([{ ticket: 'demo-1', adresse: ADRESSE }]);
    await attendre(racine, m);
    m.rouges = [];
    await attendre(racine, m, 300);
    m.rouges = [{ ticket: 'demo-1', adresse: `${ADRESSE} bis` }];
    expect(((await attendre(racine, m)) as { ticket: string }[]).map(x => x.ticket)).toEqual([
      'demo-1',
    ]);
  });

  it('several tickets come in one batch, sorted by ticket', async () => {
    const m = monde([
      { ticket: 'demo-3', adresse: ADRESSE },
      { ticket: 'demo-1', adresse: ADRESSE },
    ]);
    expect(((await attendre(depot(), m)) as { ticket: string }[]).map(x => x.ticket)).toEqual([
      'demo-1',
      'demo-3',
    ]);
  });
});
