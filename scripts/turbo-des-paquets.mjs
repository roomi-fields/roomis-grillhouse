#!/usr/bin/env node
// The `turbo.json` of each package of a repository of packages, generated from its package.json,
// the root's turbo.json and the list of the packages out of the frame; and the `dependsOn` of the
// guard tasks of the root's turbo.json.
//
//   node scripts/turbo-des-paquets.mjs           refuses a turbo.json absent or stale
//   node scripts/turbo-des-paquets.mjs --ecrire  writes the turbo.json of each package and the
//                                                guards' dependsOn in the root's
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
// The guard tasks of the root: the frame's controls (`grillhouse:gardes`) and the project's own
// guards (`gardes`, the root script the frame reserves for them; a root without it plays none),
// which `npm run verifier` plays beside the tests. They read what the builds write (the API
// reports and the code-mort check read the `dist/`; a project's guards may read its built form):
// each waits for the build of each package of the frame that has a `build` script, sorted, a
// package out of the frame left out (`//#grillhouse:gardes`, `//#gardes` in a repository of
// packages), or for the root's build (`grillhouse:gardes`, `gardes`) in a repository without
// packages. The generator writes their `dependsOn` in the root's turbo.json (or turbo.jsonc), and
// adds a guard task the root lacks (`{ dependsOn, outputs: [] }`); the rest of that file is the
// project's, its comments and its layout kept (jsonc-parser, the library of the JSON editing of
// VS Code: each edit touches the value it sets). The check refuses a guard task absent or whose
// `dependsOn` differs. A repository without a root turbo.json (or turbo.jsonc) has nothing written
// or refused at its root.
//
// The packages are the directories holding a `package.json` that the `workspaces` of the root
// `package.json` select (an array, or its `packages` key), mapped as npm maps them
// (@npmcli/map-workspaces), read with Node's glob: a pattern « ! » takes out what the other
// patterns select, unless a later pattern it matches puts it back; `node_modules` is never a
// package. `paquets` is the frame's one list of the packages of a repository, each marked out of
// the frame or not: the update of the frame (scripts/grillhouse-maj.mjs) reads it too. A
// repository without `workspaces` has none: no package turbo.json is written or refused. The
// dependencies are written in the package.json only; this file is their only reader for the
// tasks' order.
import { existsSync, globSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
// The guard tasks of the root: the frame's controls, and the project's own guards.
export const GARDES = ['grillhouse:gardes', 'gardes'];
// The layout of what the generator writes in the root's turbo.json.
const MISE_EN_FORME = { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' } };

// jsonc-parser, a tool of the frame, loaded when a turbo.json is read: the update of the frame
// imports `paquets` from a source checkout that installs no dependency.
// Missing, it is named with the command that installs it.
const jsonc = () => {
  try {
    return createRequire(import.meta.url)('jsonc-parser');
  } catch {
    throw new Error(
      "⛔ jsonc-parser manque : c'est un outil du cadre, que `npm install` installe (devDependencies)."
    );
  }
};

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// <texte> as JSON, its JSONC comments and trailing commas allowed, as Turborepo reads its
// configuration; null when it is no JSON.
const lireJsonc = texte => {
  const erreurs = [];
  const valeur = jsonc().parse(texte, erreurs, { allowTrailingComma: true });
  return erreurs.length ? null : valeur;
};

// The root configuration of Turborepo at <racine>: its path relative to <racine>, or null.
const fichierRacine = racine => RACINES.find(n => existsSync(path.join(racine, n))) ?? null;

// The tasks of the root configuration of Turborepo at <racine>: Map<name, dependsOn>, the tasks
// of the root package (`//#…`) and of one package (`<name>#…`) left out; empty without one.
function tachesRacine(racine) {
  const f = fichierRacine(racine);
  const conf = f ? lireJsonc(readFileSync(path.join(racine, f), 'utf8')) : null;
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

// The `dependsOn` each guard task of the root of <racine> must hold: Map<task key, dependsOn>.
export function gardesAttendues(racine) {
  const liste = paquets(racine);
  if (liste.length === 0) return new Map(GARDES.map(g => [g, ['build']]));
  const builds = liste
    .filter(({ pkg, hors }) => !hors && typeof pkg.scripts?.build === 'string')
    .map(({ pkg }) => `${pkg.name}#build`)
    .sort();
  return new Map(GARDES.map(g => [`//#${g}`, builds]));
}

// The guard tasks of the root's turbo.json at <racine> whose `dependsOn` differs from the one
// expected: [{ cle, attendu, present }] (present: whether the task is in the file), with the file;
// null without a root configuration, or when it is no JSON.
function gardesEcartees(racine) {
  const f = fichierRacine(racine);
  if (f === null) return null;
  const texte = readFileSync(path.join(racine, f), 'utf8');
  const conf = lireJsonc(texte);
  if (conf === null) return null;
  const ecarts = [];
  for (const [cle, attendu] of gardesAttendues(racine)) {
    const tache = conf.tasks?.[cle];
    const actuel = tache?.dependsOn;
    if (!Array.isArray(actuel) || actuel.join('\n') !== attendu.join('\n')) {
      ecarts.push({ cle, attendu, present: tache !== undefined });
    }
  }
  return { f, texte, ecarts };
}

// Writes the turbo.json of each package of <racine> and the guards' dependsOn in its root's;
// returns the paths written.
export function ecrire(racine) {
  const ecrits = [];
  for (const [f, t] of attendus(racine)) {
    const abs = path.join(racine, f);
    if (existsSync(abs) && readFileSync(abs, 'utf8') === t) continue;
    writeFileSync(abs, t);
    ecrits.push(f);
  }
  const racineEcartee = gardesEcartees(racine);
  if (racineEcartee?.ecarts.length) {
    const { modify, applyEdits } = jsonc();
    let texte = racineEcartee.texte;
    for (const { cle, attendu, present } of racineEcartee.ecarts) {
      const [chemin, valeur] = present
        ? [['tasks', cle, 'dependsOn'], attendu]
        : [['tasks', cle], { dependsOn: attendu, outputs: [] }];
      texte = applyEdits(texte, modify(texte, chemin, valeur, MISE_EN_FORME));
    }
    writeFileSync(path.join(racine, racineEcartee.f), texte);
    ecrits.push(racineEcartee.f);
  }
  return ecrits;
}

// The refusals of <racine>: one line per package turbo.json absent or other than generated, one per
// guard task of the root absent or whose dependsOn differs.
export function verifier(racine) {
  const refus = [];
  for (const { cle, attendu, present } of gardesEcartees(racine)?.ecarts ?? []) {
    const f = fichierRacine(racine);
    refus.push(
      present
        ? `⛔ ${f} : la tâche \`${cle}\` doit attendre ${attendu.join(', ') || 'aucune construction'} (la construction de chaque paquet du cadre) ; \`${COMMANDE}\` réécrit son dependsOn.`
        : `⛔ ${f} : la tâche \`${cle}\` manque ; \`${COMMANDE}\` l'ajoute, après la construction de chaque paquet du cadre.`
    );
  }
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
      'Usage : node scripts/turbo-des-paquets.mjs [--ecrire]   vérifie, ou écrit, le turbo.json de chaque paquet et les dépendances des gardes de la racine\n'
    );
    process.exit(2);
  }
  try {
    if (args.includes('--ecrire')) {
      ecrire(racine);
      process.exit(0);
    }
    const refus = verifier(racine);
    for (const l of refus) process.stderr.write(`${l}\n`);
    process.exitCode = refus.length ? 1 : 0;
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : e}\n`);
    process.exitCode = 1;
  }
}
