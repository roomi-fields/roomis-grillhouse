// The project's CLAUDE.md imports the common charter from the package installed
// (`@node_modules/@roomi-fields/grillhouse/charte.md`). Mechanism: installation.md §5.4
// (packages/grillhouse/docs/architecture/).
//
// - A CLAUDE.md that imports another charter of the frame (`@…grillhouse/charte.md`) is left.
// - The import of the former copy (`@.claude/grillhouse/charte.md`) becomes the package's, as the
//   template's paragraph « Les règles du cadre : la charte commune, que le greffon… ».
// - A CLAUDE.md that names neither receives that line at its end; none, nothing written.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const version = '0.23.0';
export const nom = 'charte importée';

const IMPORT = '@node_modules/@roomi-fields/grillhouse/charte.md';
const LIGNE = `Les règles du cadre : ${IMPORT}`;
const ANCIENNE_COPIE = '@.claude/grillhouse/charte.md';
// An import of a charter of the frame: `@<chemin>grillhouse/charte.md`, at a word's start.
const IMPORT_D_UNE_CHARTE = /(?:^|\s)@(\S*grillhouse\/charte\.md)/g;
// The paragraph of 0.23.0's template that gave the charter by the plugin, up to its blank line.
const PARAGRAPHE_DU_GREFFON =
  /^Les règles du cadre : la charte commune, que le greffon[^]*?donne à chaque séance\.$/m;

/** Brings the import of the common charter to the project's CLAUDE.md; returns what it did. */
export function migrer(projet) {
  const fichier = path.join(projet, 'CLAUDE.md');
  if (!existsSync(fichier)) {
    return [];
  }
  const texte = readFileSync(fichier, 'utf8');
  const imports = [...texte.matchAll(IMPORT_D_UNE_CHARTE)].map(m => `@${m[1]}`);
  if (imports.some(i => i !== ANCIENNE_COPIE)) {
    return [];
  }
  let neuf;
  if (imports.length > 0) {
    neuf = texte.replaceAll(ANCIENNE_COPIE, IMPORT);
  } else if (PARAGRAPHE_DU_GREFFON.test(texte)) {
    neuf = texte.replace(PARAGRAPHE_DU_GREFFON, LIGNE);
  } else {
    neuf = `${texte.replace(/\n*$/, '\n')}\n${LIGNE}\n`;
  }
  writeFileSync(fichier, neuf);
  return [`CLAUDE.md : la charte commune importée du paquet installé (${IMPORT})`];
}
