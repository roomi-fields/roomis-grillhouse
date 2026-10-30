#!/usr/bin/env node
// A release of Grillhouse, its package npm, which carries the frame's plugin: Grillhouse's own
// script, which no project runs (`grillhouse init` installs the template of a project alone).
//
//   npx grillhouse sortie <x.y.z>                    the release's files: the package's package.json, CHANGELOG.md
//   npx grillhouse sortie --etiqueter                the annotated tag v<version> on HEAD, the release commit
//   npx grillhouse sortie --verifier-etiquette <v>   exits 0 when the tag <v> names the version of the package
//   npx grillhouse sortie --entree-du-marche         the entry of the plugin in the marketplace roomi-fields
//
// - The version is the `version` of the package's `packages/grillhouse/package.json`, which npm
//   publishes; the plugin the package carries takes it when the package is packed
//   (scripts/cadre.mjs), so the frame has one version. Semantic versioning in 0.x: a change that
//   obliges a project to act raises the minor, a fix the patch.
// - Preparing writes the version given, above the current one, in the package's package.json, its
//   other fields kept, and dates the changelog: « ## [Unreleased] » becomes « ## [<x.y.z>] - <today> » and an
//   empty « ## [Unreleased] » opens above it. A release with nothing under « [Unreleased] » is
//   refused. Nothing is written when a check fails.
// - Tagging creates the annotated tag `v<version>` on HEAD, once the release commit is made and
//   the working tree holds no change. Nothing is pushed: the owner validates the push, whose
//   command the script names; `.github/workflows/release.yml` then plays the CI on the tagged
//   commit and, once it is green, checks the tag (`--verifier-etiquette`), publishes the package
//   on the npm registry (trusted publishing, no token stored) and the release on GitHub. The git
//   it runs is passed in (`etiqueter`'s `git`): the command runs git in the repository.
// - The marketplace roomi-fields (GitHub, roomi-fields/claude-plugins, a repository of its own)
//   lists the plugin by its source npm, ENTREE_DU_MARCHE: the package, without a subdirectory (a
//   source npm has none: the package's root is the plugin's) and without a version, so the machine
//   installs the version published last. `--entree-du-marche` prints it; the owner sets it in that
//   repository once the package is published, a public gesture this script does not make.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PAQUET = 'packages/grillhouse/package.json';

/** The entry of the frame's plugin in the marketplace roomi-fields. */
export const ENTREE_DU_MARCHE = {
  name: 'grillhouse',
  source: { source: 'npm', package: '@roomi-fields/grillhouse' },
};
const CHANGELOG = 'CHANGELOG.md';
const OUVERTE = '## [Unreleased]\n';
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

const lire = (racine, f) => readFileSync(path.join(racine, f), 'utf8');

// The version of Grillhouse at <racine>: its package's.
export function versionDuCadre(racine) {
  return JSON.parse(lire(racine, PAQUET)).version;
}

// Refuses a tag <etiquette> other than v<version> of the package at <racine>.
export function verifierEtiquette(racine, etiquette) {
  const v = versionDuCadre(racine);
  if (etiquette !== `v${v}`) {
    throw new Error(`L'étiquette ${etiquette} ne nomme pas la version du paquet, ${v}.`);
  }
}

const rang = v => SEMVER.exec(v)?.slice(1).map(Number) ?? null;
const audessus = (a, b) => {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) {
      return a[i] > b[i];
    }
  }
  return false;
};

// Writes the release <version> of Grillhouse at <racine>, dated <date> (YYYY-MM-DD).
export function preparerSortie(racine, version, date) {
  const actuelle = versionDuCadre(racine);
  const neuve = rang(version);
  if (!neuve) {
    throw new Error(`« ${version} » n'est pas une version x.y.z.`);
  }
  if (!audessus(neuve, rang(actuelle))) {
    throw new Error(`${version} n'est pas au-dessus de la version actuelle, ${actuelle}.`);
  }
  const journal = lire(racine, CHANGELOG);
  const debut = journal.indexOf(`\n${OUVERTE}`);
  if (debut < 0) {
    throw new Error(`${CHANGELOG} n'a pas de section « [Unreleased] ».`);
  }
  const corps = journal.slice(debut + 1 + OUVERTE.length);
  const fin = corps.search(/^## \[/m);
  if ((fin < 0 ? corps : corps.slice(0, fin)).trim() === '') {
    throw new Error(`La section « [Unreleased] » de ${CHANGELOG} est vide : rien à sortir.`);
  }
  const paquet = JSON.parse(lire(racine, PAQUET));
  paquet.version = version;
  writeFileSync(path.join(racine, PAQUET), `${JSON.stringify(paquet, null, 2)}\n`);
  writeFileSync(
    path.join(racine, CHANGELOG),
    `${journal.slice(0, debut + 1)}${OUVERTE}\n## [${version}] - ${date}\n${corps}`
  );
}

// Creates the annotated tag of the release at <racine> on HEAD, and returns its name; <git> runs
// git in <racine> (its arguments, its output as text).
export function etiqueter(
  racine,
  git = (...args) => execFileSync('git', ['-C', racine, ...args], { encoding: 'utf8' })
) {
  const etiquette = `v${versionDuCadre(racine)}`;
  if (git('status', '--porcelain').trim() !== '') {
    throw new Error(
      "L'arbre de travail porte des changements : le commit de sortie vient d'abord."
    );
  }
  if (git('tag', '--list', etiquette).trim() !== '') {
    throw new Error(`L'étiquette ${etiquette} existe déjà.`);
  }
  git('tag', '-a', etiquette, '-m', `Roomi's Grillhouse ${etiquette.slice(1)}`);
  return etiquette;
}

const USAGE =
  'Usage : npx grillhouse sortie <x.y.z>                    prépare la sortie (package.json du paquet, CHANGELOG.md)\n' +
  "        npx grillhouse sortie --etiqueter                pose l'étiquette v<version> sur le commit de sortie\n" +
  "        npx grillhouse sortie --verifier-etiquette <v>   vérifie que l'étiquette <v> nomme la version du paquet\n" +
  '        npx grillhouse sortie --entree-du-marche         écrit l’entrée du greffon dans la place de marché roomi-fields\n';

// Today, in the local calendar, as YYYY-MM-DD.
const aujourdhui = () => {
  const d = new Date();
  const n = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${n(d.getMonth() + 1)}-${n(d.getDate())}`;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const racine = process.cwd();
  try {
    if (args.length === 1 && args[0] === '--etiqueter') {
      const e = etiqueter(racine);
      process.stdout.write(
        `Étiquette ${e} posée sur HEAD, en local. La poussée, que valide le responsable : git push origin ${e} ` +
          '(la CI joue alors le commit, puis publie le paquet sur npm)\n'
      );
    } else if (args.length === 1 && args[0] === '--entree-du-marche') {
      process.stdout.write(`${JSON.stringify(ENTREE_DU_MARCHE, null, 2)}\n`);
    } else if (args.length === 2 && args[0] === '--verifier-etiquette') {
      verifierEtiquette(racine, args[1]);
    } else if (args.length === 1 && !args[0].startsWith('-')) {
      preparerSortie(racine, args[0], aujourdhui());
      process.stdout.write(
        `Sortie ${args[0]} préparée : ${PAQUET}, ${CHANGELOG}. ` +
          `Le commit de sortie, puis : npx grillhouse sortie --etiqueter\n`
      );
    } else {
      process.stderr.write(USAGE);
      process.exitCode = 2;
    }
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exitCode = 1;
  }
}
