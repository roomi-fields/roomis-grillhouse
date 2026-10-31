// The source files of a project, as the migrations read them (scripts/migrations/): each `.ts`,
// `.mts`, `.cts`, `.js`, `.mjs`, `.cjs` under its root, as a path from it; and whether a source
// text imports a package (`importe`).
//
// - Left out: the directories of the frame's tools and of what npm installs (node_modules, .git,
//   dist, coverage, .claude, .beads, .codegraph, .rtfm), and what the tools of the project's
//   language write (`ignorer` of its module, scripts/jointure.d.ts: typescript's `.turbo`, cargo's
//   `target`), as git leaves out what a `.gitignore` names. A project that declares no language
//   (the column « Langage » of its docs/ARCHITECTURE.md) leaves out what every language of the
//   frame writes.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { LANGAGES, langage, langageDe, langagesDeclares } from './langages.mjs';

const EXTENSIONS = /\.(?:[mc]?ts|[mc]?js)$/;
const HORS = [
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.claude',
  '.beads',
  '.codegraph',
  '.rtfm',
];

// The directories left out in the project at <racine>: the frame's, and what its language's tools
// write (every language's, for a project that declares none).
function hors(racine) {
  const declares = langagesDeclares(racine);
  const ecrits =
    declares.length > 0
      ? langageDe(racine).ignorer
      : Object.keys(LANGAGES).flatMap(nom => langage(nom).ignorer);
  return new Set([...HORS, ...ecrits]);
}

/** The source files of the project at <racine>, under <dossier> (from it; the root by default),
 * as paths from <racine>. */
export function sources(racine, dossier = '') {
  const exclus = hors(racine);
  const parcourir = rel =>
    readdirSync(path.join(racine, rel), { withFileTypes: true }).flatMap(e => {
      const r = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) {
        return exclus.has(e.name) ? [] : parcourir(r);
      }
      return e.isFile() && EXTENSIONS.test(e.name) ? [r] : [];
    });
  return parcourir(dossier);
}

const echapper = t => t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
/** Whether the source text <texte> imports the package <dep> (or a path into it). */
export const importe = (texte, dep) =>
  new RegExp(
    `(?:\\bfrom\\s*|\\bimport\\s*\\(?\\s*|\\brequire\\s*\\(\\s*)(['"])${echapper(dep)}(?:/[^'"]*)?\\1`
  ).test(texte);
