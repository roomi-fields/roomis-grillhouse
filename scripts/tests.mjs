#!/usr/bin/env node
// The day's tests, as Turborepo's tasks (`npm test`, `npm run test:forcer`): the build, then the
// `test:vitest` of each package, an unchanged task replayed from Turborepo's cache.
//
//   node scripts/tests.mjs [--force] [<path>…] [--<option>=<value>…]
//
// - Without a path, every package plays its tests (`turbo run test:vitest`); `--force` plays each
//   task for real (`npm run test:forcer`).
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
// - An argument that begins with « - » is an option of Vitest, written `--<name>=<value>`, passed to
//   each run as it is.
// - A run that plays no test fails: the frame's base configuration of Vitest keeps Vitest's
//   `passWithNoTests: false` (scripts/vitest-config/base.mjs).
// The exit code is Turborepo's; 2 for a path refused.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { paquets } from './turbo-des-paquets.mjs';

const racine = process.cwd();
const args = process.argv.slice(2);
const force = args.includes('--force') ? ['--force'] : [];
const options = args.filter(a => a.startsWith('-') && a !== '--force');
const chemins = args.filter(a => !a.startsWith('-'));

const turbo = (filtres, passes) => {
  const r = spawnSync(
    'turbo',
    ['run', 'test:vitest', ...force, ...filtres, ...(passes.length ? ['--', ...passes] : [])],
    { cwd: racine, stdio: 'inherit' }
  );
  process.exit(r.status ?? 1);
};

const liste = paquets(racine);
if (chemins.length === 0 || liste.length === 0) turbo([], [...chemins, ...options]);

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
turbo(
  [...noms].sort().map(n => `--filter=${n}`),
  [...absolus, ...options]
);
