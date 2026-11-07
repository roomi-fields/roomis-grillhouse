#!/usr/bin/env node
// The night tests of a project, the command `tests-de-nuit` of the module typescript
// (scripts/jointure.d.ts), which the night (scripts/nuit.sh) runs in its copy after the full pass,
// through its mounts.
//
//   node tests-de-nuit.mjs      from the root of the copy
//
// - The files `*.nuit.test.*` and `*.nuit.spec.*` of the copy, outside node_modules, dist and
//   .git, the night tests, then its measures of time, the time budget benches (`*.budget.test.*`,
//   `*.budget.spec.*`) and the time witnesses (a test file that imports `mesurerAuRepos`,
//   `fichiersTemoins` of ./vitest-config/cibles.mjs): what `npm test` and the integration leave
//   out (./vitest-config/cibles.mjs). A copy with none plays nothing, and the exit code is 0.
// - Vitest plays them with the frame's configuration (./vitest.nuit.config.mjs), from the root of
//   the copy: `npx --no-install vitest run --root <copie> --config <configuration>`, once for the
//   night tests (GRILLHOUSE_TESTS_DE_NUIT=nuit), then once for the measures alone, one file at a
//   time (GRILLHOUSE_TESTS_DE_NUIT=mesures), as Bazel plays a test tagged `exclusive` after the
//   others, nothing beside it, and as the module cargo plays its benches after its night tests
//   (grillhouse-bd7). Each run plays when the copy holds its files.
// - The exit code: 0 when every run is green; 75, « à repasser », when every red run is at 75
//   (every failure depended on a duration, one under load, ./vitest-config/duree.reporter.mjs);
//   else the code of the first red run.
// - They play once the temporary directory has room, as every heavy pass
//   (`attendreDeLaPlace` of scripts/verrou-de-machine.mjs): a wait that reaches its bound ends at 75.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { A_REPASSER, attendreDeLaPlace } from '../../services-du-noyau.mjs';
import {
  estUnBanc,
  estUnTestDeNuit,
  fichiersTemoins,
  NUIT_VARIABLE,
} from './vitest-config/cibles.mjs';

const CONFIGURATION = fileURLToPath(new URL('./vitest.nuit.config.mjs', import.meta.url));
const HORS = new Set(['node_modules', 'dist', '.git']);

// Whether a file that <est> (the rules of ./vitest-config/cibles.mjs) lies under <dossier>.
function enTient(dossier, est) {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!HORS.has(e.name) && enTient(path.join(dossier, e.name), est)) {
        return true;
      }
    } else if (e.isFile() && est(e.name)) {
      return true;
    }
  }
  return false;
}

/**
 * Plays the night tests, then the measures of time, of the copy at <racine>: 0, 75 or the code of
 * the first red run of Vitest; 0 when there is none.
 * @param {string} racine the root of the copy
 */
export function testsDeNuit(racine) {
  const runs = [
    enTient(racine, estUnTestDeNuit) && 'nuit',
    (enTient(racine, estUnBanc) || fichiersTemoins(racine).length > 0) && 'mesures',
  ].filter(Boolean);
  if (runs.length === 0) {
    return 0;
  }
  try {
    attendreDeLaPlace();
  } catch (e) {
    if (e?.name !== 'AttenteDeLaMachine') throw e;
    process.stdout.write(`${e.message}\n`);
    return e.code;
  }
  const codes = runs.map(choix => {
    const r = spawnSync(
      'npx',
      ['--no-install', 'vitest', 'run', '--root', racine, '--config', CONFIGURATION],
      { cwd: racine, stdio: 'inherit', env: { ...process.env, [NUIT_VARIABLE]: choix } }
    );
    return r.status ?? 1;
  });
  const rouges = codes.filter(c => c !== 0);
  if (rouges.length === 0) {
    return 0;
  }
  return rouges.every(c => c === A_REPASSER) ? A_REPASSER : rouges.find(c => c !== A_REPASSER);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = testsDeNuit(process.cwd());
}
