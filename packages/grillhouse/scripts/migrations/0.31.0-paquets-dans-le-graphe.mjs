// From 0.31.0 every package enters the graph of Turborepo by a `package.json` beside its manifest
// (grillhouse-44b.4, node_modules/turbo/docs/guides/multi-language.mdx:191): the crate and the
// project of Python of an existing project, which `grillhouse paquet` did not create, receive the
// same one.
//
// - The packages are those the column « Langage » of the tables of the components of
//   docs/ARCHITECTURE.md declares `cargo` or `python`, and whose folder holds the manifest of their
//   language with a package name (a `Cargo.toml` of a virtual workspace names none), the root
//   excluded; a folder is named by its path, its name or its manifest's name, as the guard of the
//   languages reads a component. A package of another language receives nothing.
// - The package.json of a package is the one the command writes (./paquet-npm.mjs): the manifest's
//   name, `private`, the scripts `build`, `test:unit` and `typecheck`. A package.json present is
//   kept as it is when its name is the manifest's; any other is left to the project (`aFaire`,
//   both names), as is a name another package of the workspaces bears, and nothing else is written
//   for that package.
// - The folder of each package is entered in the `workspaces` of the root package.json when its
//   patterns do not select it, after the pattern `!` that takes it out.
// - A project already migrated, or without crate nor project of Python, is not written: a second
//   pass changes nothing and returns no line.
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
