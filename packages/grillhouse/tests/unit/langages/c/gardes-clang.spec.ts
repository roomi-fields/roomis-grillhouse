// The two guards of the module c, on the model of the guard clippy of the module cargo: the guard
// `clang-format` (every .c and .h of a package conforms to its .clang-format) and the guard
// `clang-tidy` (the package configured by cmake in .build-cmake/<paquet>, clang-tidy played on its
// compile_commands.json), both without debt: a finding refuses, named by its file, its line and its
// rule. Each is a command of the module by its name and a guard of its list. Against the fake
// clang-format, clang-tidy and cmake (./faux-outils-c.ts, ./faux-cmake.ts): the real ones play at
// night (c.nuit.test.ts).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import type { Langage } from '../../../../scripts/jointure.js';
import { installerFauxCmake } from './faux-cmake.js';
import { installerFauxOutilsC } from './faux-outils-c.js';
import { moduleC } from './module-c.js';

const c: Langage = moduleC;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'gardes-clang-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const JOURNAL = path.join(ESSAIS, 'journal-outils');
const JOURNAL_CMAKE = path.join(ESSAIS, 'journal-cmake');
let CMAKE: string;
let OUTILS: string;
beforeAll(() => {
  CMAKE = installerFauxCmake(ESSAIS);
  OUTILS = installerFauxOutilsC(ESSAIS);
});

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

// A project whose package `osd-embed` is declared c, with its two configuration files.
function projet({ format = true, tidy = true } = {}) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(racine, 'package.json', JSON.stringify({ name: 'p', private: true }));
  declarerLesLangages(racine, { 'osd-embed': 'c' });
  ecrire(
    racine,
    'osd-embed/CMakeLists.txt',
    'cmake_minimum_required(VERSION 3.16)\nproject(osd-embed C)\nadd_subdirectory(tests)\n'
  );
  ecrire(racine, 'osd-embed/src/osd_embed.h', '#ifndef OSD_EMBED_H\n#define OSD_EMBED_H\n#endif\n');
  ecrire(racine, 'osd-embed/src/osd_embed.c', '#include "osd_embed.h"\n');
  ecrire(racine, 'osd-embed/tests/CMakeLists.txt', 'file(GLOB TESTS CONFIGURE_DEPENDS test_*.c)\n');
  ecrire(racine, 'osd-embed/tests/test_a.c', 'int main(void) { return 0; }\n');
  ecrire(racine, 'osd-embed/tests/aide.h', '#define AIDE 1\n');
  if (format) {
    ecrire(racine, 'osd-embed/.clang-format', 'BasedOnStyle: LLVM\nColumnLimit: 100\n');
  }
  if (tidy) {
    ecrire(racine, 'osd-embed/.clang-tidy', "Checks: '-*,bugprone-*'\nWarningsAsErrors: '*'\n");
  }
  return racine;
}

type Appel = { outil: string; args: string[]; cwd: string };
const journal = (f: string): Appel[] =>
  existsSync(f)
    ? readFileSync(f, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(l => JSON.parse(l) as Appel)
        .filter(a => !a.args.includes('--version'))
    : [];

// Plays the guard <nom> of the module in <racine>, the fake tools first on the PATH (<sans> the
// directories left out of it): its code and its error stream, the calls of each fake.
function lancer(
  racine: string,
  nom: string,
  env: NodeJS.ProcessEnv = {},
  dossiers: string[] = [CMAKE, OUTILS]
) {
  writeFileSync(JOURNAL, '');
  writeFileSync(JOURNAL_CMAKE, '');
  const cmd = c.commandes(racine)[nom];
  const r = spawnSync(process.execPath, [cmd.script, ...cmd.args], {
    cwd: racine,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: dossiers.join(path.delimiter),
      FAUX_OUTILS_C_JOURNAL: JOURNAL,
      FAUX_CMAKE_JOURNAL: JOURNAL_CMAKE,
      ...env,
    },
  });
  return {
    code: r.status,
    stderr: r.stderr,
    clang: journal(JOURNAL),
    cmake: journal(JOURNAL_CMAKE),
  };
}

const resolu = (a: Appel, p: string) => path.resolve(a.cwd, p);
const apres = (a: Appel, option: string) => a.args[a.args.indexOf(option) + 1];
const lignes = (s: string) => s.split('\n').filter(l => l.trim() !== '');

describe('la garde clang-format', () => {
  it('is a command of the module and a guard of its list', () => {
    const racine = projet();
    expect(c.commandes(racine)['clang-format'].script).toMatch(/langages\/c\/clang-format\.mjs$/);
    expect(c.gardes().map(g => g[0])).toEqual(
      expect.arrayContaining([expect.stringMatching(/langages\/c\/clang-format\.mjs$/)])
    );
  });

  it('accepts conforming files, played with --dry-run --Werror on every .c and .h of the package', () => {
    const racine = projet();
    const r = lancer(racine, 'clang-format');
    expect(r.code, r.stderr).toBe(0);
    expect(r.clang.map(a => a.outil)).toContain('clang-format');
    const appels = r.clang.filter(a => a.outil === 'clang-format');
    for (const a of appels) {
      expect(a.args).toContain('--dry-run');
      expect(a.args).toContain('--Werror');
    }
    const fichiers = appels.flatMap(a =>
      a.args.filter(x => /\.[ch]$/.test(x)).map(x => resolu(a, x))
    );
    for (const f of ['src/osd_embed.c', 'src/osd_embed.h', 'tests/test_a.c', 'tests/aide.h']) {
      expect(fichiers, f).toContain(path.join(racine, 'osd-embed', f));
    }
  });

  it('refuses a non-conforming file, named, and only that one', () => {
    const racine = projet();
    ecrire(
      racine,
      'osd-embed/src/osd_embed.c',
      '#include "osd_embed.h"\nint  x ;/* NONCONFORME */\n'
    );
    const r = lancer(racine, 'clang-format');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('osd-embed/src/osd_embed.c');
    expect(r.stderr).not.toContain('test_a.c');
    expect(r.stderr).not.toContain('aide.h');
  });

  it('refuses a non-conforming header of tests/ as well', () => {
    const racine = projet();
    ecrire(racine, 'osd-embed/tests/aide.h', '#define  AIDE   1 /* NONCONFORME */\n');
    const r = lancer(racine, 'clang-format');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('osd-embed/tests/aide.h');
  });

  it('has no debt: the debt mode never inscribes a finding', () => {
    const racine = projet();
    ecrire(racine, 'osd-embed/src/osd_embed.c', '/* NONCONFORME */\n');
    const r = lancer(racine, 'clang-format', { GRILLHOUSE_DETTE: 'inscrire' });
    expect(r.code).toBe(1);
    const dette = path.join(racine, 'grillhouse-dette.json');
    expect(!existsSync(dette) || !readFileSync(dette, 'utf8').includes('clang-format')).toBe(true);
  });

  it('a clang-format absent from the PATH refuses in one line that names the tool and `npx grillhouse binaires`', () => {
    const r = lancer(projet(), 'clang-format', {}, [
      CMAKE,
      installerFauxOutilsC(ESSAIS, ['clang-format']),
    ]);
    expect(r.code).toBe(1);
    expect(lignes(r.stderr)).toHaveLength(1);
    expect(r.stderr).toContain('clang-format');
    expect(r.stderr).toContain('npx grillhouse binaires');
    expect(r.clang).toEqual([]);
  });

  it('a package without .clang-format refuses in one line that names the file, clang-format never run', () => {
    const r = lancer(projet({ format: false }), 'clang-format');
    expect(r.code).toBe(1);
    expect(lignes(r.stderr)).toHaveLength(1);
    expect(r.stderr).toContain('.clang-format');
    expect(r.clang).toEqual([]);
  });
});

describe('la garde clang-tidy', () => {
  const SORTIE = [
    '/!\\/osd-embed/src/osd_embed.c:3:5: warning: narrowing conversion from int to char [bugprone-narrowing-conversions]',
    '    3 |     char c = n;',
    '/!\\/osd-embed/src/osd_embed.c:2:1: note: expanded from macro faux',
    '/!\\/osd-embed/tests/test_a.c:7:9: error: the value returned by this function should be used [cert-err33-c]',
    '',
  ];
  const ecrireSortie = (racine: string, texte: string[]) => {
    const f = path.join(ESSAIS, `sortie-${Math.random().toString(36).slice(2)}.txt`);
    writeFileSync(f, texte.join('\n').replaceAll('/!\\', racine));
    return f;
  };

  it('is a command of the module and a guard of its list', () => {
    const racine = projet();
    expect(c.commandes(racine)['clang-tidy'].script).toMatch(/langages\/c\/clang-tidy\.mjs$/);
    expect(c.gardes().map(g => g[0])).toEqual(
      expect.arrayContaining([expect.stringMatching(/langages\/c\/clang-tidy\.mjs$/)])
    );
  });

  it('configures the package in .build-cmake/<paquet> with the compile commands exported, then plays clang-tidy on that directory', () => {
    const racine = projet();
    const r = lancer(racine, 'clang-tidy');
    expect(r.code, r.stderr).toBe(0);
    const configure = r.cmake.find(a => a.args.includes('-S'))!;
    const construction = path.join(racine, '.build-cmake', 'osd-embed');
    expect(resolu(configure, apres(configure, '-S'))).toBe(path.join(racine, 'osd-embed'));
    expect(resolu(configure, apres(configure, '-B'))).toBe(construction);
    expect(configure.args).toContain('-DCMAKE_EXPORT_COMPILE_COMMANDS=ON');
    const tidy = r.clang.find(a => a.outil === 'clang-tidy')!;
    const p = tidy.args.includes('-p')
      ? apres(tidy, '-p')
      : tidy.args.find(a => a.startsWith('-p='))?.slice(3);
    expect(resolu(tidy, p!)).toBe(construction);
  });

  it('a run without finding is green', () => {
    const racine = projet();
    expect(
      lancer(racine, 'clang-tidy', { FAUX_CLANG_TIDY_SORTIE: ecrireSortie(racine, ['']) }).code
    ).toBe(0);
  });

  it('refuses each warning and each error as a finding with its file, its line and its rule, a note being none', () => {
    const racine = projet();
    const r = lancer(racine, 'clang-tidy', {
      FAUX_CLANG_TIDY_SORTIE: ecrireSortie(racine, SORTIE),
      FAUX_CLANG_TIDY_CODE: '1',
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/osd-embed\/src\/osd_embed\.c:3[^\n]*bugprone-narrowing-conversions/);
    expect(r.stderr).toMatch(/osd-embed\/tests\/test_a\.c:7[^\n]*cert-err33-c/);
    expect(r.stderr).not.toContain('expanded from macro');
  });

  it('has no debt: the debt mode never inscribes a finding', () => {
    const racine = projet();
    const r = lancer(racine, 'clang-tidy', {
      FAUX_CLANG_TIDY_SORTIE: ecrireSortie(racine, SORTIE),
      FAUX_CLANG_TIDY_CODE: '1',
      GRILLHOUSE_DETTE: 'inscrire',
    });
    expect(r.code).toBe(1);
    const dette = path.join(racine, 'grillhouse-dette.json');
    expect(!existsSync(dette) || !readFileSync(dette, 'utf8').includes('clang-tidy')).toBe(true);
  });

  it('a clang-tidy that fails without any finding refuses, its error stream named', () => {
    const racine = projet();
    const r = lancer(racine, 'clang-tidy', {
      FAUX_CLANG_TIDY_CODE: '2',
      FAUX_CLANG_TIDY_ERREUR: 'boom-de-clang-tidy',
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('boom-de-clang-tidy');
  });

  it('a clang-tidy absent from the PATH refuses in one line that names the tool and `npx grillhouse binaires`', () => {
    const r = lancer(projet(), 'clang-tidy', {}, [
      CMAKE,
      installerFauxOutilsC(ESSAIS, ['clang-tidy']),
    ]);
    expect(r.code).toBe(1);
    expect(lignes(r.stderr)).toHaveLength(1);
    expect(r.stderr).toContain('clang-tidy');
    expect(r.stderr).toContain('npx grillhouse binaires');
    expect(r.clang).toEqual([]);
  });

  it('a cmake absent from the PATH refuses in one line that names it, clang-tidy never run', () => {
    const r = lancer(projet(), 'clang-tidy', {}, [OUTILS]);
    expect(r.code).toBe(1);
    expect(lignes(r.stderr)).toHaveLength(1);
    expect(r.stderr).toContain('cmake');
    expect(r.clang).toEqual([]);
  });

  it('a package without .clang-tidy refuses in one line that names the file, clang-tidy never run', () => {
    const r = lancer(projet({ tidy: false }), 'clang-tidy');
    expect(r.code).toBe(1);
    expect(lignes(r.stderr)).toHaveLength(1);
    expect(r.stderr).toContain('.clang-tidy');
    expect(r.clang).toEqual([]);
  });

  it('a configuration that fails is refused with the code of cmake, never rendered as a lint finding', () => {
    const racine = projet();
    const r = lancer(racine, 'clang-tidy', {
      FAUX_CMAKE_CODES: JSON.stringify({ configure: 3 }),
      FAUX_CLANG_TIDY_SORTIE: ecrireSortie(racine, SORTIE),
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/cmake[^\n]*\b3\b/);
    expect(r.stderr).not.toMatch(/bugprone-|cert-/);
    expect(r.clang.filter(a => a.outil === 'clang-tidy')).toEqual([]);
  });
});
