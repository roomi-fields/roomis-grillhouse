// A circuit reserves 3 cores: a package.json whose `grillhouse.part.coeurs` is 4 gets 3, its other
// keys, its layout and its end of line kept. Mechanism: installation.md §5.4
// (packages/grillhouse/docs/architecture/).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const version = '0.49.0';
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
