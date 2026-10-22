#!/usr/bin/env node
// A release of Grillhouse, the frame and its mod together: Grillhouse's own script, which no
// project receives (a « - » line of .claude/grillhouse/fichiers.txt).
//
//   npx grillhouse sortie <x.y.z>        the release's files: VERSION, plugin.json, CHANGELOG.md
//   npx grillhouse sortie --etiqueter    the annotated tag v<VERSION> on HEAD, the release commit
//
// - The version lives in `.claude/grillhouse/VERSION`, one line, which every project receives with
//   the frame's update; the mod's `mods/grillhouse/.claude-plugin/plugin.json` carries the same,
//   written by this script beside it (tests/unit/version.spec.ts refuses any gap). Semantic
//   versioning in 0.x: a change that obliges a project to act raises the minor, a fix the patch.
// - Preparing writes the version given, above the current one, in both files, and dates the
//   changelog: « ## [Unreleased] » becomes « ## [<x.y.z>] - <today> » and an empty
//   « ## [Unreleased] » opens above it. A release with nothing under « [Unreleased] » is refused.
//   Nothing is written when a check fails.
// - Tagging creates the annotated tag `v<VERSION>` on HEAD, once the release commit is made and
//   the working tree holds no change. Nothing is pushed: the owner validates the push, whose
//   command the script names; `.github/workflows/release.yml` then publishes the release on GitHub.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const VERSION = '.claude/grillhouse/VERSION';
const PLUGIN = 'mods/grillhouse/.claude-plugin/plugin.json';
const CHANGELOG = 'CHANGELOG.md';
const OUVERTE = '## [Unreleased]\n';
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

const lire = (racine, f) => readFileSync(path.join(racine, f), 'utf8');

// The version of the frame at <racine>, which plugin.json must carry too.
export function versionDuCadre(racine) {
  const v = lire(racine, VERSION).trim();
  const greffon = JSON.parse(lire(racine, PLUGIN)).version;
  if (greffon !== v) {
    throw new Error(`${VERSION} dit ${v}, ${PLUGIN} dit ${greffon} : les deux vont ensemble.`);
  }
  return v;
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
  const plugin = JSON.parse(lire(racine, PLUGIN));
  plugin.version = version;
  writeFileSync(path.join(racine, VERSION), `${version}\n`);
  writeFileSync(path.join(racine, PLUGIN), `${JSON.stringify(plugin, null, 2)}\n`);
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
  'Usage : npx grillhouse sortie <x.y.z>       prépare la sortie (VERSION, plugin.json, CHANGELOG.md)\n' +
  "        npx grillhouse sortie --etiqueter   pose l'étiquette v<VERSION> sur le commit de sortie\n";

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
        `Étiquette ${e} posée sur HEAD, en local. La poussée, que valide le responsable : git push origin ${e}\n`
      );
    } else if (args.length === 1 && !args[0].startsWith('-')) {
      preparerSortie(racine, args[0], aujourdhui());
      process.stdout.write(
        `Sortie ${args[0]} préparée : ${VERSION}, ${PLUGIN}, ${CHANGELOG}. ` +
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
