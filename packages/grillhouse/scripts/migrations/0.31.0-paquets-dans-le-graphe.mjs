// Every cargo or python package enters the graph of Turborepo by a `package.json` beside its
// manifest. Mechanism: installation.md §5.4 (packages/grillhouse/docs/architecture/).
//
// - The packages are those the column « Langage » of docs/ARCHITECTURE.md declares `cargo` or
//   `python`, whose folder holds the manifest with a package name, the root excluded.
// - The package.json is the one `grillhouse paquet` writes (./paquet-npm.mjs); one present is kept
//   when its name is the manifest's, else left (`aFaire`), as a name another workspace bears.
// - The folder enters the root `workspaces` when no pattern selects it, after the `!` pattern.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inscrireAuxEspaces, packageJsonDuPaquet, paquetsSansPackageJson } from '../paquet-npm.mjs';
import { paquets } from '../paquets.mjs';

export const version = '0.31.0';
export const nom = 'paquets dans le graphe';

export function migrer(projet) {
  const racinePj = path.join(projet, 'package.json');
  if (!existsSync(racinePj)) {
    return [];
  }
  const lignes = [];
  const inscrire = [];
  for (const { chemin, nom: nomNpm } of paquetsSansPackageJson(projet)) {
    const f = `${chemin}/package.json`;
    const abs = path.join(projet, f);
    if (existsSync(abs)) {
      let present;
      try {
        present = JSON.parse(readFileSync(abs, 'utf8')).name;
      } catch (e) {
        lignes.push({
          aFaire: `${f} : ${e.message} ; le nom du paquet est ${JSON.stringify(nomNpm)}.`,
        });
        continue;
      }
      if (present !== nomNpm) {
        lignes.push({
          aFaire: `${f} : son nom est ${JSON.stringify(present)}, celui de son manifeste ${JSON.stringify(nomNpm)} ; accorde-les, le paquet entre alors aux workspaces.`,
        });
        continue;
      }
    } else {
      const autre = paquets(projet).find(p => p.pkg.name === nomNpm && p.dossier !== chemin);
      if (autre) {
        lignes.push({
          aFaire: `${f} : le nom ${JSON.stringify(nomNpm)} est déjà celui de ${autre.dossier}/package.json ; un nom ne désigne qu'un paquet, renomme l'un des deux.`,
        });
        continue;
      }
      writeFileSync(abs, packageJsonDuPaquet(nomNpm, chemin));
      lignes.push(`${f} : écrit, le paquet entre dans le graphe de Turborepo`);
    }
    inscrire.push(chemin);
  }
  let texte = readFileSync(racinePj, 'utf8');
  const inscrits = [];
  for (const chemin of inscrire) {
    const neuf = inscrireAuxEspaces(texte, chemin);
    if (neuf !== null) {
      texte = neuf;
      inscrits.push(chemin);
    }
  }
  if (inscrits.length) {
    writeFileSync(racinePj, texte);
    lignes.push(`package.json : workspaces, ${inscrits.join(', ')} ajouté(s)`);
  }
  return lignes;
}
