// The report of the checks (scripts/activites.mjs, `controles`): the reds come first, each with its
// test, its file and its message, read from the reports of Vitest and never from the log; a red
// guard of the project with no SARIF waits for the final pass at the checks of the plan. A test of
// size medium: a trial git worktree, a stand-in for npm on the PATH that writes the results a pass
// leaves (the reports of Vitest, the summary of Turborepo) and prints noise on its output.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import { monde } from './seance-d-essai.js';

interface Controles {
  rouge: boolean;
  auDeveloppeur: boolean;
  resume: string;
  texte: string;
  rouges: { paquet: string; texte: string }[];
  tous: { dansLePlan: boolean; texte: string }[];
}
const controles = activites.controles as unknown as (ctx: object, finale: boolean) => Controles;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'controles-rapport-'));
const avant = { PATH: process.env.PATH };
beforeAll(() => {
  const bin = path.join(ESSAIS, 'bin');
  mkdirSync(bin);
  const npm = path.join(bin, 'npm');
  // The stand-in writes what FAUX_NPM_RESULTATS describes (`{ vitest, taches }`) in the results
  // directory of the pass, the noise of a run on its output, then ends on FAUX_NPM_CODE.
  writeFileSync(
    npm,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const d = process.env.GRILLHOUSE_RESULTATS;
const s = JSON.parse(process.env.FAUX_NPM_RESULTATS || '{}');
if (d && s.vitest) {
  fs.mkdirSync(path.join(d, 'vitest'), { recursive: true });
  fs.writeFileSync(path.join(d, 'vitest', 'rapport.json'), JSON.stringify({ testResults: s.vitest }));
}
if (d && s.taches) {
  fs.mkdirSync(path.join(d, 'turbo'), { recursive: true });
  fs.writeFileSync(path.join(d, 'turbo', 'run.json'), JSON.stringify({ tasks: s.taches }));
}
console.log('forms:test:unit: FAIL tests/mesure.test.mjs');
console.log(' Tasks:    0 successful, 1 total');
console.log('Cached:    0 cached, 1 total');
process.exit(Number(process.env.FAUX_NPM_CODE || 1));
`
  );
  chmodSync(npm, 0o755);
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH ?? ''}`;
});
afterAll(() => {
  process.env.PATH = avant.PATH;
  delete process.env.FAUX_NPM_RESULTATS;
  delete process.env.FAUX_NPM_CODE;
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A pass on the trial copy whose plan is <paquets>, the stand-in leaving <resultats>.
function jouer(
  resultats: (copie: string) => object,
  finale: boolean,
  paquets = ['packages/forms']
) {
  const m = monde({ copie: true });
  process.env.FAUX_NPM_CODE = '1';
  process.env.FAUX_NPM_RESULTATS = JSON.stringify(resultats(m.ctx.copie));
  return controles({ ...m.ctx, paquets, ecartes: [], base: { dossier: m.ctx.tmp } }, finale);
}

const ECHEC = (copie: string) => ({
  vitest: [
    {
      name: path.join(copie, 'packages/forms/test/mesure.test.mjs'),
      status: 'failed',
      message: '',
      assertionResults: [
        {
          title: 'mesure rend le double',
          fullName: 'critère 1 — mesure rend le double',
          status: 'failed',
          failureMessages: ['AssertionError: expected 2 to be 4\n    at mesure.test.mjs:3'],
        },
      ],
    },
  ],
});
const GARDE_SANS_SARIF = () => ({
  taches: [
    {
      taskId: '//#gardes',
      package: '//',
      directory: '',
      task: 'gardes',
      execution: { exitCode: 1 },
    },
  ],
});

describe('le rapport des contrôles que reçoit le développeur', () => {
  it.each([
    [false, /^Contrôles du plan.* : rouge : 1 rouge\(s\) — /],
    [true, /^Contrôles de la passe finale.* : rouge : 1 rouge\(s\) — /],
  ])(
    'nomme d’abord ses rouges, chacun avec son test, son fichier et son message lus des rapports, sans le bruit du journal (passe finale : %s)',
    (finale, entete) => {
      const c = jouer(ECHEC, finale);
      expect(c.rouge).toBe(true);
      expect(c.auDeveloppeur).toBe(true);
      const lignes = c.texte.trim().split('\n');
      expect(lignes[0]).toMatch(entete);
      const tete = lignes.indexOf('Tes rouges (1) :');
      expect(tete).toBeGreaterThan(0);
      expect(lignes[tete + 1]).toMatch(
        /^- test packages\/forms\/test\/mesure\.test\.mjs › critère 1 — mesure rend le double — AssertionError: expected 2 to be 4$/
      );
      // Nothing of Turborepo's output: no prefixed line of a task, no summary of the run.
      expect(c.texte).not.toMatch(/test:unit:|Tasks:|Cached:/);
    }
  );
});

describe('une garde rouge du projet sans SARIF', () => {
  it('n’est pas le rouge du développeur aux contrôles du plan : elle attend la passe finale, nommée dans leur rapport', () => {
    const c = jouer(GARDE_SANS_SARIF, false, ['packages/forms', 'packages/binder']);
    expect(c.rouge).toBe(false);
    expect(c.auDeveloppeur).toBe(false);
    expect(c.rouges).toEqual([]);
    expect(c.resume).toContain('laissés à la passe finale, 1 rouge(s) hors du plan');
    expect(c.texte).toContain('Laissés à la passe finale (1) :');
    expect(c.tous.map(r => [r.dansLePlan, r.texte.startsWith('tâche //#gardes rouge')])).toEqual([
      [false, true],
    ]);
  });

  it('est rouge à la passe finale, qu’aucun paquet du plan ne tient : rien pour le développeur', () => {
    const c = jouer(GARDE_SANS_SARIF, true, ['packages/forms', 'packages/binder']);
    expect(c.rouge).toBe(true);
    expect(c.auDeveloppeur).toBe(false);
  });
});
