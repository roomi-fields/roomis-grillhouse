import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LANGAGE } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CADRE } from './cadre.js';
import { installerFauxTurbo } from './integration-essai.js';

// The trial harness of the launcher of an agent (scripts/enveloppe/lancer.sh) and of its envelope
// (scripts/enveloppe/enveloppe.mjs), shared by this package's tests that launch it
// (enveloppe*.nuit.spec.ts, lancer-modele.nuit.spec.ts).

export const SCRIPT = path.join(CADRE, 'scripts/enveloppe/enveloppe.mjs');

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
