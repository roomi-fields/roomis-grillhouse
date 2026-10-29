import { writeFileSync } from 'node:fs';
import path from 'node:path';

// The language of a project of trial (grillhouse-3dr.2.3): the core refuses a project that
// declares none. This material mounts nothing, so that a test importing it keeps its size.

// The section `grillhouse` of a project of TypeScript: it declares its language.
export const LANGAGE = { langages: ['typescript'] };

// Writes at <repo> the package.json of a project of TypeScript without workspaces.
export function declarerLeLangage(repo: string) {
  writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({ name: 'essai', private: true, grillhouse: LANGAGE })
  );
}
