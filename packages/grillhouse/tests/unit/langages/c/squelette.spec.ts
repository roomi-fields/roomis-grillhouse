// The skeleton of a package c, which `grillhouse paquet <dossier>` writes (scripts/paquet.mjs), as
// `cmake` projects and `cargo new --lib` give one: its CMakeLists.txt (C99 strict, warnings as
// errors, a static library, the tests below), its two files of source without behaviour, the
// CMakeLists.txt of tests/ that takes every test_*.c, the package.json of the graph and the entry
// of the workspaces; a folder that already holds a CMakeLists.txt is refused.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ecrireLePaquet, planDuPaquet } from '../../../../scripts/paquet.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'squelette-c-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');

// A project whose table declares the packages <noms> in c, its root package.json holding
// <workspaces>.
function projet(noms: string[], workspaces: string[] = []): string {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(
    racine,
    'docs/ARCHITECTURE.md',
    `# Architecture\n\n| Composant | Rôle | Langage |\n| --- | --- | --- |\n${noms
      .map(n => `| \`${n}\` | un paquet | c |`)
      .join('\n')}\n`
  );
  ecrire(
    racine,
    'package.json',
    `${JSON.stringify({ name: 'osd', private: true, workspaces }, null, 2)}\n`
  );
  return racine;
}

describe('le squelette c — ce que grillhouse paquet écrit', () => {
  it('the CMakeLists.txt: C99 strict, warnings as errors, a static library, the tests below', () => {
    const racine = projet(['osd-embed']);
    const f = planDuPaquet(racine, 'osd-embed').fichiers;
    const cmake = f['osd-embed/CMakeLists.txt'];
    expect(cmake).toMatch(/^\s*project\(\s*osd-embed\b/im);
    expect(cmake).toMatch(/CMAKE_C_STANDARD\s+99/);
    expect(cmake).toMatch(/CMAKE_C_STANDARD_REQUIRED\s+ON/);
    expect(cmake).toMatch(/CMAKE_C_EXTENSIONS\s+OFF/);
    for (const option of ['-Wall', '-Wextra', '-Wpedantic', '-Werror']) {
      expect(cmake, option).toContain(option);
    }
    expect(cmake).toMatch(/add_library\(\s*osd-embed\s+STATIC\b/);
    expect(cmake).toMatch(/enable_testing\(\)/);
    expect(cmake).toMatch(/add_subdirectory\(\s*tests\s*\)/);
  });

  it('src/<nom>.h and src/<nom>.c, without behaviour (the dash of the name read _)', () => {
    const racine = projet(['osd-embed', 'capteur']);
    const f = planDuPaquet(racine, 'osd-embed').fichiers;
    expect(f['osd-embed/src/osd_embed.h']).toContain('OSD_EMBED_H');
    expect(f['osd-embed/src/osd_embed.c']).toContain('#include "osd_embed.h"');
    expect(f['osd-embed/src/osd_embed.c']).not.toMatch(/\)\s*\{/);
    expect(Object.keys(planDuPaquet(racine, 'capteur').fichiers)).toEqual(
      expect.arrayContaining(['capteur/src/capteur.h', 'capteur/src/capteur.c'])
    );
  });

  it('tests/CMakeLists.txt takes every test_*.c present, one executable and one CTest test each', () => {
    const racine = projet(['osd-embed']);
    const tests = planDuPaquet(racine, 'osd-embed').fichiers['osd-embed/tests/CMakeLists.txt'];
    expect(tests).toMatch(
      /file\(\s*GLOB[^)]*test_\*\.c[^)]*CONFIGURE_DEPENDS|file\(\s*GLOB[^)]*CONFIGURE_DEPENDS[^)]*test_\*\.c/
    );
    expect(tests).toContain('add_executable');
    expect(tests).toContain('add_test');
  });

  it('the package.json of the graph carries the name of project() and its scripts; the documents say c', () => {
    const racine = projet(['osd-embed']);
    const f = planDuPaquet(racine, 'osd-embed').fichiers;
    const pkg = JSON.parse(f['osd-embed/package.json']) as {
      name: string;
      scripts: Record<string, string>;
    };
    expect(pkg.name).toBe('osd-embed');
    expect(Object.keys(pkg.scripts)).toEqual(
      expect.arrayContaining(['build', 'test:unit', 'typecheck'])
    );
    expect(f['osd-embed/docs/INTERFACE.md']).toMatch(/^\*\*Langage\*\* : c$/m);
  });

  it('no lock to write, no entry of cmake; the workspaces receive the folder when no pattern selects it', () => {
    const racine = projet(['osd-embed'], ['packages/*']);
    const plan = planDuPaquet(racine, 'osd-embed');
    expect(plan.verrouiller).toEqual([]);
    expect(plan.espace).toBeNull();
    expect(JSON.parse(plan.espaceNpm!.texte)).toMatchObject({
      workspaces: ['packages/*', 'osd-embed'],
    });
    const choisi = projet(['osd-embed'], ['osd-*']);
    expect(planDuPaquet(choisi, 'osd-embed').espaceNpm).toBeNull();
  });

  it('.clang-format: the LLVM base, a column limit of 100', () => {
    const racine = projet(['osd-embed']);
    const format = planDuPaquet(racine, 'osd-embed').fichiers['osd-embed/.clang-format'];
    expect(format).toMatch(/^BasedOnStyle:\s*LLVM\s*$/m);
    expect(format).toMatch(/^ColumnLimit:\s*100\s*$/m);
  });

  it('.clang-tidy: bugprone, cert, clang-analyzer and misc checks, every warning an error', () => {
    const racine = projet(['osd-embed']);
    const tidy = planDuPaquet(racine, 'osd-embed').fichiers['osd-embed/.clang-tidy'];
    expect(tidy).toMatch(
      /^Checks:\s*['"]?-\*,bugprone-\*,cert-\*,clang-analyzer-\*,misc-\*['"]?\s*$/m
    );
    expect(tidy).toMatch(/^WarningsAsErrors:\s*['"]\*['"]\s*$/m);
  });

  it('written, the plan leaves the two clang configurations on the disk', () => {
    const racine = projet(['osd-embed']);
    expect(ecrireLePaquet(racine, planDuPaquet(racine, 'osd-embed'))).toEqual(
      expect.arrayContaining(['osd-embed/.clang-format', 'osd-embed/.clang-tidy'])
    );
    expect(lire(racine, 'osd-embed/.clang-format')).toContain('LLVM');
  });

  it('written, the plan leaves the files on the disk', () => {
    const racine = projet(['osd-embed']);
    const ecrits = ecrireLePaquet(racine, planDuPaquet(racine, 'osd-embed'));
    expect(ecrits).toEqual(
      expect.arrayContaining([
        'osd-embed/CMakeLists.txt',
        'osd-embed/src/osd_embed.h',
        'osd-embed/src/osd_embed.c',
        'osd-embed/tests/CMakeLists.txt',
        'osd-embed/package.json',
      ])
    );
    expect(lire(racine, 'osd-embed/CMakeLists.txt')).toContain('project(osd-embed');
  });

  it('a folder that already holds a CMakeLists.txt is refused, named, nothing written', () => {
    const racine = projet(['osd-embed']);
    ecrire(racine, 'osd-embed/CMakeLists.txt', 'project(osd-embed C)\n');
    expect(() => planDuPaquet(racine, 'osd-embed')).toThrow(
      /osd-embed : le dossier porte déjà son CMakeLists\.txt/
    );
  });
});
