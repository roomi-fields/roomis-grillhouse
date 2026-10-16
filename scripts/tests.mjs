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
// - A run with paths plays in two Turborepo runs: the builds first, without arguments
//   (`turbo run build --filter=<name>...`: each package and its dependencies; the root's build in a
//   repository without packages), then the tests alone (`turbo run test:vitest --only`), which
//   receive the paths after `--`. Turborepo passes the arguments after `--` to every task of the
//   run and counts them in each task's hash: in one run, naming another file would play each build
//   again. A build that fails ends the run, and no test plays. `--force` plays the tests named for
//   real, their builds replayed from the cache: a test suspected unstable is played again, and a
//   build, which the same inputs give again, is not.
// - The builds' run also plays the traces the tests of the named packages wait for (a package's
//   `grillhouse.lit` over another's `grillhouse.traces`, scripts/turbo-des-paquets.mjs), as Bazel
//   produces the inputs of a test before it: their task ids (`<producer>#trace:<name>`) read in
//   Turborepo's plan of those tests (`turbo run test:vitest --filter=<name> --dry=json`), the graph
//   Turborepo plays, the one the launcher reads; without arguments, so replayed from the cache. A
//   trace that fails ends the run, as a build.
// - In the envelope of an agent (`GRILLHOUSE_ENVELOPPE`, scripts/enveloppe/composant.mjs), the
//   neighbours and their traces arrive built by the launcher and read-only, as in a sandbox of
//   Bazel: the build is the named packages' alone, with the traces of those packages their tests
//   wait for, which live in the package the agent writes (`turbo run build <name>#trace:<t>…
//   --only --filter=<name>`, the build before the trace, replayed from the cache when nothing
//   moved), never their dependencies nor a neighbour's trace.
// - An argument that begins with « - » is an option of Vitest, written `--<name>=<value>`, passed to
//   each run of the tests as it is.
// - A run that plays no test fails: the frame's base configuration of Vitest keeps Vitest's
//   `passWithNoTests: false` (scripts/vitest-config/base.mjs).
// The exit code is Turborepo's; 2 for a path refused.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { composantDeLEnveloppe } from './enveloppe/composant.mjs';
import { paquets } from './paquets.mjs';
import { tracesDuPlan } from './turbo-des-paquets.mjs';

const racine = process.cwd();
const enveloppe = composantDeLEnveloppe() !== null;
const args = process.argv.slice(2);
const force = args.includes('--force') ? ['--force'] : [];
const options = args.filter(a => a.startsWith('-') && a !== '--force');
const chemins = args.filter(a => !a.startsWith('-'));

// One Turborepo run of <args>; its exit code.
const turbo = args =>
  spawnSync('turbo', ['run', ...args], { cwd: racine, stdio: 'inherit' }).status ?? 1;

// The trace tasks the tests <filtres> select wait for, read in Turborepo's plan of those tests, the
// ones <garder> keeps; none without a filter. A plan that fails exits with its code, its output
// written.
const traces = (filtres, garder) => {
  if (filtres.length === 0) return [];
  const plan = spawnSync('turbo', ['run', 'test:vitest', ...filtres, '--dry=json'], {
    cwd: racine,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (plan.status !== 0) {
    process.stderr.write(`${plan.stdout ?? ''}${plan.stderr ?? ''}`);
    process.exit(plan.status ?? 1);
  }
  return tracesDuPlan(JSON.parse(plan.stdout), garder);
};

// The builds <filtres> select with the traces their tests wait for (in an envelope, the packages
// they name alone, with their own traces), then the tests <filtres> select alone, which receive
// <passes>; exits with the first exit code that is not 0, else with the tests'.
const cibles = (filtres, passes) => {
  const noms = new Set(filtres.map(f => f.slice('--filter='.length)));
  const construction = turbo(
    enveloppe
      ? ['build', ...traces(filtres, t => noms.has(t.package)), '--only', ...filtres]
      : ['build', ...traces(filtres), ...filtres.map(f => `${f}...`)]
  );
  if (construction !== 0) process.exit(construction);
  process.exit(turbo(['test:vitest', '--only', ...force, ...filtres, '--', ...passes]));
};

const liste = paquets(racine);
if (chemins.length === 0) {
  process.exit(turbo(['test:vitest', ...force, ...(options.length ? ['--', ...options] : [])]));
}
if (liste.length === 0) cibles([], [...chemins, ...options]);

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
  process.exit(2);
}
cibles(
  [...noms].sort().map(n => `--filter=${n}`),
  [...absolus, ...options]
);
