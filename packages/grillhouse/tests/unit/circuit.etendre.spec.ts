// `--etendre` places each component it adds before the first component of the plan that reads it,
// as the module of the language reads it (`lecteurs` of the join, its `lit`), never by the
// manifests of npm (grillhouse-x7c.1).
// Witness: the reviewer of grillhouse-x7c (2026-10-30): `etendre` read the dependencies of the
// package.json files to order the plan; in a workspace of cargo (OSC Bridge), no crate has one, and
// the component added always went to the end of the plan.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages, architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as circuit from '../../scripts/circuit.mjs';
import * as duTicket from '../../scripts/ticket-du-circuit.mjs';
import { ordonnerLePlan } from '../../scripts/circuit.mjs';
import type { Langage } from '../../scripts/jointure.js';
import moduleCargo from '../../scripts/langages/cargo/index.mjs';
import exemples from '../../scripts/langages/cargo/exemples.mjs';
import moduleTypescript from '../../scripts/langages/typescript/index.mjs';
import { parLesTypes } from '../../scripts/langages/typescript/references-par-les-types.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

const cargo = moduleCargo as unknown as Langage;
const typescript = moduleTypescript as unknown as Langage;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-etendre-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// Writes the files <fichiers> (path → text) under a new directory <nom> of the trials.
function depot(nom: string, fichiers: Record<string, string>): string {
  const racine = path.join(ESSAIS, nom);
  for (const [rel, texte] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
    writeFileSync(path.join(racine, rel), texte);
  }
  return racine;
}

describe('grillhouse-x7c.1, critère 1 — un espace cargo ordonne le plan par ses crates', () => {
  let restaurer = () => {};
  let espace = '';
  beforeAll(() => {
    const cargo = path.join(ESSAIS, 'cargo');
    mkdirSync(cargo);
    restaurer = avecFauxCargo(installerFauxCargo(cargo), path.join(cargo, 'journal'));
    espace = (exemples.preparer(cargo) as { depots: { espace: string } }).depots.espace;
    writeFileSync(path.join(espace, 'package.json'), JSON.stringify({ name: 'espace' }));
    declarerLesLangages(espace, ['cargo']);
  });
  afterAll(() => restaurer());

  it('ws-core, which ws-app reads, enters the plan [ws-app] before it', () => {
    expect(ordonnerLePlan(espace, ['crates/app'], ['crates/core'])).toEqual([
      'crates/core',
      'crates/app',
    ]);
  });

  it('the join gives what the tests of a crate read: its dependencies of development', () => {
    const composants = cargo.composants(espace);
    const l = cargo.lecteurs(espace, { composants, noms: [], texte: '', nommes: [] });
    const nom = (n: string) => composants.find(c => c.nom === n)!;
    expect([...l.parLesTests.get(nom('ws-outil'))!].map(c => c.nom)).toEqual(['ws-app']);
    expect([...l.parLesTests.get(nom('ws-app'))!]).toEqual([]);
  });

  it('a component no component of the plan reads goes to its end', () => {
    expect(ordonnerLePlan(espace, ['crates/core'], ['crates/matiere'])).toEqual([
      'crates/core',
      'crates/matiere',
    ]);
  });
});

describe('grillhouse-x7c.1, critère 2 — un projet typescript s’ordonne comme avant', () => {
  const projet = depot('typescript', {
    'package.json': JSON.stringify({
      name: 'essai',
      workspaces: ['packages/*'],
    }),
    'docs/ARCHITECTURE.md': architecture(),
    'packages/a/package.json': JSON.stringify({
      name: '@essai/a',
      dependencies: { '@essai/b': '*' },
      devDependencies: { '@essai/d': '*' },
    }),
    'packages/a/src/index.ts': "import { b } from '@essai/b';\nexport const a = b;\n",
    'packages/a/tests/a.test.ts': "import { d } from '@essai/d';\nexport const t = d;\n",
    'packages/d/package.json': JSON.stringify({ name: '@essai/d' }),
    'packages/d/src/index.ts': 'export const d = 1;\n',
    'packages/b/package.json': JSON.stringify({ name: '@essai/b' }),
    'packages/b/src/index.ts': 'export const b = 1;\n',
    'packages/c/package.json': JSON.stringify({ name: '@essai/c' }),
    'packages/c/src/index.ts': 'export const c = 1;\n',
  });

  it('@essai/b, which @essai/a imports, enters the plan [a] before it', () => {
    expect(ordonnerLePlan(projet, ['packages/a'], ['packages/b'])).toEqual([
      'packages/b',
      'packages/a',
    ]);
  });

  it('the join gives what the tests of a package read, its imports in production left in `lit`', () => {
    const composants = typescript.composants(projet);
    const l = typescript.lecteurs(projet, { composants, noms: [], texte: '', nommes: [] });
    const a = composants.find(c => c.paquet === '@essai/a')!;
    expect([...l.parLesTests.get(a)!].map(c => c.paquet)).toEqual(['@essai/d']);
    expect([...l.lit.get(a)!].map(c => c.paquet)).toEqual(['@essai/b']);
  });

  // BPScript: the chain tests of 040-checker read 010-parser, a dependency of development.
  it('@essai/d, which the tests of @essai/a alone import, enters the plan [a] before it', () => {
    expect(ordonnerLePlan(projet, ['packages/a'], ['packages/d'])).toEqual([
      'packages/d',
      'packages/a',
    ]);
  });

  it('a package no package of the plan imports goes to its end', () => {
    expect(ordonnerLePlan(projet, ['packages/a'], ['packages/c'])).toEqual([
      'packages/a',
      'packages/c',
    ]);
  });
});

// Discovery of the reviewer of grillhouse-x7c.1: `lecteurs` built TypeScript's language service
// with no element to resolve (7.9 s on BPScript), on each `--etendre`.
// OSC Bridge OB-20q.1: its developpeur wrote `osd.workspace = true` in a crate of the plan, the
// line of the root's `[workspace.dependencies]` out of the plan; the copy no longer loaded
// (`cargo metadata`, code 101), and `--etendre .`, the answer that repairs it, failed on it.
describe('un plan s’étend même quand la copie du ticket ne se charge pas', () => {
  const planEtendu = circuit.planEtendu as (
    ctx: { copie: string; racine: string },
    paquets: string[],
    gagnes: string[]
  ) => { plan: string[]; lu: string };
  // A project of TypeScript whose package a imports its package b.
  const projet = depot('typescript-etendu', {
    'package.json': JSON.stringify({ name: 'essai', workspaces: ['packages/*'] }),
    'docs/ARCHITECTURE.md': architecture(),
    'packages/a/package.json': JSON.stringify({
      name: '@essai/a',
      dependencies: { '@essai/b': '*' },
    }),
    'packages/a/src/index.ts': "import { b } from '@essai/b';\nexport const a = b;\n",
    'packages/b/package.json': JSON.stringify({ name: '@essai/b' }),
    'packages/b/src/index.ts': 'export const b = 1;\n',
  });
  // A copy that declares no language: its tree does not load (scripts/langages.mjs refuses it).
  const cassee = depot('copie-cassee', { 'package.json': JSON.stringify({ name: 'cassee' }) });

  it('a copy that loads gives the order', () => {
    expect(planEtendu({ copie: projet, racine: cassee }, ['packages/a'], ['packages/b'])).toEqual({
      plan: ['packages/b', 'packages/a'],
      lu: 'copie',
    });
  });

  it('a copy that does not load: the order is read in the main tree', () => {
    expect(() => {
      ordonnerLePlan(cassee, ['packages/a'], ['packages/b']);
    }).toThrow();
    expect(planEtendu({ copie: cassee, racine: projet }, ['packages/a'], ['packages/b'])).toEqual({
      plan: ['packages/b', 'packages/a'],
      lu: 'principal',
    });
  });

  it('without a copy, the main tree gives the order', () => {
    const absente = path.join(ESSAIS, 'copie-absente');
    expect(planEtendu({ copie: absente, racine: projet }, ['packages/a'], ['packages/b'])).toEqual({
      plan: ['packages/b', 'packages/a'],
      lu: 'principal',
    });
  });

  it('the title names its packages from the main tree when the copy does not load, by their path when neither does', () => {
    const nomsDe = duTicket.nomsDe as (
      ctx: { copie: string; racine: string },
      dossiers: string[]
    ) => string[];
    const plan = ['packages/b', 'packages/a'];
    expect(nomsDe({ copie: projet, racine: cassee }, plan)).toEqual(['@essai/b', '@essai/a']);
    expect(nomsDe({ copie: cassee, racine: projet }, plan)).toEqual(['@essai/b', '@essai/a']);
    expect(nomsDe({ copie: cassee, racine: cassee }, plan)).toEqual(plan);
  });

  it('neither tree loads: the gained package goes to the end of the plan', () => {
    expect(planEtendu({ copie: cassee, racine: cassee }, ['packages/a'], ['packages/b'])).toEqual({
      plan: ['packages/a', 'packages/b'],
      lu: 'aucun',
    });
  });
});

describe('grillhouse-x7c.1 — sans élément à résoudre, aucun service de langage', () => {
  it('the survey by the types of no element is done, in a folder no service could read', () => {
    const vide = depot('sans-tsconfig', { 'README.md': 'rien\n' });
    expect(parLesTypes(vide, [], [])).toEqual({ etat: 'fait', raison: null, elements: [] });
  });
});
