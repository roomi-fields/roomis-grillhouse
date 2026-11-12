// A setup file of the base configuration: a test file's register is its own, as git's tests give
// each test a HOME of its own. When the launch names no register (`GRILLHOUSE_REGISTRE`), the file
// names one under a directory of its own in the temporary directory, which every process the test
// starts inherits (scripts/registre.mjs reads the variable first); the directory is removed at the
// end of the test file, and at the exit of the process for one made inside a running test. A
// register the launch names stays.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, onTestFinished } from 'vitest';

const DOSSIERS = (globalThis.__grillhouseRegistresDEssai ??= new Set());
if (DOSSIERS.size === 0) {
  process.on('exit', () => {
    for (const d of DOSSIERS) {
      rmSync(d, { recursive: true, force: true });
    }
  });
}

if (!process.env.GRILLHOUSE_REGISTRE) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'grillhouse-registre-'));
  DOSSIERS.add(dossier);
  process.env.GRILLHOUSE_REGISTRE = path.join(dossier, 'essai.jsonl');
  const retirer = () => {
    rmSync(dossier, { recursive: true, force: true });
    DOSSIERS.delete(dossier);
  };
  try {
    // Imported inside a running test (a test of this file's behavior): the end of that test.
    onTestFinished(retirer);
  } catch {
    afterAll(retirer);
  }
}
