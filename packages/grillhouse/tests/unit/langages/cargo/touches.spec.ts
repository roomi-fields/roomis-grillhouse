// grillhouse-pkl.3, criterion 6 — the crates touched since a commit (the changes git sees, the
// untracked files included) and their dependents by the manifests, the development dependencies
// included, transitively, as Turborepo's `--filter=...[<commit>]`; a file of the workspace itself
// (its Cargo.toml, its Cargo.lock) touches every crate, as Turborepo's global dependencies; any
// other file out of every crate is out of the graph.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/cargo/index.mjs';
import exemples from '../../../../scripts/langages/cargo/exemples.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const cargo = module as unknown as Langage;

type Depots = Record<'espace' | 'change' | 'depuis', string>;
type Composant = { nom: string };
const lu = (t: { touches: Composant[]; dependants: Composant[]; horsGraphe: string[] }) => ({
  touches: t.touches.map(c => c.nom),
  dependants: t.dependants.map(c => c.nom),
  horsGraphe: t.horsGraphe,
});

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'touches-cargo-'));
let restaurer = () => {};
let d: Depots;
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
  d = (exemples.preparer(ESSAIS) as { depots: Depots }).depots;
});
afterAll(() => {
  restaurer();
  rmSync(ESSAIS, { recursive: true, force: true });
});

describe('grillhouse-pkl.3, critère 6 — les crates touchés et leurs dépendants', () => {
  it('ws-core touched gives ws-app (normal) and ws-outil (dev and build); a file out of every crate is out of the graph', () => {
    expect(lu(cargo.touches(d.change, { depuis: d.depuis }))).toEqual({
      touches: ['ws-core'],
      dependants: ['ws-app', 'ws-outil'],
      horsGraphe: ['notes.txt'],
    });
  });

  it('nothing changed: nothing touched', () => {
    expect(lu(cargo.touches(d.espace, { depuis: 'HEAD' }))).toEqual({
      touches: [],
      dependants: [],
      horsGraphe: [],
    });
  });

  it('a Cargo.lock, untracked, touches every crate', () => {
    writeFileSync(path.join(d.espace, 'Cargo.lock'), '# essai\nversion = 4\n');
    try {
      expect(lu(cargo.touches(d.espace, { depuis: 'HEAD' }))).toEqual({
        touches: ['ws-app', 'ws-core', 'ws-matiere', 'ws-outil'],
        dependants: [],
        horsGraphe: [],
      });
    } finally {
      rmSync(path.join(d.espace, 'Cargo.lock'));
    }
  });

  it('the workspace’s Cargo.toml changed touches every crate', () => {
    writeFileSync(
      path.join(d.espace, 'Cargo.toml'),
      '# Les crates de l’essai.\n[workspace]\nresolver = "2"\nmembers = ["crates/core", "crates/app", "crates/outil", "crates/matiere"]\n'
    );
    expect(lu(cargo.touches(d.espace, { depuis: 'HEAD' })).touches).toEqual([
      'ws-app',
      'ws-core',
      'ws-matiere',
      'ws-outil',
    ]);
  });
});
