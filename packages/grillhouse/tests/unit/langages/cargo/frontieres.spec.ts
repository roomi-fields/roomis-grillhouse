// grillhouse-pkl.6, criterion 3 — the guard of the boundaries between crates: what `cargo
// metadata --no-deps` says each member depends on, by its path, against the list the workspace
// permits (`[workspace.metadata.grillhouse.frontieres]` of its Cargo.toml, each crate the crates
// it may depend on); a dependency absent from it refuses, with its kind (`normal`, `dev`,
// `build`), judged by the project's debt and written in SARIF.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireSarif } from '../../../../scripts/resultats.mjs';
import { commande, constatsDesFrontieres } from '../../../../scripts/langages/cargo/frontieres.mjs';
import exemples from '../../../../scripts/langages/cargo/exemples.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

// A finding read back from the SARIF of a run (scripts/resultats.mjs, `lireSarif`).
type Lu = {
  garde: string;
  regle: string | null;
  fichier: string | null;
  ligne: number | null;
  niveau: string;
  message: string;
  genre: string;
  trouve?: number;
};
const lus = (dossier: string) => (lireSarif(dossier) as { constats: Lu[] }).constats;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'frontieres-cargo-'));
let restaurer = () => {};
let d: { espace: string; seul: string };
let manifeste = '';
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
  d = (exemples.preparer(ESSAIS) as { depots: typeof d }).depots;
  manifeste = readFileSync(path.join(d.espace, 'Cargo.toml'), 'utf8');
});
afterAll(() => {
  restaurer();
  rmSync(ESSAIS, { recursive: true, force: true });
});

// The workspace of four crates, its list <liste> appended to its manifest.
const permettre = (liste: string) =>
  writeFileSync(
    path.join(d.espace, 'Cargo.toml'),
    `${manifeste}\n[workspace.metadata.grillhouse.frontieres]\n${liste}`
  );
// ws-app → ws-core (normal); ws-outil → ws-app (dev), ws-core (build).
const TOUT = 'ws-app = ["ws-core"]\nws-outil = ["ws-app", "ws-core"]\n';
const lu = (c: { fichier?: string; regle?: string; message: string }) => [
  c.fichier,
  c.regle,
  c.message,
];

describe('grillhouse-pkl.6, critère 3 — la garde des frontières entre crates', () => {
  it('every dependency between crates in the list: no finding', () => {
    permettre(TOUT);
    expect(constatsDesFrontieres(d.espace)).toEqual([]);
  });

  it('a crate of development absent from the list refuses, with « dev »', () => {
    permettre('ws-app = ["ws-core"]\nws-outil = ["ws-core"]\n');
    expect(constatsDesFrontieres(d.espace).map(lu)).toEqual([
      [
        'crates/outil/Cargo.toml',
        'dependance-non-permise',
        expect.stringMatching(/ws-outil dépend de ws-app \(dev\)/),
      ],
    ]);
  });

  it('a crate the list does not name may depend on no crate: each dependency refused, its kind', () => {
    permettre('ws-app = ["ws-core"]\n');
    expect(constatsDesFrontieres(d.espace).map(c => c.message)).toEqual([
      expect.stringMatching(/ws-outil dépend de ws-app \(dev\)/),
      expect.stringMatching(/ws-outil dépend de ws-core \(build\)/),
    ]);
  });

  it('a workspace without list refuses each dependency between crates, normal ones included', () => {
    writeFileSync(path.join(d.espace, 'Cargo.toml'), manifeste);
    expect(constatsDesFrontieres(d.espace).map(c => c.message)).toEqual([
      expect.stringMatching(/ws-app dépend de ws-core \(normal\)/),
      expect.stringMatching(/ws-outil dépend de ws-app \(dev\)/),
      expect.stringMatching(/ws-outil dépend de ws-core \(build\)/),
    ]);
  });

  it('a single crate, as OSC Bridge: no dependency between crates, no finding', () => {
    expect(constatsDesFrontieres(d.seul)).toEqual([]);
  });

  it('the command refuses (1), its findings in SARIF under the guard frontieres; green at 0', () => {
    permettre('ws-app = ["ws-core"]\nws-outil = ["ws-core"]\n');
    const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
    const env = { ...process.env, GRILLHOUSE_RESULTATS: resultats };
    expect(commande(d.espace, { env })).toBe(1);
    expect(lus(resultats).map(c => [c.garde, c.fichier, c.regle])).toEqual([
      ['frontieres', 'crates/outil/Cargo.toml', 'dependance-non-permise'],
    ]);
    permettre(TOUT);
    expect(commande(d.espace, { env })).toBe(0);
  });
});
