#!/usr/bin/env node
// A release of Grillhouse, the package and its mod together: Grillhouse's own script, which no
// project receives (`npm run new` leaves it out, scripts/new-project.sh).
//
//   npx grillhouse sortie <x.y.z>                    the release's files: the package's package.json, plugin.json, CHANGELOG.md
//   npx grillhouse sortie --etiqueter                the annotated tag v<version> on HEAD, the release commit
//   npx grillhouse sortie --verifier-etiquette <v>   exits 0 when the tag <v> names the version of the package and the mod
//
// - The version is the `version` of the package's `packages/grillhouse/package.json`, which npm
//   publishes; the mod's `mods/grillhouse/.claude-plugin/plugin.json` carries the same, written by
//   this script beside it (tests/unit/version.spec.ts refuses any gap), and the session start of a
//   project names a mod installed at another version than its package (scripts/greffons.mjs).
//   Semantic versioning in 0.x: a change that obliges a project to act raises the minor, a fix the
//   patch.
// - Preparing writes the version given, above the current one, in both files, their other fields
//   kept, and dates the changelog: « ## [Unreleased] » becomes « ## [<x.y.z>] - <today> » and an
//   empty « ## [Unreleased] » opens above it. A release with nothing under « [Unreleased] » is
//   refused. Nothing is written when a check fails.
// - Tagging creates the annotated tag `v<version>` on HEAD, once the release commit is made and
//   the working tree holds no change. Nothing is pushed: the owner validates the push, whose
//   command the script names; `.github/workflows/release.yml` then plays the CI on the tagged
//   commit and, once it is green, checks the tag (`--verifier-etiquette`), publishes the package
//   on the npm registry (the repository's secret NPM_TOKEN) and the release on GitHub.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PAQUET = 'packages/grillhouse/package.json';
const PLUGIN = 'mods/grillhouse/.claude-plugin/plugin.json';
const CHANGELOG = 'CHANGELOG.md';
const OUVERTE = '## [Unreleased]\n';
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

const lire = (racine, f) => readFileSync(path.join(racine, f), 'utf8');

// The version of Grillhouse at <racine>: its package's, which plugin.json must carry too.
export function versionDuCadre(racine) {
  const v = JSON.parse(lire(racine, PAQUET)).version;
  const greffon = JSON.parse(lire(racine, PLUGIN)).version;
  if (greffon !== v) {
    throw new Error(`${PAQUET} dit ${v}, ${PLUGIN} dit ${greffon} : les deux vont ensemble.`);
  }
  return v;
}

// Refuses a tag <etiquette> other than v<version> of the package and the mod at <racine>.
export function verifierEtiquette(racine, etiquette) {
  const v = versionDuCadre(racine);
  if (etiquette !== `v${v}`) {
    throw new Error(
      `L'étiquette ${etiquette} ne nomme pas la version du paquet et du greffon, ${v}.`
    );
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
  for (const f of [PAQUET, PLUGIN]) {
    const json = JSON.parse(lire(racine, f));
    json.version = version;
    writeFileSync(path.join(racine, f), `${JSON.stringify(json, null, 2)}\n`);
  }
  writeFileSync(
    path.join(racine, CHANGELOG),
    `${journal.slice(0, debut + 1)}${OUVERTE}\n## [${version}] - ${date}\n${corps}`
  );
}

// Creates the annotated tag of the release at <racine> on HEAD, and returns its name.
export function etiqueter(racine) {
  const git = (...args) => execFileSync('git', ['-C', racine, ...args], { encoding: 'utf8' });
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
  'Usage : npx grillhouse sortie <x.y.z>                    prépare la sortie (package.json du paquet, plugin.json, CHANGELOG.md)\n' +
  "        npx grillhouse sortie --etiqueter                pose l'étiquette v<version> sur le commit de sortie\n" +
  "        npx grillhouse sortie --verifier-etiquette <v>   vérifie que l'étiquette <v> nomme la version du paquet et du greffon\n";

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
    } else if (args.length === 2 && args[0] === '--verifier-etiquette') {
      verifierEtiquette(racine, args[1]);
    } else if (args.length === 1 && !args[0].startsWith('-')) {
      preparerSortie(racine, args[0], aujourdhui());
      process.stdout.write(
        `Sortie ${args[0]} préparée : ${PAQUET}, ${PLUGIN}, ${CHANGELOG}. ` +
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
