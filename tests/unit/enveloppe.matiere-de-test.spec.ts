import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { CODE_REFUS } from '../../scripts/enveloppe/codes.mjs';
import { SCRIPT, enveloppeEssai } from './enveloppe-essai.js';

// The envelope of an agent (scripts/enveloppe/enveloppe.mjs, tests/unit/enveloppe.spec.ts) and the
// package of the shared test material: shown, by any form of export, absent, or reached by a link.
// The trial harness: ./enveloppe-essai.ts.

// The real envelope, when this machine can build one. Its repositories live outside /tmp, which
// the envelope replaces with an empty directory, in a trial directory of this run alone.
const ESSAIS = racineSousLaMaison('grillhouse-essais-enveloppe-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { essai } = enveloppeEssai(ESSAIS);

// METACADRE intentions 4, « la preuve avant l'affirmation », and 5, « des agents cadrés », and
// grillhouse-2sq: like the *-test-utils packages of a monorepo, published by the subpath export
// `./test-fixtures` and written by their owner, the package of the shared test material is the
// package whose package.json exports `./test-fixtures`. In the envelope it comes back whole:
// written for the testeur, read-only for every other role. A project without it does not change.
// The role is the envelope's third argument: `enveloppe.mjs <copie> <composant> <rôle> -- …`.
type Manifeste = Record<string, unknown>;
const MATIERE_FICHIERS = [
  'fixtures/index.js',
  'fixtures/cas/un.txt',
  'fixtures/cas/profond/plus/deux.txt',
  'src/generer.ts',
  'README.md',
];
// A repository with the agent's component `packages/a`, an ordinary sibling `packages/b`, siblings
// that export other subpaths, and, when <matiere> is given, the package `packages/<nom>` with that
// package.json and the files of MATIERE_FICHIERS. Its copy is `.claude/worktrees/demo-1`.
function depotAvecMatiere(matiere?: { nom: string; manifeste: Manifeste }) {
  const repo = essai('matiere-');
  const ecrire = (rel: string, contenu: string) => {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    writeFileSync(path.join(repo, rel), contenu);
  };
  ecrire('packages/a/src/a.ts', 'a');
  ecrire('packages/b/src/b.ts', 'secret-b');
  ecrire('packages/b/package.json', '{"name":"b"}');
  ecrire(
    'packages/c/package.json',
    JSON.stringify({ name: 'c', exports: { '.': './x.js', './utils': './u.js' } })
  );
  ecrire('packages/c/src/c.ts', 'secret-c');
  ecrire('packages/d/package.json', JSON.stringify({ name: 'd', exports: './index.js' }));
  ecrire('packages/d/src/d.ts', 'secret-d');
  ecrire('scripts/outil.mjs', 'outil');
  ecrire('.beads/config.yaml', '');
  if (matiere) {
    ecrire(`packages/${matiere.nom}/package.json`, JSON.stringify(matiere.manifeste));
    for (const rel of MATIERE_FICHIERS) {
      ecrire(`packages/${matiere.nom}/${rel}`, `matiere:${rel}`);
    }
  }
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'init');
  const copie = path.join(repo, '.claude/worktrees/demo-1');
  git('worktree', 'add', '-q', '-b', 'agent/demo-1', copie);
  const home = essai('home-');
  mkdirSync(path.join(home, '.claude'));
  const run = (role: string, shell: string, composant = 'packages/a') =>
    spawnSync('node', [SCRIPT, copie, composant, role, '--', 'bash', '-c', shell], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
    });
  return { repo, copie, run };
}

const AUTRES_ROLES = ['developpeur', 'explorateur', 'arbitre'];

describe.runIf(canWrap)('the envelope and the package of the shared test material', () => {
  const { repo, copie, run } = depotAvecMatiere({
    nom: 'matiere',
    manifeste: {
      name: 'matiere',
      exports: { '.': './index.js', './test-fixtures': './fixtures/index.js' },
    },
  });
  const m = 'packages/matiere';

  it('shows every role the whole package, its deep files and its sources included', () => {
    for (const role of ['testeur', ...AUTRES_ROLES]) {
      const r = run(role, `cd ${m} && find . -type f`);
      expect(r.status, role).toBe(0);
      expect(r.stdout.split('\n').filter(Boolean).sort(), role).toEqual(
        ['./package.json', ...MATIERE_FICHIERS.map(f => `./${f}`)].sort()
      );
      expect(run(role, `cat ${m}/fixtures/cas/profond/plus/deux.txt`).stdout, role).toBe(
        'matiere:fixtures/cas/profond/plus/deux.txt'
      );
    }
  });
  it('lets the testeur write it: a new file, a new directory, a changed file', () => {
    const r = run(
      'testeur',
      `echo n > ${m}/fixtures/cas/neuf.txt && mkdir -p ${m}/fixtures/nouveau/sous && ` +
        `touch ${m}/fixtures/nouveau/sous/x && echo change > ${m}/fixtures/cas/un.txt`
    );
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(path.join(copie, m, 'fixtures/cas/neuf.txt'), 'utf8')).toBe('n\n');
    expect(existsSync(path.join(copie, m, 'fixtures/nouveau/sous/x'))).toBe(true);
    expect(readFileSync(path.join(copie, m, 'fixtures/cas/un.txt'), 'utf8')).toBe('change\n');
  });
  it('keeps it read-only for every other role', () => {
    for (const role of AUTRES_ROLES) {
      expect(run(role, `touch ${m}/fixtures/cas/${role}.txt`).status, role).not.toBe(0);
      expect(run(role, `mkdir ${m}/${role}`).status, role).not.toBe(0);
      expect(run(role, `echo x >> ${m}/src/generer.ts`).status, role).not.toBe(0);
      expect(run(role, `rm ${m}/README.md`).status, role).not.toBe(0);
      expect(existsSync(path.join(copie, m, 'fixtures/cas', `${role}.txt`)), role).toBe(false);
      expect(existsSync(path.join(copie, m, 'README.md')), role).toBe(true);
    }
  });
  it('gives the testeur its own component in writing and the other siblings hidden', () => {
    expect(run('testeur', 'touch packages/a/src/neuf.ts').status).toBe(0);
    for (const s of ['b', 'c', 'd']) {
      expect(run('testeur', `cat packages/${s}/src/${s}.ts`).status, s).not.toBe(0);
      expect(run('testeur', `touch packages/${s}/x`).status, s).not.toBe(0);
    }
  });
  it('lets no role write the package in the main tree', () => {
    for (const role of ['testeur', ...AUTRES_ROLES]) {
      expect(run(role, `touch ${repo}/${m}/fixtures/${role}`).status, role).not.toBe(0);
      expect(existsSync(path.join(repo, m, 'fixtures', role)), role).toBe(false);
    }
  });
  it('keeps it read-only for another role whose component is a folder of the root', () => {
    expect(run('developpeur', 'cat scripts/outil.mjs', 'scripts').stdout).toBe('outil');
    expect(run('developpeur', `touch ${m}/fixtures/racine`, 'scripts').status).not.toBe(0);
    expect(existsSync(path.join(copie, m, 'fixtures/racine'))).toBe(false);
    expect(run('testeur', `touch ${m}/fixtures/racine`, 'scripts').status).toBe(0);
  });
  // Where a run of the material's tests writes in it, Turborepo's task logs and Vite's cache, every
  // other role gets an empty directory proper to the session: nothing reaches the copy.
  it('gives every other role an empty directory of its own where a run of its tests writes', () => {
    const sorties = ['.turbo', 'node_modules/.vite'];
    for (const role of AUTRES_ROLES) {
      const ecrit = sorties.map(s => `touch ${m}/${s}/${role}`).join(' && ');
      expect(run(role, ecrit).status, role).toBe(0);
      for (const s of sorties) {
        expect(existsSync(path.join(copie, m, s, role)), `${role} ${s}`).toBe(false);
      }
      expect(run(role, `touch ${m}/${role}`).status, role).not.toBe(0);
    }
    const r = run('testeur', `touch ${m}/.turbo/testeur`);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(path.join(copie, m, '.turbo/testeur'))).toBe(true);
  });
});

describe.runIf(canWrap)('the package of the shared test material, by any form of export', () => {
  it('is found by a conditional export, under another name', () => {
    const { copie, run } = depotAvecMatiere({
      nom: 'outils-de-test',
      manifeste: {
        name: '@projet/outils-de-test',
        exports: {
          './test-fixtures': { import: './fixtures/index.mjs', require: './fixtures/index.cjs' },
        },
      },
    });
    const m = 'packages/outils-de-test';
    expect(run('developpeur', `cat ${m}/src/generer.ts`).stdout).toBe('matiere:src/generer.ts');
    expect(run('developpeur', `touch ${m}/fixtures/x`).status).not.toBe(0);
    expect(run('testeur', `touch ${m}/fixtures/x`).status).toBe(0);
    expect(existsSync(path.join(copie, m, 'fixtures/x'))).toBe(true);
  });
});

describe.runIf(canWrap)('a project without the package of the shared test material', () => {
  const { run } = depotAvecMatiere();
  it('hides every sibling from every role, whatever subpaths it exports', () => {
    for (const role of ['testeur', ...AUTRES_ROLES]) {
      for (const s of ['b', 'c', 'd']) {
        expect(run(role, `cat packages/${s}/src/${s}.ts`).status, `${role} ${s}`).not.toBe(0);
        expect(run(role, `cat packages/${s}/package.json`).status, `${role} ${s}`).toBe(0);
        expect(run(role, `touch packages/${s}/package.json`).status, `${role} ${s}`).not.toBe(0);
      }
      expect(run(role, 'touch packages/a/src/x.ts').status, role).toBe(0);
    }
  });
});

describe.runIf(canWrap)('the envelope and a link of the shared test material', () => {
  it.each(['testeur', 'developpeur'])(
    'refuses to launch (%s) when the material links into a hidden component',
    role => {
      const { copie, run } = depotAvecMatiere({
        nom: 'matiere',
        manifeste: { name: 'matiere', exports: { './test-fixtures': './fixtures/index.js' } },
      });
      symlinkSync(
        path.join(copie, 'packages/b/src'),
        path.join(copie, 'packages/matiere/fixtures/vers-b')
      );
      const r = run(role, 'true');
      expect(r.status).toBe(CODE_REFUS);
      expect(r.stderr).toMatch(/traverserait l'enveloppe/);
    }
  );
});
