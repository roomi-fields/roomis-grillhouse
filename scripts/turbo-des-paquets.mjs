#!/usr/bin/env node
// The `turbo.json` of each package of a repository of packages, generated from its package.json,
// the root's turbo.json and the list of the packages out of the frame.
//
//   node scripts/turbo-des-paquets.mjs           refuses a package's turbo.json absent or stale
//   node scripts/turbo-des-paquets.mjs --ecrire  writes the turbo.json of each package
//
// Turborepo's `^build` waits for the build of every internal package a package declares, its
// devDependencies included; a package whose tests import a neighbour that depends on it (the
// shared test material, two stages testing each other) makes a cycle that `turbo run build`
// refuses. A build waits for its runtime dependencies only, as Bazel separates the deps of a
// library from those of its test. So each package receives a package configuration
// (https://turborepo.dev/docs/reference/package-configurations): `extends: ["//"]`, and a `build`
// whose `dependsOn`, which replaces the root's, holds the `<name>#build` of each internal package
// its `dependencies`, `peerDependencies` and `optionalDependencies` name that has a `build`
// script, sorted. The tests keep the root's `^build`: a test waits for everything it imports.
//
// A package out of the frame (`docs/agents/hors-cadre.txt`, read by `horsCadre` of
// scripts/consommateurs.mjs: a directory under `packages/` or `src/`) stays a workspace, which a
// neighbour may import by its name, and Turborepo plays none of its tasks: its configuration
// excludes each task of the root's turbo.json (or turbo.jsonc), `"extends": false`, by which the
// task does not exist for it. A `^` dependency still reaches an excluded task, so no `dependsOn`
// written here names a package out of the frame, and a package of the frame that declares one
// (in its `dependencies`, `devDependencies` or `optionalDependencies`, the fields `^` follows)
// has each root task whose `dependsOn` holds a `^<task>` written out: its other entries kept, then
// the `<name>#<task>` of each internal package it declares there, out of the frame left out,
// sorted. The check refuses a configuration that is not so, which Turborepo would play.
//
// The packages are the directories holding a `package.json` that the `workspaces` of the root
// `package.json` select (an array, or its `packages` key), mapped as npm maps them
// (@npmcli/map-workspaces), read with Node's glob: a pattern « ! » takes out what the other
// patterns select, unless a later pattern it matches puts it back; `node_modules` is never a
// package. `paquets` is the frame's one list of the packages of a repository, each marked out of
// the frame or not: the update of the frame (scripts/grillhouse-maj.mjs) reads it too. A
// repository without `workspaces` has none: nothing is written, nothing is refused. The
// dependencies are written in the package.json only; this file is their only reader for the
// tasks' order.
import { existsSync, globSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { horsCadre } from './consommateurs.mjs';

export const TURBO = 'turbo.json';
export const COMMANDE = 'node scripts/turbo-des-paquets.mjs --ecrire';
// The fields of a package.json whose packages its code needs at run time.
const EXECUTION = ['dependencies', 'peerDependencies', 'optionalDependencies'];
// The fields of a package.json whose packages Turborepo's `^` follows.
const TOPOLOGIE = ['dependencies', 'devDependencies', 'optionalDependencies'];
// The root configuration of Turborepo, in the order Turborepo reads it.
const RACINES = ['turbo.json', 'turbo.jsonc'];

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// <texte> as JSON, its JSONC comments and trailing commas taken out, as Turborepo reads its
// configuration; null when it is no JSON.
const lireJsonc = texte => {
  let out = '';
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (c === '"') {
      const fin = /"(?:[^"\\]|\\.)*"/y;
      fin.lastIndex = i;
      const m = fin.exec(texte);
      if (!m) return null;
      out += m[0];
      i += m[0].length - 1;
    } else if (c === '/' && texte[i + 1] === '/') {
      while (i < texte.length && texte[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && texte[i + 1] === '*') {
      const fin = texte.indexOf('*/', i + 2);
      if (fin < 0) return null;
      i = fin + 1;
    } else {
      out += c;
    }
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return null;
  }
};

// The tasks of the root configuration of Turborepo at <racine>: Map<name, dependsOn>, the tasks
// of the root package (`//#…`) and of one package (`<name>#…`) left out; empty without one.
function tachesRacine(racine) {
  const f = RACINES.map(n => path.join(racine, n)).find(existsSync);
  const conf = f ? lireJsonc(readFileSync(f, 'utf8')) : null;
  const taches = new Map();
  for (const [nom, t] of Object.entries(conf?.tasks ?? {})) {
    if (!nom.includes('#')) taches.set(nom, Array.isArray(t?.dependsOn) ? t.dependsOn : []);
  }
  return taches;
}

// The packages of the repository at <racine>: [{ dossier, pkg, hors }], sorted by directory;
// `hors` whether `docs/agents/hors-cadre.txt` lists it (a directory under `packages/` or `src/`).
export function paquets(racine) {
  const p = lireJson(path.join(racine, 'package.json'));
  const declares = Array.isArray(p?.workspaces) ? p.workspaces : (p?.workspaces?.packages ?? []);
  const motifs = [];
  let nies = [];
  for (const brut of declares.map(String)) {
    const excl = /^!+/.exec(brut)?.[0] ?? '';
    const motif = brut
      .slice(excl.length)
      .replace(/^\.?\/+/, '')
      .replace(/\/$/, '');
    if (excl.length % 2 === 1) {
      nies.push(motif);
    } else {
      // A pattern puts back what an earlier negation it matches took out.
      nies = nies.filter(n => !path.matchesGlob(motif, n));
      motifs.push(motif);
    }
  }
  const dossiers = new Set();
  for (const motif of motifs) {
    for (const f of globSync(`${motif}/package.json`, { cwd: racine })) {
      const dossier = path.dirname(f);
      if (f.split(path.sep).includes('node_modules')) continue;
      if (nies.some(n => path.matchesGlob(dossier, n))) continue;
      dossiers.add(dossier);
    }
  }
  const listes = dossiers.size ? horsCadre(racine) : new Set();
  return [...dossiers].sort().map(dossier => ({
    dossier,
    pkg: lireJson(path.join(racine, dossier, 'package.json')) ?? {},
    hors: ['packages', 'src'].includes(path.dirname(dossier)) && listes.has(path.basename(dossier)),
  }));
}

// The text of a package's turbo.json, whose tasks are <taches>.
const texte = taches =>
  `// Généré par \`${COMMANDE}\` depuis les package.json, le turbo.json racine et docs/agents/hors-cadre.txt ; ne pas éditer.\n${JSON.stringify(
    { $schema: 'https://turborepo.com/schema.json', extends: ['//'], tasks: taches },
    null,
    2
  )}\n`;

// The internal packages the <champs> of <pkg> name, among <noms>, itself left out, sorted.
const internes = (pkg, champs, noms) =>
  [...new Set(champs.flatMap(c => Object.keys(pkg[c] ?? {})))]
    .filter(n => n !== pkg.name && noms.has(n))
    .sort();

// The turbo.json each package of <racine> must hold: Map<path relative to <racine>, text>.
export function attendus(racine) {
  const liste = paquets(racine);
  const racineTaches = [...tachesRacine(racine)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const hors = new Set(liste.filter(p => p.hors).map(({ pkg }) => pkg.name));
  const duCadre = new Set(liste.filter(p => !p.hors).map(({ pkg }) => pkg.name));
  const construits = new Set(
    liste
      .filter(({ pkg, hors }) => !hors && typeof pkg.scripts?.build === 'string')
      .map(({ pkg }) => pkg.name)
  );
  const out = new Map();
  for (const { dossier, pkg, hors: exclu } of liste) {
    const taches = {};
    if (exclu) {
      for (const [nom] of racineTaches) taches[nom] = { extends: false };
    } else {
      taches.build = {
        dependsOn: internes(pkg, EXECUTION, construits).map(n => `${n}#build`),
      };
      if (TOPOLOGIE.some(c => Object.keys(pkg[c] ?? {}).some(n => hors.has(n)))) {
        const voisins = internes(pkg, TOPOLOGIE, duCadre);
        for (const [nom, dependances] of racineTaches) {
          if (nom === 'build' || !dependances.some(d => d.startsWith('^'))) continue;
          taches[nom] = {
            dependsOn: [
              ...dependances.filter(d => !d.startsWith('^')),
              ...dependances
                .filter(d => d.startsWith('^'))
                .flatMap(d => voisins.map(n => `${n}#${d.slice(1)}`))
                .sort(),
            ],
          };
        }
      }
    }
    out.set(path.join(dossier, TURBO), texte(taches));
  }
  return out;
}

// Writes the turbo.json of each package of <racine>; returns the paths written.
export function ecrire(racine) {
  const ecrits = [];
  for (const [f, t] of attendus(racine)) {
    const abs = path.join(racine, f);
    if (existsSync(abs) && readFileSync(abs, 'utf8') === t) continue;
    writeFileSync(abs, t);
    ecrits.push(f);
  }
  return ecrits;
}

// The refusals of <racine>: one line per package turbo.json absent or other than generated.
export function verifier(racine) {
  const refus = [];
  for (const [f, t] of attendus(racine)) {
    const abs = path.join(racine, f);
    if (!existsSync(abs)) {
      refus.push(
        `⛔ ${f} manque : \`${COMMANDE}\` l'écrit depuis les package.json, le turbo.json racine et docs/agents/hors-cadre.txt.`
      );
    } else if (readFileSync(abs, 'utf8') !== t) {
      refus.push(
        `⛔ ${f} diffère de ce que donnent les package.json, le turbo.json racine et docs/agents/hors-cadre.txt : \`${COMMANDE}\` le réécrit (une dépendance s'écrit au package.json, un paquet hors cadre à hors-cadre.txt).`
      );
    }
  }
  return refus;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = process.cwd();
  const args = process.argv.slice(2);
  if (args.some(a => a !== '--ecrire')) {
    process.stderr.write(
      'Usage : node scripts/turbo-des-paquets.mjs [--ecrire]   vérifie, ou écrit, le turbo.json de chaque paquet\n'
    );
    process.exit(2);
  }
  if (args.includes('--ecrire')) {
    ecrire(racine);
    process.exit(0);
  }
  const refus = verifier(racine);
  for (const l of refus) process.stderr.write(`${l}\n`);
  process.exitCode = refus.length ? 1 : 0;
}
