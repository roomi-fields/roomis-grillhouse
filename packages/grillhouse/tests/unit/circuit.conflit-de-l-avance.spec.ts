// Un conflit de l'avance d'une copie va au rôle qui écrit ses fichiers, sans monter au superviseur
// (scripts/etapes.mjs GESTES, scripts/enveloppe/travail-de-la-copie.mjs `rolesDuConflit`,
// scripts/circuit.mjs `avantLaPasse`).
//
// Interface attendue :
// - `rolesDuConflit(fichiers, estUnTest)` : `{ testwriter: string[], developpeur: string[] }`, les
//   fichiers de chaque rôle (testwriter : `estUnTest(f)` non nul), et `roles`, l'ordre des séances :
//   le testwriter d'abord, puis le développeur, un rôle sans fichier absent.
// - `avantLaPasse(ctx, etape, regeneration, env, { estUnTest })` : sur une copie en conflit, rend
//   `{ conflit: { fichiers, roles } }` sans `arret` ; `ctx.conflitsRelances` (les rôles déjà relancés
//   pour ce conflit) : un rôle déjà relancé dont des fichiers restent en conflit rend l'arrêt
//   « lancement », chaque fichier encore en conflit nommé.
// - le geste `conflit-de-l-avance` de GESTES.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { avantLaPasse } from '../../scripts/circuit.mjs';
import { GESTES, gesteDe } from '../../scripts/etapes.mjs';
import { rolesDuConflit } from '../../scripts/enveloppe/travail-de-la-copie.mjs';

interface Repartition {
  testwriter: string[];
  developpeur: string[];
  roles: string[];
}
const repartir = rolesDuConflit as unknown as (
  fichiers: string[],
  estUnTest: (f: string) => unknown
) => Repartition;
const avant = avantLaPasse as unknown as (
  ctx: Record<string, unknown>,
  etape: string,
  regeneration: unknown,
  env: NodeJS.ProcessEnv,
  o: { estUnTest: (f: string) => unknown }
) => {
  arret?: { nom: string; rapport: string; piece: string };
  conflit?: { fichiers: string[]; roles: string[] };
};

const estUnTest = (f: string) => (f.endsWith('.spec.txt') || f.startsWith('tests/') ? {} : null);

describe('les fichiers en conflit vont au rôle qui les écrit', () => {
  it('un fichier de test va au testwriter seul', () => {
    const r = repartir(['x.spec.txt'], estUnTest);
    expect(r.roles).toEqual(['testwriter']);
    expect(r.testwriter).toEqual(['x.spec.txt']);
    expect(r.developpeur).toEqual([]);
  });

  it('la matière de test partagée, que estUnTest désigne, va au testwriter', () => {
    const r = repartir(['tests/common/serve.rs'], estUnTest);
    expect(r.roles).toEqual(['testwriter']);
  });

  it('un fichier de code va au développeur seul', () => {
    const r = repartir(['src/a.txt'], estUnTest);
    expect(r.roles).toEqual(['developpeur']);
    expect(r.developpeur).toEqual(['src/a.txt']);
  });

  it('des fichiers des deux rôles relancent le testwriter d’abord, puis le développeur', () => {
    const r = repartir(['src/a.txt', 'x.spec.txt', 'tests/y.txt'], estUnTest);
    expect(r.roles).toEqual(['testwriter', 'developpeur']);
    expect(r.testwriter).toEqual(['x.spec.txt', 'tests/y.txt']);
    expect(r.developpeur).toEqual(['src/a.txt']);
  });
});

describe('le geste du conflit de l’avance est une règle du circuit', () => {
  it('est enregistré dans GESTES avec son geste, sa règle et son cas', () => {
    const g = gesteDe('conflit-de-l-avance');
    expect(g).not.toBeNull();
    expect(GESTES.filter((x: { genre: string }) => x.genre === 'conflit-de-l-avance')).toHaveLength(
      1
    );
    expect(g.geste).toMatch(/testwriter/);
    expect(g.geste).toMatch(/développeur/);
    expect(g.regle).toMatch(/estUnTest/);
    expect(g.cas).toMatch(/SH-b52\.2|SH-br0\.3/);
  });
});

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-conflit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};
const lignes = (d: string) => `l1\n${d}\nl3\nl4\nl5\nl6\nl7\n`;

// Une copie dont l'avance sur main laisse des conflits sur <fichiers>.
function copieEnConflit(fichiers: string[]) {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  writeFileSync(path.join(racine, '.gitignore'), '.claude/worktrees/\n');
  for (const f of fichiers) {
    writeFileSync(path.join(racine, f), lignes('base'));
  }
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'base');
  const copie = path.join(racine, '.claude/worktrees/demo-1');
  git(racine, 'worktree', 'add', '-q', '-b', 'agent/demo-1', copie, 'HEAD');
  for (const f of fichiers) {
    writeFileSync(path.join(racine, f), lignes('MAIN'));
  }
  git(racine, 'commit', '-qam', 'main');
  for (const f of fichiers) {
    writeFileSync(path.join(copie, f), lignes('COPIE'));
  }
  return { racine, copie, ticket: 'demo-1', journal: `${copie}.log` };
}

describe('l’avance en conflit avant une passe relance le rôle, sans arrêt', () => {
  it('un conflit sur un fichier de test rend le testwriter, sans arrêt, le fichier nommé', () => {
    const ctx = copieEnConflit(['x.spec.txt']);
    const r = avant(ctx, 'controles', null, process.env, { estUnTest });
    expect(r.arret).toBeUndefined();
    expect(r.conflit?.roles).toEqual(['testwriter']);
    expect(r.conflit?.fichiers).toEqual(['x.spec.txt']);
  });

  it('un conflit sur les fichiers des deux rôles rend le testwriter d’abord, puis le développeur', () => {
    const ctx = copieEnConflit(['x.spec.txt', 'src.txt']);
    const r = avant(ctx, 'controles', null, process.env, { estUnTest });
    expect(r.arret).toBeUndefined();
    expect(r.conflit?.roles).toEqual(['testwriter', 'developpeur']);
    expect([...(r.conflit?.fichiers ?? [])].sort()).toEqual(['src.txt', 'x.spec.txt']);
  });

  it('un conflit qu’une deuxième séance du rôle ne lève pas monte au superviseur, chaque fichier nommé', () => {
    const ctx = copieEnConflit(['x.spec.txt', 'y.spec.txt']);
    const r = avant({ ...ctx, conflitsRelances: ['testwriter'] }, 'controles', null, process.env, {
      estUnTest,
    });
    expect(r.conflit).toBeUndefined();
    expect(r.arret?.nom).toBe('lancement');
    expect(r.arret?.rapport).toMatch(/^ {2}x\.spec\.txt$/m);
    expect(r.arret?.rapport).toMatch(/^ {2}y\.spec\.txt$/m);
  });

  it('le testwriter déjà relancé, le conflit restant du développeur rend encore le développeur', () => {
    const ctx = copieEnConflit(['src.txt']);
    const r = avant({ ...ctx, conflitsRelances: ['testwriter'] }, 'controles', null, process.env, {
      estUnTest,
    });
    expect(r.arret).toBeUndefined();
    expect(r.conflit?.roles).toEqual(['developpeur']);
  });
});
