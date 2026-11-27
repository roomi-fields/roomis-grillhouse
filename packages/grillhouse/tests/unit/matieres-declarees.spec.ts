// A project declares a folder out of every package as test material, under `grillhouse.matieres`
// of its root package.json (scripts/matieres-cles.mjs), as Bazel declares a `filegroup(testonly)`
// named in the `data` of a test, and as the compiler of Rust keeps `tests/ui` at its root, out of
// every crate, its cases added with the code. The testwriter writes any file under it; the
// developpeur does not. Witness: OSD, 2026-11-21, `conformance/` at the root, its cases refused to
// the testwriter by the lock.
//
// Each case reads the answer of `estUnTest` of the join of the languages, the conflict roles and
// the mounts of the envelope (`plan`), on a project of trial.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as circuit from '../../scripts/circuit.mjs';
import * as enveloppe from '../../scripts/enveloppe/enveloppe.mjs';
import { rolesDuConflit } from '../../scripts/enveloppe/travail-de-la-copie.mjs';
import { langageDe } from '../../scripts/langages.mjs';

// The reader of the key, loaded by its path so that each case fails alone while the module is
// absent.
type Lecteur = { matieresDeclareesDe: (dir: string) => string[] };
const lecteur = (await import('../../scripts/matieres-cles.mjs' as string).catch(
  () => ({})
)) as Partial<Lecteur>;
const matieresDeclareesDe = (dir: string): string[] => {
  if (!lecteur.matieresDeclareesDe) {
    throw new Error('scripts/matieres-cles.mjs ne publie pas matieresDeclareesDe');
  }
  return lecteur.matieresDeclareesDe(dir);
};
const { ARRETS } = circuit;
const { plan } = enveloppe;
type Arret = { code: number; nom: string; rapport: string; piece: string; question: string };
const matieresAuLancement = (racine: string): { matieres?: string[]; arret?: Arret } =>
  (circuit as unknown as Record<string, (r: string) => { matieres?: string[]; arret?: Arret }>)[
    'matieresAuLancement'
  ]!(racine);
const matieresDeLaCopie = (l: unknown, copie: string): string[] =>
  (enveloppe as unknown as Record<string, (l: unknown, c: string) => string[]>)[
    'matieresDeLaCopie'
  ]!(l, copie);

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'matieres-declarees-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const CAS = 'conformance/0.6/read/cas-1/descriptor.json';
const MATIERE = { joue: false, test: false, matiere: true };

let n = 0;
// A project of trial: packages `packages/a` and `packages/m` (the shared test material), a folder
// `conformance` at the root, out of every package, and the key <matieres> when given.
function projet(matieres?: unknown, dossiers: string[] = []): string {
  const dir = path.join(ESSAIS, `projet-${n++}`);
  const ecrire = (rel: string, contenu: unknown) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), JSON.stringify(contenu));
  };
  ecrire('package.json', {
    name: 'essai',
    workspaces: ['packages/*'],
    ...(matieres === undefined ? {} : { grillhouse: { matieres } }),
  });
  ecrire('packages/a/package.json', { name: 'a' });
  ecrire('packages/m/package.json', { name: 'm', exports: { './test-fixtures': './f.js' } });
  mkdirSync(path.join(dir, 'conformance/0.6/read/cas-1'), { recursive: true });
  for (const d of dossiers) {
    mkdirSync(path.join(dir, d), { recursive: true });
  }
  declarerLesLangages(dir);
  return dir;
}

describe('the key grillhouse.matieres lists the folders of test material', () => {
  it('gives the declared folders, from the root', () => {
    expect(matieresDeclareesDe(projet(['conformance']))).toEqual(['conformance']);
    expect(matieresDeclareesDe(projet(['conformance', 'cas'], ['cas']))).toEqual([
      'conformance',
      'cas',
    ]);
  });

  it('gives none without the key, or with an empty list', () => {
    expect(matieresDeclareesDe(projet())).toEqual([]);
    expect(matieresDeclareesDe(projet([]))).toEqual([]);
  });

  it.each([
    ['a string', 'conformance'],
    ['an object', { conformance: true }],
    ['a list of numbers', [1]],
    ['an empty path', ['']],
    ['an absolute path', ['/etc']],
    ['a path out of the root', ['../dehors']],
    ['a path that climbs out of the root', ['conformance/../../dehors']],
    ['a folder absent of the tree', ['absent']],
    ['a package', ['packages/a']],
    ['a folder that holds packages', ['packages']],
    ['a folder inside a package', ['packages/a/src']],
  ])('refuses %s, the key named, before any work', (_nom, valeur) => {
    const dir = projet(valeur, ['packages/a/src']);
    expect(() => matieresDeclareesDe(dir)).toThrow('grillhouse.matieres');
  });

  it('stops the circuit at its launch, « lancement », before any session, the key named', () => {
    expect(matieresAuLancement(projet(['conformance']))).toMatchObject({
      matieres: ['conformance'],
    });
    const { arret, matieres } = matieresAuLancement(projet(['packages/a']));
    expect(matieres).toBeUndefined();
    expect(arret).toMatchObject({ code: ARRETS.lancement, nom: 'lancement' });
    for (const t of [arret?.rapport, arret?.piece, arret?.question]) {
      expect(t).toContain('grillhouse.matieres');
    }
  });

  it('is read from the main tree, never from a copy, and resolved from the copy given', () => {
    const principal = projet(['conformance']);
    const git = (...args: string[]) =>
      spawnSync('git', ['-C', principal, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
        encoding: 'utf8',
      });
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'x');
    const copie = path.join(ESSAIS, `copie-${n++}`);
    expect(git('worktree', 'add', '-q', copie).status).toBe(0);
    // The copy's own key says nothing: the main tree's decides.
    writeFileSync(
      path.join(copie, 'package.json'),
      JSON.stringify({ name: 'essai', workspaces: ['packages/*'], grillhouse: { matieres: [] } })
    );
    expect(matieresDeclareesDe(copie)).toEqual(['conformance']);
    expect(langageDe(copie).estUnTest(CAS, copie)).toEqual(MATIERE);
    expect(langageDe(copie).estUnTest(path.join(copie, CAS), copie)).toEqual(MATIERE);
  });
});

describe('estUnTest of the join of the languages, for a file under a declared folder', () => {
  it('rends test material, in the language of the project', () => {
    const r = projet(['conformance']);
    expect(langageDe(r).estUnTest(CAS, r)).toEqual(MATIERE);
    expect(langageDe(r).estUnTest('conformance/0.6/read/cas-1/case.json', r)).toEqual(MATIERE);
    expect(langageDe(r).estUnTest(path.join(r, CAS), r)).toEqual(MATIERE);
  });

  it('keeps the first answer of a module of a language for a file that module judges', () => {
    const r = projet(['conformance']);
    expect(langageDe(r).estUnTest('conformance/lit.test.ts', r)).toMatchObject({ joue: true });
  });

  it('keeps the answer of the module for a file out of every declared folder', () => {
    const r = projet(['conformance']);
    expect(langageDe(r).estUnTest('conformance-autre/x.json', r)).toBeNull();
    expect(langageDe(r).estUnTest('docs/x.json', r)).toBeNull();
    expect(langageDe(r).estUnTest('src/a.test.ts', r)).toMatchObject({ joue: true });
  });

  it('rends exactly what it rendered before without the key', () => {
    const r = projet();
    expect(langageDe(r).estUnTest(CAS, r)).toBeNull();
    expect(langageDe(r).estUnTest('src/a.test.ts', r)).toMatchObject({ joue: true });
  });
});

describe('a conflict of a copy on a file of a declared folder', () => {
  it('goes to the testwriter, never to the developpeur', () => {
    const r = projet(['conformance']);
    const l = langageDe(r);
    expect(rolesDuConflit([CAS, 'src/a.ts'], (f: string) => l.estUnTest(f, r))).toMatchObject({
      testwriter: [CAS],
      developpeur: ['src/a.ts'],
    });
  });
});

describe('the envelope and the folders of test material', () => {
  // The mounts of the session of <role> on the copy /wt whose material is <matieres>.
  const montages = (role: string, matieres: string[]) => {
    const r = plan(
      {
        trees: ['/main', '/wt'],
        copie: '/wt',
        paquets: ['packages/a'],
        role,
        matieres,
        paquetsDeLaCopie: [
          { dossier: 'packages/a', pkg: { name: 'a' } },
          { dossier: 'packages/m', pkg: { name: 'm' } },
        ],
      },
      { existe: () => true }
    );
    const args = r.args ?? [];
    return args.flatMap((a, i) =>
      a === '--bind' || a === '--ro-bind' ? [`${a} ${args[i + 2]}`] : []
    );
  };

  it('lists the declared folders with the package of the shared material', () => {
    const r = projet(['conformance']);
    expect(matieresDeLaCopie(langageDe(r), r).sort()).toEqual(['conformance', 'packages/m']);
  });

  it('lists the package of the material alone without the key, as before', () => {
    const r = projet();
    expect(matieresDeLaCopie(langageDe(r), r)).toEqual(['packages/m']);
  });

  it('mounts each declared folder in writing for the testwriter, read-only for the developpeur', () => {
    const r = projet(['conformance']);
    const matieres = matieresDeLaCopie(langageDe(r), r);
    expect(montages('testwriter', matieres)).toContain('--bind /wt/conformance');
    expect(montages('developpeur', matieres)).toContain('--ro-bind /wt/conformance');
    expect(montages('developpeur', matieres)).not.toContain('--bind /wt/conformance');
  });
});
