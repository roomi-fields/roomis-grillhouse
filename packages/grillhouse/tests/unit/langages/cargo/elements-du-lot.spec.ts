// grillhouse-pkl.3, criterion 9 — the elements of a lot of a workspace of cargo: one per crate the
// lot adds, changes or removes (kind `crate`), read in git at each commit; every changed Rust
// source in `horsDuService`, whose items the reviewer surveys himself.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/cargo/index.mjs';
import exemples from '../../../../scripts/langages/cargo/exemples.mjs';

const cargo = module as unknown as Langage;

type Depots = Record<'lot' | 'avantLeLot', string>;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'lot-cargo-'));
let d: Depots;
beforeAll(() => {
  d = (exemples.preparer(ESSAIS) as { depots: Depots }).depots;
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe('grillhouse-pkl.3, critère 9 — les éléments du lot, un par crate', () => {
  it('a crate changed, one added, one removed, each at its manifest’s line of its name', () => {
    const l = cargo.elementsDuLot(d.lot, { avant: d.avantLeLot, apres: 'HEAD' });
    expect(l.etat).toBe('fait');
    expect(l.elements).toEqual([
      {
        id: 'crates/core/Cargo.toml#ws-core',
        nom: 'ws-core',
        genre: 'crate',
        statut: 'changé',
        paquet: 'ws-core',
        fichier: 'crates/core/Cargo.toml',
        ligne: 2,
        exporte: true,
      },
      expect.objectContaining({ id: 'crates/neuf/Cargo.toml#ws-neuf', statut: 'neuf' }),
      expect.objectContaining({ id: 'crates/outil/Cargo.toml#ws-outil', statut: 'supprimé' }),
    ]);
    expect(l.horsDuService).toEqual([
      'crates/core/src/lib.rs',
      'crates/neuf/src/lib.rs',
      'crates/outil/build.rs',
      'crates/outil/src/lib.rs',
    ]);
    expect(l.fichiers).toContain('Cargo.toml');
  });

  it('no lot: no element, no file', () => {
    expect(cargo.elementsDuLot(d.lot, { avant: 'HEAD', apres: 'HEAD' })).toMatchObject({
      etat: 'fait',
      elements: [],
      horsDuService: [],
      fichiers: [],
    });
  });

  it('a commit unknown: impossible, its reason', () => {
    const l = cargo.elementsDuLot(d.lot, { avant: 'absent', apres: 'HEAD' });
    expect(l.etat).toBe('impossible');
    expect(l.raison).toMatch(/^erreur : git diff/);
  });
});
