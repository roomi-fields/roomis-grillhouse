import { appendFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CADRE, enProcessus } from './cadre.js';
import { installerFauxTurbo } from './integration-essai.js';

// The trial harness of the launcher of an agent (scripts/enveloppe/lancer.sh) and of its envelope
// (scripts/enveloppe/enveloppe.mjs), shared by this package's tests that launch it
// (enveloppe*.nuit.spec.ts, lancer-modele*.nuit.spec.ts); the removal of the tickets' folders
// serves also sous-modules-essai.ts and commandes-en-enveloppe.nuit.spec.ts.

export const SCRIPT = path.join(CADRE, 'scripts/enveloppe/enveloppe.mjs');

// Writes at <repo> the package.json of a project of TypeScript that the launcher prepares: its
// language declared, Turborepo the trial's stand-in (./integration-essai.ts), node_modules ignored.
export function projetDuLanceur(repo: string) {
  writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({
      name: 'essai',
      private: true,
      devDependencies: { turbo: 'file:outils/turbo' },
    })
  );
  declarerLesLangages(repo);
  installerFauxTurbo(repo);
  appendFileSync(path.join(repo, '.gitignore'), 'node_modules\n');
}

const ouvrirBaseDuTicket = enProcessus<{ base: string; dossier: string }>(
  'scripts/mesure/base-de-passe.mjs',
  'ouvrirBaseDuTicket'
);

// The temporary directory of each ticket of a test file that launches sessions, removed at its
// end, red or green: the launcher gives it each session of the ticket and it outlives the session
// (grillhouse-xv9), as the frame names it (scripts/mesure/base-de-passe.mjs, `ouvrirBaseDuTicket`).
// The tickets: <tickets>, and each one the returned function records, which gives it back.
export function retirerLesTicketsALaFin(tickets: string[] = []): (id: string) => string {
  const ids = new Set(tickets);
  afterAll(() => {
    for (const id of ids) {
      rmSync(ouvrirBaseDuTicket(id).base, { recursive: true, force: true });
    }
  });
  return id => {
    ids.add(id);
    return id;
  };
}
