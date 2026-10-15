#!/usr/bin/env node
// The `turbo.json` of each package of a repository of packages, generated from its package.json.
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
// The packages are the directories holding a `package.json` that the `workspaces` of the root
// `package.json` select (an array, or its `packages` key), mapped as npm maps them
// (@npmcli/map-workspaces), read with Node's glob: a pattern « ! » takes out what the other
// patterns select, unless a later pattern it matches puts it back; `node_modules` is never a
// package. `paquets` is the frame's one list of the packages of a repository: the update of the
// frame (scripts/grillhouse-maj.mjs) reads it too. A repository without `workspaces` has none:
// nothing is written, nothing is refused. The dependencies are written in the package.json only;
// this file is their only reader for the build's order.
//
// A package out of the frame (`docs/agents/hors-cadre.txt`, read by `horsCadre` of
// scripts/consommateurs.mjs) is out of the workspaces: the check refuses one the workspaces still
// select, and names the negation to write (`"!packages/<name>"`), by which npm and Turborepo
// ignore it.
import { existsSync, globSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { horsCadre } from './consommateurs.mjs';

export const TURBO = 'turbo.json';
export const COMMANDE = 'node scripts/turbo-des-paquets.mjs --ecrire';
// The fields of a package.json whose packages its code needs at run time.
const EXECUTION = ['dependencies', 'peerDependencies', 'optionalDependencies'];

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// The packages of the repository at <racine>: [{ dossier, pkg }], sorted by directory.
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
  return [...dossiers]
    .sort()
    .map(dossier => ({ dossier, pkg: lireJson(path.join(racine, dossier, 'package.json')) ?? {} }));
}

// The text of a package's turbo.json, whose build waits for <taches>.
const texte = taches =>
  `// Généré par \`${COMMANDE}\` depuis les dépendances d'exécution du package.json ; ne pas éditer.\n${JSON.stringify(
    {
      $schema: 'https://turborepo.com/schema.json',
      extends: ['//'],
      tasks: { build: { dependsOn: taches } },
    },
    null,
    2
  )}\n`;

// The turbo.json each package of <racine> must hold: Map<path relative to <racine>, text>.
export function attendus(racine) {
  const liste = paquets(racine);
  const construits = new Set(
    liste.filter(({ pkg }) => typeof pkg.scripts?.build === 'string').map(({ pkg }) => pkg.name)
  );
  const out = new Map();
  for (const { dossier, pkg } of liste) {
    const noms = new Set(EXECUTION.flatMap(c => Object.keys(pkg[c] ?? {})));
    const taches = [...noms]
      .filter(n => n !== pkg.name && construits.has(n))
      .sort()
      .map(n => `${n}#build`);
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

// The refusals of <racine>: one line per package turbo.json absent or other than generated, and
// one per package out of the frame that the workspaces select.
export function verifier(racine) {
  const refus = [];
  const hors = horsCadre(racine);
  for (const { dossier } of paquets(racine)) {
    const parent = path.dirname(dossier);
    if ((parent === 'packages' || parent === 'src') && hors.has(path.basename(dossier))) {
      refus.push(
        `⛔ ${dossier} est hors cadre (docs/agents/hors-cadre.txt), et les workspaces du package.json le sélectionnent encore : écris-y la négation "!${dossier}", par laquelle npm et Turborepo l'ignorent.`
      );
    }
  }
  for (const [f, t] of attendus(racine)) {
    const abs = path.join(racine, f);
    if (!existsSync(abs)) {
      refus.push(`⛔ ${f} manque : \`${COMMANDE}\` l'écrit depuis les package.json.`);
    } else if (readFileSync(abs, 'utf8') !== t) {
      refus.push(
        `⛔ ${f} diffère des dépendances des package.json : \`${COMMANDE}\` le réécrit (une dépendance s'écrit au package.json).`
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
