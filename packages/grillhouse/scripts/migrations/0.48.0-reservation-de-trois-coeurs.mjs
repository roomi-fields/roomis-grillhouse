// From 0.48.0 a circuit reserves 3 cores (it reserved 4). A package.json of the project whose
// `grillhouse.part.coeurs` is 4 gets 3, its other keys, its layout and its end of line kept; a
// project without that value, without `grillhouse` or without package.json is left, and a second
// pass changes nothing and says nothing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const version = '0.48.0';
export const nom = 'reservation de trois coeurs';

/** `grillhouse.part.coeurs` 4 turned into 3 in the package.json of <projet>; returns what it did. */
export function migrer(projet) {
  const fichier = path.join(projet, 'package.json');
  if (!existsSync(fichier)) {
    return [];
  }
  const texte = readFileSync(fichier, 'utf8');
  const pkg = JSON.parse(texte);
  const part = pkg?.grillhouse?.part;
  if (!part || typeof part !== 'object' || part.coeurs !== 4) {
    return [];
  }
  part.coeurs = 3;
  const indent = /^\n?(\s+)"/m.exec(texte)?.[1] ?? 2;
  const fin = texte.endsWith('\n') ? '\n' : '';
  writeFileSync(fichier, `${JSON.stringify(pkg, null, indent)}${fin}`);
  return [
    'package.json : grillhouse.part.coeurs passe de 4 à 3, la réservation de cœurs d’un circuit ordinaire',
  ];
}
