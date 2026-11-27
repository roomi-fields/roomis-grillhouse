// The reading of the `grillhouse.matieres` key of a package.json, the folders of test material out
// of every package, as Bazel declares a `filegroup(testonly = True)` named in the `data` of a test
// and as the compiler of Rust keeps `tests/ui` at its root, out of every crate, its cases added
// with the code (Web Platform Tests keep their cases the same way): a list of folders of the
// repository, each from the root. The testwriter writes any file under one, as a file of shared
// test material; the developpeur does not (`estUnTest` of the join of the languages,
// scripts/langages.mjs, which the judgment of a lot, the envelope and the conflicts of a copy read).
//
// This module holds the reading itself, given the components of the project; it imports no
// language, so that the join of the languages can use it. The reading a caller asks by a
// directory alone is `matieresDeclareesDe` (./matieres-cles.mjs).
//
// - The key is read from the package.json of the main tree of the repository, never of a copy, as
//   `grillhouse.engendres` (scripts/engendres.mjs): a lot never declares the folder it then
//   writes; each folder is resolved from the root of the tree given, the copy. Read once per pass
//   (`luUneFois`).
// - A fault is refused by its key `grillhouse.matieres`, named: not a list of strings, an empty
//   path, an absolute one, one that leaves the root, a folder absent of the main tree, a folder
//   that is a package, holds one or lies inside one (the declaration gives the testwriter no
//   manifest, and no package is opened to him by it). The nature of the files of a folder is not
//   bounded, as the `data` of a `filegroup(testonly)` and `tests/ui`.
//
// What a test reads out of its imports: docs/architecture/tests.md §4.1 and §7.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { luUneFois } from './lecture-unique.mjs';
import { arbrePrincipal } from './outils-cles.mjs';

/**
 * The folders of test material that the project that holds <dir> declares, from the root, in the
 * order of the key; none without the key.
 * @param {string} dir a directory of the project: its main tree or a copy
 * @param {(dir: string) => { dossier: string }[]} composants the components of the project
 * @returns {string[]}
 * @throws {Error} the faults of the key, one per line
 */
export function matieresDeclarees(dir, composants) {
  return luUneFois(`matieres ${path.resolve(dir)}`, () => lire(dir, composants));
}

function lire(dir, composants) {
  const principal = arbrePrincipal(dir);
  const f = path.join(principal, 'package.json');
  const brut = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8'))?.grillhouse?.matieres : undefined;
  if (brut === undefined || brut === null) {
    return [];
  }
  if (!Array.isArray(brut) || !brut.every(m => typeof m === 'string')) {
    throw new Error(
      `la clé grillhouse.matieres vaut ${JSON.stringify(brut)}, pas une liste de chemins de dossiers depuis la racine.`
    );
  }
  if (brut.length === 0) {
    return [];
  }
  const paquets = composants(dir)
    .map(c => path.relative(dir, c.dossier).split(path.sep).join('/'))
    .filter(p => p !== '' && p !== '.');
  const fautes = [];
  const dossiers = [];
  for (const m of brut) {
    const n = path.posix.normalize(m === '' ? '.' : m).replace(/\/+$/, '');
    const nom = `la clé grillhouse.matieres nomme « ${m} »`;
    if (n === '.' || n === '') {
      fautes.push(
        'la clé grillhouse.matieres nomme un chemin vide ou la racine : un dossier est sous la racine.'
      );
    } else if (path.isAbsolute(m)) {
      fautes.push(`${nom}, un chemin absolu : un dossier part de la racine du dépôt.`);
    } else if (n.split('/')[0] === '..') {
      fautes.push(`${nom}, hors du dépôt : un dossier part de la racine.`);
    } else if (
      !existsSync(path.join(principal, n)) ||
      !statSync(path.join(principal, n)).isDirectory()
    ) {
      fautes.push(`${nom}, qui n'est pas un dossier de l'arbre principal.`);
    } else {
      const paquet = paquets.find(p => n === p || n.startsWith(`${p}/`) || p.startsWith(`${n}/`));
      if (paquet) {
        fautes.push(
          `${nom}, qui recouvre le paquet ${paquet} : un dossier de matière est hors de tout paquet.`
        );
      } else {
        dossiers.push(n);
      }
    }
  }
  if (fautes.length) {
    throw new Error(fautes.join('\n'));
  }
  return dossiers;
}

/**
 * Whether <fichier> (absolute, or from <racine>) lies under one of the folders <dossiers>.
 * @param {string[]} dossiers
 * @param {string} racine
 * @param {string} fichier
 */
export function sousUneMatiere(dossiers, racine, fichier) {
  if (dossiers.length === 0) {
    return false;
  }
  const rel = path.relative(racine, path.resolve(racine, fichier)).split(path.sep).join('/');
  return dossiers.some(d => rel.startsWith(`${d}/`));
}
