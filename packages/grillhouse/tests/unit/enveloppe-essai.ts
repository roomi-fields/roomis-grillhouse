import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { installerFauxTurbo } from './integration-essai.js';

// The trial harness of the envelope of an agent (scripts/enveloppe/enveloppe.mjs) and of its
// launcher (scripts/enveloppe/lancer.sh), shared by their tests (tests/unit/enveloppe*.spec.ts).

export const SCRIPT = path.resolve(__dirname, '../../scripts/enveloppe/enveloppe.mjs');

// The section `grillhouse` of a project of TypeScript: it declares its language
// (grillhouse-3dr.2.3).
export const LANGAGE = { langages: ['typescript'] };

// Writes at <repo> the package.json of a project of TypeScript without workspaces.
export function declarerLeLangage(repo: string) {
  writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({ name: 'essai', private: true, grillhouse: LANGAGE })
  );
}

// Writes at <repo> the package.json of a project of TypeScript that the launcher prepares: its
// language declared, Turborepo the trial's stand-in (./integration-essai.ts), node_modules ignored.
export function projetDuLanceur(repo: string) {
  writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({
      name: 'essai',
      private: true,
      grillhouse: LANGAGE,
      devDependencies: { turbo: 'file:outils/turbo' },
    })
  );
  installerFauxTurbo(repo);
  appendFileSync(path.join(repo, '.gitignore'), 'node_modules\n');
}

// The repositories of trial of one test file, under <ESSAIS>.
export function enveloppeEssai(ESSAIS: string) {
  const essai = (nom: string) => mkdtempSync(path.join(ESSAIS, nom));
  return { essai };
}
