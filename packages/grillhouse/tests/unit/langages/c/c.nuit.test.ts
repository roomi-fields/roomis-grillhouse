// The module c against the real cmake and ctest, at night: the skeleton `grillhouse paquet` writes
// configures, compiles under C99 strict with its warnings as errors, and plays its tests by CTest;
// the verdict reads the report CTest writes, by file; a test that fails is red with its output; a
// file of source with an error makes the build red. The build tree lies in .build-cmake, outside
// the package.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Langage } from '../../../../scripts/jointure.js';
import { moduleC } from './module-c.js';
import { ecrireLePaquet, planDuPaquet } from '../../../../scripts/paquet.mjs';

const c: Langage = moduleC;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'c-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

// A project whose package `osd-embed` is the skeleton's, with a passing and a failing test.
function projet() {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(
    racine,
    'docs/ARCHITECTURE.md',
    '| Composant | Rôle | Langage |\n| --- | --- | --- |\n| `osd-embed` | le noyau | c |\n'
  );
  ecrire(racine, 'package.json', JSON.stringify({ name: 'osd', private: true, workspaces: [] }));
  ecrireLePaquet(racine, planDuPaquet(racine, 'osd-embed'));
  ecrire(racine, 'osd-embed/tests/test_vert.c', 'int main(void) { return 0; }\n');
  ecrire(
    racine,
    'osd-embed/tests/test_rouge.c',
    '#include <stdio.h>\nint main(void) {\n  puts("attendu 1, obtenu 2");\n  return 1;\n}\n'
  );
  return racine;
}

function jouer(racine: string, nom: string, args: string[]) {
  const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  const cmd = c.commandes(racine)[nom];
  const r = spawnSync(process.execPath, [cmd.script, ...cmd.args, ...args], {
    cwd: racine,
    encoding: 'utf8',
    env: { ...process.env, GRILLHOUSE_RESULTATS: resultats },
  });
  return { r, verdict: c.verdict(resultats) };
}

describe('le module c — le vrai cmake et le vrai ctest', () => {
  it('the skeleton builds under -Werror, a green test plays, a red one is red with its output', () => {
    const racine = projet();
    const vert = jouer(racine, 'tests-du-paquet', ['osd-embed/tests/test_vert.c']);
    expect(vert.r.status, vert.r.stderr).toBe(0);
    expect(vert.verdict.rapports.map(x => [path.basename(x.fichier), x.etat])).toEqual([
      ['test_vert.c', 'passed'],
    ]);
    expect(existsSync(path.join(racine, '.build-cmake/osd-embed/CMakeCache.txt'))).toBe(true);
    expect(existsSync(path.join(racine, 'osd-embed/CMakeCache.txt'))).toBe(false);
    const tout = jouer(racine, 'tests-du-paquet', ['osd-embed']);
    expect(tout.r.status).toBe(1);
    const rouge = tout.verdict.rapports.find(x => x.fichier.endsWith('test_rouge.c'));
    expect(rouge?.etat).toBe('failed');
    expect(rouge?.tests[0].message).toContain('attendu 1, obtenu 2');
    for (const nom of ['typer']) {
      const t = jouer(racine, nom, []);
      expect(t.r.status, t.r.stderr).toBe(0);
    }
  }, 300_000);

  it('the files of the skeleton pass the guards clang-format and clang-tidy with the real tools', () => {
    const racine = projet();
    for (const garde of ['clang-format', 'clang-tidy']) {
      const t = jouer(racine, garde, []);
      expect(t.r.status, `${garde} : ${t.r.stderr}`).toBe(0);
    }
  }, 300_000);

  it('a compilation error makes the build red', () => {
    const racine = projet();
    ecrire(racine, 'osd-embed/src/osd_embed.c', '#include "osd_embed.h"\nint x = ;\n');
    const r = jouer(racine, 'tests-du-paquet', ['osd-embed']);
    expect(r.r.status).toBe(1);
    expect(c.echecDeCompilation(r.r.stderr)).toBe(true);
    expect(r.verdict.rapports).toEqual([]);
  }, 300_000);
});
