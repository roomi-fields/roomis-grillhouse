// From 0.48.0 the key `grillhouse.poussee` (the commit branch and the night branch) is retired from
// the frame: main receives every lot, and the night pushes nothing. A package.json of the project
// that carries the key, with any value, loses it, its other keys, its layout and its end of line
// kept; a project without the key, without `grillhouse` or without package.json is left, and a
// second pass changes nothing and says nothing. The remote branches of the project are not touched.
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
