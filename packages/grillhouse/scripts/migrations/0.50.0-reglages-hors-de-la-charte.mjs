// The charter of a project describes no setting: the list of the keys `grillhouse.*` and of the
// files of the machine, and what each one sets, lives in the document of the installation
// (docs/architecture/installation.md, §4.2 and §4.3), which follows the installed version. The
// update never rewrites a project's `CLAUDE.md`.
//
// - `migrer` writes nothing and returns no line: the form of the project does not change.
// - `restes(projet)`: when `CLAUDE.md` names a key of the list (`grillhouse.<clé>`), a variable
//   of a file of the machine (`GRILLHOUSE_*`, `TURBO_*`), the script `ci:preparer`, or a
//   section « La CI de main » or « La machine vierge » in its section « Commandes », one line,
//   which names each match by its line; none when the charter names none. A second pass on a
//   charter cleaned says nothing.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const version = '0.50.0';
export const nom = 'reglages hors de la charte';

// The keys of the settings of the project (installation.md, §4.2).
const CLES = [
  'version',
  'outil',
  'circuits',
  'groupe',
  'mesure',
  'outils',
  'partage',
  'references',
  'engendres',
  'flux',
  'matieres',
  'nuit',
  'demarrage',
  'rappel',
  'plageDeNuit',
  'sigle',
  'lit',
  'traces',
  'donnees',
  'part',
  'poussee',
  'langages',
];
const MOTIFS = [
  new RegExp(`grillhouse\\.(?:${CLES.join('|')})\\b`, 'g'),
  /\b(?:GRILLHOUSE|TURBO)_[A-Z0-9_]+/g,
  /\bci:preparer\b/g,
  /^#{1,6}\s*(?:La CI de main|La machine vierge)\b/gm,
];

/** Changes nothing: the charter is the project's (`restes`). */
export function migrer() {
  return [];
}

/** One line naming each setting the charter of <projet> describes, by its line; none if it names none. */
export function restes(projet) {
  const fichier = path.join(projet, 'CLAUDE.md');
  if (!existsSync(fichier)) {
    return [];
  }
  const noms = [];
  readFileSync(fichier, 'utf8')
    .split('\n')
    .forEach((ligne, i) => {
      for (const motif of MOTIFS) {
        for (const m of ligne.matchAll(motif)) {
          const nomTrouve = m[0].replace(/^#+\s*/, '');
          const marque = `${nomTrouve} l.${i + 1}`;
          if (!noms.includes(marque)) {
            noms.push(marque);
          }
        }
      }
    });
  if (noms.length === 0) {
    return [];
  }
  return [
    `CLAUDE.md, rubrique « Commandes » : la charte décrit des réglages du cadre (${noms.join(', ')}). La charte d'un projet n'en décrit aucun : leur liste et ce que chacun règle sont au document de l'installation (node_modules/@roomi-fields/grillhouse/docs/architecture/installation.md, §4.2 et §4.3), qui suit la version installée. Retire ces descriptions, et mets à leur place la ligne de renvoi du gabarit (node_modules/@roomi-fields/grillhouse/cadre/templates/projet/CLAUDE.md, rubrique « Commandes ») ; la montée ne réécrit jamais ta charte.`,
  ];
}
