#!/usr/bin/env node
// The day's tests, as Turborepo's tasks (`npm test`, `npm run test:forcer`): the build, then the
// `test:vitest` of each package, an unchanged task replayed from Turborepo's cache.
//
//   node scripts/tests.mjs [--force] [<path>…] [--<option>=<value>…]
//
// - Without a path, every package plays its tests (`turbo run test:vitest`); `--force` plays each
//   task for real, the builds included (`npm run test:forcer`).
// - A path is written from the root of the repository: a test file or a directory. In a repository
//   of packages, each path plays in the package that holds it: Turborepo runs the `test:vitest` of
//   those packages only (`--filter=<name>`), and their Vitest receives each path made absolute,
//   which it matches against its own test files (a path of another package matches none of them).
//   Turborepo filters packages, not files, and Vitest resolves a relative path from the directory
//   of the package that runs it, so the frame translates each path into its package; a Vitest at the
//   root (its projects) would run each package's tests under the root's version, not the one the
//   package declares. A path out of every package, in a package out of the frame
//   (`docs/agents/hors-cadre.txt`), or in a package without a `test:vitest` script is refused,
//   named, and nothing plays. In a repository without packages, the paths go to the root's Vitest
//   as they are.
// - The paths and the options reach Vitest in the variable `GRILLHOUSE_TESTS`
//   (scripts/vitest-config/cibles.mjs), which the `env` of the task `test:vitest` names, never
//   after `--`: Turborepo passes the arguments after `--` to the tasks the command names only, and
//   counts them in the hash of every task of the run (its documentation, « Caching »: « including
//   dependencies of `build` that did not receive `--arg=value` »), where a variable of a task's
//   `env` enters that task's hash alone. So a run with paths is one Turborepo run of the tests with
//   what they depend on (`turbo run test:vitest --filter=<name>`): the builds and the traces they
//   wait for play first, from the cache when nothing moved, whatever paths are named, and the hash
//   of the tests holds theirs, as Bazel's key of a target holds its transitive inputs; a change to
//   a package the tests import, or to what they read, plays them again. A build that fails ends the
//   run, and no test plays. Every other run of Turborepo plays with the variable unset.
// - `--force` with paths plays the tests named for real, their builds replayed from the cache:
//   Turborepo's `--force` re-executes every task of the run, so the variable carries the moment of
//   the run instead (`rejouer`), a value no cached run of the tests has. A test suspected unstable
//   is played again, and a build, which the same inputs give again, is not.
// - In the envelope of an agent (`GRILLHOUSE_ENVELOPPE`, scripts/enveloppe/composant.mjs), the
//   neighbours and their traces arrive built by the launcher and read-only, as in a sandbox of
//   Bazel: the build is the named packages' alone, with the traces of those packages their tests
//   wait for, which live in the package the agent writes (`turbo run build <name>#trace:<t>…
//   --only --filter=<name>`, their task ids read in Turborepo's plan of the tests,
//   `turbo run test:vitest --filter=<name> --dry=json`), never their dependencies nor a
//   neighbour's trace; then the tests alone (`turbo run test:vitest --only --filter=<name>`), the
//   paths in the variable. A named package that the envelope shows read-only (the shared test
//   material, for every role but the testeur) is not built, nor are its traces: it arrives built,
//   as a read-only input of Bazel, and its tests play as it is; the frame knows it read-only by
//   testing its directory for writing (`inscriptible`), where the envelope mounts it, and the logs
//   of its tasks go to the envelope's directories proper to the session (`sortiesDeTest`,
//   scripts/enveloppe/enveloppe.mjs), never into its source. There the hash of the tests sees
//   neither the code of the neighbours nor their builds: the verdict that counts is the reviewer's
//   and the integration's, out of the envelope.
// - An argument that begins with « - » is an option of Vitest, written `--<name>=<value>`, carried
//   in the variable beside the paths.
// - A run that plays no test fails: the frame's base configuration of Vitest keeps Vitest's
//   `passWithNoTests: false` (scripts/vitest-config/base.mjs).
// The exit code is Turborepo's; 2 for a path refused.
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { composantDeLEnveloppe } from './enveloppe/composant.mjs';
import { paquets } from './paquets.mjs';
import { tracesDuPlan } from './turbo-des-paquets.mjs';
import { VARIABLE } from './vitest-config/cibles.mjs';

const racine = process.cwd();
const enveloppe = composantDeLEnveloppe() !== null;
const args = process.argv.slice(2);
const force = args.includes('--force');
const options = args.filter(a => a.startsWith('-') && a !== '--force');
const chemins = args.filter(a => !a.startsWith('-'));

// One Turborepo run of <args>, VARIABLE set to <tests> (unset without); its exit code.
const turbo = (args, tests) => {
  const env = { ...process.env };
  delete env[VARIABLE];
  if (tests) env[VARIABLE] = JSON.stringify(tests);
  return spawnSync('turbo', ['run', ...args], { cwd: racine, stdio: 'inherit', env }).status ?? 1;
};

// The trace tasks of the packages <noms> their tests wait for, read in Turborepo's plan of the
// tests <filtres> select: `{ ids }`; a plan that fails gives `{ code }`, its output written.
const traces = (filtres, noms) => {
  const plan = spawnSync('turbo', ['run', 'test:vitest', ...filtres, '--dry=json'], {
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
  if (!enveloppe) return turbo(['test:vitest', ...filtres], tests);
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
  return turbo(['test:vitest', '--only', ...filtres], tests);
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
      ['test:vitest', ...(force ? ['--force'] : [])],
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
    } else if (typeof p.pkg.scripts?.['test:vitest'] !== 'string') {
      refus.push(`⛔ ${chemin} : ${p.dossier} n'a pas de script test:vitest.`);
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

process.exitCode = lancer();
