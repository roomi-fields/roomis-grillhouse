// grillhouse-pkl.6, criterion 4 — the index of the interfaces of a workspace of cargo, a generated
// file of the module (`fichiersEngendres`): one line per crate that has a `docs/INTERFACE.md`,
// and one for the root's, from its title and its first sentence; its check (`verifier`) finds it
// up to date (`aJour`) or late (`enRetard`), and its command writes it.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/cargo/index.mjs';
import exemples, { INDEX } from '../../../../scripts/langages/cargo/exemples.mjs';
import { commande, index, SORTIE } from '../../../../scripts/langages/cargo/index-interfaces.mjs';
import { lireSarif } from '../../../../scripts/resultats.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const cargo = module as unknown as Langage;
type Depots = Record<'espace' | 'enRetard' | 'seul', string>;

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

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'index-cargo-'));
let restaurer = () => {};
let d: Depots;
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
  d = (exemples.preparer(ESSAIS) as { depots: Depots }).depots;
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => restaurer());

const lIndex = () => {
  const f = cargo.fichiersEngendres(d.espace).find(x => x.nom === "l'index des interfaces");
  if (!f) {
    throw new Error("l'index des interfaces manque aux fichiers engendrés");
  }
  return f;
};

describe('grillhouse-pkl.6, critère 4 — l’index des interfaces d’un espace cargo', () => {
  it('the module engenders it: its file, the interfaces it reads, its guard', () => {
    const f = lIndex();
    expect(f.fichiers).toEqual([SORTIE]);
    expect(f.entiers).toEqual([SORTIE]);
    expect(f.lit).toEqual(['docs/INTERFACE.md', '**/docs/INTERFACE.md']);
    expect(f.gardes).toEqual(['index-interfaces']);
    expect(f.commande).toMatch(/index-interfaces\.mjs"?$/);
  });

  it('one line per crate with an interface, then the root, each its title and first sentence', () => {
    expect(index(d.espace)).toBe(INDEX);
  });

  it('aJour: the index written matches its interfaces, no finding', () => {
    expect(lIndex().verifier(d.espace)).toEqual([]);
  });

  it('enRetard: an interface changed, the index is late, named', () => {
    const constats = lIndex().verifier(d.enRetard);
    expect(constats.map(c => c.fichier)).toEqual([SORTIE]);
    expect(constats[0]?.message).toContain(`${SORTIE} n'est pas à jour`);
  });

  it('the guard --verifier refuses the late index (1), in SARIF under index-interfaces', () => {
    const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
    const env = { ...process.env, GRILLHOUSE_RESULTATS: resultats };
    expect(commande(d.enRetard, ['--verifier'], { env })).toBe(1);
    expect(lus(resultats).map(c => [c.garde, c.fichier])).toEqual([['index-interfaces', SORTIE]]);
    expect(commande(d.espace, ['--verifier'], { env })).toBe(0);
  });

  it('its command writes it, then it is up to date', () => {
    expect(commande(d.enRetard, [])).toBe(0);
    expect(readFileSync(path.join(d.enRetard, SORTIE), 'utf8')).toContain(
      '`ws-core` offre un autre cœur. (`crates/core/docs/INTERFACE.md`)'
    );
    expect(lIndex().verifier(d.enRetard)).toEqual([]);
  });

  it('a crate at the root, as OSC Bridge: the root interface is its line, by its name', () => {
    mkdirSync(path.join(d.seul, 'docs'), { recursive: true });
    writeFileSync(
      path.join(d.seul, 'docs/INTERFACE.md'),
      '# seul (application) — interface\n\nL’application offre sa ligne de commande.\n'
    );
    expect(index(d.seul).split('\n').slice(5)).toEqual([
      '## seul (application) — interface',
      '',
      'L’application offre sa ligne de commande. (`docs/INTERFACE.md`)',
      '',
    ]);
  });
});
