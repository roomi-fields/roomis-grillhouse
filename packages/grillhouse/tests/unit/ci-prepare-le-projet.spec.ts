// The frame's workflows play the project's preparation script `ci:preparer` (npm's
// `--if-present`, so a project without it changes nothing) after `npm ci` and before the binaries
// of the languages and the verification, in each job that verifies or tests; the job that merges
// reports verifies nothing and gets none. The update (`grillhouse maj`) carries the step to a
// project's copy that bears the frame's mark, and leaves a copy without the mark alone.
//
// Small tests: the text of the workflows, and the update called by its interface.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { mettreAJour } from '../../scripts/grillhouse-maj.mjs';
import { MARQUE } from '../../scripts/workflows-du-cadre.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const GABARIT = path.join(DEPOT, 'templates/projet/.github/workflows');
const CADRE = path.join(DEPOT, '.github/workflows');
const PREPARER = 'npm run --if-present ci:preparer';

type Etape = { name?: string; run?: string; uses?: string };
type Flux = { jobs: Record<string, { steps?: Etape[] }> };

const jobs = (fichier: string) => (parse(readFileSync(fichier, 'utf8')) as Flux).jobs;

const indexDe = (etapes: Etape[], motif: RegExp) => etapes.findIndex(e => motif.test(e.run ?? ''));

// [file, job] pairs that verify or test, per workflow.
const QUI_VERIFIE: Record<string, string[]> = {
  'ci.yml': ['gardes', 'tranches'],
  'machine-vierge.yml': ['verification'],
  'nuit.yml': ['tranches'],
};

function jouePreparer(dossier: string, fichier: string, job: string) {
  const etapes = jobs(path.join(dossier, fichier))[job]?.steps ?? [];
  const install = indexDe(etapes, /^npm ci$/);
  const preparer = indexDe(etapes, /ci:preparer/);
  expect(install, `${fichier} ${job}: npm ci`).toBeGreaterThanOrEqual(0);
  expect(etapes[preparer]?.run?.trim(), `${fichier} ${job}: the step`).toBe(PREPARER);
  expect(preparer, `${fichier} ${job}: after npm ci`).toBeGreaterThan(install);
  const binaires = indexDe(etapes, /grillhouse binaires/);
  if (binaires >= 0) {
    expect(preparer, `${fichier} ${job}: before the binaries`).toBeLessThan(binaires);
  }
  // The night plays the night tests; the other workflows play `npm run verifier`.
  const verif = indexDe(
    etapes,
    fichier === 'nuit.yml' ? /grillhouse tests-de-nuit/ : /npm run verifier/
  );
  expect(verif, `${fichier} ${job}: verification`).toBeGreaterThanOrEqual(0);
  expect(preparer, `${fichier} ${job}: before the verification`).toBeLessThan(verif);
}

describe('the template workflows play the preparation of the project', () => {
  for (const [fichier, liste] of Object.entries(QUI_VERIFIE)) {
    for (const job of liste) {
      it(`${fichier}: the job ${job} plays ci:preparer after npm ci, before the binaries and the verification`, () => {
        jouePreparer(GABARIT, fichier, job);
      });
    }
  }

  it('ci.yml: the job that merges the reports plays no preparation', () => {
    const etapes = jobs(path.join(GABARIT, 'ci.yml')).fusion?.steps ?? [];
    expect(etapes.some(e => /ci:preparer/.test(e.run ?? ''))).toBe(false);
  });
});

describe("the frame's own workflows play the preparation like the template's", () => {
  for (const [fichier, liste] of Object.entries({
    'ci.yml': ['gardes', 'tranches'],
    'nuit.yml': ['tranches'],
  })) {
    for (const job of liste) {
      it(`${fichier}: the job ${job} plays ci:preparer after npm ci, before the verification`, () => {
        jouePreparer(CADRE, fichier, job);
      });
    }
  }

  it.each(['fusion', 'build'])('ci.yml: the job %s plays no preparation', job => {
    const etapes = jobs(path.join(CADRE, 'ci.yml'))[job]?.steps ?? [];
    expect(etapes.some(e => /ci:preparer/.test(e.run ?? ''))).toBe(false);
  });
});

describe('the update carries the preparation step to the project', () => {
  const ESSAIS = mkdtempSync(path.join(tmpdir(), 'grillhouse-ci-preparer-'));
  afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

  const ecrire = (racine: string, f: string, contenu: string) => {
    mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
    writeFileSync(path.join(racine, f), contenu);
  };
  const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
  const ANCIEN = `${MARQUE} depuis le gabarit du cadre.\nname: CI\non: workflow_dispatch\njobs: {}\n`;
  const DU_PROJET =
    'name: CI\non: push\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: npm ci\n';

  function projet(ymls: Record<string, string>) {
    const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
    ecrire(
      racine,
      'package.json',
      `${JSON.stringify({ name: 'p', private: true, workspaces: ['packages/*'] })}\n`
    );
    declarerLesLangages(racine, { 'packages/a': 'typescript' });
    ecrire(racine, 'packages/a/package.json', `${JSON.stringify({ name: '@p/a' })}\n`);
    for (const [f, contenu] of Object.entries(ymls)) {
      ecrire(racine, `.github/workflows/${f}`, contenu);
    }
    return racine;
  }

  it('rewrites the marked ci.yml, machine-vierge.yml and nuit.yml with the step', () => {
    const racine = projet({
      'ci.yml': ANCIEN,
      'machine-vierge.yml': ANCIEN,
      'nuit.yml': ANCIEN,
    });
    mettreAJour(racine, DEPOT);
    for (const f of ['ci.yml', 'machine-vierge.yml', 'nuit.yml']) {
      expect(lire(racine, `.github/workflows/${f}`), f).toContain(PREPARER);
    }
  });

  it('leaves a copy without the mark as the project wrote it', () => {
    const racine = projet({ 'ci.yml': ANCIEN, 'nuit.yml': DU_PROJET });
    mettreAJour(racine, DEPOT);
    expect(lire(racine, '.github/workflows/nuit.yml')).toBe(DU_PROJET);
  });

  it('adds no step to a project that holds no workflow of the frame', () => {
    const racine = projet({ 'ci.yml': DU_PROJET });
    mettreAJour(racine, DEPOT);
    expect(lire(racine, '.github/workflows/ci.yml')).toBe(DU_PROJET);
  });
});
