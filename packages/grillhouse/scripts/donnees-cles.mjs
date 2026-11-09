#!/usr/bin/env node
// The reading of the `grillhouse.donnees` key of a package.json, the data of a package, as Bazel's
// `data` declare the output of another target that a test runs (`data = ["//crates/service:bin"]`):
// `{ "<VARIABLE>": "<paquet>#<sortie>" }`. The consumer lists the provider in its `devDependencies`,
// so that Turborepo builds the provider before the consumer's tests (`^build`,
// scripts/langages/typescript/turbo-des-paquets.mjs), even when the provider is out of the plan; the
// variable carries the absolute path of the built output, which `npm test`, `npm run verifier`
// (bin/grillhouse.mjs), the circuit (scripts/circuit.mjs), the envelope, the integration and the
// night pass to the tests as they pass `grillhouse.outils` (scripts/outils-cles.mjs).
//
// - The key is absent, null or an object; each name is a variable's (`[A-Za-z_][A-Za-z0-9_]*`),
//   each value of the form `<paquet>#<sortie>`: a package of the repository by its package.json
//   name, in the `devDependencies` of the consumer, and an output its language knows. Every fault is
//   named with its key (`grillhouse.donnees.<VARIABLE>`), one per line; a faulty key gives no
//   variable, before any work.
// - The output is asked of the language of the provider (`sortieDuPaquet`, scripts/jointure.d.ts):
//   for a crate, a binary (target of kind `bin`) of `cargo metadata`, in its target directory, under
//   `release` when the `build` script of the provider's package.json carries `--release`, `debug`
//   otherwise; another language is refused, « sortie non prise en charge pour <langage> ».
// - The consumers are the root and the packages of the main tree of the repository (`arbrePrincipal`,
//   scripts/outils-cles.mjs); the paths are resolved from the directory given, the copy.
// - `controlerLesDonnees` runs after the build: an output absent at its path is refused, the
//   variable and the path named.
// - `node donnees-cles.mjs <dir>` writes one line `export VARIABLE='chemin'` per datum of the
//   project that holds <dir> (`exportsDesDonnees`), which the night evaluates, exit 0; a faulty key
//   writes its faults on stderr, exit 1.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LANGAGES, langage } from './langages.mjs';
import { arbrePrincipal } from './outils-cles.mjs';
import { paquets } from './paquets.mjs';
import { paquetsSansPackageJson } from './paquet-npm.mjs';

const NOM = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FORME = /^([^#\s]+)#([^#\s]+)$/;
const RELEASE = /(^|\s)--release(\s|$)/;

// The language of the package at <chemin> (from <racine>): the one whose manifest is not the
// package.json when the tables declare it so, else the language of the package.json.
function langageDuPaquet(racine, chemin) {
  const hors = paquetsSansPackageJson(racine).find(p => p.chemin === chemin);
  if (hors) {
    return hors.langage;
  }
  return Object.keys(LANGAGES).find(n => langage(n).manifeste === 'package.json') ?? 'typescript';
}

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// The data the project of <dir> declares: { donnees, parPaquet, fautes }, `parPaquet` the variables
// of each consumer by its folder from the root.
function lire(dir) {
  const racine = arbrePrincipal(dir);
  const fautes = [];
  /** @type {Record<string, string>} */
  const donnees = {};
  /** @type {Map<string, string[]>} */
  const parPaquet = new Map();
  /** @type {Map<string, string[]>} */
  const fournisseurs = new Map();
  const racinePkg = lireJson(path.join(racine, 'package.json'));
  if (racinePkg === null) {
    return { donnees, parPaquet, fournisseurs, fautes };
  }
  const liste = paquets(racine);
  const consommateurs = [{ dossier: '.', pkg: racinePkg }, ...liste];
  for (const { dossier, pkg } of consommateurs) {
    const d = pkg?.grillhouse?.donnees;
    if (d === undefined || d === null) {
      continue;
    }
    const ou = dossier === '.' ? 'package.json' : `${dossier}/package.json`;
    if (typeof d !== 'object' || Array.isArray(d)) {
      fautes.push(
        `${ou} : la clé grillhouse.donnees vaut ${JSON.stringify(d)}, pas un objet { VARIABLE: "<paquet>#<sortie>" }.`
      );
      continue;
    }
    for (const [nom, v] of Object.entries(d)) {
      const cle = `grillhouse.donnees.${nom}`;
      const faute = f => fautes.push(`${ou} : la clé ${cle} ${f}`);
      if (!NOM.test(nom)) {
        fautes.push(`${ou} : la clé grillhouse.donnees nomme « ${nom} », pas un nom de variable.`);
        continue;
      }
      const forme = typeof v === 'string' ? FORME.exec(v) : null;
      if (!forme) {
        faute(`vaut ${JSON.stringify(v)}, pas de la forme <paquet>#<sortie>.`);
        continue;
      }
      const [, nomDuPaquet, sortie] = forme;
      const fournisseur = liste.find(p => p.pkg?.name === nomDuPaquet);
      if (!fournisseur) {
        faute(`nomme le paquet « ${nomDuPaquet} », qu'aucun paquet du dépôt ne porte.`);
        continue;
      }
      if (!Object.hasOwn(pkg.devDependencies ?? {}, nomDuPaquet)) {
        faute(
          `nomme le paquet « ${nomDuPaquet} », absent des devDependencies de ${ou} : la construction du fournisseur avant les tests passe par cette dépendance.`
        );
        continue;
      }
      const langageNom = langageDuPaquet(racine, fournisseur.dossier);
      const release = RELEASE.test(String(fournisseur.pkg.scripts?.build ?? ''));
      let chemin;
      try {
        chemin = langage(langageNom).sortieDuPaquet(dir, fournisseur.dossier, sortie, { release });
      } catch (e) {
        faute(`nomme ${v} : ${e.message.replace(/^⛔ /, '')}`);
        continue;
      }
      if (Object.hasOwn(donnees, nom) && donnees[nom] !== chemin) {
        faute(`est déclarée deux fois, pour deux sorties différentes.`);
        continue;
      }
      donnees[nom] = chemin;
      parPaquet.set(dossier, [...(parPaquet.get(dossier) ?? []), nom]);
      fournisseurs.set(dossier, [...(fournisseurs.get(dossier) ?? []), nomDuPaquet]);
    }
  }
  return { donnees: fautes.length ? {} : donnees, parPaquet, fournisseurs, fautes };
}

/**
 * The data of the project that holds <dir>: each variable and the absolute path of the output it
 * names, none without `grillhouse.donnees`. Nothing exists yet: the paths are those the build will
 * write.
 * @param {string} dir a directory of the project: its main tree or a copy
 * @returns {Record<string, string>}
 * @throws {Error} the faults of the key, one per line
 */
export function donneesDe(dir) {
  const { donnees, fautes } = lire(dir);
  if (fautes.length) {
    throw new Error(fautes.join('\n'));
  }
  return donnees;
}

/**
 * The variables of the consumer at <chemin> (from the root) with their paths, to be checked once
 * the build is done.
 * @param {string} dir
 * @param {string} chemin
 * @returns {Record<string, string>}
 * @throws {Error} the faults of the key, one per line
 */
export function donneesDuPaquet(dir, chemin) {
  const { donnees, parPaquet, fautes } = lire(dir);
  if (fautes.length) {
    throw new Error(fautes.join('\n'));
  }
  return Object.fromEntries(
    [...parPaquet]
      .filter(([d]) => contient(d, chemin))
      .flatMap(([, ns]) => ns.map(n => [n, donnees[n]]))
  );
}

// Whether the consumer folder <dossier> is <chemin> or holds it (a file or a folder in the package).
const contient = (dossier, chemin) =>
  dossier === '.' ? chemin === '.' : chemin === dossier || chemin.startsWith(`${dossier}/`);

/**
 * The names of the providers of the consumer that holds <chemin> (the package folder, or a file or
 * folder in it), which a run of its tests builds first.
 * @param {string} dir
 * @param {string} chemin
 * @returns {string[]}
 * @throws {Error} the faults of the key, one per line
 */
export function fournisseursDuPaquet(dir, chemin) {
  const { fautes, fournisseurs } = lire(dir);
  if (fautes.length) {
    throw new Error(fautes.join('\n'));
  }
  return [
    ...new Set([...fournisseurs].filter(([d]) => contient(d, chemin)).flatMap(([, ns]) => ns)),
  ];
}

/**
 * Builds the providers <noms> by the module of the language whose manifest is the package.json.
 * @param {string[]} noms
 * @throws {Error} a build that fails
 */
export function construireLesFournisseurs(noms) {
  if (!noms.length) {
    return;
  }
  const nom = Object.keys(LANGAGES).find(n => langage(n).manifeste === 'package.json');
  const module = nom ? langage(nom) : null;
  if (!module?.construireLesPaquets) {
    throw new Error('aucun langage du projet ne construit les paquets par leur nom.');
  }
  module.construireLesPaquets(noms);
}

/**
 * Refuses an output absent after the build, its variable and its path named, one per line.
 * @param {Record<string, string>} donnees
 * @throws {Error}
 */
export function controlerLesDonnees(donnees) {
  const absents = Object.entries(donnees)
    .filter(([, c]) => !existsSync(c))
    .map(
      ([n, c]) => `la variable ${n} nomme ${c}, que la construction du fournisseur n'a pas produit.`
    );
  if (absents.length) {
    throw new Error(absents.join('\n'));
  }
}

/**
 * The environment <env> of a pass with the data <donnees> (`donneesDe`), the data winning.
 * @param {Record<string, string>} donnees
 * @param {Record<string, string | undefined>} env
 */
export function avecLesDonnees(donnees, env) {
  return { ...env, ...donnees };
}

// The shell's text that exports the data <donnees>, one `export VARIABLE='chemin'` per line.
export const exportsDesDonnees = donnees =>
  Object.entries(donnees)
    .map(([n, c]) => `export ${n}='${c.replaceAll("'", "'\\''")}'\n`)
    .join('');

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.stdout.write(exportsDesDonnees(donneesDe(path.resolve(process.argv[2] ?? '.'))));
  } catch (e) {
    process.stderr.write(`${/** @type {Error} */ (e).message}\n`);
    process.exitCode = 1;
  }
}
