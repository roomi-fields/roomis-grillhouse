// From 0.33.0 the remote cache of Turborepo is shared between the CI and the poste
// (grillhouse-44b.12.6): the template's CI takes its server from the repository's variables and
// secrets, and the commands of the frame on the poste read it from
// ~/.config/grillhouse/turbo-cache.env, read alone (scripts/fichier-du-poste.mjs).
//
// - The migration changes no file: without a server, the CI and the poste keep their local cache,
//   and a marked workflow of the frame reaches the project by the update.
// - What stays to the project (`restes`), once: a project whose root's turbo.json does not sign
//   the artifacts (`remoteCache.signature`) is told how to plug a server. One that signs them has
//   plugged it already.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const version = '0.33.0';
export const nom = 'cache distant';

/** Changes nothing: plugging a server is the project's gesture (`restes`). */
export function migrer() {
  return [];
}

// Whether the root's turbo.json (or turbo.jsonc) of <projet> signs the artifacts of its remote cache.
const signe = projet =>
  ['turbo.json', 'turbo.jsonc']
    .map(f => path.join(projet, f))
    .some(f => existsSync(f) && /"signature"\s*:\s*true/.test(readFileSync(f, 'utf8')));

/** How to plug a server of remote cache, for a project whose turbo.json does not sign. */
export function restes(projet) {
  if (signe(projet)) {
    return [];
  }
  return [
    'turbo.json : le cache distant de Turborepo se partage entre la CI et le poste, s\'il y a un serveur (facultatif ; sans lui rien ne change). Pour le brancher : les variables TURBO_API et TURBO_TEAM et les secrets TURBO_TOKEN et TURBO_REMOTE_CACHE_SIGNATURE_KEY du dépôt sur GitHub (la CI du cadre les lit : un push vers main ou agent/** écrit, tout autre run lit), `"remoteCache": { "signature": true }` dans le turbo.json racine, et, sur le poste, les quatre mêmes variables dans ~/.config/grillhouse/turbo-cache.env (droits 600), que chaque projet du poste lit seul, sans jamais écrire.',
  ];
}
