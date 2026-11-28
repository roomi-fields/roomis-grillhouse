// A project holds no follow-up of its supervisor: the note of resumption replaces
// `pitmaster/SUIVI.md` (greffon.md, §5.2). The file the template placed is removed; one the project
// filled stays, left to the project. Mechanism: installation.md §5.4
// (packages/grillhouse/docs/architecture/).
import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync } from 'node:fs';
import path from 'node:path';

export const version = null;
export const nom = 'suivi du superviseur retire';

const FICHIER = 'pitmaster/SUIVI.md';
// The file as the template of a project placed it, its one form.
const GABARIT = `# Suivi de la supervision

Tenu par la compétence \`pitmaster\`. Une question s'écrit ici dès qu'elle naît ; tranchée, elle en
sort et sa réponse va dans son ticket.

## Dernier tour

- Date : aucun tour encore
- Agents lancés : aucun
- À vérifier au prochain tour : rien

## R — à confirmer par le responsable

Chaque point : contexte, exemple, règle, recommandation, question, ticket.

## S — à surveiller

Chaque point : ce qui se surveille, ce qui le fermera.

## F — fermés

Chaque point : ce qui l'a fermé, le ticket.
`;

/** The `pitmaster/SUIVI.md` of <projet> retired; returns what it did, or leaves to the project. */
export function migrer(projet) {
  const fichier = path.join(projet, FICHIER);
  if (!existsSync(fichier)) {
    return [];
  }
  if (readFileSync(fichier, 'utf8') !== GABARIT) {
    return [
      {
        aFaire: `${FICHIER} : rempli par le projet, il n'a plus de lecteur ; reprends son contenu ouvert dans la note de reprise du superviseur (\`npx grillhouse superviseur --question <fichier>\`) ou dans des tickets, puis retire-le`,
      },
    ];
  }
  rmSync(fichier);
  const dossier = path.dirname(fichier);
  if (readdirSync(dossier).length === 0) {
    rmdirSync(dossier);
  }
  return [`${FICHIER} : retiré, identique au gabarit ; la note de reprise du superviseur le remplace`];
}
