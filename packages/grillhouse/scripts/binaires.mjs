#!/usr/bin/env node
// The binaries of the languages of a project, installed on the machine alone, as `rustup` or
// `actions/setup-*` bring a toolchain without touching the repository: what a CI runs after
// `npm ci`, so that `npm run verifier` finds the programs its languages run (cargo's sccache,
// nextest and cargo-deny; python's uv).
//
//   npx grillhouse binaires    from the root of the project
//
// - Each binary of the languages the project declares (`binaires` of each module), which its
//   installation does not list at its version, is installed by the commands its module describes
//   (`miseAJour.installation`: `liste`, then `installer` for each one missing or at another
//   version), each run by Node, as `npm install` brings what is installed to what is declared; a
//   language without binaries runs nothing. `npx grillhouse maj` and `npx grillhouse paquet` play
//   the same installation (`installerBinaires`).
// - No file of the project is written: the binaries go where the module's tool puts them
//   (`~/.cargo/bin`, uv's folder).
// - The report: each binary installed, or « à jour »; on the error stream, the line of each
//   failure, which names the command to type. The exit code: 0; 1 for a failure; 2 for the usage
//   (any argument) or a project whose languages the frame refuses (scripts/langages.mjs).
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { langagesDe } from './langages.mjs';

/**
 * Installs on the machine each binary of the languages of the project at <projet> (`binaires` of
 * its module) that its installation does not list at its version, by the commands its module
 * describes (`miseAJour.installation`: `liste`, then `installer` for each one missing), each run by
 * Node; a language without binaries runs nothing. Returns `{ installes, lignes }`: each binary
 * installed (`<nom>@<version>`), and the line of each failure, the error stream of its command,
 * which names the command to type.
 */
export function installerBinaires(projet) {
  const installes = [];
  const lignes = [];
  for (const m of langagesDe(projet)) {
    const r = installerLesBinairesDe(projet, m);
    installes.push(...r.installes);
    lignes.push(...r.lignes);
  }
  return { installes, lignes };
}

// The binaries of the module <langage> installed in the project at <projet> (`installerBinaires`).
function installerLesBinairesDe(projet, langage) {
  const voulus = Object.entries(langage.binaires);
  const installation = langage.miseAJour.installation;
  if (voulus.length === 0 || installation === null) {
    return { installes: [], lignes: [] };
  }
  const lancer = c =>
    spawnSync(process.execPath, [c.script, ...c.args], { cwd: projet, encoding: 'utf8' });
  const cause = r => (r.error ? r.error.message : (r.stderr ?? '').trim() || `code ${r.status}`);
  const liste = lancer(installation.liste);
  let presents;
  try {
    if (liste.error || liste.status !== 0) {
      throw new Error(cause(liste));
    }
    presents = JSON.parse(liste.stdout);
  } catch (e) {
    return {
      installes: [],
      lignes: [`Binaires : la liste des binaires installés échoue. ${e.message}`],
    };
  }
  const installes = [];
  const lignes = [];
  for (const [nom, version] of voulus) {
    if (presents[nom] === version) {
      continue;
    }
    const r = lancer(installation.installer(nom, version));
    if (!r.error && r.status === 0) {
      installes.push(`${nom}@${version}`);
    } else {
      lignes.push(`Binaire ${nom}@${version} : ${cause(r)}`);
    }
  }
  return { installes, lignes };
}

export const USAGE =
  'Usage : npx grillhouse binaires   installe les binaires des langages du projet qui manquent à leur version\n';

/**
 * `grillhouse binaires <args…>` in the project at <projet> (see the header): `{ code, sortie,
 * erreur }`, the standard output, the error stream and the exit code.
 * @param {string[]} args the arguments after the subcommand
 * @param {string} [projet] the root of the project, the working directory by default
 * @returns {{ code: number, sortie: string, erreur: string }}
 */
export function binaires(args, projet = process.cwd()) {
  if (args.length > 0) {
    return { code: 2, sortie: '', erreur: USAGE };
  }
  let r;
  try {
    r = installerBinaires(projet);
  } catch (e) {
    return { code: 2, sortie: '', erreur: `⛔ ${e.message.replace(/^⛔ /, '')}\n` };
  }
  const sortie = r.installes.length
    ? `Binaires installés : ${r.installes.join(', ')}.\n`
    : r.lignes.length
      ? ''
      : 'Binaires : à jour.\n';
  return {
    code: r.lignes.length ? 1 : 0,
    sortie,
    erreur: r.lignes.map(l => `${l}\n`).join(''),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { code, sortie, erreur } = binaires(process.argv.slice(2));
  process.stdout.write(sortie);
  process.stderr.write(erreur);
  process.exitCode = code;
}
