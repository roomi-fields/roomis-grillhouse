#!/usr/bin/env node
// The night tests of a project, the command `tests-de-nuit` of the module typescript
// (scripts/jointure.d.ts), which the night (scripts/nuit.sh) runs in its copy after the full pass,
// through its mounts.
//
//   node tests-de-nuit.mjs                   from the root of the copy: the night of the poste
//   node tests-de-nuit.mjs --hors-du-poste   the night of a shared machine (a CI runner)
//   node tests-de-nuit.mjs --hors-du-poste --tranche i/n   its tranche i of n
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
// - With `--hors-du-poste`, the night of a shared machine: the night tests alone, but those that
//   bear the tag `@poste` (`porteLEtiquetteDuPoste` of ./vitest-config/cibles.mjs, which the guard
//   ./tests-du-poste.mjs asks of a night test that depends on the poste), in one run
//   (GRILLHOUSE_TESTS_DE_NUIT=hors-poste), and no measure of time: a shared machine does not measure
//   a time (the frame's charter, « Une mesure de temps joue la nuit »). It keeps no last green, as
//   the night of the poste alone does (scripts/nuit.sh).
// - With `--tranche i/n` (or `--tranche=i/n`) beside `--hors-du-poste`, the i-th of n parts of
//   those files, Vitest's split (`--shard`), as a tranche of the verification
//   (`npm run verifier -- --tranche i/n`, ./tranches.mjs): it writes its blob report and the files
//   of its part under `.vitest-reports/` (the reports of an earlier run of the same tranche
//   removed), which `grillhouse fusion-des-tranches` controls and merges once the n tranches played:
//   the n tranches together play each night test out of the poste once. The variable
//   GRILLHOUSE_TRANCHE_DE_NUIT carries it to the night's configuration.
// - A tranche not of the form `i/n` (1 ≤ i ≤ n), a tranche without `--hors-du-poste` (the night of
//   the poste plays whole), and any other argument are refused before any work, exit 2.
// - The exit code: 0 when every run is green; 75, « à repasser », when every red run is at 75
//   (every failure depended on a duration, one under load, ./vitest-config/duree.reporter.mjs);
//   else the code of the first red run.
// - They play once the temporary directory has room, as every heavy pass
//   (`attendreDeLaPlace` of scripts/verrou-de-machine.mjs): a wait that reaches its bound ends at 75.
import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { A_REPASSER, attendreDeLaPlace } from '../../services-du-noyau.mjs';
import {
  estUnBanc,
  estUnTestDeNuit,
  fichiersTemoins,
  NUIT_TRANCHE,
  NUIT_VARIABLE,
} from './vitest-config/cibles.mjs';
import { fichiersDeLaTranche, LA_FORME, lireLaTranche, RAPPORTS } from './tranches.mjs';

/**
 * The options of the arguments <args>: `{ horsDuPoste, tranche, erreur }`, `tranche`
 * `{ index, count }` or undefined, `erreur` the line that refuses them, or undefined.
 * @param {string[]} args
 */
export function lireLesArguments(args) {
  let horsDuPoste = false;
  let texte;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--hors-du-poste') {
      horsDuPoste = true;
    } else if (a === '--tranche') {
      texte = args[++i] ?? '';
    } else if (a.startsWith('--tranche=')) {
      texte = a.slice('--tranche='.length);
    } else {
      return { horsDuPoste, erreur: `⛔ tests-de-nuit : argument inconnu « ${a} » (usage : tests-de-nuit [--hors-du-poste [--tranche ${LA_FORME}]]).` };
    }
  }
  const tranche = texte === undefined ? undefined : (lireLaTranche(texte) ?? undefined);
  if (texte !== undefined && !tranche) {
    return { horsDuPoste, erreur: `⛔ --tranche attend la forme ${LA_FORME}, deux entiers avec 1 ≤ i ≤ n (par exemple --tranche 1/3) : « ${texte} » ne l'a pas.` };
  }
  if (tranche && !horsDuPoste) {
    return { horsDuPoste, erreur: '⛔ --tranche découpe la nuit d\'une machine partagée : elle se donne avec --hors-du-poste ; la nuit du poste se joue entière.' };
  }
  return { horsDuPoste, tranche };
}

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
 * The runs of Vitest the night plays in the copy at <racine>, each a value of
 * GRILLHOUSE_TESTS_DE_NUIT, in their order: `nuit` when it holds night tests, then `mesures` when it
 * holds a bench or a time witness; with <horsDuPoste>, `hors-poste` alone when it holds night tests.
 * @param {string} racine the root of the copy
 * @param {{ horsDuPoste?: boolean }} [options] the night of a shared machine
 * @returns {string[]}
 */
export function runsDeLaNuit(racine, { horsDuPoste = false } = {}) {
  if (horsDuPoste) {
    return enTient(racine, estUnTestDeNuit) ? ['hors-poste'] : [];
  }
  return [
    enTient(racine, estUnTestDeNuit) && 'nuit',
    (enTient(racine, estUnBanc) || fichiersTemoins(racine).length > 0) && 'mesures',
  ].filter(Boolean);
}

/**
 * Plays the night tests, then the measures of time, of the copy at <racine>: 0, 75 or the code of
 * the first red run of Vitest; 0 when there is none. With <horsDuPoste>, the night tests alone, but
 * those tagged `@poste`, and no measure.
 * @param {string} racine the root of the copy
 * With <tranche>, the night tests of its part alone, its reports written under RAPPORTS.
 * @param {{ horsDuPoste?: boolean, tranche?: { index: number, count: number } }} [options] the night of a shared machine, its tranche
 */
export function testsDeNuit(racine, options = {}) {
  const runs = runsDeLaNuit(racine, options);
  if (runs.length === 0) {
    return 0;
  }
  try {
    attendreDeLaPlace();
  } catch (e) {
    if (e?.name !== 'AttenteDeLaMachine') {
      throw e;
    }
    process.stdout.write(`${e.message}\n`);
    return e.code;
  }
  const { tranche } = options;
  const rapports = path.join(racine, RAPPORTS);
  if (tranche) {
    for (const f of fichiersDeLaTranche(rapports, tranche)) {
      rmSync(f, { force: true });
    }
  }
  const enTranche = tranche
    ? { [NUIT_TRANCHE]: JSON.stringify({ tranche: `${tranche.index}/${tranche.count}`, rapports }) }
    : {};
  const codes = runs.map(choix => {
    const r = spawnSync(
      'npx',
      ['--no-install', 'vitest', 'run', '--root', racine, '--config', CONFIGURATION],
      {
        cwd: racine,
        stdio: 'inherit',
        env: { ...process.env, [NUIT_VARIABLE]: choix, ...enTranche },
      }
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
  const { horsDuPoste, tranche, erreur } = lireLesArguments(process.argv.slice(2));
  if (erreur) {
    process.stderr.write(`${erreur}\n`);
    process.exitCode = 2;
  } else {
    process.exitCode = testsDeNuit(process.cwd(), { horsDuPoste, tranche });
  }
}
