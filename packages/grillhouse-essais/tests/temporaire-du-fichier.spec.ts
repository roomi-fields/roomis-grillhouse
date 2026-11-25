import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { temporaireDuFichier } from './temporaire-du-fichier.js';

// The temporary directory of a test file that launches the launcher (./temporaire-du-fichier.ts,
// `temporaireDuFichier`), as Bazel gives each test its TEST_TMPDIR.

// The temporary directory of the run, before the file names its own.
const DU_LANCEMENT = process.env.TMP;
let dossier = '';
// Registered before the directory's own removal, so it runs after it (Vitest's hooks in stack).
afterAll(() => {
  expect(existsSync(dossier)).toBe(false);
  expect(process.env.TMP).toBe(DU_LANCEMENT);
});
dossier = temporaireDuFichier();

describe('the temporary directory of a test file', () => {
  it('is made by mkdtemp in the temporary directory of the run, its own', () => {
    expect(path.dirname(dossier)).toBe(DU_LANCEMENT);
    expect(path.basename(dossier)).toMatch(/^essai-fichier-\w{6}$/);
  });
});
