// A project of cargo and c: the verification plays the two modules, their verdicts are joined, and
// no folder is claimed twice (a package has one language); a folder that holds both a Cargo.toml and
// a CMakeLists.txt (with project() ) is refused by the guard of the languages, named. Against the
// fake cargo (../cargo/faux-cargo.ts) and the fake cmake and ctest (./faux-cmake.ts).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import type { Langage } from '../../../../scripts/jointure.js';
import { constats } from '../../../../scripts/langages-des-paquets.mjs';
import { langageDe } from '../../../../scripts/langages.mjs';
import { moduleC } from './module-c.js';
import { avecFauxCargo, installerFauxCargo } from '../cargo/faux-cargo.js';
import { installerFauxCmake } from './faux-cmake.js';

const c: Langage = moduleC;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'cargo-et-c-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let FAUX_CMAKE = '';
let restaurer = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal-cargo'));
  FAUX_CMAKE = installerFauxCmake(ESSAIS);
});
afterAll(() => restaurer());

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const CMAKE = (nom: string) => `cmake_minimum_required(VERSION 3.16)\nproject(${nom} C)\n`;

// A project of one crate `noyau` and one package c `osd-embed`, with a test.
function projet() {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(racine, 'package.json', JSON.stringify({ name: 'p', private: true }));
  declarerLesLangages(racine, { noyau: 'cargo', 'osd-embed': 'c' });
  ecrire(racine, 'Cargo.toml', '[workspace]\nmembers = ["noyau"]\nresolver = "2"\n');
  ecrire(racine, 'noyau/Cargo.toml', '[package]\nname = "noyau"\nversion = "0.1.0"\n');
  ecrire(racine, 'noyau/src/lib.rs', '');
  ecrire(racine, 'osd-embed/CMakeLists.txt', CMAKE('osd-embed'));
  ecrire(racine, 'osd-embed/src/osd_embed.c', '');
  ecrire(racine, 'osd-embed/tests/test_a.c', 'int main(void) { return 0; }\n');
  return racine;
}

describe('un projet cargo et c — les deux modules servent ensemble', () => {
  it('the languages are composed, each folder claimed by one module', () => {
    const racine = projet();
    const l = langageDe(racine);
    expect(l.nom).toBe('cargo+c');
    const dossiers = l.composants(racine).map(x => path.relative(racine, x.dossier));
    expect(dossiers.sort()).toEqual(['noyau', 'osd-embed']);
    expect(l.composantDe(racine, 'noyau/src/lib.rs')?.nom).toBe('noyau');
    expect(l.composantDe(racine, 'osd-embed/tests/test_a.c')?.nom).toBe('osd-embed');
  });

  it('the verdict of a run of the c package is read by the composition, beside cargo’s', () => {
    const racine = projet();
    const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
    const cmd = c.commandes(racine)['tests-du-paquet'];
    const r = spawnSync(process.execPath, [cmd.script, ...cmd.args, 'osd-embed'], {
      cwd: racine,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${FAUX_CMAKE}${path.delimiter}${process.env.PATH ?? ''}`,
        GRILLHOUSE_RESULTATS: resultats,
      },
    });
    expect(r.status, r.stderr).toBe(0);
    const v = langageDe(racine).verdict(resultats);
    expect(v.rapports.map(x => path.relative(racine, x.fichier))).toEqual([
      'osd-embed/tests/test_a.c',
    ]);
    expect(v.taches.map(t => [t.tache, t.code])).toEqual([['osd-embed#ctest', 0]]);
  });

  it('the guard of the languages finds nothing on such a project', () => {
    expect(constats(projet())).toEqual([]);
  });
});

describe('un dossier cargo et c à la fois est refusé', () => {
  for (const declare of ['cargo', 'c']) {
    it(`a folder holding Cargo.toml and a CMakeLists.txt with project(), declared ${declare}, is refused, both manifests named`, () => {
      const racine = mkdtempSync(path.join(ESSAIS, 'mixte-'));
      ecrire(racine, 'package.json', JSON.stringify({ name: 'p', private: true }));
      declarerLesLangages(racine, { mixte: declare });
      ecrire(racine, 'Cargo.toml', '[workspace]\nmembers = ["mixte"]\nresolver = "2"\n');
      ecrire(racine, 'mixte/Cargo.toml', '[package]\nname = "mixte"\nversion = "0.1.0"\n');
      ecrire(racine, 'mixte/src/lib.rs', '');
      ecrire(racine, 'mixte/CMakeLists.txt', CMAKE('mixte'));
      const messages = constats(racine).map(x => x.message);
      expect(messages.length).toBeGreaterThan(0);
      expect(
        messages.some(
          m => m.includes('mixte') && m.includes('Cargo.toml') && m.includes('CMakeLists.txt')
        )
      ).toBe(true);
    });
  }

  it('a CMakeLists.txt without project() beside a Cargo.toml is no second language', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'sans-project-'));
    ecrire(racine, 'package.json', JSON.stringify({ name: 'p', private: true }));
    declarerLesLangages(racine, { mixte: 'cargo' });
    ecrire(racine, 'Cargo.toml', '[workspace]\nmembers = ["mixte"]\nresolver = "2"\n');
    ecrire(racine, 'mixte/Cargo.toml', '[package]\nname = "mixte"\nversion = "0.1.0"\n');
    ecrire(racine, 'mixte/src/lib.rs', '');
    ecrire(racine, 'mixte/CMakeLists.txt', 'add_subdirectory(x)\n');
    expect(readFileSync(path.join(racine, 'mixte/CMakeLists.txt'), 'utf8')).not.toMatch(
      /project\(/
    );
    expect(constats(racine)).toEqual([]);
  });
});
