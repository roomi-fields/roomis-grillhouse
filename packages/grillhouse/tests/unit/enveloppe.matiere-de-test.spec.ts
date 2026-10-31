// METACADRE intentions 4, « la preuve avant l'affirmation », and 5, « des agents cadrés », and
// grillhouse-2sq: like the *-test-utils packages of a monorepo, published by the subpath export
// `./test-fixtures` and written by their owner, the package of the shared test material is the
// package whose package.json exports `./test-fixtures` (`matieres` of
// scripts/langages/typescript/consommateurs.mjs). In the envelope of an agent
// (scripts/enveloppe/enveloppe.mjs, `plan`) it comes back whole: written for the testwriter,
// read-only for every other role, where a run of its tests writes an empty directory proper to the
// session. A project without it does not change.
//
// Each case reads the plan of the envelope, the arguments of bwrap, on a disk described; bwrap
// itself, in a repository of trial, is the night's
// (packages/grillhouse-essais/tests/enveloppe.matiere-de-test.nuit.spec.ts).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { plan } from '../../scripts/enveloppe/enveloppe.mjs';
import { matieres } from '../../scripts/langages/typescript/consommateurs.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'enveloppe-matiere-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const AUTRES_ROLES = ['developpeur', 'explorateur', 'questionneur'];

// A repository of workspaces: `packages/a`, siblings that export other subpaths, and, when
// <matiere> is given, the package `packages/<nom>` with that package.json.
function depot(matiere?: { nom: string; manifeste: Record<string, unknown> }) {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const ecrire = (rel: string, contenu: unknown) => {
    mkdirSync(path.dirname(path.join(r, rel)), { recursive: true });
    writeFileSync(path.join(r, rel), JSON.stringify(contenu));
  };
  ecrire('package.json', { name: 'essai', workspaces: ['packages/*'] });
  ecrire('packages/a/package.json', { name: 'a' });
  ecrire('packages/b/package.json', { name: 'b' });
  ecrire('packages/c/package.json', { name: 'c', exports: { '.': './x.js', './utils': './u.js' } });
  ecrire('packages/d/package.json', { name: 'd', exports: './index.js' });
  if (matiere) {
    ecrire(`packages/${matiere.nom}/package.json`, matiere.manifeste);
  }
  return r;
}
const noms = (r: string) => matieres(r).map(m => path.relative(r, m.dir));

describe('the package of the shared test material, by any form of export', () => {
  it('is the package that exports ./test-fixtures', () => {
    const r = depot({
      nom: 'matiere',
      manifeste: {
        name: 'matiere',
        exports: { '.': './index.js', './test-fixtures': './fixtures/index.js' },
      },
    });
    expect(noms(r)).toEqual(['packages/matiere']);
  });
  it('is found by a conditional export, under another name', () => {
    const r = depot({
      nom: 'outils-de-test',
      manifeste: {
        name: '@projet/outils-de-test',
        exports: {
          './test-fixtures': { import: './fixtures/index.mjs', require: './fixtures/index.cjs' },
        },
      },
    });
    expect(noms(r)).toEqual(['packages/outils-de-test']);
  });
  it('is none in a project without it, whatever subpaths its packages export', () => {
    expect(noms(depot())).toEqual([]);
  });
});

// The plan of the session of <role> in the copy /wt of the main tree /main, its plan <composant>,
// the material packages/m; the outputs of a run of the material's tests exist.
function arguments_(role: string, composant = 'packages/a') {
  const presents = new Set([
    '/wt/.git',
    '/wt/packages/a',
    '/wt/packages/b',
    '/wt/packages/m',
    '/wt/packages/m/.turbo',
    '/wt/packages/m/node_modules/.vite',
    '/wt/scripts',
  ]);
  const r = plan(
    {
      trees: ['/main', '/wt'],
      copie: '/wt',
      paquets: [composant],
      role,
      matieres: ['packages/m'],
      sorties: { ecrites: [], propres: ['.turbo', 'node_modules/.vite'] },
      paquetsDeLaCopie: [
        { dossier: 'packages/a', pkg: { name: 'a' } },
        { dossier: 'packages/b', pkg: { name: 'b' } },
        { dossier: 'packages/m', pkg: { name: 'm' } },
      ],
    },
    { existe: (p: string) => presents.has(p) }
  );
  return r.args ?? [];
}
// The mounts of <args> as `<flag> <target>`, in order.
const montages = (args: string[]) =>
  args.flatMap((a, i) =>
    a === '--bind' || a === '--ro-bind'
      ? [`${a} ${args[i + 2]}`]
      : a === '--tmpfs'
        ? [`${a} ${args[i + 1]}`]
        : []
  );
// The last mount of <cible> in <args>: bwrap's later mount covers an earlier one.
const dernier = (args: string[], cible: string) =>
  montages(args)
    .filter(m => m.endsWith(` ${cible}`))
    .at(-1);

describe('the envelope and the package of the shared test material', () => {
  it('lets the testwriter write it', () => {
    expect(dernier(arguments_('testwriter'), '/wt/packages/m')).toBe('--bind /wt/packages/m');
  });
  it('keeps it read-only for every other role', () => {
    for (const role of AUTRES_ROLES) {
      expect(dernier(arguments_(role), '/wt/packages/m'), role).toBe('--ro-bind /wt/packages/m');
    }
  });
  it('mounts it after the packages of the plan and the copy, so that no earlier mount opens it', () => {
    for (const role of ['testwriter', ...AUTRES_ROLES]) {
      const m = montages(arguments_(role));
      const matiere = m.findIndex(x => x.endsWith(' /wt/packages/m'));
      expect(matiere, role).toBe(m.length - (role === 'testwriter' ? 1 : 3));
      expect(
        m.findIndex(x => x === '--bind /wt/packages/a'),
        role
      ).toBeLessThan(matiere);
    }
  });
  it('gives the testwriter its own package in writing, the other siblings read-only', () => {
    const args = arguments_('testwriter');
    expect(dernier(args, '/wt/packages/a')).toBe('--bind /wt/packages/a');
    expect(dernier(args, '/wt/packages/b')).toBeUndefined();
    expect(dernier(args, '/wt')).toBe('--ro-bind /wt');
  });
  it('lets no role write the package in the main tree', () => {
    for (const role of ['testwriter', ...AUTRES_ROLES]) {
      expect(
        montages(arguments_(role)).filter(m => m.includes('/main')),
        role
      ).toEqual([]);
    }
  });
  it('keeps it read-only for another role whose component is a folder of the root', () => {
    const dev = arguments_('developpeur', 'scripts');
    expect(dernier(dev, '/wt')).toBe('--bind /wt');
    expect(dernier(dev, '/wt/packages/m')).toBe('--ro-bind /wt/packages/m');
    expect(dernier(arguments_('testwriter', 'scripts'), '/wt/packages/m')).toBe(
      '--bind /wt/packages/m'
    );
  });
  // Where a run of the material's tests writes in it, Turborepo's task logs and Vite's cache, every
  // other role gets an empty directory proper to the session: nothing reaches the copy.
  it('gives every other role an empty directory of its own where a run of its tests writes', () => {
    for (const role of AUTRES_ROLES) {
      const m = montages(arguments_(role));
      expect(m.slice(-2), role).toEqual([
        '--tmpfs /wt/packages/m/.turbo',
        '--tmpfs /wt/packages/m/node_modules/.vite',
      ]);
    }
    expect(montages(arguments_('testwriter')).filter(x => x.startsWith('--tmpfs /wt/'))).toEqual(
      []
    );
  });
});

// grillhouse-ool, criterion 1: the testwriter declares what his tests depend on, and the run of
// his tests (`npm test`) brings the lock file of the versions at the root of the copy in line with
// it, as cargo does: the envelope opens that file to him alone, the rest of the root read-only.
describe('the envelope and the lock file of the versions', () => {
  const verrous = (role: string, composant = 'packages/a') =>
    plan(
      {
        trees: ['/main', '/wt'],
        copie: '/wt',
        paquets: [composant],
        role,
        verrous: ['Cargo.lock'],
        paquetsDeLaCopie: [{ dossier: 'packages/a', pkg: { name: 'a' } }],
      },
      { existe: (p: string) => ['/wt/.git', '/wt/packages/a', '/wt/Cargo.lock'].includes(p) }
    ).args ?? [];

  it('opens it to the testwriter', () => {
    expect(dernier(verrous('testwriter'), '/wt/Cargo.lock')).toBe('--bind /wt/Cargo.lock');
  });
  it('leaves it read-only for every other role', () => {
    for (const role of AUTRES_ROLES) {
      expect(dernier(verrous(role), '/wt/Cargo.lock'), role).toBeUndefined();
    }
  });
});
