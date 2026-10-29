import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The language of a project of trial (grillhouse-3dr.2.3): the core refuses a project that
// declares none; and the trial directories of the tests of the envelope. This material mounts
// nothing, so that a test importing it keeps its size.

// The section `grillhouse` of a project of TypeScript: it declares its language.
export const LANGAGE = { langages: ['typescript'] };

// Writes at <repo> the package.json of a project of TypeScript without workspaces.
export function declarerLeLangage(repo: string) {
  writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({ name: 'essai', private: true, grillhouse: LANGAGE })
  );
}

// The repositories of trial of one test file of the envelope, under <ESSAIS>.
export function enveloppeEssai(ESSAIS: string) {
  const essai = (nom: string) => mkdtempSync(path.join(ESSAIS, nom));
  return { essai };
}
