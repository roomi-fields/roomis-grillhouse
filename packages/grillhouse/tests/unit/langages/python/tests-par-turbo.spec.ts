// grillhouse-44b.5, critères 1, 6, 7, 8 et 9 — le module python joue ses tests par les tâches de
// Turborepo, comme le module cargo (../cargo/tests-par-turbo.spec.ts) et TypeScript : `tester`
// lance `turbo run test:unit` sur les projets, les chemins nommés passant par `GRILLHOUSE_TESTS` ;
// le script `test:unit` d'un projet appelle `tests-du-paquet`, qui joue pytest sans relancer
// Turborepo ; aucune sélection par le dernier vert. Joué contre le faux uv (./faux-uv.ts) et le
// faux Turborepo (../../faux-turbo.ts).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/python/index.mjs';
import { appelsDeTurbo, installerFauxTurbo } from '../../faux-turbo.js';
import { installerFauxUv } from './faux-uv.js';

const python = module as unknown as Langage;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'python-par-turbo-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const JOURNAL = path.join(ESSAIS, 'journal-uv');
const JOURNAL_TURBO = path.join(ESSAIS, 'journal-turbo');
let uv: string;
let turbo: string;
beforeAll(() => {
  uv = installerFauxUv(ESSAIS);
  turbo = installerFauxTurbo(ESSAIS);
});

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

// Deux projets Python, `site` et `autre`, paquets du graphe (leur package.json, grillhouse-44b.4),
// chacun avec son verrou et un test.
function projet() {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(
    racine,
    'package.json',
    JSON.stringify({ name: 'p', private: true, workspaces: ['site', 'autre'] })
  );
  declarerLesLangages(racine, { site: 'python', autre: 'python' });
  for (const p of ['site', 'autre']) {
    ecrire(
      racine,
      `${p}/package.json`,
      JSON.stringify({
        name: p,
        private: true,
        scripts: { 'test:unit': `grillhouse tests-du-paquet ${p}` },
      })
    );
    ecrire(
      racine,
      `${p}/pyproject.toml`,
      `[project]\nname = "${p}"\nversion = "0.1.0"\n\n[dependency-groups]\ntest = ["pytest>=8"]\n`
    );
    ecrire(racine, `${p}/uv.lock`, 'version = 1\n');
    ecrire(racine, `${p}/test_${p}.py`, 'def test_x():\n    assert True\n');
  }
  return racine;
}

function lancer(racine: string, nom: string, args: string[] = [], env: NodeJS.ProcessEnv = {}) {
  writeFileSync(JOURNAL, '');
  writeFileSync(JOURNAL_TURBO, '');
  const c = python.commandes(racine)[nom]!;
  const r = spawnSync(process.execPath, [c.script, ...c.args, ...args], {
    cwd: racine,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${turbo}${path.delimiter}${uv}${path.delimiter}${process.env.PATH ?? ''}`,
      GRILLHOUSE_RESULTATS: mkdtempSync(path.join(ESSAIS, 'resultats-')),
      FAUX_UV_JOURNAL: JOURNAL,
      FAUX_TURBO_JOURNAL: JOURNAL_TURBO,
      ...env,
    },
  });
  const appels = readFileSync(JOURNAL, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as { args: string[]; cwd: string })
    .filter(a => !a.args.includes('--version'));
  return { code: r.status, stderr: r.stderr, appels, turbo: appelsDeTurbo(JOURNAL_TURBO) };
}

const filtres = (args: string[]) => args.filter(a => a.startsWith('--filter=')).sort();
const nommes = (tests: string | null) =>
  (JSON.parse(tests ?? '{"arguments":[]}') as { arguments: string[] }).arguments;

describe('grillhouse-44b.5, critères 1 et 6 — tester lance les tâches de Turborepo', () => {
  it('critère 6: sans chemin, un seul `turbo run test:unit` sur les projets, pytest jamais lancé', () => {
    const racine = projet();
    const r = lancer(racine, 'tester');
    expect(r.code, r.stderr).toBe(0);
    expect(r.appels).toEqual([]);
    expect(r.turbo).toHaveLength(1);
    expect(r.turbo[0]!.args.slice(0, 2)).toEqual(['run', 'test:unit']);
    expect(filtres(r.turbo[0]!.args)).toEqual(
      expect.arrayContaining(['--filter=autre', '--filter=site'])
    );
  });

  it('critère 6: un chemin de test choisit le projet qui le tient, et passe, absolu, par la variable', () => {
    const racine = projet();
    const r = lancer(racine, 'tester', ['site/test_site.py']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.appels).toEqual([]);
    expect(filtres(r.turbo[0]!.args)).toEqual(['--filter=site']);
    expect(nommes(r.turbo[0]!.tests)).toEqual([path.join(racine, 'site/test_site.py')]);
  });

  it('critère 6: deux chemins de deux projets : leurs filtres, triés', () => {
    const racine = projet();
    const r = lancer(racine, 'tester', ['site/test_site.py', 'autre']);
    expect(filtres(r.turbo[0]!.args)).toEqual(['--filter=autre', '--filter=site']);
  });

  it('critère 6: un chemin hors de tout projet est refusé (2), Turborepo jamais lancé', () => {
    const racine = projet();
    const r = lancer(racine, 'tester', ['ailleurs/test_x.py']);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/ailleurs/);
    expect(r.turbo).toEqual([]);
  });

  it('critère 6: le code de Turborepo est celui de tester', () => {
    expect(lancer(projet(), 'tester', [], { FAUX_TURBO_CODE: '1' }).code).toBe(1);
  });

  it('critère 1: la marque du circuit ne change plus l’appel : aucune sélection par le dernier vert', () => {
    const racine = projet();
    const sans = lancer(racine, 'tester');
    const avec = lancer(racine, 'tester', [], { GRILLHOUSE_DEPUIS_LE_VERT: '1' });
    expect(avec.turbo[0]!.args).toEqual(sans.turbo[0]!.args);
    expect(avec.appels).toEqual([]);
  });
});

describe('grillhouse-44b.5, critère 8 — --force rejoue pour de vrai', () => {
  it('sans chemin, --force : `--force` à Turborepo, ou le moment du rejeu dans la variable', () => {
    const t = lancer(projet(), 'tester', ['--force']).turbo[0]!;
    const moment = (JSON.parse(t.tests ?? '{}') as { rejouer?: string }).rejouer;
    expect(t.args.includes('--force') || typeof moment === 'string').toBe(true);
  });

  it('avec un chemin, --force change la variable des tests : le hash de la tâche change', () => {
    const racine = projet();
    const sans = lancer(racine, 'tester', ['site/test_site.py']).turbo[0]!;
    const force = lancer(racine, 'tester', ['site/test_site.py', '--force']).turbo[0]!;
    expect(force.tests).not.toBe(sans.tests);
    expect((JSON.parse(force.tests!) as { rejouer?: string }).rejouer).toEqual(expect.any(String));
  });

  it('sans --force, la variable ne porte aucun moment : un projet inchangé est relu du cache', () => {
    const racine = projet();
    const t = lancer(racine, 'tester', ['site/test_site.py']).turbo[0]!;
    expect(JSON.parse(t.tests!)).not.toHaveProperty('rejouer');
    expect(lancer(racine, 'tester', ['site/test_site.py']).turbo[0]!.tests).toBe(t.tests);
  });
});

describe('grillhouse-44b.5, critère 7 — le corps de la tâche est une commande du module', () => {
  it('`tests-du-paquet` est une commande décrite du module, distincte de tester', () => {
    const c = python.commandes(projet());
    expect(Object.keys(c)).toContain('tests-du-paquet');
    expect(c['tests-du-paquet']).not.toEqual(c.tester);
  });

  it('un projet : pytest dans son dossier seul, sans relancer Turborepo', () => {
    const racine = projet();
    const r = lancer(racine, 'tests-du-paquet', ['site']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.turbo).toEqual([]);
    expect(r.appels).toHaveLength(1);
    expect(r.appels[0]!.args).toContain('pytest');
    expect(r.appels[0]!.cwd).toBe(path.join(racine, 'site'));
  });

  it('un autre projet : le sien seul', () => {
    const racine = projet();
    const r = lancer(racine, 'tests-du-paquet', ['autre']);
    expect(r.appels.map(a => a.cwd)).toEqual([path.join(racine, 'autre')]);
  });

  it('un pytest rouge rend la commande rouge', () => {
    const racine = projet();
    const r = lancer(racine, 'tests-du-paquet', ['site'], {
      FAUX_UV_CODES: JSON.stringify({ pytest: 1 }),
    });
    expect(r.code).not.toBe(0);
    expect(r.turbo).toEqual([]);
  });

  it('un chemin hors de tout projet est refusé (2), pytest jamais lancé', () => {
    const r = lancer(projet(), 'tests-du-paquet', ['ailleurs']);
    expect(r.code).toBe(2);
    expect(r.appels).toEqual([]);
  });
});

describe('grillhouse-44b.5, critères 1 et 9 — verifier joue les tâches de Turborepo et ne pose aucun vert', () => {
  it('critère 1: verifier lance `turbo run … test:unit` sur les projets', () => {
    const r = lancer(projet(), 'verifier', ['--tout']);
    expect(r.code, r.stderr).toBe(0);
    const test = r.turbo.find(a => a.args.includes('test:unit'));
    expect(test, JSON.stringify(r.turbo)).toBeDefined();
    expect(test!.args[0]).toBe('run');
    expect(r.appels.filter(a => a.args.includes('pytest'))).toEqual([]);
  });

  it('critère 9: aucun vert posé par le module python, vert ou non', () => {
    const racine = projet();
    const vert = path.join(racine, '.git/grillhouse/dernier-vert/main.json');
    expect(lancer(racine, 'verifier', ['--tout']).code).toBe(0);
    expect(existsSync(vert)).toBe(false);
    expect(lancer(racine, 'verifier', [], { FAUX_TURBO_CODE: '1' }).code).not.toBe(0);
    expect(existsSync(vert)).toBe(false);
  });

  it('critère 1: une tâche rouge de Turborepo rend verifier rouge', () => {
    expect(lancer(projet(), 'verifier', ['--tout'], { FAUX_TURBO_CODE: '1' }).code).toBe(1);
  });

  it('critère 9: sous GRAPHE_JOUE (le module du graphe a passé), verifier ne lance aucune tâche test:unit ni pytest', () => {
    const r = lancer(projet(), 'verifier', ['--tout'], { GRILLHOUSE_GRAPHE_JOUE: '1' });
    expect(r.code, r.stderr).toBe(0);
    expect(r.turbo.some(a => a.args.includes('test:unit'))).toBe(false);
    expect(r.appels.filter(a => a.args.includes('pytest'))).toEqual([]);
  });
});
