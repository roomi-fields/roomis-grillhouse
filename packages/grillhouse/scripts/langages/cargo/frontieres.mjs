#!/usr/bin/env node
// The guard of the boundaries between the crates of a workspace of cargo: who may depend on whom,
// written once in the workspace's manifest, as Nx's `depConstraints` in one configuration, and
// held against what cargo itself says of each member (`cargo metadata --no-deps`, ./composants.mjs).
//
//   node frontieres.mjs     in the root of the workspace; 0 green, 1 a finding refused
//
// - The list permitted: `[workspace.metadata.grillhouse.frontieres]` of the root Cargo.toml, the
//   table cargo keeps for its tools (`metadata` of `cargo metadata`); each key a crate, its value
//   the crates it may depend on (`ws-app = ["ws-core"]`). A crate the list does not name, or a
//   workspace without list, may depend on no other crate.
// - A dependency between crates is one a member declares by its path on another member, of any
//   kind (`normal`, `dev`, `build`); a crate out of the workspace (crates.io, a git source) is
//   cargo-deny's (`bans`), not this guard's.
// - Each dependency absent from the list is a finding: the manifest of the crate that declares it,
//   the rule `dependance-non-permise`, a message naming both crates and the kind. The findings are
//   judged by the debt (../../dette.mjs) and written in SARIF (../../resultats.mjs); cargo unable
//   to answer refuses, named, never inscribed.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MODE, trancher } from '../../dette.mjs';
import { crates, metadonnees } from './composants.mjs';

export const GARDE = 'frontieres';
export const REGLE = 'dependance-non-permise';
const TABLE = '[workspace.metadata.grillhouse.frontieres]';

/**
 * The dependencies between the crates of the workspace at <racine> that its list does not
 * permit, each a finding `{ fichier, regle, message }`, by crate then by dependency.
 * @param {string} racine the root of the workspace
 */
export function constatsDesFrontieres(racine) {
  const permises = metadonnees(racine)?.metadata?.grillhouse?.frontieres ?? {};
  const liste = crates(racine);
  const parDossier = new Map(liste.map(c => [c.composant.dossier, c.composant]));
  const out = [];
  for (const c of liste) {
    const nom = c.composant.nom;
    const permis = new Set(Array.isArray(permises[nom]) ? permises[nom] : []);
    const manifeste = path
      .relative(racine, path.join(c.composant.dossier, 'Cargo.toml'))
      .split(path.sep)
      .join('/');
    const deps = c.deps
      .map(d => ({ lu: parDossier.get(d.dossier), genre: d.genre }))
      .filter(d => d.lu && d.lu !== c.composant && !permis.has(d.lu.nom))
      .sort((a, b) => a.lu.nom.localeCompare(b.lu.nom) || a.genre.localeCompare(b.genre));
    for (const { lu, genre } of deps) {
      out.push({
        fichier: manifeste,
        regle: REGLE,
        message: `${nom} dépend de ${lu.nom} (${genre}) : absent de la liste permise ${TABLE} du Cargo.toml.`,
      });
    }
  }
  return out;
}

/**
 * Runs the guard in the workspace at <racine>: its exit code, its refusals printed.
 * @param {string} racine the root of the workspace
 * @param {{ env?: NodeJS.ProcessEnv }} [o] the environment (the results directory, the debt's mode)
 */
export function commande(racine, { env = process.env } = {}) {
  let constats;
  try {
    constats = constatsDesFrontieres(racine);
  } catch (e) {
    constats = [{ message: e.message }];
  }
  const { refus, lignes } = trancher(racine, GARDE, constats, env[MODE] || undefined, env);
  for (const c of refus) {
    process.stderr.write(`⛔ frontieres : ${c.fichier ? `${c.fichier} — ` : ''}${c.message}\n`);
  }
  for (const l of lignes) {
    process.stderr.write(`${l}\n`);
  }
  return refus.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = commande(process.cwd());
}
