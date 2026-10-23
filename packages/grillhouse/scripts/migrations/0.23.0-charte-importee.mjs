// The common charter arrives whole, imported by the project's CLAUDE.md from the package installed
// (`@node_modules/@roomi-fields/grillhouse/charte.md`), as Claude Code loads a CLAUDE.md and its
// imports whole; no hook writes it any more, since Claude Code caps a hook's output.
//
// - A CLAUDE.md that imports a charter of the frame (`@…grillhouse/charte.md`) other than the
//   former copy is left: it already has one (Grillhouse imports its source,
//   `@mods/grillhouse/charte.md`).
// - The import of the former copy (`@.claude/grillhouse/charte.md`) becomes the import of the
//   package installed.
// - The paragraph of the template that gave the charter by the plugin (« Les règles du cadre : la
//   charte commune, que le greffon du cadre … donne à chaque séance. ») becomes
//   « Les règles du cadre : @node_modules/@roomi-fields/grillhouse/charte.md ».
// - A CLAUDE.md that names neither receives that line at its end, after a blank line.
// - A project without CLAUDE.md is not written.
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
  if (!existsSync(fichier)) return [];
  const texte = readFileSync(fichier, 'utf8');
  const imports = [...texte.matchAll(IMPORT_D_UNE_CHARTE)].map(m => `@${m[1]}`);
  if (imports.some(i => i !== ANCIENNE_COPIE)) return [];
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
