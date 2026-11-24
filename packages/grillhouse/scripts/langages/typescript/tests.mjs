#!/usr/bin/env node
// The day's tests, as Turborepo's tasks (`npm test`, `npm run test:forcer`): the build, then the
// `test:unit` of each package, an unchanged task replayed from Turborepo's cache.
// Mechanism: packages/grillhouse/docs/architecture/tests.md, §3.1 (command of the tests), §5.4.
//
//   npx grillhouse tests [--force] [<path>…] [--<option>=<value>…]
//
// - Without a path, every package plays its tests (`turbo run test:unit`); `--force` plays each
//   task for real, the builds included (`npm run test:forcer`).
// - A path is written from the root of the repository: a test file or a directory. In a repository
//   of packages, each path plays in the package that holds it: Turborepo runs the `test:unit` of
//   those packages only (`--filter=<name>`), and their Vitest receives each path made absolute,
//   which it matches against its own test files. A path out of every package, in a package out of
//   the frame (`docs/agents/hors-cadre.txt`), or in a package without a `test:unit` script is
//   refused, named, and nothing plays. In a repository without packages, the paths go to the
//   root's Vitest as they are.
// - The paths and the options reach Vitest in `GRILLHOUSE_TESTS` (vitest-config/cibles.mjs), which
//   the `env` of the task `test:unit` names, never after `--` (Turborepo counts those arguments
//   in the hash of every task of the run). A run with paths is one Turborepo run of the tests with
//   what they depend on (`turbo run test:unit --filter=<name>`); a package named whole (the exact
//   folder of a package) carries no path: it plays under the hash of the complete pass, and a run
//   that mixes it with files of another package is two runs, the code the first that is not 0.
//   Every other run of Turborepo plays with the variable unset.
// - Each run plays every task whose dependencies succeed (`--continue=dependencies-successful`):
//   each build that fails is named on Turborepo's line « Failed: », a test that waits for it does
//   not play, and the exit code stays red.
// - `--force` with paths plays the tests named for real, their builds replayed from the cache:
//   the variable carries the moment of the run (`rejouer`) instead of Turborepo's `--force`.
// - In the envelope of an agent (`GRILLHOUSE_ENVELOPPE`, scripts/enveloppe/paquets-du-plan.mjs),
//   the packages out of its plan and their traces arrive built and read-only: the build is the
//   named packages' alone, with the traces of those packages their tests wait for
//   (`turbo run build <name>#trace:<t>… --only --filter=<name>`, their task ids read in
//   `turbo run test:unit --filter=<name> --dry=json`), never their dependencies nor a neighbour's
//   trace; then the tests alone (`turbo run test:unit --only --filter=<name>`), the paths in the
//   variable. A named package that the envelope shows read-only (`inscriptible`: one out of the
//   plan; the shared test material, for every role but the testwriter) is not built, nor are its
//   traces. The shared test material plays its tests as it is, the logs of its tasks going to the
//   envelope's directories proper to the session (`sortiesDeTest`, scripts/enveloppe/enveloppe.mjs).
//   A package out of the plan has none: its tests fail on « Read-only file system » and play out
//   of the envelope.
// - An argument that begins with « - » is an option of Vitest, written `--<name>=<value>`, carried
//   in the variable beside the paths.
// - A time budget bench or a time witness, which the day leaves out, plays when a path names its
//   own file, under the measure of time of the day's configuration (vitest-config/cibles.mjs);
//   a night test named is refused, naming it, and nothing plays (./tests-de-nuit.mjs); a
//   directory or a package named leaves them all out.
// - A run that plays no test fails: the base configuration of Vitest keeps `passWithNoTests:
//   false` (vitest-config/base.mjs).
// - Under the circuit's mark (`GRILLHOUSE_DEPUIS_LE_VERT`, scripts/circuit.mjs), a run measures
//   itself against the last green as `npm run verifier` does (scripts/dernier-vert.mjs): in a
//   package or a directory named, the tests Vitest relates to the files changed since it, every
//   test when a change lies out of Vitest's graph; a file named itself plays, changed or not;
//   `--force` plays them all. Without the mark, every test named plays. With the base of the lot
//   besides (`GRILLHOUSE_BASE_DU_LOT`), it measures against that base, targeted.
// - While the environment names a results directory (`GRILLHOUSE_RESULTATS`), each run of
//   Turborepo writes its summary (`--summarize`), moved there, and Vitest its JSON report there.
// - While it names the progress directory of a pass (`GRILLHOUSE_AVANCEMENT`,
//   scripts/avancement.mjs), each run plans its tasks first, and Vitest writes there the files
//   done and planned of each.
// - The base of the run (scripts/mesure/base-de-passe.mjs), swept first of the bases a killed run
//   left: named in TMPDIR, TMP and TEMP to every run of Turborepo (`globalPassThroughEnv`), and
//   removed at the end, green, red or interrupted (SIGINT, SIGTERM, SIGHUP).
// The exit code is Turborepo's; 2 for a path refused.
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  AVANCEMENT,
  BASE_DU_LOT,
  CHANGEMENTS,
  DEPUIS_LE_VERT,
  mesure,
  ouvrirBase,
  paquetsDeLEnveloppe,
  retirerALInterruption,
  SCRIPT_DES_TESTS,
  surUnePart,
  TESTS_CIBLES,
  testsCibles,
  tracesDuPlan,
} from '../../services-du-noyau.mjs';
import { estHorsDuJour } from './vitest-config/cibles.mjs';
import { paquets } from '../../paquets.mjs';
import { RESULTATS } from '../../resultats.mjs';
import { garderLesResumes } from './resume-du-lanceur.mjs';
import { horsTypescript, planifier } from './turbo-des-paquets.mjs';

const racine = process.cwd();
// The base of the run (scripts/mesure/base-de-passe.mjs): this process and every run of
// Turborepo write in it (TMPDIR, TMP, TEMP), and it goes at the end of the run, or at its
// interruption.
const base = ouvrirBase('tests');
Object.assign(process.env, base.env);
const lacher = retirerALInterruption(base.fermer);
const enveloppe = paquetsDeLEnveloppe() !== null;
const args = process.argv.slice(2);
const force = args.includes('--force');
const options = args.filter(a => a.startsWith('-') && a !== '--force');
const chemins = args.filter(a => !a.startsWith('-'));
// Under the circuit's mark, the tests measured against the last green; `--force` plays them all.
const depuis = process.env[DEPUIS_LE_VERT]
  ? mesure(racine, { tout: force, lot: process.env[BASE_DU_LOT] })
  : null;
if (depuis) {
  process.stdout.write(`${depuis.ligne}\n`);
}

// One Turborepo run of <args>, VARIABLE set to <tests> (unset without), each task whose
// dependencies succeed played to its end; its exit code. While the run names a results directory
// (RESULTATS), Turborepo writes its summary, which goes there.
const turbo = (args, tests) => {
  const env = { ...process.env };
  delete env[TESTS_CIBLES];
  delete env[CHANGEMENTS];
  delete env[BASE_DU_LOT];
  Object.assign(env, depuis?.env ?? {});
  if (tests) {
    env[TESTS_CIBLES] = JSON.stringify(tests);
  }
  const resume = env[RESULTATS] ? ['--summarize'] : [];
  const runs = path.join(racine, '.turbo', 'runs');
  const avant = new Set(existsSync(runs) ? readdirSync(runs) : []);
  // A run of the tests under a progress directory plans its tasks (scripts/avancement.mjs).
  if (args[0] === SCRIPT_DES_TESTS) {
    planifier(env[AVANCEMENT], {
      racine,
      args: [...args, '--continue=dependencies-successful'],
      env,
    });
  }
  const code =
    spawnSync('turbo', ['run', ...args, '--continue=dependencies-successful', ...resume], {
      cwd: racine,
      stdio: 'inherit',
      env,
    }).status ?? 1;
  if (resume.length) {
    garderLesResumes(racine, avant, env);
  }
  return code;
};

// The trace tasks of the packages <noms> their tests wait for, read in Turborepo's plan of the
// tests <filtres> select: `{ ids }`; a plan that fails gives `{ code }`, its output written.
const traces = (filtres, noms) => {
  const plan = spawnSync('turbo', ['run', SCRIPT_DES_TESTS, ...filtres, '--dry=json'], {
    cwd: racine,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (plan.status !== 0) {
    process.stderr.write(`${plan.stdout ?? ''}${plan.stderr ?? ''}`);
    return { code: plan.status ?? 1 };
  }
  return { ids: tracesDuPlan(JSON.parse(plan.stdout), t => noms.has(t.package)) };
};

// The tests <filtres> select, which receive <passes> in VARIABLE: one run with what they depend on;
// in an envelope, the build of the packages they name with their own traces, then the tests alone.
// Its exit code: the first that is not 0, else the tests'.
const cibles = (filtres, passes) => {
  // `testsCibles` is undefined with no path and no `--force`: the variable then stays unset.
  const tests = testsCibles({ arguments: passes, force });
  if (!enveloppe) {
    return turbo([SCRIPT_DES_TESTS, ...filtres], tests);
  }
  // A package the envelope shows read-only arrives built: only the packages it shows in writing
  // build, as the envelope mounts them (`inscriptible`).
  const construits = filtres.filter(f => inscriptible(dossiers.get(f.slice('--filter='.length))));
  if (filtres.length === 0 || construits.length > 0) {
    const noms = new Set(construits.map(f => f.slice('--filter='.length)));
    const propres = construits.length ? traces(construits, noms) : { ids: [] };
    if (propres.code !== undefined) {
      return propres.code;
    }
    const construction = turbo(['build', ...propres.ids, '--only', ...construits]);
    if (construction !== 0) {
      return construction;
    }
  }
  return turbo([SCRIPT_DES_TESTS, '--only', ...filtres], tests);
};

// True when this process may write the directory <dir>: false under a read-only mount.
const inscriptible = dir => {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

const liste = paquets(racine);
// The directory of each package of the frame, by its name.
const dossiers = new Map(liste.map(p => [p.pkg.name, path.join(racine, p.dossier)]));

// The run the command asks for: its exit code.
const lancer = () => {
  if (chemins.length === 0) {
    return turbo(
      [SCRIPT_DES_TESTS, ...horsTypescript(racine), ...(force ? ['--force'] : [])],
      options.length ? { arguments: options } : undefined
    );
  }
  if (liste.length === 0) {
    return cibles([], [...chemins, ...options]);
  }

  // The package of the frame that holds each path, the paths made absolute; the refusals.
  const refus = [];
  const noms = new Set();
  const absolus = [];
  // The packages named whole (the exact folder of a package): they play under the hash of the
  // complete pass, as Bazel's `//pkg/...` shares the cache of `//...`.
  const entiers = new Set();
  for (const chemin of chemins) {
    const abs = path.resolve(racine, chemin);
    const p = liste.find(({ dossier }) =>
      `${abs}${path.sep}`.startsWith(path.join(racine, dossier, path.sep))
    );
    if (!p) {
      refus.push(
        `⛔ ${chemin} : hors de tout paquet ; un chemin de test s'écrit depuis la racine, dans un paquet.`
      );
    } else if (p.hors) {
      refus.push(
        `⛔ ${chemin} : ${p.dossier} est hors cadre (docs/agents/hors-cadre.txt) ; Turborepo n'en joue aucune tâche.`
      );
    } else if (typeof p.pkg.scripts?.[SCRIPT_DES_TESTS] !== 'string') {
      refus.push(`⛔ ${chemin} : ${p.dossier} n'a pas de script ${SCRIPT_DES_TESTS}.`);
    } else {
      if (abs === path.join(racine, p.dossier)) {
        entiers.add(p.pkg.name);
        continue;
      }
      noms.add(p.pkg.name);
      // A directory ends with « / »: Vitest matches the start of a path, and packages/a is the start
      // of packages/ab.
      const dossier = existsSync(abs) && statSync(abs).isDirectory();
      absolus.push(dossier ? `${abs}${path.sep}` : abs);
    }
  }
  if (refus.length) {
    for (const l of refus) {
      process.stderr.write(`${l}\n`);
    }
    return 2;
  }
  // The whole packages play with no path in the variable (only the options and the moment of
  // `--force`); the files play in a run of their own. The code is the first that is not 0.
  const codes = [];
  if (entiers.size) {
    codes.push(
      cibles(
        [...entiers].sort().map(n => `--filter=${n}`),
        options
      )
    );
  }
  if (noms.size) {
    codes.push(
      cibles(
        [...noms].sort().map(n => `--filter=${n}`),
        [...absolus, ...options]
      )
    );
  }
  return codes.find(c => c !== 0) ?? 0;
};

try {
  // The run takes its part of the machine (scripts/passe-de-la-machine.mjs `surUnePart`), whose
  // mark every run of Turborepo carries to its tasks; a measure of time named plays on dedicated
  // cores (`mesure`), the rest of the machine going on.
  const mesureDeTemps = chemins.some(c => {
    const abs = path.resolve(racine, c);
    return existsSync(abs) && statSync(abs).isFile() && estHorsDuJour(abs);
  });
  process.exitCode = surUnePart(
    env => {
      Object.assign(process.env, env);
      return lancer();
    },
    { racine, mesure: mesureDeTemps }
  );
} finally {
  lacher();
  depuis?.retirer();
  base.fermer();
}
