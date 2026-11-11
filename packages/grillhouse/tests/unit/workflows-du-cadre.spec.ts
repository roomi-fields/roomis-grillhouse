// The frame's workflows of GitHub Actions in a project (scripts/workflows-du-cadre.mjs): the
// template carries the CI of a lot and the night of a shared machine, every job on the repository's
// variable RUNNER, and the update rewrites a workflow that bears the frame's mark, never one of the
// project's own.
//
// Small tests: the template's text and a project's files, without a process.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { erreursDeBase } from '../../scripts/base-des-workflows.mjs';
import { rapport } from '../../scripts/grillhouse-maj.mjs';
import {
  aLaCiDuCadre,
  estDuCadre,
  GABARIT_DES_WORKFLOWS,
  MARQUE,
  poserLesWorkflows,
  WORKFLOWS,
} from '../../scripts/workflows-du-cadre.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const MODELES = path.join(DEPOT, GABARIT_DES_WORKFLOWS);
const modele = (nom: string) => readFileSync(path.join(MODELES, nom), 'utf8');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'workflows-du-cadre-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Job = {
  'runs-on'?: string;
  strategy?: { matrix?: Record<string, unknown> };
  steps?: { run?: string; if?: string }[];
  needs?: string | string[];
};
type Flux = {
  on: Record<string, unknown>;
  env?: Record<string, unknown>;
  jobs: Record<string, Job>;
};
const flux = (nom: string) => parse(modele(nom)) as Flux;
const RUNNER = `\${{ fromJSON(vars.RUNNER || '"ubuntu-latest"') }}`;

describe('the template of the CI of a project', () => {
  it('holds the workflow of a lot and the workflow of the night, each bearing the mark of the frame', () => {
    for (const nom of ['ci.yml', 'nuit.yml']) {
      expect(estDuCadre(modele(nom)), nom).toBe(true);
    }
  });

  it('plays the verification of a lot in guards, tranches and their merge', () => {
    const ci = flux('ci.yml');
    expect(Object.keys(ci.jobs)).toEqual(expect.arrayContaining(['gardes', 'tranches', 'fusion']));
    const runs = Object.values(ci.jobs).flatMap(j => (j.steps ?? []).map(e => e.run ?? ''));
    expect(runs.some(r => r.includes('npm run verifier -- --sans-tests'))).toBe(true);
    expect(runs.some(r => r.includes('--tranche'))).toBe(true);
    expect(runs.some(r => r.includes('grillhouse fusion-des-tranches'))).toBe(true);
    expect(ci.jobs.tranches.strategy?.matrix?.tranche).toHaveLength(Number(ci.env?.TRANCHES));
  });

  it('proves the build in the job of the guards, with no job that packs or builds again', () => {
    const ci = flux('ci.yml');
    expect(Object.keys(ci.jobs)).not.toContain('build');
    expect(modele('ci.yml')).not.toMatch(/npm pack/);
  });

  it('measures a push against the commit before it, and the rest as a complete pass', () => {
    expect(erreursDeBase(modele('ci.yml'))).toEqual([]);
    const etapes = flux('ci.yml').jobs.tranches.steps ?? [];
    expect(
      etapes.some(e => /--base/.test(e.run ?? '') && /github\.event\.before/.test(e.run ?? ''))
    ).toBe(true);
  });

  it('plays a lot on the branch of a ticket that the queue pushes', () => {
    const push = flux('ci.yml').on.push as { branches: string[] };
    expect(push.branches).toContain('agent/**');
  });

  it('plays the night tests out of the poste, in tranches, on a schedule', () => {
    const nuit = flux('nuit.yml');
    expect(nuit.on.schedule).toBeDefined();
    const runs = Object.values(nuit.jobs).flatMap(j => (j.steps ?? []).map(e => e.run ?? ''));
    expect(
      runs.some(
        r => r.includes('grillhouse tests-de-nuit --hors-du-poste') && r.includes('--tranche')
      )
    ).toBe(true);
    expect(runs.some(r => r.includes('grillhouse fusion-des-tranches'))).toBe(true);
    expect(nuit.jobs.tranches.strategy?.matrix?.tranche).toHaveLength(Number(nuit.env?.TRANCHES));
  });

  it('runs every job on the variable RUNNER of the repository, ubuntu-latest without it', () => {
    for (const nom of ['ci.yml', 'nuit.yml']) {
      for (const [job, j] of Object.entries(flux(nom).jobs)) {
        expect(j['runs-on'], `${nom} : ${job}`).toBe(RUNNER);
      }
    }
  });

  it('writes no value of the variable RUNNER', () => {
    for (const nom of ['ci.yml', 'nuit.yml']) {
      expect(modele(nom), nom).not.toMatch(/^\s*RUNNER\s*:/m);
    }
  });
});

// A project at a new path, its workflows <fichiers> by name.
function projet(fichiers: Record<string, string>) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  mkdirSync(path.join(p, WORKFLOWS), { recursive: true });
  for (const [nom, texte] of Object.entries(fichiers)) {
    writeFileSync(path.join(p, WORKFLOWS, nom), texte);
  }
  return p;
}
const lire = (p: string, nom: string) => readFileSync(path.join(p, WORKFLOWS, nom), 'utf8');
const ANCIEN = `${MARQUE} depuis le gabarit du cadre.\nname: CI\non: push\njobs: {}\n`;
const DU_PROJET = 'name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps: []\n';

describe('the update of the workflows of a project', () => {
  it('rewrites a workflow of the frame to the template, and writes the one it lacks', () => {
    const p = projet({ 'ci.yml': ANCIEN });
    expect(poserLesWorkflows(p, DEPOT)).toEqual([`${WORKFLOWS}/ci.yml`, `${WORKFLOWS}/nuit.yml`]);
    expect(lire(p, 'ci.yml')).toBe(modele('ci.yml'));
    expect(lire(p, 'nuit.yml')).toBe(modele('nuit.yml'));
  });

  it('leaves a workflow of the project, without the mark, as it is', () => {
    const p = projet({ 'ci.yml': ANCIEN, 'nuit.yml': DU_PROJET });
    expect(poserLesWorkflows(p, DEPOT)).toEqual([`${WORKFLOWS}/ci.yml`]);
    expect(lire(p, 'nuit.yml')).toBe(DU_PROJET);
  });

  it('writes nothing in a project that holds no workflow of the frame', () => {
    const p = projet({ 'ci.yml': DU_PROJET });
    expect(aLaCiDuCadre(p)).toBe(false);
    expect(poserLesWorkflows(p, DEPOT)).toEqual([]);
    expect(lire(p, 'ci.yml')).toBe(DU_PROJET);
    const vide = mkdtempSync(path.join(ESSAIS, 'vide-'));
    expect(poserLesWorkflows(vide, DEPOT)).toEqual([]);
  });

  it('replayed, changes nothing', () => {
    const p = projet({ 'ci.yml': ANCIEN });
    poserLesWorkflows(p, DEPOT);
    expect(poserLesWorkflows(p, DEPOT)).toEqual([]);
    expect(lire(p, 'ci.yml')).toBe(modele('ci.yml'));
  });

  it('reports the workflows written, and that their machine is the variable RUNNER', () => {
    const b = {
      dependances: [],
      gardes: null,
      ligneEtat: false,
      greffon: false,
      workflows: [`${WORKFLOWS}/nuit.yml`],
      duLangage: { lignes: [], aFaire: [], installer: false, sansVerifier: null },
    };
    const texte = rapport(b);
    expect(texte).toContain(`${WORKFLOWS}/nuit.yml`);
    expect(texte).toContain('RUNNER');
    expect(rapport({ ...b, workflows: [] })).not.toContain('RUNNER');
  });
});
