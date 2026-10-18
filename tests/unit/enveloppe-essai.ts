import { mkdtempSync } from 'node:fs';
import path from 'node:path';

// The trial harness of the envelope of an agent (scripts/enveloppe/enveloppe.mjs) and of its
// launcher (scripts/enveloppe/lancer.sh), shared by their tests (tests/unit/enveloppe*.spec.ts).

export const SCRIPT = path.resolve(__dirname, '../../scripts/enveloppe/enveloppe.mjs');

// The repositories of trial of one test file, under <ESSAIS>.
export function enveloppeEssai(ESSAIS: string) {
  const essai = (nom: string) => mkdtempSync(path.join(ESSAIS, nom));
  return { essai };
}
