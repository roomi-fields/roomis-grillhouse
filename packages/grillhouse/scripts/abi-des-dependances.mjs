#!/usr/bin/env node
// The version of Node a project's dependencies were installed under, as Yarn's integrity file
// keeps the system it installed for: a native module built for one binary interface of Node
// (`process.versions.modules`, the NODE_MODULE_VERSION) refuses to load under another, and npm
// rebuilds nothing when Node changes.
//
//   node abi-des-dependances.mjs --marquer <projet>   writes the mark of the current Node
//   node abi-des-dependances.mjs --a-jour <projet>    exit 0 when the mark is the current Node's,
//                                                     1 otherwise (no mark, another one)
//   node abi-des-dependances.mjs --manque <projet>    prints the line « Manque » of the session
//                                                     start, nothing when nothing is missing
//
// - The mark is the file MARQUE under the project's node_modules, which holds the binary
//   interface of the Node that installed the whole tree. A complete installation writes it: the
//   project's `prepare` under `npm ci` (scripts/crochets.mjs), and the night after its own
//   `npm ci` (scripts/nuit.sh). `npm install` leaves it as it stands: it rebuilds nothing already
//   installed, so the mark keeps the interface of the last complete installation.
// - A project without node_modules has nothing to mark and lacks nothing here (the session start
//   names the missing dependencies by its own line).
// - Without a mark (a tree installed by a former version of the frame, or by `npm install`
//   alone), the night installs again, and the session start says nothing: it names a known gap.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The mark, from the root of the project. */
export const MARQUE = path.join('node_modules', '.grillhouse-abi');

/**
 * Writes the mark of the binary interface <abi> in the project at <racine>, which has node_modules.
 * @param {string} racine
 * @param {string} [abi]
 */
export function marquerLesDependances(racine, abi = process.versions.modules) {
  writeFileSync(path.join(racine, MARQUE), `${abi}\n`);
}

/**
 * Writes the mark when <env> is the environment of a script that `npm ci` runs (`npm_command`),
 * the one installation that builds the whole tree again; true when it wrote it.
 * @param {string} racine
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [abi]
 */
export function marquerApresInstallation(
  racine,
  env = process.env,
  abi = process.versions.modules
) {
  if (env.npm_command !== 'ci' || !existsSync(path.join(racine, 'node_modules'))) {
    return false;
  }
  marquerLesDependances(racine, abi);
  return true;
}

/**
 * The gap between the dependencies of the project at <racine> and the Node of <abi>: null when it
 * has no node_modules or its mark is <abi>; otherwise the mark it holds, null for none.
 * @param {string} racine
 * @param {string} [abi]
 * @returns {{ marquee: string | null } | null}
 */
export function ecartDesDependances(racine, abi = process.versions.modules) {
  if (!existsSync(path.join(racine, 'node_modules'))) {
    return null;
  }
  const f = path.join(racine, MARQUE);
  const marquee = existsSync(f) ? readFileSync(f, 'utf8').trim() || null : null;
  return marquee === String(abi) ? null : { marquee };
}

/**
 * The item of « Manque » of the session start for the project at <racine> under the Node of
 * <abi> and <version>, with the command that rebuilds the tree; null when nothing is missing or
 * when no mark says under which Node the tree was installed.
 * @param {string} racine
 * @param {string} [abi]
 * @param {string} [version]
 */
export function ligneDuManque(racine, abi = process.versions.modules, version = process.version) {
  const ecart = ecartDesDependances(racine, abi);
  if (ecart === null || ecart.marquee === null) {
    return null;
  }
  return `les dépendances npm réinstallées sous le Node courant (${version}, interface binaire ${abi}) : elles ont été installées sous une autre version de Node (interface binaire ${ecart.marquee}), où un module natif ne charge plus (\`npm ci\`)`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [option, projet] = process.argv.slice(2);
  const racine = path.resolve(projet ?? '.');
  if (option === '--marquer') {
    marquerLesDependances(racine);
  } else if (option === '--a-jour') {
    process.exitCode = ecartDesDependances(racine) === null ? 0 : 1;
  } else if (option === '--manque') {
    const ligne = ligneDuManque(racine);
    if (ligne !== null) {
      process.stdout.write(`${ligne}\n`);
    }
  } else {
    process.stderr.write('usage : abi-des-dependances.mjs --marquer|--a-jour|--manque <projet>\n');
    process.exitCode = 2;
  }
}
