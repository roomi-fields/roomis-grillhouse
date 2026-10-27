// From 0.24.12 the circuit sorts the discoveries of a ticket once its lot is on main (step 5.3, the
// tri of the discoveries, grillhouse-0yu.5): each one receives its verdict at its ticket, and an
// `a-porter` or a `non-confirmee` reopens under `a-valider`. A project's `docs/agents/issue-tracker.md`
// is its own since 0.23.0, and its template's rule said a discovery « reopens on the owner's
// word », the supervisor bringing those that touch a real use: a rule the frame no longer holds.
//
// - Each of the two sentences of that rule, when the file holds it as the template wrote it,
//   becomes the rule of the tri, as the template now writes it; nothing else of the file changes.
// - A file without them (already migrated, or rewritten by the project) is not written; a project
//   without the file neither.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const version = '0.24.12';
export const nom = 'tri des découvertes';

const FICHIER = path.join('docs', 'agents', 'issue-tracker.md');
// Each former sentence, and the sentence of the tri that replaces it.
const REMPLACEMENTS = [
  [
    "; it reopens on the owner's word. A discovery that blocks stops the agent, and its handoff names it. The supervisor brings to the owner the discoveries that touch a real use.",
    ". Once the ticket's lot is on main, the tri of the discoveries (step 5.3, the `explorateur`) gives each one its verdict at its ticket, with its piece, as a label: `traitee`, `doublon` or `sans-suite` leave it closed; `a-porter` (a defect of the actual use) or `non-confirmee` (no proof played again, what lacks written) reopen it under `a-valider`, for the owner. A discovery that blocks stops the agent, and its handoff names it.",
  ],
  [
    "`decouverte` (a discovery recorded closed; it reopens on the owner's word),",
    '`decouverte` (a discovery recorded closed; the tri reopens it under `a-valider` when its verdict is `a-porter` or `non-confirmee`), `traitee`, `doublon`, `sans-suite`, `a-porter`, `non-confirmee` (the verdict of the tri of a discovery),',
  ],
];

/** Brings the rule of the tri to the project's issue-tracker.md; returns what it did. */
export function migrer(projet) {
  const fichier = path.join(projet, FICHIER);
  if (!existsSync(fichier)) return [];
  const texte = readFileSync(fichier, 'utf8');
  const neuf = REMPLACEMENTS.reduce((t, [ancien, nouveau]) => t.replace(ancien, nouveau), texte);
  if (neuf === texte) return [];
  writeFileSync(fichier, neuf);
  return [
    `${FICHIER} : une découverte reçoit son verdict au tri des découvertes, en fin de ticket, au lieu de se rouvrir sur le mot du responsable`,
  ];
}
