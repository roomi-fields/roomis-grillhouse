// The lots of the integration (`refusLots` of scripts/integration/integrer.mjs) judged on the tree
// where each file lives: a file present after the lot on the ticket's copy, a file the lot deletes
// or renames away on the main tree, as each side of a diff is read in its own tree. A lot that
// moves the crate at the root under `crates/<nom>` (as OSC Bridge did) has its tests read with the
// crates of the copy, not with the one root crate of main. The crates come from `cargo metadata`
// (the fake cargo of ./faux-cargo.ts, first on the PATH).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { refusLots } from '../../../../scripts/integration/integrer.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'lots-de-l-integration-'));
let restaurer = () => {};
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => restaurer());

const manifeste = 'name = "osc"\nversion = "0.1.0"\nedition = "2021"\npublish = false\n';
const architecture = (dossier: string) =>
  `# Architecture\n\n| Composant | Langage |\n| --- | --- |\n| \`${dossier}\` | cargo |\n`;

// A tree under ESSAIS: <fichiers> written from its root.
function arbre(nom: string, fichiers: Record<string, string>) {
  const racine = path.join(ESSAIS, nom);
  for (const [f, t] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
    writeFileSync(path.join(racine, f), t);
  }
  return racine;
}

// Main: the crate at the root. The copy: the same crate moved under `crates/osc`.
let arbres: { avant: string; apres: string };
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
  const crate = (sous: string) => ({
    [`${sous}src/lib.rs`]: 'pub fn un() -> i32 {\n    1\n}\n',
    [`${sous}src/tests.rs`]: '#[test]\nfn un() {}\n',
    [`${sous}tests/bout.rs`]: '#[test]\nfn passe() {}\n',
  });
  arbres = {
    avant: arbre('main', {
      'Cargo.toml': `[workspace]\nmembers = ["."]\n\n[package]\n${manifeste}`,
      'docs/ARCHITECTURE.md': architecture('.'),
      ...crate(''),
    }),
    apres: arbre('copie', {
      'Cargo.toml': '[workspace]\nresolver = "2"\nmembers = ["crates/osc"]\n',
      'crates/osc/Cargo.toml': `[package]\n${manifeste}`,
      'docs/ARCHITECTURE.md': architecture('crates/osc'),
      ...crate('crates/osc/'),
    }),
  };
});

// The lot that moves the crate: its tests, sources and destinations, and its code.
const TESTS = [
  'crates/osc/src/tests.rs',
  'crates/osc/tests/bout.rs',
  'src/tests.rs',
  'tests/bout.rs',
];
const CODE = ['Cargo.toml', 'crates/osc/Cargo.toml', 'crates/osc/src/lib.rs', 'src/lib.rs'];

describe('les lots de l’intégration se jugent sur l’arbre où chaque fichier existe', () => {
  it('un lot de tests qui déplace les tests du crate racine vers un crate neuf passe', () => {
    expect(refusLots(TESTS, CODE, arbres)).toBeNull();
  });

  it('un fichier de code du crate neuf reste refusé du lot de tests', () => {
    expect(refusLots([...TESTS, 'crates/osc/src/lib.rs'], [], arbres)).toBe(
      'Le lot de tests touche du code : crates/osc/src/lib.rs.'
    );
  });

  it('un test du crate neuf, ou un test d’avant le lot, reste refusé du lot de code', () => {
    expect(refusLots([], [...CODE, 'crates/osc/tests/bout.rs'], arbres)).toMatch(
      /^Le lot de code touche des fichiers du testwriter .* : crates\/osc\/tests\/bout\.rs\.$/
    );
    // A source the lot moves away, gone from the copy: judged on main, where it is a test.
    expect(refusLots([], [...CODE, 'tests/bout.rs'], arbres)).toMatch(
      /^Le lot de code touche des fichiers du testwriter .* : tests\/bout\.rs\.$/
    );
  });
});
