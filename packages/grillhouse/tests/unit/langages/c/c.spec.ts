// The module c: a package of C declared in the architecture carries its CMakeLists.txt at its
// root (its `project(<nom>`), `src/<nom>.h` and `src/<nom>.c`, and `tests/`, where every
// `tests/test_*.c` is one executable and one CTest test (`file(GLOB … CONFIGURE_DEPENDS)` of the
// skeleton's `tests/CMakeLists.txt`). CMake configures, compiles and CTest plays it in
// `.build-cmake/<paquet>` at the root, outside the package's tree; the JUnit report CTest writes
// is taken as it is and read by file for the verdict. Against the fake cmake and ctest
// (./faux-cmake.ts); the real ones play at night (c.nuit.test.ts).
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { sortiesDuLangage } from '../../../../scripts/enveloppe/enveloppe.mjs';
import type { Langage } from '../../../../scripts/jointure.js';
import { constats } from '../../../../scripts/langages-des-paquets.mjs';
import { LANGAGES, langageDe, langagesDeclares } from '../../../../scripts/langages.mjs';
import { moduleC } from './module-c.js';
import { installerFauxCmake } from './faux-cmake.js';

const c: Langage = moduleC;
const DEPOT = path.resolve(__dirname, '../../../../../..');

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'c-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const JOURNAL = path.join(ESSAIS, 'journal');
let FAUX: string;
beforeAll(() => {
  FAUX = installerFauxCmake(ESSAIS);
});

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

const CMAKE = (nom: string) =>
  `cmake_minimum_required(VERSION 3.16)\nproject(${nom} C)\nadd_subdirectory(tests)\n`;
const CMAKE_DES_TESTS = 'file(GLOB TESTS CONFIGURE_DEPENDS test_*.c)\n';

// A project whose package `osd-embed` is declared c: its CMakeLists.txt, its two files of source,
// two test files, a helper and the CMakeLists.txt of tests/.
function projet() {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(racine, 'package.json', JSON.stringify({ name: 'p', private: true }));
  declarerLesLangages(racine, { 'osd-embed': 'c' });
  ecrire(racine, 'osd-embed/CMakeLists.txt', CMAKE('osd-embed'));
  ecrire(racine, 'osd-embed/src/osd_embed.h', '#ifndef OSD_EMBED_H\n#define OSD_EMBED_H\n#endif\n');
  ecrire(racine, 'osd-embed/src/osd_embed.c', '#include "osd_embed.h"\n');
  ecrire(racine, 'osd-embed/tests/CMakeLists.txt', CMAKE_DES_TESTS);
  ecrire(racine, 'osd-embed/tests/test_a.c', 'int main(void) { return 0; }\n');
  ecrire(racine, 'osd-embed/tests/test_b.c', 'int main(void) { return 0; }\n');
  ecrire(racine, 'osd-embed/tests/aide.h', '#define AIDE 1\n');
  return racine;
}

type Appel = {
  outil: string;
  args: string[];
  cwd: string;
  tmpdir: string | null;
  junit: string | null;
};

// Runs the command <nom> of the module in <racine> with <args>, the fake cmake and ctest first on
// the PATH (<path> to replace it): `{ code, stderr, appels, verdict, resultats }`, `appels` the
// calls of the two tools in order.
function lancer(
  racine: string,
  nom: string,
  args: string[] = [],
  env: NodeJS.ProcessEnv = {},
  path_: string = FAUX
) {
  writeFileSync(JOURNAL, '');
  const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  const cmd = c.commandes(racine)[nom];
  const r = spawnSync(process.execPath, [cmd.script, ...cmd.args, ...args], {
    cwd: racine,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: path_,
      GRILLHOUSE_RESULTATS: resultats,
      FAUX_CMAKE_JOURNAL: JOURNAL,
      ...env,
    },
  });
  const appels = readFileSync(JOURNAL, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as Appel)
    .filter(a => !a.args.includes('--version'));
  return { code: r.status, stderr: r.stderr, appels, verdict: c.verdict(resultats), resultats };
}

// The path <p> a tool was given, resolved from its working directory.
const resolu = (a: Appel, p: string) => path.resolve(a.cwd, p);
const apres = (a: Appel, option: string) => a.args[a.args.indexOf(option) + 1];

// Every file under <dossier>.
const fichiers = (dossier: string): string[] =>
  readdirSync(dossier).flatMap(n => {
    const f = path.join(dossier, n);
    return statSync(f).isDirectory() ? fichiers(f) : [f];
  });

describe('le module c — un paquet c porte son CMakeLists.txt', () => {
  it('the frame’s list names c, its manifest a CMakeLists.txt', () => {
    expect(LANGAGES).toHaveProperty('c', './langages/c/index.mjs');
    expect(c.nom).toBe('c');
    expect(c.manifeste).toBe('CMakeLists.txt');
  });

  it('a project that declares c in the column « Langage » is accepted', () => {
    const racine = projet();
    expect(langagesDeclares(racine)).toEqual(['c']);
    expect(langageDe(racine).nom).toBe('c');
  });

  it('a folder whose CMakeLists.txt calls project(<nom> is a component of that name', () => {
    const racine = projet();
    expect(c.composants(racine)).toEqual([
      expect.objectContaining({ dossier: path.join(racine, 'osd-embed'), nom: 'osd-embed' }),
    ]);
    expect(c.composantDe(racine, 'osd-embed/src/osd_embed.c')?.nom).toBe('osd-embed');
    expect(c.composantDe(racine, 'osd-embed/tests/test_a.c')?.nom).toBe('osd-embed');
    expect(c.composantDe(racine, 'docs/ARCHITECTURE.md')).toBeNull();
    expect(c.joueDesTests(racine, c.composants(racine)[0])).toBe(true);
  });

  it.each([
    ['lowercase, name and language on the line', 'project(alpha C)', 'alpha'],
    ['any case, a space before the parenthesis', 'PROJECT (beta LANGUAGES C)', 'beta'],
    ['mixed case', 'Project(gamma_2 VERSION 1.0)', 'gamma_2'],
    ['the name on the next line', 'project(\n  delta\n  C)', 'delta'],
    ['a commented project( left out', '# project(faux C)\nproject(epsilon C)', 'epsilon'],
    ['a comment after the call', 'project(zeta C) # le paquet', 'zeta'],
  ])('project( read: %s', (_cas, texte, nom) => {
    const racine = mkdtempSync(path.join(ESSAIS, 'lecture-'));
    ecrire(racine, 'dossier/CMakeLists.txt', `cmake_minimum_required(VERSION 3.16)\n${texte}\n`);
    expect(c.composants(racine).map(x => [path.basename(x.dossier), x.nom])).toEqual([
      ['dossier', nom],
    ]);
  });

  it('a CMakeLists.txt without project( is no component; nor is the CMakeLists.txt of tests/', () => {
    const racine = projet();
    ecrire(racine, 'cmake/CMakeLists.txt', 'add_subdirectory(x)\n# project(commente C)\n');
    expect(c.composants(racine).map(x => x.nom)).toEqual(['osd-embed']);
    expect(c.composantDe(racine, 'osd-embed/tests/CMakeLists.txt')?.nom).toBe('osd-embed');
  });

  it('a package without test_*.c plays no test', () => {
    const racine = projet();
    rmSync(path.join(racine, 'osd-embed/tests/test_a.c'));
    rmSync(path.join(racine, 'osd-embed/tests/test_b.c'));
    expect(c.joueDesTests(racine, c.composants(racine)[0])).toBe(false);
  });

  it('the guard of the languages: declared c and with its CMakeLists.txt, no finding; without it, refused', () => {
    const racine = projet();
    expect(constats(racine)).toEqual([]);
    rmSync(path.join(racine, 'osd-embed/CMakeLists.txt'));
    expect(constats(racine).map(x => x.message)).toEqual([
      'osd-embed : déclaré c (docs/ARCHITECTURE.md:5), sans son CMakeLists.txt.',
    ]);
  });

  it('a CMakeLists.txt with project( that no row declares is refused, named', () => {
    const racine = projet();
    ecrire(racine, 'autre/CMakeLists.txt', CMAKE('autre'));
    expect(constats(racine).map(x => x.message)).toEqual([
      expect.stringMatching(
        /^autre : paquet c \(son CMakeLists\.txt\) que docs\/ARCHITECTURE\.md ne déclare pas/
      ),
    ]);
  });

  it('a CMakeLists.txt without project( that no row declares is no package: no finding', () => {
    const racine = projet();
    ecrire(racine, 'cmake/CMakeLists.txt', 'add_subdirectory(x)\n');
    expect(constats(racine)).toEqual([]);
  });

  it('a package whose project() name differs from the one its row declares is refused, both named', () => {
    const racine = projet();
    ecrire(racine, 'osd-embed/CMakeLists.txt', CMAKE('autre'));
    const messages = constats(racine).map(x => x.message);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('osd-embed');
    expect(messages[0]).toContain('autre');
    expect(messages[0]).toContain('project(');
  });
});

describe('le module c — ce que le testwriter écrit', () => {
  it('tests/test_*.c are played; the rest of tests/ is his matter, not played; the code is not his', () => {
    const racine = projet();
    const joue = { joue: true, test: true, matiere: false };
    const matiere = { joue: false, test: true, matiere: false };
    expect(c.estUnTest('osd-embed/tests/test_a.c', racine)).toEqual(joue);
    expect(c.estUnTest('osd-embed/tests/test_nouveau.c', racine)).toEqual(joue);
    expect(c.estUnTest('osd-embed/tests/aide.h', racine)).toEqual(matiere);
    expect(c.estUnTest('osd-embed/tests/CMakeLists.txt', racine)).toEqual(matiere);
    expect(c.estUnTest('osd-embed/tests/donnees/scene.bin', racine)).toEqual(matiere);
    expect(c.estUnTest('osd-embed/src/osd_embed.c', racine)).toBeNull();
    expect(c.estUnTest('osd-embed/src/test_x.c', racine)).toBeNull();
    expect(c.estUnTest('osd-embed/CMakeLists.txt', racine)).toBeNull();
    expect(c.estUnTest('docs/ARCHITECTURE.md', racine)).toBeNull();
  });

  it('the CMakeLists.txt of the package’s root is refused to him, named; he has no lock file', () => {
    const racine = projet();
    expect(c.manifestes.verrous).toEqual([]);
    const f = 'osd-embed/CMakeLists.txt';
    const avant = readFileSync(path.join(racine, f), 'utf8');
    const refus = c.manifestes.horsDesTests(f, racine, avant, `${avant}add_definitions(-DX)\n`);
    expect(refus?.join(' ')).toContain('CMakeLists.txt');
    expect(refus).not.toEqual([]);
    // The CMakeLists.txt of tests/ is his matter, no manifest.
    expect(
      c.manifestes.horsDesTests('osd-embed/tests/CMakeLists.txt', racine, '', 'x\n')
    ).toBeNull();
    expect(c.manifestes.horsDesTests('osd-embed/src/osd_embed.c', racine, '', 'x\n')).toBeNull();
  });
});

describe('le module c — les tests par CMake et CTest', () => {
  it('each command is its script of the module and its name', () => {
    const cmd = c.commandes(ESSAIS);
    for (const nom of ['tester', 'verifier', 'typer', 'construire', 'tests-du-paquet']) {
      expect(cmd[nom].script, nom).toMatch(/langages\/c\/commandes\.mjs$/);
      expect(cmd[nom].args, nom).toEqual([nom]);
    }
  });

  it('a package played whole is configured, compiled and played by CTest in .build-cmake/<paquet>, outside its tree', () => {
    const racine = projet();
    const r = lancer(racine, 'tests-du-paquet', ['osd-embed']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.appels.map(a => a.outil)).toEqual(['cmake', 'cmake', 'ctest']);
    const [configure, compile, ctest] = r.appels;
    const construction = path.join(racine, '.build-cmake', 'osd-embed');
    expect(resolu(configure, apres(configure, '-S'))).toBe(path.join(racine, 'osd-embed'));
    expect(resolu(configure, apres(configure, '-B'))).toBe(construction);
    expect(compile.args[0]).toBe('--build');
    expect(resolu(compile, compile.args[1])).toBe(construction);
    expect(resolu(ctest, apres(ctest, '--test-dir'))).toBe(construction);
    expect(ctest.args).toContain('--output-junit');
    expect(fichiers(path.join(racine, 'osd-embed')).some(f => f.includes('CMakeCache'))).toBe(
      false
    );
  });

  it('the verdict has a report by file tests/<nom>.c, each CTest test its case', () => {
    const racine = projet();
    const r = lancer(racine, 'tests-du-paquet', ['osd-embed']);
    expect(r.verdict.taches.map(t => [t.tache, t.tests, t.code])).toEqual([
      ['osd-embed#ctest', true, 0],
    ]);
    expect(r.verdict.rapports).toEqual([
      {
        fichier: path.join(racine, 'osd-embed/tests/test_a.c'),
        etat: 'passed',
        message: '',
        tests: [{ titre: 'test_a', nom: 'test_a', etat: 'passed', message: '' }],
      },
      {
        fichier: path.join(racine, 'osd-embed/tests/test_b.c'),
        etat: 'passed',
        message: '',
        tests: [{ titre: 'test_b', nom: 'test_b', etat: 'passed', message: '' }],
      },
    ]);
  });

  it('the JUnit report CTest wrote is kept as it is for the report file', () => {
    const racine = projet();
    const r = lancer(racine, 'tests-du-paquet', ['osd-embed']);
    const ecrit = r.appels.find(a => a.outil === 'ctest')?.junit;
    expect(ecrit).toContain('<testcase name="test_a"');
    const gardes = fichiers(r.resultats).filter(f => f.endsWith('.xml'));
    expect(gardes.map(f => readFileSync(f, 'utf8'))).toEqual([ecrit]);
  });

  it('a red test: the code 1, the report of its file failed, its message the output of the test', () => {
    const r = lancer(projet(), 'tests-du-paquet', ['osd-embed'], {
      FAUX_CTEST_ECHECS: JSON.stringify({ test_b: 'attendu 1, obtenu 2 & <fin>' }),
    });
    expect(r.code).toBe(1);
    const parNom = Object.fromEntries(r.verdict.rapports.map(x => [path.basename(x.fichier), x]));
    expect(parNom['test_a.c'].etat).toBe('passed');
    expect(parNom['test_b.c'].etat).toBe('failed');
    expect(parNom['test_b.c'].tests[0]).toEqual({
      titre: 'test_b',
      nom: 'test_b',
      etat: 'failed',
      message: 'attendu 1, obtenu 2 & <fin>',
    });
    expect(r.verdict.taches.map(t => t.code)).toEqual([1]);
  });

  it('a test file named plays alone', () => {
    const racine = projet();
    const r = lancer(racine, 'tests-du-paquet', ['osd-embed/tests/test_a.c']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.verdict.rapports.map(x => path.basename(x.fichier))).toEqual(['test_a.c']);
  });

  it('a package played whole without any test is green', () => {
    const racine = projet();
    rmSync(path.join(racine, 'osd-embed/tests/test_a.c'));
    rmSync(path.join(racine, 'osd-embed/tests/test_b.c'));
    const r = lancer(racine, 'tests-du-paquet', ['osd-embed']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.verdict.taches.map(t => [t.tache, t.code])).toEqual([['osd-embed#ctest', 0]]);
    expect(r.verdict.rapports).toEqual([]);
  });

  it('a test file named that CTest does not know is red', () => {
    const r = lancer(projet(), 'tests-du-paquet', ['osd-embed/tests/test_a.c'], {
      FAUX_CMAKE_SANS_TESTS: '1',
    });
    expect(r.code).toBe(1);
  });

  it('a path out of the test files is refused, named, and nothing plays', () => {
    const racine = projet();
    for (const chemin of [
      'osd-embed/src/osd_embed.c',
      'osd-embed/tests/aide.h',
      'osd-embed/CMakeLists.txt',
      'docs/ARCHITECTURE.md',
    ]) {
      const r = lancer(racine, 'tests-du-paquet', [chemin]);
      expect(r.code, chemin).toBe(2);
      expect(r.stderr, chemin).toContain(chemin);
      expect(r.appels, chemin).toEqual([]);
    }
  });

  it('test files that CTest registers none of are red, « fichier de test non pris par CTest »', () => {
    const racine = projet();
    const r = lancer(racine, 'tests-du-paquet', ['osd-embed'], { FAUX_CMAKE_SANS_TESTS: '1' });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('fichier de test non pris par CTest');
    expect(r.stderr).toContain('tests/test_a.c');
  });
});

describe('le module c — la compilation', () => {
  it('a compilation error makes the build red, and no test plays', () => {
    const r = lancer(projet(), 'tests-du-paquet', ['osd-embed'], {
      FAUX_CMAKE_CODES: JSON.stringify({ build: 1 }),
    });
    expect(r.code).toBe(1);
    expect(r.appels.map(a => a.outil)).toEqual(['cmake', 'cmake']);
    expect(r.verdict.taches.some(t => t.code !== 0)).toBe(true);
    expect(r.verdict.rapports).toEqual([]);
    expect(r.stderr).toContain('error: unknown type name');
  });

  it('the log of a compiler error shows a compilation failure, any other log does not', () => {
    expect(c.echecDeCompilation("src/x.c:1:1: error: unknown type name 'faux'")).toBe(true);
    expect(c.echecDeCompilation('test_a ..... Passed')).toBe(false);
  });

  it('typer replays the compilation: configured, compiled, red on an error', () => {
    const racine = projet();
    const bon = lancer(racine, 'typer');
    expect(bon.code, bon.stderr).toBe(0);
    expect(bon.appels.map(a => a.outil)).toEqual(['cmake', 'cmake']);
    expect(bon.appels[1].args[0]).toBe('--build');
    const mauvais = lancer(racine, 'typer', [], {
      FAUX_CMAKE_CODES: JSON.stringify({ build: 1 }),
    });
    expect(mauvais.code).toBe(1);
  });

  it('construire builds the one package named, in its directory under .build-cmake', () => {
    const racine = projet();
    const r = lancer(racine, 'construire', ['osd-embed']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.appels.map(a => a.outil)).toEqual(['cmake', 'cmake']);
    expect(resolu(r.appels[0], apres(r.appels[0], '-B'))).toBe(
      path.join(racine, '.build-cmake', 'osd-embed')
    );
  });
});

describe('le module c — l’enveloppe, la mise à jour et le poste', () => {
  it('.build-cmake is written by a session and ignored by git', () => {
    expect(c.sorties.ecrites).toContain('.build-cmake/');
    const s = sortiesDuLangage(c.sorties, { maison: '/home/x', principal: '/depot' });
    expect(s.sorties.ecrites).toContain('.build-cmake');
    expect(c.ignorer).toContain('.build-cmake');
  });

  it('ctest run directly is refused to a role that writes', () => {
    expect(c.droits).toEqual(expect.arrayContaining(['Bash(ctest*)']));
  });

  it('cmake and ctest are required of the poste', () => {
    expect(c.executables).toEqual(expect.arrayContaining(['cmake', 'ctest']));
  });

  it('a poste without cmake, or without ctest, fails by naming the tool', () => {
    const racine = projet();
    const vide = mkdtempSync(path.join(ESSAIS, 'vide-'));
    const sansCmake = lancer(racine, 'tests-du-paquet', ['osd-embed'], {}, vide);
    expect(sansCmake.code).not.toBe(0);
    expect(sansCmake.stderr).toContain('cmake');
    const sansCtest = installerFauxCmake(ESSAIS, 'ctest');
    const r = lancer(racine, 'tests-du-paquet', ['osd-embed'], {}, sansCtest);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ctest');
  });

  it('the update lays the template templates/c, which gives the test scripts a project lacks', () => {
    const p: { scripts?: Record<string, string> } = { scripts: { test: 'le mien' } };
    const modele = JSON.parse(
      readFileSync(path.join(DEPOT, 'templates/c/package.json'), 'utf8')
    ) as Record<string, unknown>;
    const part = c.miseAJour.appliquer(ESSAIS, { p, modele, source: '', version: '0' });
    expect(p.scripts).toEqual({
      test: 'le mien',
      'test:forcer': 'grillhouse tests --force',
      verifier: 'grillhouse verifier',
    });
    expect(part.bilan).toEqual({ scripts: ['test:forcer', 'verifier'], turbo: null });
    expect(c.miseAJour.gabarit).toBe('templates/c');
  });
});
