import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CADRE } from './cadre.js';
import { temporaireDuFichier } from './temporaire-du-fichier.js';

// grillhouse-3q3, critères 1 et 2: the temporary directory of a test file that launches the
// launcher (./temporaire-du-fichier.ts, `temporaireDuFichier`), as Bazel gives each test its TEST_TMPDIR.
// The launcher opens the temporary directory of its ticket by the frame's script
// (scripts/mesure/base-de-passe.mjs, as scripts/enveloppe/lancer.sh calls it).
const BASE_DU_TICKET = path.join(CADRE, 'scripts/mesure/base-de-passe.mjs');
const duTicket = (ticket: string) =>
  spawnSync(process.execPath, [BASE_DU_TICKET, ticket], { encoding: 'utf8' }).stdout.trim();

// The temporary directory of the run, before the file names its own.
const DU_LANCEMENT = process.env.TMP;
let dossier = '';
// Registered before the directory's own removal, so it runs after it (Vitest's hooks in stack).
afterAll(() => {
  expect(existsSync(dossier)).toBe(false);
  expect(process.env.TMP).toBe(DU_LANCEMENT);
});
dossier = temporaireDuFichier();

describe('grillhouse-3q3 — the temporary directory of a test file', () => {
  it('critère 1 — the launcher opens the ticket demo-1 under the directory of this file', () => {
    expect(duTicket('demo-1')).toBe(path.join(dossier, 'grillhouse-ticket-demo-1', 't'));
  });

  it('critère 1 — the directory is made by mkdtemp in the temporary directory of the run, its own', () => {
    expect(path.dirname(dossier)).toBe(DU_LANCEMENT);
    expect(path.basename(dossier)).toMatch(/^essai-fichier-\w{6}$/);
  });
});
