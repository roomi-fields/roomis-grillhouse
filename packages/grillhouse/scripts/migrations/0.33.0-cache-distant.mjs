// The remote cache of Turborepo is shared between the CI (the repository's variables and
// secrets) and the poste (~/.config/grillhouse/turbo-cache.env, scripts/fichier-du-poste.mjs).
// Mechanism: installation.md §5.4 and §4.3 (packages/grillhouse/docs/architecture/).
//
// - The migration changes no file.
// - `restes`, once: a project whose root turbo.json does not sign the artifacts
//   (`remoteCache.signature`) is told how to plug a server.
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
