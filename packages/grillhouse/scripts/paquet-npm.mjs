// The package.json of a package of a language other than TypeScript (a crate, a project of Python):
// the entry by which it enters the graph of Turborepo, which reads a `package.json` beside each
// project that is no JavaScript (node_modules/turbo/docs/guides/multi-language.mdx:191), as Turborepo's
// own example of Rust writes one beside the crate. `grillhouse paquet` writes it with the package
// (./paquet.mjs), and the migration of 0.31.0 for the packages of an existing project
// (./migrations/0.31.0-paquets-dans-le-graphe.mjs).
//
// - Its name is the manifest's: the `name` of the `[package]` of a Cargo.toml, of the `[project]`
//   of a pyproject.toml.
// - Its scripts call the commands of the package's module on its path, from the root of the
//   project, where the module plays: `build` the module's `construire`, `test:unit` its `tests`,
//   `typecheck` its `typer`.
// - The entry of its folder in the `workspaces` of the root package.json: none for a folder the
//   patterns already select; else its path, after the pattern `!` that takes it out when one does.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LANGAGES, langage, langagesDeclares } from './langages.mjs';
import { selectionne } from './paquets.mjs';
import { hors } from './sources.mjs';
import {
  colonneDesNoms,
  langageDeLaCellule,
  nomme,
  nomsDe,
  tableauxDesComposants,
} from './tableau-des-composants.mjs';

/**
 * The languages of the frame whose package has no package.json of its own, the ones whose manifest
 * is another file: the package.json is written beside that manifest.
 */
export const sansPackageJson = () =>
  Object.keys(LANGAGES).filter(n => langage(n).manifeste !== 'package.json');

/**
 * The name the manifest <texte> of the language <langageNom> gives its package; null for none
 * (the module of the language reads it).
 * @param {string} langageNom
 * @param {string} texte
 */
export const nomDuManifeste = (langageNom, texte) => langage(langageNom).nomDuManifeste(texte);

// The folders under <dossier> that hold <manifeste>, as `{ dossier, nom, paquet }` (the component
// shape of the tables), <dossier> itself left out; hidden folders and the ones the sources of the
// project leave out are not walked.
function avecManifeste(dossier, manifeste, langageNom, exclus) {
  const out = [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.') || exclus.has(e.name)) continue;
    const d = path.join(dossier, e.name);
    const f = path.join(d, manifeste);
    const paquet = existsSync(f) ? nomDuManifeste(langageNom, readFileSync(f, 'utf8')) : null;
    if (paquet !== null) out.push({ dossier: d, nom: e.name, paquet });
    out.push(...avecManifeste(d, manifeste, langageNom, exclus));
  }
  return out;
}

/**
 * The packages of a language without package.json of its own (`sansPackageJson`) the tables of the
 * components of docs/ARCHITECTURE.md declare in the project at <racine>: `{ langage, chemin, nom }`,
 * `chemin` from the root, `nom` the manifest's name, sorted by language then path. A package is a
 * folder under the root that holds the manifest of its language with a package name (a
 * `Cargo.toml` of a virtual workspace names none) and that a row of the language names, by its
 * path, its folder's name or its manifest's name, as the guard of the languages reads a component.
 * @param {string} racine
 */
export function paquetsSansPackageJson(racine) {
  const sortie = [];
  const declares = langagesDeclares(racine);
  for (const langageNom of sansPackageJson().filter(n => declares.includes(n))) {
    const candidats = avecManifeste(
      racine,
      langage(langageNom).manifeste,
      langageNom,
      hors(racine)
    );
    const trouves = new Set();
    for (const t of tableauxDesComposants(racine)) {
      const colonne = colonneDesNoms(t.lignes, candidats, racine, t.colonne);
      if (colonne < 0) continue;
      for (const l of t.lignes) {
        if (langageDeLaCellule(l.cellules[t.colonne]) !== langageNom) continue;
        for (const c of candidats) {
          if (nomme(nomsDe(l.cellules[colonne]), c, racine)) trouves.add(c);
        }
      }
    }
    sortie.push(
      ...[...trouves]
        .map(c => ({
          langage: langageNom,
          chemin: path.relative(racine, c.dossier).split(path.sep).join('/'),
          nom: c.paquet,
        }))
        .sort((a, b) => (a.chemin < b.chemin ? -1 : 1))
    );
  }
  return sortie;
}

/**
 * The text of the package.json of the package <nom> in <chemin> (from the root of the project).
 * @param {string} nom
 * @param {string} chemin
 */
export function packageJsonDuPaquet(nom, chemin) {
  const racine = chemin
    .split('/')
    .map(() => '..')
    .join('/');
  const appel = commande => `cd ${racine} && grillhouse ${commande} ${chemin}`;
  const p = {
    name: nom,
    private: true,
    scripts: {
      build: appel('construire'),
      'test:unit': appel('tests'),
      typecheck: appel('typer'),
    },
  };
  return `${JSON.stringify(p, null, 2)}\n`;
}

/**
 * The text of the root package.json <texte> with <chemin> entered in its `workspaces`; null when
 * its patterns select the folder already.
 * @param {string} texte
 * @param {string} chemin
 */
export function inscrireAuxEspaces(texte, chemin) {
  const p = JSON.parse(texte);
  if (selectionne(p, chemin)) {
    return null;
  }
  const indent = /^([ \t]+)"/m.exec(texte)?.[1] ?? 2;
  const fin = texte.endsWith('\n') ? '\n' : '';
  if (Array.isArray(p.workspaces)) {
    p.workspaces = [...p.workspaces, chemin];
  } else if (Array.isArray(p.workspaces?.packages)) {
    p.workspaces = { ...p.workspaces, packages: [...p.workspaces.packages, chemin] };
  } else {
    p.workspaces = [chemin];
  }
  return `${JSON.stringify(p, null, indent)}${fin}`;
}
