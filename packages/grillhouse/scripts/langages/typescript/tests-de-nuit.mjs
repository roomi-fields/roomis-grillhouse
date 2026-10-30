#!/usr/bin/env node
// The night tests of a project, the command `tests-de-nuit` of the module typescript
// (scripts/jointure.d.ts), which the night (scripts/nuit.sh) runs in its copy after the full pass,
// through its mounts.
//
//   node tests-de-nuit.mjs      from the root of the copy
//
// - The files `*.nuit.test.*`, `*.nuit.spec.*`, `*.budget.test.*` and `*.budget.spec.*` of the
//   copy, outside node_modules, dist and .git: the night tests and the time budget benches, which
//   `npm test` and the integration leave out (./vitest-config/cibles.mjs, HORS_DU_JOUR). A copy
//   with neither plays none, and the exit code is 0.
// - Vitest plays them with the frame's configuration (./vitest.nuit.config.mjs), from the root of
//   the copy, a bench or a night test alone as well: `npx --no-install vitest run --root <copie>
//   --config <configuration>`. Its exit code is this command's: 75, « à repasser », when every
//   failure depended on a duration, one under load (./vitest-config/duree.reporter.mjs).
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CONFIGURATION = fileURLToPath(new URL('./vitest.nuit.config.mjs', import.meta.url));
const HORS = new Set(['node_modules', 'dist', '.git']);
const DE_NUIT = /\.(nuit|budget)\.(test|spec)\.(c|m)?[jt]sx?$/;

// Whether a night test or a bench lies under <dossier>.
function enTient(dossier) {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!HORS.has(e.name) && enTient(path.join(dossier, e.name))) {
        return true;
      }
    } else if (e.isFile() && DE_NUIT.test(e.name)) {
      return true;
    }
  }
  return false;
}

/**
 * Plays the night tests of the copy at <racine>: the exit code of Vitest, 0 when there is none.
 * @param {string} racine the root of the copy
 */
export function testsDeNuit(racine) {
  if (!enTient(racine)) {
    return 0;
  }
  const r = spawnSync(
    'npx',
    ['--no-install', 'vitest', 'run', '--root', racine, '--config', CONFIGURATION],
    { cwd: racine, stdio: 'inherit' }
  );
  return r.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = testsDeNuit(process.cwd());
}
