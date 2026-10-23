// The source files of a project, as the migrations read them (scripts/migrations/): each `.ts`,
// `.mts`, `.cts`, `.js`, `.mjs`, `.cjs` under its root, as a path from it, the directories of
// tools and of what is installed or built (node_modules, .git, dist, coverage, .turbo, .claude,
// .beads, .codegraph, .rtfm) left out.
import { readdirSync } from 'node:fs';
import path from 'node:path';

const EXTENSIONS = /\.(?:[mc]?ts|[mc]?js)$/;
const HORS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.turbo',
  '.claude',
  '.beads',
  '.codegraph',
  '.rtfm',
]);

/** The source files of the project at <racine>, as paths from it. */
export function sources(racine, rel = '') {
  return readdirSync(path.join(racine, rel), { withFileTypes: true }).flatMap(e => {
    const r = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) return HORS.has(e.name) ? [] : sources(racine, r);
    return e.isFile() && EXTENSIONS.test(e.name) ? [r] : [];
  });
}
