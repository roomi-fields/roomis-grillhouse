// The registry of test results (scripts/registre-des-resultats.mjs) keeps, per branch, the passed
// tests of the last green pass, which the proof of the red reads to tell a test main already holds
// green from a new one — instead of compiling and playing HEAD's version of each test file
// (grillhouse-43l). Each case plays the real git in a repository of trial.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as etatDepot from '../../scripts/etat-du-depot.mjs';
import * as registre from '../../scripts/registre-des-resultats.mjs';

type Etat = { racine: string; commit: string; branche?: string; main?: string; raison?: string };
type Rapport = {
  fichier: string;
  etat: string;
  tests: { nom: string; titre: string; etat: string; message: string }[];
};
type Registre = { commit: string; tests: Record<string, Record<string, string>>; branche: string };
type Rouge = { fichier: string; nom: string };

const etatDuDepot = etatDepot.etatDuDepot as (racine: string) => Etat;
const garderLeRegistre = registre.garderLeRegistre as (etat: Etat, rapports: Rapport[]) => void;
const lireLeRegistre = registre.lireLeRegistre as (racine: string) => Registre | null;
const vertsDuRegistre = registre.vertsDuRegistre as (
  reg: Registre | null,
  fichier: string
) => Set<string>;
const consignerLesRegressions = registre.consignerLesRegressions as (
  etat: Etat,
  rouges: Rouge[],
  reg: Registre | null,
  quand: string
) => void;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'registre-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};

// A repository of trial on main, one commit.
function depot() {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(r, 'init', '-q', '-b', 'main');
  git(r, 'config', 'user.email', 'essai@example.com');
  git(r, 'config', 'user.name', 'essai');
  writeFileSync(path.join(r, 'a.txt'), 'a\n');
  git(r, 'add', '-A');
  git(r, 'commit', '-q', '-m', 'essai');
  return r;
}

const rapport = (racine: string, rel: string, tests: { nom: string; etat: string }[]): Rapport => ({
  fichier: path.join(racine, rel),
  etat: 'passed',
  tests: tests.map(t => ({ ...t, titre: t.nom, message: '' })),
});

describe('registre des résultats', () => {
  it('garde les verts d’une passe et les relit par fichier, les rouges exclus', () => {
    const r = depot();
    const etat = etatDuDepot(r);
    garderLeRegistre(etat, [
      rapport(r, 'tests/a.spec.ts', [
        { nom: 'a passe', etat: 'passed' },
        { nom: 'a casse', etat: 'failed' },
      ]),
      rapport(r, 'tests/b.spec.ts', [{ nom: 'b passe', etat: 'passed' }]),
    ]);
    const reg = lireLeRegistre(r);
    expect(reg?.commit).toBe(etat.commit);
    expect([...vertsDuRegistre(reg, 'tests/a.spec.ts')]).toEqual(['a passe']);
    expect([...vertsDuRegistre(reg, 'tests/b.spec.ts')]).toEqual(['b passe']);
    // Un fichier que le registre ne tient pas : aucun vert (un fichier neuf du lot).
    expect(vertsDuRegistre(reg, 'tests/neuf.spec.ts').size).toBe(0);
  });

  it('lireLeRegistre rend null sans registre', () => {
    expect(lireLeRegistre(depot())).toBeNull();
  });

  it('ne compte pas un registre dont le commit n’est pas un ancêtre de HEAD', () => {
    const r = depot();
    garderLeRegistre(etatDuDepot(r), [
      rapport(r, 'tests/a.spec.ts', [{ nom: 'a passe', etat: 'passed' }]),
    ]);
    // Une autre histoire : le commit du registre n’est plus un ancêtre de HEAD.
    git(r, 'checkout', '-q', '--orphan', 'neuve');
    git(r, 'commit', '-q', '--allow-empty', '-m', 'orpheline');
    git(r, 'branch', '-qM', 'main');
    expect(lireLeRegistre(r)).toBeNull();
  });

  it('consigne une régression (un vert qui rougit) avec son moment, sans doublon', () => {
    const r = depot();
    const etat = etatDuDepot(r);
    garderLeRegistre(etat, [rapport(r, 'tests/a.spec.ts', [{ nom: 'a passe', etat: 'passed' }])]);
    const reg = lireLeRegistre(r);
    const rouges: Rouge[] = [
      { fichier: 'tests/a.spec.ts', nom: 'a passe' }, // était vert → régression
      { fichier: 'tests/a.spec.ts', nom: 'tout neuf' }, // jamais vert → ignoré
    ];
    consignerLesRegressions(etat, rouges, reg, 'jour');
    consignerLesRegressions(etat, rouges, reg, 'jour'); // deux fois : pas de doublon
    const commun = git(r, 'rev-parse', '--path-format=absolute', '--git-common-dir');
    const f = path.join(commun, 'grillhouse', 'regressions', 'main.json');
    expect(existsSync(f)).toBe(true);
    const liste = JSON.parse(readFileSync(f, 'utf8')) as {
      fichier: string;
      nom: string;
      dernierVert: string;
      premierRouge: string;
      quand: string;
    }[];
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({
      fichier: 'tests/a.spec.ts',
      nom: 'a passe',
      dernierVert: reg?.commit,
      premierRouge: etat.commit,
      quand: 'jour',
    });
  });
});
