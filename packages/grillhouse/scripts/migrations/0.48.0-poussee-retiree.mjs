// The key `grillhouse.poussee` has no reader: a package.json carrying it, with any value, loses
// it, its other keys, its layout and its end of line kept; the remote branches are not touched.
// Mechanism: installation.md §5.4 (packages/grillhouse/docs/architecture/).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const version = '0.48.0';
export const nom = 'poussee retiree';

/** `grillhouse.poussee` taken out of the package.json of <projet>; returns what it did. */
export function migrer(projet) {
  const fichier = path.join(projet, 'package.json');
  if (!existsSync(fichier)) {
    return [];
  }
  const texte = readFileSync(fichier, 'utf8');
  const pkg = JSON.parse(texte);
  const grillhouse = pkg?.grillhouse;
  if (!grillhouse || typeof grillhouse !== 'object' || !Object.hasOwn(grillhouse, 'poussee')) {
    return [];
  }
  delete grillhouse.poussee;
  const indent = /^\n?(\s+)"/m.exec(texte)?.[1] ?? 2;
  const fin = texte.endsWith('\n') ? '\n' : '';
  writeFileSync(fichier, `${JSON.stringify(pkg, null, indent)}${fin}`);
  return [
    "package.json : la clé grillhouse.poussee est retirée, main reçoit seule chaque lot et la nuit ne pousse plus ; les branches distantes du projet (l'ancienne branche de commit, la branche de nuit) ne sont pas touchées",
  ];
}
