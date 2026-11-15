import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { nuit } from '../../../../scripts/langages/typescript/vitest-config/cibles.mjs';

// The night mounts a trial (a Temporal server, a copy) per test and takes its measures at rest; it
// plays one file at a time, so the files never saturate the machine against one another. The plugin
// of the night's configuration (`nuit` of scripts/langages/typescript/vitest-config/cibles.mjs) sets
// `fileParallelism: false` for every choice of GRILLHOUSE_TESTS_DE_NUIT.
const RACINE = mkdtempSync(path.join(tmpdir(), 'nuit-un-fichier-'));
afterAll(() => rmSync(RACINE, { recursive: true, force: true }));

// The test options the night plugin leaves on a bare config under the choice <choix> (undefined for
// the default run: the night tests, the benches and the witnesses together).
async function sousLeChoix(choix: string | undefined): Promise<{ fileParallelism?: boolean }> {
  const env: Record<string, string | undefined> = {};
  if (choix !== undefined) {
    env.GRILLHOUSE_TESTS_DE_NUIT = choix;
  }
  const config: { root: string; test: { fileParallelism?: boolean } } = { root: RACINE, test: {} };
  await nuit(env).config(config);
  return config.test;
}

describe('la nuit joue un fichier à la fois', () => {
  for (const choix of ['nuit', 'hors-poste', 'mesures', undefined]) {
    it(`le choix ${choix ?? '(défaut)'} pose fileParallelism à false`, async () => {
      const test = await sousLeChoix(choix);
      expect(test.fileParallelism).toBe(false);
    });
  }
});
