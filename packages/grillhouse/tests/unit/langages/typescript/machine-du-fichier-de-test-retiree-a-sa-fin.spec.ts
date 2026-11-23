// The machine of a test file is its own (the setup file machine.setup.mjs of the base
// configuration names it a directory of the state of the parts under the temporary directory), and
// goes with it: what a pass of the file left there (the part of a pass a test killed, which never
// gave it back) is removed at the end of the file, as the register of the file is, so that the
// guard of the temporary directory of the run finds nothing. Medium test: a project of trial whose
// package extends the base configuration, played by `testsDeNuit` of
// scripts/langages/typescript/tests-de-nuit.mjs, without the whole product.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import * as nuitMjs from '../../../../scripts/langages/typescript/tests-de-nuit.mjs';

const nuit = nuitMjs as unknown as { testsDeNuit: (racine: string) => number };

const DEPOT = path.resolve(fileURLToPath(import.meta.url), '../../../../../../..');
const BASE = path.join(
  DEPOT,
  'packages/grillhouse/scripts/langages/typescript/vitest-config/base.mjs'
);

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'machine-du-fichier-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe('la machine d’un fichier de test part avec lui', () => {
  it('la part qu’une passe tuée a laissée dans le dossier des parts du fichier ne reste pas dans le dossier temporaire du run', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
    const trace = path.join(racine, 'trace.json');
    symlinkSync(path.join(DEPOT, 'node_modules'), path.join(racine, 'node_modules'));
    const fichiers: Record<string, string> = {
      'package.json': '{"type":"module"}\n',
      // The pass of the trial takes its part on the machine of this file (a trial machine, never
      // the user's); the configuration of the package takes the variable out before the test
      // files of the trial load, so that each names a machine of its own.
      'packages/a/vitest.config.mjs':
        `import base from ${JSON.stringify(BASE)};\n` +
        'delete process.env.GRILLHOUSE_PARTS_DE_LA_MACHINE;\nexport default base;\n',
      // A pass a test killed leaves its part: a file in the directory of the parts of the file.
      'packages/a/tests/n.nuit.test.mjs':
        "import { mkdirSync, writeFileSync } from 'node:fs';\nimport path from 'node:path';\n" +
        "import { it } from 'vitest';\nit('laisse une part', () => {\n" +
        '  const parts = process.env.GRILLHOUSE_PARTS_DE_LA_MACHINE;\n' +
        '  mkdirSync(parts, { recursive: true });\n' +
        "  writeFileSync(path.join(parts, 'tuee.json'), '{}');\n" +
        `  writeFileSync(${JSON.stringify(trace)}, JSON.stringify({ parts }));\n});\n`,
    };
    for (const [f, contenu] of Object.entries(fichiers)) {
      mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
      writeFileSync(path.join(racine, f), contenu);
    }
    const machine = process.env.GRILLHOUSE_PARTS_DE_LA_MACHINE;
    expect(machine).toBeTruthy();
    expect(nuit.testsDeNuit(racine)).toBe(0);
    // The directory of the parts was the trial file's own, not this file's, and went with it.
    const { parts } = JSON.parse(readFileSync(trace, 'utf8')) as { parts: string };
    expect(parts).toMatch(/grillhouse-parts-/);
    expect(parts).not.toBe(machine);
    expect(existsSync(parts)).toBe(false);
  }, 120_000);
});
