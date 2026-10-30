#!/usr/bin/env node
// The day's tests, as Turborepo's tasks (`npm test`, `npm run test:forcer`): the build, then the
// `test:unit` of each package, an unchanged task replayed from Turborepo's cache.
//
//   npx grillhouse tests [--force] [<path>…] [--<option>=<value>…]
//
// - Without a path, every package plays its tests (`turbo run test:unit`); `--force` plays each
//   task for real, the builds included (`npm run test:forcer`).
// - A path is written from the root of the repository: a test file or a directory. In a repository
//   of packages, each path plays in the package that holds it: Turborepo runs the `test:unit` of
//   those packages only (`--filter=<name>`), and their Vitest receives each path made absolute,
//   which it matches against its own test files (a path of another package matches none of them).
//   Turborepo filters packages, not files, and Vitest resolves a relative path from the directory
//   of the package that runs it, so the frame translates each path into its package; a Vitest at the
//   root (its projects) would run each package's tests under the root's version, not the one the
//   package declares. A path out of every package, in a package out of the frame
//   (`docs/agents/hors-cadre.txt`), or in a package without a `test:unit` script is refused,
//   named, and nothing plays. In a repository without packages, the paths go to the root's Vitest
//   as they are.
// - The paths and the options reach Vitest in the variable `GRILLHOUSE_TESTS`
//   (scripts/langages/typescript/vitest-config/cibles.mjs), which the `env` of the task `test:unit` names, never
//   after `--`: Turborepo passes the arguments after `--` to the tasks the command names only, and
//   counts them in the hash of every task of the run (its documentation, « Caching »: « including
//   dependencies of `build` that did not receive `--arg=value` »), where a variable of a task's
//   `env` enters that task's hash alone. So a run with paths is one Turborepo run of the tests with
//   what they depend on (`turbo run test:unit --filter=<name>`): the builds and the traces they
//   wait for play first, from the cache when nothing moved, whatever paths are named, and the hash
//   of the tests holds theirs, as Bazel's key of a target holds its transitive inputs; a change to
//   a package the tests import, or to what they read, plays them again. Every other run of
//   Turborepo plays with the variable unset.
// - Each run of Turborepo plays every task whose dependencies succeed
//   (`--continue=dependencies-successful`), as Bazel's `--keep_going` and `npm run verifier` do:
//   each build that fails is named on Turborepo's line « Failed: », a test that waits for a failed
//   build does not play, and the exit code stays red. A build that fails first does not hide another
//   one, which the run would otherwise cancel unreported.
// - `--force` with paths plays the tests named for real, their builds replayed from the cache:
//   Turborepo's `--force` re-executes every task of the run, so the variable carries the moment of
//   the run instead (`rejouer`), a value no cached run of the tests has. A test suspected unstable
//   is played again, and a build, which the same inputs give again, is not.
// - In the envelope of an agent (`GRILLHOUSE_ENVELOPPE`, scripts/enveloppe/paquets-du-plan.mjs),
//   the packages out of its plan and their traces arrive built by the launcher and read-only, as
//   in a sandbox of Bazel: the build is the named packages' alone, with the traces of those
//   packages their tests wait for, which live in the package the agent writes
//   (`turbo run build <name>#trace:<t>… --only --filter=<name>`, their task ids read in
//   Turborepo's plan of the tests, `turbo run test:unit --filter=<name> --dry=json`), never
//   their dependencies nor a neighbour's trace; then the tests alone
//   (`turbo run test:unit --only --filter=<name>`), the paths in the variable. A named package
//   that the envelope shows read-only (one out of the plan; the shared test material, for every
//   role but the testwriter) is not built, nor are its traces: it arrives built, as a read-only
//   input of Bazel; the frame knows it read-only by testing its directory for writing
//   (`inscriptible`), where the envelope mounts it. The shared test material plays its tests as
//   it is: the logs of its tasks go to the envelope's directories proper to the session
//   (`sortiesDeTest`, scripts/enveloppe/enveloppe.mjs), never into its source. A package out of
//   the plan has no such directories: Turborepo and Vite cannot write its logs and its cache, and
//   a run of its tests fails on « Read-only file system »; its tests play out of the envelope. The
//   verdict that counts is the reviewer's and the integration's, out of the envelope.
// - An argument that begins with « - » is an option of Vitest, written `--<name>=<value>`, carried
//   in the variable beside the paths.
// - A night test or a time budget bench, which the day leaves out, plays when a path names its own
//   file, under the measure of time of the day's configuration (scripts/langages/typescript/vitest-config/cibles.mjs);
//   a directory or a package named leaves them out.
// - A run that plays no test fails: the frame's base configuration of Vitest keeps Vitest's
//   `passWithNoTests: false` (scripts/langages/typescript/vitest-config/base.mjs).
// - Under the circuit's mark (`GRILLHOUSE_DEPUIS_LE_VERT`, its proof and its checks,
//   scripts/circuit.mjs), a run measures itself against the last green, as `npm run verifier`
//   does (scripts/dernier-vert.mjs): in a package or a directory named, the tests Vitest relates to
//   the files changed since it, every test when a change lies out of Vitest's graph; a file named
//   itself plays, changed or not; `--force` plays them all. Without the mark, every test named
//   plays.
// - While the environment names a results directory (`GRILLHOUSE_RESULTATS`,
//   scripts/resultats.mjs), each run of Turborepo writes its summary (`--summarize`), moved there,
//   and Vitest its JSON report there: what the circuit reads of a run.
// - While the environment names the progress directory of a pass (`GRILLHOUSE_AVANCEMENT`,
//   scripts/avancement.mjs: the circuit's proof and checks), each run of the tests plans its
//   tasks first, and Vitest writes there the files done and planned of each.
// - The run has a base of its own (scripts/mesure/base-de-passe.mjs), which it sweeps first
//   of the bases a killed run left: it names it in TMPDIR, TMP and TEMP to every run of
//   Turborepo, whose root's `globalPassThroughEnv` passes TMPDIR on to every task, and removes it
//   at its end, green, red or interrupted (SIGINT, SIGTERM, SIGHUP).
// The exit code is Turborepo's; 2 for a path refused.
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  AVANCEMENT,
  CHANGEMENTS,
  DEPUIS_LE_VERT,
  mesure,
  ouvrirBase,
  paquetsDeLEnveloppe,
  retirerALInterruption,
} from '../../services-du-noyau.mjs';
import { paquets } from '../../paquets.mjs';
import { garderLesResumes } from './verdict.mjs';
import { RESULTATS } from '../../resultats.mjs';
import { planifier, tracesDuPlan } from './turbo-des-paquets.mjs';
import { SCRIPT_DES_TESTS } from './script-des-tests.mjs';
import { VARIABLE } from './vitest-config/cibles.mjs';

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
const depuis = process.env[DEPUIS_LE_VERT] ? mesure(racine, { tout: force }) : null;
if (depuis) process.stdout.write(`${depuis.ligne}\n`);

// One Turborepo run of <args>, VARIABLE set to <tests> (unset without), each task whose
// dependencies succeed played to its end; its exit code. While the run names a results directory
// (RESULTATS), Turborepo writes its summary, which goes there.
const turbo = (args, tests) => {
  const env = { ...process.env };
  delete env[VARIABLE];
  delete env[CHANGEMENTS];
  Object.assign(env, depuis?.env ?? {});
  if (tests) env[VARIABLE] = JSON.stringify(tests);
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
  if (resume.length) garderLesResumes(racine, avant, env);
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
  const tests = { arguments: passes, ...(force ? { rejouer: new Date().toISOString() } : {}) };
  if (!enveloppe) return turbo([SCRIPT_DES_TESTS, ...filtres], tests);
  // A package the envelope shows read-only arrives built: only the packages it shows in writing
  // build, as the envelope mounts them (`inscriptible`).
  const construits = filtres.filter(f => inscriptible(dossiers.get(f.slice('--filter='.length))));
  if (filtres.length === 0 || construits.length > 0) {
    const noms = new Set(construits.map(f => f.slice('--filter='.length)));
    const propres = construits.length ? traces(construits, noms) : { ids: [] };
    if (propres.code !== undefined) return propres.code;
    const construction = turbo(['build', ...propres.ids, '--only', ...construits]);
    if (construction !== 0) return construction;
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
      [SCRIPT_DES_TESTS, ...(force ? ['--force'] : [])],
      options.length ? { arguments: options } : undefined
    );
  }
  if (liste.length === 0) return cibles([], [...chemins, ...options]);

  // The package of the frame that holds each path, the paths made absolute; the refusals.
  const refus = [];
  const noms = new Set();
  const absolus = [];
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
      noms.add(p.pkg.name);
      // A directory ends with « / »: Vitest matches the start of a path, and packages/a is the start
      // of packages/ab.
      const dossier = existsSync(abs) && statSync(abs).isDirectory();
      absolus.push(dossier ? `${abs}${path.sep}` : abs);
    }
  }
  if (refus.length) {
    for (const l of refus) process.stderr.write(`${l}\n`);
    return 2;
  }
  return cibles(
    [...noms].sort().map(n => `--filter=${n}`),
    [...absolus, ...options]
  );
};

try {
  process.exitCode = lancer();
} finally {
  lacher();
  depuis?.retirer();
  base.fermer();
}
