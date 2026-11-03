// grillhouse-3e2.4 — la preuve du rouge ne vaut que pour un test du comportement que le ticket
// développe (décision du responsable, 2026-11-03) : un fichier que seule la nuit joue (test de nuit,
// banc ou témoin de temps) est mis de côté, nommé dans le rapport, jamais compté « ne se charge
// pas », jamais cause de refus. Chaque module de langage dit, pour un fichier de test, s'il est hors
// du jour (`horsDuJour(chemin, racine)`), avec les définitions qu'il a déjà. Témoin : SyntHub
// SH-ae6.5.14 (2026-11-02), `crates/service/tests/search_budget.rs`, un banc, compté « ne se charge
// pas : non joué (code 0) ».
// Tests moyens : des dépôts d'essai, le faux cargo (./langages/cargo/faux-cargo.ts).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as circuit from '../../scripts/circuit.mjs';
import type { Langage } from '../../scripts/jointure.js';
import moduleCargo from '../../scripts/langages/cargo/index.mjs';
import modulePython from '../../scripts/langages/python/index.mjs';
import moduleTypescript from '../../scripts/langages/typescript/index.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

type Separation = { jour: string[]; misDeCote: string[] };
const separer = circuit.separerLesFichiersDuJour as (
  ctx: { copie: string },
  fichiers: string[]
) => Separation;
const sectionMisDeCote = circuit.sectionMisDeCote as (fichiers: string[]) => string[];
const preuveReussie = circuit.preuveReussie as (
  compte: Record<string, number>,
  o: { inchange: boolean }
) => boolean;
const apresLaPreuve = circuit.apresLaPreuve as (o: {
  rouges: number;
  pourLeDeveloppeur: boolean;
  inchange: boolean;
}) => unknown;
type AvecHorsDuJour = { horsDuJour(chemin: string, racine: string): boolean };
const cargo = moduleCargo as unknown as Langage & AvecHorsDuJour;
const python = modulePython as unknown as Langage & AvecHorsDuJour;
const typescript = moduleTypescript as unknown as Langage & AvecHorsDuJour;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'hors-du-jour-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
let restaurer: () => void = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
});
afterAll(() => restaurer());

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const depot = (langages: Record<string, string>, fichiers: Record<string, string>) => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  declarerLesLangages(racine, langages);
  for (const [f, texte] of Object.entries(fichiers)) {
    ecrire(racine, f, texte);
  }
  return racine;
};

const CARGO = {
  'Cargo.toml': '[workspace]\nmembers = ["crates/service"]\nresolver = "2"\n',
  'crates/service/Cargo.toml': '[package]\nname = "service"\nversion = "0.1.0"\nedition = "2021"\n',
  'crates/service/src/lib.rs': 'pub fn un() -> i32 { 1 }\n',
  'crates/service/src/server/tests.rs': '#[test]\nfn relais() {}\n',
  'crates/service/tests/jour.rs': '#[test]\nfn jour() {}\n',
  'crates/service/tests/search_budget.rs': '#[test]\nfn vite() {}\n',
  'crates/service/tests/lourd_nuit.rs': '#[test]\nfn long() {}\n',
  'crates/service/tests/gros_nuit/main.rs': '#[test]\nfn long() {}\n',
  'crates/service/tests/common/mod.rs': 'pub fn aide() {}\n',
};
const PYTHON = {
  'pyproject.toml': '[project]\nname = "p"\nversion = "0.1.0"\n',
  'test_jour.py': 'def test_jour():\n    pass\n',
  'test_x.py': 'def test_x():\n    pass\n',
  'lourd_nuit_test.py': 'def test_long():\n    pass\n',
};
const TEMOIN =
  "import { mesurerAuRepos } from '@roomi-fields/grillhouse/vitest-config/mesure';\nimport { it } from 'vitest';\nit('t', () => {});\n";
const TYPESCRIPT = {
  'package.json': JSON.stringify({ name: 'p', private: true }),
  'src/index.ts': 'export const a = 1;\n',
  'test/jour.test.ts': "import { it } from 'vitest';\nit('a', () => {});\n",
  'test/vitesse.budget.test.ts': "import { it } from 'vitest';\nit('a', () => {});\n",
  'test/lourd.nuit.test.ts': "import { it } from 'vitest';\nit('a', () => {});\n",
  'test/temoin.test.ts': TEMOIN,
};

describe('grillhouse-3e2.4, critère 6 — chaque module dit, pour un fichier de test, s’il est hors du jour', () => {
  it('critère 6 (cargo) : un banc `_budget`, un test de nuit `_nuit`, en fichier ou en dossier, sont hors du jour', () => {
    const racine = depot({ 'crates/service': 'cargo' }, CARGO);
    const hors = (f: string) => cargo.horsDuJour(`crates/service/${f}`, racine);
    expect(hors('tests/search_budget.rs')).toBe(true);
    expect(hors('tests/lourd_nuit.rs')).toBe(true);
    expect(hors('tests/gros_nuit/main.rs')).toBe(true);
  });

  it('critère 6 (cargo) : un test de tests/, un test sous src/, une aide : du jour', () => {
    const racine = depot({ 'crates/service': 'cargo' }, CARGO);
    const hors = (f: string) => cargo.horsDuJour(`crates/service/${f}`, racine);
    expect(hors('tests/jour.rs')).toBe(false);
    expect(hors('src/server/tests.rs')).toBe(false);
    expect(hors('tests/common/mod.rs')).toBe(false);
    expect(hors('src/lib.rs')).toBe(false);
  });

  it('critère 6 (python) : `*_nuit_test.py` est hors du jour, `test_*.py` du jour', () => {
    const racine = depot({ '.': 'python' }, PYTHON);
    expect(python.horsDuJour('lourd_nuit_test.py', racine)).toBe(true);
    expect(python.horsDuJour('test_x.py', racine)).toBe(false);
    expect(python.horsDuJour('tests/test_y.py', racine)).toBe(false);
  });

  it('critère 6 (typescript) : un banc, un test de nuit et un témoin de temps sont hors du jour', () => {
    const racine = depot({ '.': 'typescript' }, TYPESCRIPT);
    expect(typescript.horsDuJour('test/vitesse.budget.test.ts', racine)).toBe(true);
    expect(typescript.horsDuJour('test/lourd.nuit.test.ts', racine)).toBe(true);
    expect(typescript.horsDuJour('test/temoin.test.ts', racine)).toBe(true);
    expect(typescript.horsDuJour('test/jour.test.ts', racine)).toBe(false);
  });

  it('critère 6 : un fichier dont le nom ne suit pas ces définitions est du jour, un fichier absent aussi', () => {
    const racine = depot({ 'crates/service': 'cargo' }, CARGO);
    expect(cargo.horsDuJour('crates/service/tests/nuit_banc.rs', racine)).toBe(false);
    expect(cargo.horsDuJour('README.md', racine)).toBe(false);
    const ts = depot({ '.': 'typescript' }, TYPESCRIPT);
    expect(typescript.horsDuJour('test/absent.test.ts', ts)).toBe(false);
    const py = depot({ '.': 'python' }, PYTHON);
    expect(python.horsDuJour('nuit.py', py)).toBe(false);
  });
});

describe('grillhouse-3e2.4, critère 2 et 4 — la preuve met de côté les fichiers que seule la nuit joue', () => {
  it('critère 2 (cargo) : le banc et le test de nuit du lot sont mis de côté, le test sous src/ et celui de tests/ restent', () => {
    const racine = depot({ 'crates/service': 'cargo' }, CARGO);
    const lot = [
      'crates/service/src/server/tests.rs',
      'crates/service/tests/jour.rs',
      'crates/service/tests/lourd_nuit.rs',
      'crates/service/tests/search_budget.rs',
    ];
    expect(separer({ copie: racine }, lot)).toEqual({
      jour: ['crates/service/src/server/tests.rs', 'crates/service/tests/jour.rs'],
      misDeCote: ['crates/service/tests/lourd_nuit.rs', 'crates/service/tests/search_budget.rs'],
    });
  });

  it('critère 2 (python) : un test de nuit du lot est mis de côté', () => {
    const racine = depot({ '.': 'python' }, PYTHON);
    expect(separer({ copie: racine }, ['lourd_nuit_test.py', 'test_x.py'])).toEqual({
      jour: ['test_x.py'],
      misDeCote: ['lourd_nuit_test.py'],
    });
  });

  it('critère 2 (typescript) : un banc, un test de nuit et un témoin sont mis de côté', () => {
    const racine = depot({ '.': 'typescript' }, TYPESCRIPT);
    expect(
      separer({ copie: racine }, [
        'test/jour.test.ts',
        'test/lourd.nuit.test.ts',
        'test/temoin.test.ts',
        'test/vitesse.budget.test.ts',
      ])
    ).toEqual({
      jour: ['test/jour.test.ts'],
      misDeCote: ['test/lourd.nuit.test.ts', 'test/temoin.test.ts', 'test/vitesse.budget.test.ts'],
    });
  });

  it('critère 2 : un lot sans fichier hors du jour n’en met aucun de côté ; un lot vide non plus', () => {
    const racine = depot({ '.': 'python' }, PYTHON);
    expect(separer({ copie: racine }, ['test_x.py', 'test_jour.py'])).toEqual({
      jour: ['test_x.py', 'test_jour.py'],
      misDeCote: [],
    });
    expect(separer({ copie: racine }, [])).toEqual({ jour: [], misDeCote: [] });
  });

  it('critère 2 : le rapport nomme les fichiers mis de côté dans la section « Mis de côté (joués par la nuit seule) »', () => {
    const lignes = sectionMisDeCote([
      'crates/service/tests/lourd_nuit.rs',
      'crates/service/tests/search_budget.rs',
    ]);
    const texte = lignes.join('\n');
    expect(lignes[0]).toMatch(/^Mis de côté \(joués par la nuit seule\)/);
    expect(texte).toContain('crates/service/tests/lourd_nuit.rs');
    expect(texte).toContain('crates/service/tests/search_budget.rs');
    expect(texte).not.toMatch(/ne se charge/);
  });

  it('critère 2 : sans fichier mis de côté, aucune section', () => {
    expect(sectionMisDeCote([])).toEqual([]);
  });

  const COMPTE = {
    fichiers: 0,
    rouges: 0,
    casses: 0,
    injustifies: 0,
    justifies: 0,
    anciens: 0,
    misDeCote: 0,
  };

  it('critère 2 et décision du responsable : un lot dont le seul fichier de test est hors du jour passe la preuve', () => {
    for (const misDeCote of [1, 2]) {
      expect(preuveReussie({ ...COMPTE, misDeCote }, { inchange: false })).toBe(true);
    }
  });

  it('critère 2 : un fichier mis de côté ne remplace pas la preuve d’un fichier du jour — un vert sans vert attendu refuse encore', () => {
    expect(
      preuveReussie(
        { ...COMPTE, fichiers: 1, injustifies: 1, justifies: 1, misDeCote: 1 },
        { inchange: false }
      )
    ).toBe(false);
    expect(preuveReussie({ ...COMPTE, fichiers: 1, misDeCote: 1 }, { inchange: false })).toBe(
      false
    );
  });

  it('critère 2 : un fichier du jour qui ne se charge pas refuse le lot, banc ou non', () => {
    expect(
      preuveReussie({ ...COMPTE, fichiers: 1, casses: 1, misDeCote: 1 }, { inchange: false })
    ).toBe(false);
  });

  it('critère 2 : un lot sans aucun fichier de test, ni du jour ni de côté, ne passe toujours pas', () => {
    expect(preuveReussie(COMPTE, { inchange: false })).toBe(false);
  });

  it('critère 2 : un rouge du jour avec un banc de côté passe, comme sans banc', () => {
    expect(
      preuveReussie({ ...COMPTE, fichiers: 1, rouges: 2, misDeCote: 1 }, { inchange: false })
    ).toBe(true);
  });

  it('critère 3 : un lot vert à la preuve avec un constat du relecteur pour le développeur va au développeur', () => {
    const code = apresLaPreuve({ rouges: 1, pourLeDeveloppeur: false, inchange: false });
    expect(apresLaPreuve({ rouges: 0, pourLeDeveloppeur: true, inchange: false })).toBe(code);
    expect(apresLaPreuve({ rouges: 0, pourLeDeveloppeur: false, inchange: false })).not.toBe(code);
  });
});

describe('grillhouse-3e2.4, critère 6 — la composition de plusieurs langages répond avec le module du fichier', () => {
  it('critère 6 : la réponse est celle du module du composant qui tient le fichier', () => {
    const racine = depot(
      { 'crates/service': 'cargo', py: 'python' },
      {
        ...CARGO,
        'py/pyproject.toml': '[project]\nname = "py"\nversion = "0.1.0"\n',
        'py/lourd_nuit_test.py': 'def test_l():\n    pass\n',
        'py/test_x.py': 'def test_x():\n    pass\n',
      }
    );
    expect(
      separer({ copie: racine }, [
        'crates/service/tests/search_budget.rs',
        'crates/service/tests/jour.rs',
        'py/lourd_nuit_test.py',
        'py/test_x.py',
      ])
    ).toEqual({
      jour: ['crates/service/tests/jour.rs', 'py/test_x.py'],
      misDeCote: ['crates/service/tests/search_budget.rs', 'py/lourd_nuit_test.py'],
    });
  });
});
