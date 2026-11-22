// Une garde qui lit le produit d'une construction ne part pas avant cette construction (une tâche
// de Turborepo qui lit un `dist/` l'attend par son `dependsOn`, comme les deps d'une cible Bazel) :
// la commande `construire --gardes` de chaque module joue ce que les tâches de gardes de la racine
// attendent dans le graphe, lu dans le plan à blanc de ces tâches, sans jouer les gardes. Une seule
// implémentation pour tout langage. Joué contre le faux Turborepo (./faux-turbo.ts).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Langage } from '../../scripts/jointure.js';
import c from '../../scripts/langages/c/index.mjs';
import cargo from '../../scripts/langages/cargo/index.mjs';
import python from '../../scripts/langages/python/index.mjs';
import typescript from '../../scripts/langages/typescript/index.mjs';
import { appelsDeTurbo, installerFauxTurbo } from './faux-turbo.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'construire-pour-les-gardes-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const JOURNAL = path.join(ESSAIS, 'journal-turbo');
let faux: string;
beforeAll(() => {
  faux = installerFauxTurbo(ESSAIS);
});

const MODULES: [string, Langage][] = [
  ['typescript', typescript as unknown as Langage],
  ['cargo', cargo as unknown as Langage],
  ['python', python as unknown as Langage],
  ['c', c as unknown as Langage],
];

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

// Une copie de deux paquets, dont la racine porte les scripts de gardes <scripts>.
function copie(scripts: Record<string, string>) {
  const r = mkdtempSync(path.join(ESSAIS, 'copie-'));
  ecrire(
    r,
    'package.json',
    JSON.stringify({ name: 'essai', private: true, workspaces: ['packages/*'], scripts })
  );
  ecrire(r, 'packages/noyau/package.json', JSON.stringify({ name: 'noyau' }));
  ecrire(r, 'packages/site/package.json', JSON.stringify({ name: 'site' }));
  return r;
}

const tache = (taskId: string) => ({
  taskId,
  task: taskId.slice(taskId.indexOf('#') + 1),
  package: taskId.slice(0, taskId.indexOf('#')),
  dependencies: [],
});
// Le plan à blanc des deux tâches de gardes : elles attendent la construction de chaque paquet.
const PLAN = {
  tasks: ['//#grillhouse:gardes', '//#gardes', 'site#build', 'noyau#build'].map(tache),
};
const GARDES = { 'grillhouse:gardes': 'grillhouse gardes-du-cadre', gardes: 'node gardes.mjs' };

// La commande `construire --gardes` de <module> dans <racine> : son code et les appels de Turborepo.
function construire(module: Langage, racine: string, env: NodeJS.ProcessEnv = {}) {
  writeFileSync(JOURNAL, '');
  const commande = module.commandes(racine).construire!;
  const r = spawnSync(process.execPath, [commande.script, ...commande.args, '--gardes'], {
    cwd: racine,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${faux}${path.delimiter}${process.env.PATH ?? ''}`,
      FAUX_TURBO_JOURNAL: JOURNAL,
      FAUX_TURBO_PLAN: JSON.stringify(PLAN),
      ...env,
    },
  });
  const appels = appelsDeTurbo(JOURNAL).map(a => a.args);
  return {
    code: r.status,
    stderr: r.stderr,
    plans: appels.filter(a => a.includes('--dry=json')),
    jouees: appels.filter(a => !a.includes('--dry=json')),
  };
}

describe('la construction que les gardes attendent, lue dans le graphe', () => {
  it('lit le plan des tâches de gardes de la racine, puis joue ce qu’elles attendent, jamais les gardes', () => {
    const racine = copie(GARDES);
    for (const [langage, module] of MODULES) {
      const r = construire(module, racine);
      expect(r.code, `${langage} : ${r.stderr}`).toBe(0);
      expect(r.plans, langage).toEqual([['run', 'grillhouse:gardes', 'gardes', '--dry=json']]);
      expect(r.jouees, langage).toHaveLength(1);
      expect(r.jouees[0]!.slice(0, 3), langage).toEqual(['run', 'noyau#build', 'site#build']);
      expect(r.jouees[0], langage).toContain('--continue=dependencies-successful');
      expect(r.jouees[0], langage).not.toContain('gardes');
      expect(r.jouees[0], langage).not.toContain('//#gardes');
    }
  });

  it('borne les constructions côte à côte à la moitié des cœurs de la part, comme la vérification', () => {
    const racine = copie(GARDES);
    for (const [langage, module] of MODULES) {
      const r = construire(module, racine, { GRILLHOUSE_TRAVAILLEURS: '6' });
      expect(r.jouees[0], `${langage} : ${r.stderr}`).toContain('--concurrency=3');
      const un = construire(module, racine, { GRILLHOUSE_TRAVAILLEURS: '1' });
      expect(un.jouees[0], langage).toContain('--concurrency=1');
    }
  });

  it('ne nomme que les scripts de gardes que la racine porte', () => {
    const racine = copie({ 'grillhouse:gardes': GARDES['grillhouse:gardes'] });
    for (const [langage, module] of MODULES) {
      const r = construire(module, racine);
      expect(r.plans, `${langage} : ${r.stderr}`).toEqual([
        ['run', 'grillhouse:gardes', '--dry=json'],
      ]);
    }
  });

  it('une racine sans script de gardes ne lit aucun plan et ne construit rien (0)', () => {
    const racine = copie({});
    for (const [langage, module] of MODULES) {
      const r = construire(module, racine);
      expect(r.code, `${langage} : ${r.stderr}`).toBe(0);
      expect([...r.plans, ...r.jouees], langage).toEqual([]);
    }
  });

  it('des gardes qui n’attendent aucune construction ne jouent rien (0)', () => {
    const racine = copie(GARDES);
    for (const [langage, module] of MODULES) {
      const r = construire(module, racine, {
        FAUX_TURBO_PLAN: JSON.stringify({ tasks: PLAN.tasks.slice(0, 2) }),
      });
      expect(r.code, `${langage} : ${r.stderr}`).toBe(0);
      expect(r.jouees, langage).toEqual([]);
    }
  });

  it('une construction rouge rend son code, que les contrôles lisent', () => {
    const racine = copie(GARDES);
    for (const [langage, module] of MODULES) {
      expect(construire(module, racine, { FAUX_TURBO_CODE: '1' }).code, langage).toBe(1);
    }
  });

  it('un plan à blanc que Turborepo refuse est une faute nommée (1), sans rien jouer', () => {
    const racine = copie(GARDES);
    for (const [langage, module] of MODULES) {
      const r = construire(module, racine, { FAUX_TURBO_CODE_DRY: '1' });
      expect(r.code, langage).toBe(1);
      expect(r.stderr, langage).toContain('--dry=json échoue');
      expect(r.jouees, langage).toEqual([]);
    }
  });
});
