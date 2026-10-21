#!/usr/bin/env node
// The `turbo.json` of each package of a repository of packages, generated from its package.json
// (its dependencies, its build, the paths its tests read and the traces it writes), its
// configurations of TypeScript, the root's turbo.json and the list of the packages out of the
// frame; and, in the root's turbo.json, the `dependsOn` of the guard tasks, the `env` of the tests,
// the variable of the results directory and the exclusion of a submodule's `.git`.
//
//   node scripts/turbo-des-paquets.mjs           refuses a turbo.json absent or stale, and a
//                                                declaration of a path read or trace refused (below)
//   node scripts/turbo-des-paquets.mjs --ecrire  writes the turbo.json of each package, and the
//                                                guards' dependsOn and the tests' env in the root's
//
// Turborepo's `^build` waits for the build of every internal package a package declares, its
// devDependencies included; a package whose tests import a neighbour that depends on it (the
// shared test material, two stages testing each other) makes a cycle that `turbo run build`
// refuses. A build waits for its runtime dependencies only, as Bazel separates the deps of a
// library from those of its test. So each package receives a package configuration
// (https://turborepo.dev/docs/reference/package-configurations): `extends: ["//"]`, and a `build`
// whose `dependsOn`, which replaces the root's, holds the `<name>#build` of each internal package
// its `dependencies`, `peerDependencies` and `optionalDependencies` name that has a `build`
// script, sorted. The tests keep the root's `build` and `^build`: a test waits for its own package's build, whose
// built entry it imports, and for everything it imports.
//
// A build hashes what it reads, as Turborepo's `inputs` limit what invalidates a task
// (https://turborepo.dev/docs/reference/configuration#inputs): a test file changed leaves its
// package's build as it is, and so the builds and tests of every package depending on it. A
// package with a `tsconfig.build.json` has its `build` hash the root's build inputs, Turborepo's
// default (`$TURBO_DEFAULT$`) left out, then, sorted: its package.json, its tsconfig.build.json and
// each configuration it extends inside the package, `<dir>/**` per directory it includes (an
// `include` entry, its fixed part before a glob; a `files` entry, its directory, since tsc compiles
// what a listed file imports, its neighbours most often), the same for each configuration a `tsc`
// of its `build` script compiles (`-p`, `--project`, `-b`, `--build`, else tsconfig.json). tsc's
// own rules hold: a configuration's `include`
// and `files` replace its bases', a later base of an `extends` list replacing an earlier one, each
// path relative to the file that writes it (`${configDir}`, to the configuration compiled). What is
// unknown leaves the build on Turborepo's default, every file of its package hashed, so that it
// never gives a stale cache: a tsconfig.build.json absent or not JSON, a command of the `build`
// script other than `tsc …` (`vite build`, `node copier.mjs`), a base that cannot be read, a
// configuration setting
// neither `include` nor `files` (tsc then takes every file), an included path out of the package
// or at its root.
//
// A package out of the frame (`docs/agents/hors-cadre.txt`: a directory under `packages/` or
// `src/`) stays a workspace, which a neighbour may import by its name, and Turborepo plays none
// of its tasks: its configuration excludes each task of the root's turbo.json (or turbo.jsonc),
// `"extends": false`, by which the task does not exist for it. A `^` dependency still reaches an excluded task, so no `dependsOn`
// written here names a package out of the frame, and a package of the frame that declares one
// (in its `dependencies`, `devDependencies` or `optionalDependencies`, the fields `^` follows)
// has each root task whose `dependsOn` holds a `^<task>` written out: its other entries kept, then
// the `<name>#<task>` of each internal package it declares there, out of the frame left out,
// sorted. The check refuses a configuration that is not so, which Turborepo would play.
//
// What a package's tests read, as Bazel's `data`, and the traces a stage writes, as Bazel's
// genrule: the test task of a package depends on its code, on what it imports and on the paths it
// declares only. A package declares in its package.json, each path from the root:
//
//   "grillhouse": {
//     "lit": ["packages/990-corpus/test/060-encoder/paires-v1"],
//     "traces": { "trace:grammaires": { "lit": ["…/paires-v1"], "ecrit": "packages/060-encoder/trace/grammaires-du-corpus" } }
//   }
//
// - `lit`: the paths its tests read, directories or files, data or code, a neighbour's scripts and
//   sources included, as Bazel's `data` takes any file. Its `test:vitest` hashes them
//   (`inputs`: the root's, `$TURBO_EXTENDS$`, or Turborepo's default, `$TURBO_DEFAULT$`, when the
//   root's task sets none, since `$TURBO_EXTENDS$` then extends an empty list; then
//   `$TURBO_ROOT$/<dir>/**` each) and waits, beside the root's `dependsOn`, for each trace whose
//   output one of them overlaps (`<producer>#trace:<name>`); the producer declares nothing for it.
// - `traces`: each trace the package produces, its command the package's script of the same name,
//   `trace:<name>`. Its task waits for `build` and `^build`, and for the traces its `lit` overlaps;
//   it hashes the package's files and its `lit`, its output left out, and Turborepo caches its
//   output, `ecrit`, a directory inside the package that git ignores. A restore from the cache
//   adds files and removes none: the command empties its directory before writing it.
//   The traces a package's tests wait for are read in Turborepo's plan of its tests
//   (`tracesDuPlan`), by the targeted run (scripts/tests.mjs) and the launcher
//   (scripts/enveloppe/lancer.sh), which produce them before the tests; the envelope shows the
//   directory of a neighbour's trace read-only (scripts/enveloppe/enveloppe.mjs), and the targeted
//   run inside it plays the traces of the agent's package only.
// - The package holding a declared path of data alone (the shared test material) has its `build`
//   leave it out (`inputs`: the root's, then `!<dir>/**` each): its data no longer moves its build,
//   nor the tests of every package that waits for it. A declared path holding code (a file a build
//   compiles: `.ts`, `.tsx`, `.mts`, `.cts`, `.d.ts` included, whose types tsc checks, `.js`,
//   `.jsx`, `.mjs`, `.cjs`) stays an input of its package's build, as Bazel's `data` leaves a file
//   in the rule that builds it; what a trace writes is no code of it. The builds a package's
//   dependencies give stay as they are: a package reduces them in its package.json.
//
// The check refuses a declared path absent that no trace writes; a trace written out of its
// package, followed by git, or not ignored; a `trace:*` script without
// declaration, a declaration without script or not named `trace:<name>`. In the root's
// turbo.json, which is the project's, it refuses what the generator owns: a task of one package
// (`<package>#<task>`, the root's own `//#…` kept), a `trace:*` task, an input (`inputs` under
// `$TURBO_ROOT$/`, `globalDependencies`) naming a package directory.
//
// A submodule's `.git`, in a copy (a worktree), is a file naming that copy: an input reaching it
// changes the hash of its task in each new copy, and the cache never serves. Beside each input
// that can reach the `.git` of a submodule the .gitmodules declares (a pattern of the root under
// `$TURBO_ROOT$/`, of any task, or a global dependency, whose fixed part is the submodule or holds
// it, then a glob), the generator writes its exclusion, `!$TURBO_ROOT$/<path>/.git`
// (`!<path>/.git` for a global dependency), in the root's turbo.json, the rest of the file kept,
// and in the inputs it writes in a package's turbo.json; the check refuses a root input lacking it.
//
// The configuration of Vitest of the package of the shared test material (`matieres` of
// scripts/consommateurs.mjs) is CommonJS (`vitest.config.cjs`): the envelope shows that package
// read-only to every role but the testeur (scripts/enveloppe/enveloppe.mjs), and Vite 5 loads a
// CommonJS configuration in memory, where it bundles an ESM one into a file beside it
// (`vitest.config.mjs.timestamp-<n>.mjs`). The check refuses a `vitest.config.mjs` or `.mts` of
// that package, and a `.js` or `.ts` when its `type` is `module`, as Vite tells ESM from CommonJS.
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
// The tests of a targeted run: the paths reach Vitest in the variable `GRILLHOUSE_TESTS`
// (scripts/vitest-config/cibles.mjs, scripts/tests.mjs), which the `env` of the root's
// `test:vitest` names: it enters the hash of the tests alone, and reaches their process alone
// (Turborepo's strict mode of the variables). A package's own `test:vitest` sets no `env`, and
// inherits the root's. The generator adds the variable to the `env` of the root's `test:vitest`,
// the project's entries kept, and the check refuses a `test:vitest` of the root without it.
//
// Two variables pass to every task without entering any hash: the root's `globalPassThroughEnv`
// names them, Turborepo's strict mode of the variables keeping out of a task every variable its
// configuration does not name. The results directory of a run (`GRILLHOUSE_RESULTATS`,
// scripts/resultats.mjs), where the guards write their SARIF, Turborepo its summaries and Vitest
// its JSON reports; the changes since the last green (`GRILLHOUSE_CHANGEMENTS`,
// scripts/dernier-vert.mjs), by which the tests of a package Turborepo plays again are those
// Vitest relates to them, while a package whose inputs did not move replays from the cache. The
// generator adds each one the root lacks, the project's entries kept, and the check refuses a
// root without one.
//
// The packages are those of `paquets` (scripts/paquets.mjs, the frame's one list of the packages of
// a repository, each marked out of the frame or not). A repository without `workspaces` has none:
// no package turbo.json is written or refused. The dependencies are written in the package.json
// only; this file is their only reader for the tasks' order.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyEdits, modify, parse } from 'jsonc-parser';
import { matieres, parcourir } from './consommateurs.mjs';
import { paquets } from './paquets.mjs';
import { ecrireSarif, RESULTATS } from './resultats.mjs';
import { VARIABLE as TESTS_CIBLES } from './vitest-config/cibles.mjs';
import { CHANGEMENTS } from './vitest-config/changements.mjs';

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
// The test task of a package, and the prefix of a trace task.
const TESTS = 'test:vitest';
// The variables the root's `globalPassThroughEnv` names, and why, as the check says it.
const PASSAGES = [RESULTATS, CHANGEMENTS];
const POURQUOI = {
  [RESULTATS]: "où les gardes, Turborepo et Vitest écrivent les résultats qu'un circuit lit",
  [CHANGEMENTS]:
    'les fichiers changés depuis le dernier vert, auxquels Vitest relie les tests que rejoue un paquet',
};
const TRACE = 'trace:';
// The files a build compiles: TypeScript's sources and declarations (tsc's default `include`
// takes a `.d.ts` into the program, whose types the build checks) and JavaScript (`allowJs`).
const CODE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
// The configuration of TypeScript a package's build compiles, and the token tsc reads in a path
// of `include` or `files` for the directory of the configuration it compiles.
const TSCONFIG_BUILD = 'tsconfig.build.json';
const CONFIG_DIR = '${configDir}';

// <texte> as JSON, its JSONC comments and trailing commas allowed, as Turborepo reads its
// configuration; null when it is no JSON.
const lireJsonc = texte => {
  const erreurs = [];
  const valeur = parse(texte, erreurs, { allowTrailingComma: true });
  return erreurs.length ? null : valeur;
};

// The root configuration of Turborepo at <racine>: its path relative to <racine>, or null.
const fichierRacine = racine => RACINES.find(n => existsSync(path.join(racine, n))) ?? null;

// The root configuration of Turborepo at <racine>, parsed, with its path: { f, conf }, or null.
function confRacine(racine) {
  const f = fichierRacine(racine);
  const conf = f ? lireJsonc(readFileSync(path.join(racine, f), 'utf8')) : null;
  return conf ? { f, conf } : null;
}

// The tasks of the root configuration of Turborepo at <racine>: Map<name, { dependsOn, inputs }>
// (`inputs` null when the task has none), the tasks of the root package (`//#…`) and of one
// package (`<name>#…`) left out; empty without one.
function tachesRacine(racine) {
  const taches = new Map();
  for (const [nom, t] of Object.entries(confRacine(racine)?.conf.tasks ?? {})) {
    if (nom.includes('#')) continue;
    taches.set(nom, {
      dependsOn: Array.isArray(t?.dependsOn) ? t.dependsOn : [],
      inputs: Array.isArray(t?.inputs) ? t.inputs : null,
    });
  }
  return taches;
}

// The trace tasks of a plan of Turborepo (`turbo run … --dry=json`, parsed), its tasks that
// <garder> keeps: their task ids (`<producer>#trace:<name>`), sorted.
export const tracesDuPlan = (plan, garder = () => true) =>
  plan.tasks
    .filter(t => t.task.startsWith(TRACE) && garder(t))
    .map(t => t.taskId)
    .sort();

// A path from the root, without its trailing slashes.
const net = d => String(d ?? '').replace(/\/+$/, '');
// The fixed part of the pattern <motif>, its segments before the first holding a glob character,
// and whether it has such a segment: { fixe, glob }.
function partieFixe(motif) {
  const segments = String(motif).replace(/^\.\//, '').split('/');
  const i = segments.findIndex(s => /[*?[\]{}]/.test(s));
  return { fixe: net((i < 0 ? segments : segments.slice(0, i)).join('/')), glob: i >= 0 };
}
// Whether <f> is <d> or under it.
const sous = (f, d) => f === d || f.startsWith(`${d}/`);
// Whether one of <a> and <b> holds the other.
const recouvre = (a, b) => sous(a, b) || sous(b, a);

// The paths of the submodules the .gitmodules of <racine> declares, sorted; none without one.
function sousModules(racine) {
  if (!existsSync(path.join(racine, '.gitmodules'))) return [];
  const r = gitSort(racine, [
    'config',
    '-f',
    '.gitmodules',
    '--get-regexp',
    '^submodule\\..*\\.path$',
  ]);
  return r.stdout
    .split('\n')
    .map(l => net(l.slice(l.indexOf(' ') + 1).trim()))
    .filter(Boolean)
    .sort();
}

// The exclusion of the `.git` of each submodule of <sm> one of the <chemins> (from the root)
// holds, each `!<prefixe><path from <depuis>>/.git`: the `.git` of a submodule set in a copy is
// a file naming that copy.
const gitsExclus = (chemins, sm, prefixe = '$TURBO_ROOT$/', depuis = '') =>
  sm
    .filter(m => chemins.some(c => sous(m, c)))
    .map(m => `!${prefixe}${depuis ? path.posix.relative(depuis, m) : m}/.git`);

// The file of the base <base> that a configuration of TypeScript in <dir> extends, as tsc finds
// it: a path, `.json` added when it lacks it, or a module resolved from <dir>; null without one.
function baseTs(base, dir) {
  if (base.startsWith('.') || path.isAbsolute(base)) {
    const f = path.resolve(dir, base);
    return [f, `${f}.json`].find(c => existsSync(c) && statSync(c).isFile()) ?? null;
  }
  const exiger = createRequire(path.join(dir, 'tsconfig.json'));
  for (const c of [base, `${base}.json`, `${base}/tsconfig.json`]) {
    try {
      return exiger.resolve(c);
    } catch {
      // The next form tsc tries.
    }
  }
  return null;
}

// The configuration of TypeScript at <f> (absolute) with its bases, as tsc reads them:
// { configs, files, include }, `configs` the absolute path of each file read, `files` and
// `include` the entries that win, [{ chemin, dir }] (the configuration's own, else those of its
// last base that sets them, `dir` the directory of the file that writes them), undefined when no
// file sets them; null when one of them cannot be read.
function configTs(f, vus = []) {
  if (vus.includes(f) || !existsSync(f)) return null;
  const conf = lireJsonc(readFileSync(f, 'utf8'));
  if (conf === null || typeof conf !== 'object' || Array.isArray(conf)) return null;
  const dir = path.dirname(f);
  const lu = { configs: [f], files: undefined, include: undefined };
  for (const base of conf.extends === undefined ? [] : [conf.extends].flat()) {
    const fb = typeof base === 'string' ? baseTs(base, dir) : null;
    const r = fb === null ? null : configTs(fb, [...vus, f]);
    if (r === null) return null;
    lu.configs.push(...r.configs);
    for (const cle of ['files', 'include']) if (r[cle] !== undefined) lu[cle] = r[cle];
  }
  for (const cle of ['files', 'include']) {
    if (conf[cle] === undefined) continue;
    if (!Array.isArray(conf[cle])) return null;
    lu[cle] = conf[cle].map(chemin => ({ chemin: String(chemin), dir }));
  }
  return lu;
}

// What tsc reads in the package at <abs> compiling the configuration <projet> (absolute):
// { fichiers, dossiers }, the configurations inside the package, and the directory of each
// included path, each relative to the package; null when unknown: a configuration unread,
// neither `files` nor `include` set (tsc then takes every file), an included path out of the
// package or at its root. A listed file gives its directory: tsc compiles what it imports, its
// neighbours most often.
function luParTsc(abs, projet) {
  const lu = configTs(projet);
  if (lu === null || (lu.files === undefined && lu.include === undefined)) return null;
  const dedans = p => {
    const r = path.relative(abs, p).split(path.sep).join('/');
    return r === '' || r === '..' || r.startsWith('../') || path.isAbsolute(r) ? null : r;
  };
  const fichiers = lu.configs.map(dedans).filter(r => r && !r.split('/').includes('node_modules'));
  const dossiers = [];
  for (const [cle, entrees] of [
    ['files', lu.files ?? []],
    ['include', lu.include ?? []],
  ]) {
    for (const { chemin, dir } of entrees) {
      const f = chemin.startsWith(CONFIG_DIR)
        ? path.join(path.dirname(projet), chemin.slice(CONFIG_DIR.length))
        : path.resolve(dir, chemin);
      const r = dedans(f);
      if (r === null) return null;
      const { fixe, glob } = partieFixe(r);
      const fichier = cle === 'files' || (existsSync(f) && statSync(f).isFile());
      const d = glob ? fixe : fichier ? path.posix.dirname(r) : r;
      if (d === '' || d === '.') return null;
      dossiers.push(d);
    }
  }
  return { fichiers, dossiers };
}

// The inputs of the build of the package in <dossier> (from <racine>) whose package.json is
// <pkg>: what its build reads, as Turborepo's `inputs` limit what invalidates a task
// (https://turborepo.dev/docs/reference/configuration#inputs): its package.json, its
// tsconfig.build.json and each configuration it extends inside the package, `<dir>/**` per
// directory it includes, the same for each configuration a `tsc` of its `build` script compiles
// (`-p`, `--project`, `-b`, `--build`, else tsconfig.json), sorted; then the exclusion of the
// `.git` of each submodule of <sm> one of these directories holds. Null without a
// tsconfig.build.json read, when a command of the `build` script (each one apart from the next by
// `&&`, `||`, `;` or `|`) is not `tsc …` (`npx tsc …`), whose reads are unknown, or when what tsc
// reads is unknown (`luParTsc`): the build then hashes every file of its package, Turborepo's
// default, and a command unknown never gives a stale cache.
function entreesBuild(racine, dossier, pkg, sm) {
  const abs = path.join(racine, dossier);
  const projets = [path.join(abs, TSCONFIG_BUILD)];
  if (!existsSync(projets[0])) return null;
  const fichiers = new Set(['package.json']);
  const versProjet = m => {
    const f = path.resolve(abs, m);
    return existsSync(f) && statSync(f).isDirectory() ? path.join(f, 'tsconfig.json') : f;
  };
  for (const commande of String(pkg.scripts?.build ?? '').split(/&&|\|\||[;|]/)) {
    const mots = commande
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(m => m.replace(/^['"]|['"]$/g, ''));
    if (mots.length === 0) continue;
    const tsc = mots[0] === 'npx' ? 1 : 0;
    if (mots[tsc] !== 'tsc') return null;
    const options = mots.slice(tsc + 1);
    const p = options.findIndex(m => m === '-p' || m === '--project');
    const b = options.findIndex(m => m === '-b' || m === '--build');
    if (p >= 0) {
      projets.push(versProjet(options[p + 1] ?? '.'));
    } else if (b >= 0) {
      const suite = options.slice(b + 1);
      const fin = suite.findIndex(m => m.startsWith('-'));
      const noms = fin < 0 ? suite : suite.slice(0, fin);
      projets.push(...(noms.length ? noms : ['.']).map(versProjet));
    } else {
      projets.push(versProjet('.'));
    }
  }
  const dossiers = new Set();
  for (const projet of new Set(projets)) {
    const lu = luParTsc(abs, projet);
    if (lu === null) return null;
    for (const f of lu.fichiers) fichiers.add(f);
    for (const d of lu.dossiers) dossiers.add(d);
  }
  const lus = [...dossiers];
  return [
    ...[...fichiers, ...lus.map(d => `${d}/**`)].sort(),
    ...gitsExclus(
      lus.map(d => `${dossier}/${d}`),
      sm,
      '',
      dossier
    ),
  ];
}

// The data and traces each package of the frame declares in its package.json:
// [{ dossier, pkg, lit, traces: [{ tache, id, lit, ecrit }] }], each path from the root.
function declarations(liste) {
  return liste
    .filter(p => !p.hors)
    .map(({ dossier, pkg }) => {
      const g = pkg.grillhouse ?? {};
      const chemins = l => [...new Set((Array.isArray(l) ? l : []).map(net))].sort();
      return {
        dossier,
        pkg,
        lit: chemins(g.lit),
        traces: Object.entries(g.traces ?? {})
          .map(([tache, t]) => ({
            tache,
            id: `${pkg.name}#${tache}`,
            lit: chemins(t?.lit),
            ecrit: net(t?.ecrit),
          }))
          .sort((a, b) => (a.tache < b.tache ? -1 : 1)),
      };
    });
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
  const deRacine = new Map(racineTaches);
  const hors = new Set(liste.filter(p => p.hors).map(({ pkg }) => pkg.name));
  const duCadre = new Set(liste.filter(p => !p.hors).map(({ pkg }) => pkg.name));
  const construits = new Set(
    liste
      .filter(({ pkg, hors }) => !hors && typeof pkg.scripts?.build === 'string')
      .map(({ pkg }) => pkg.name)
  );
  const decls = new Map(declarations(liste).map(d => [d.dossier, d]));
  const traces = [...decls.values()].flatMap(d => d.traces);
  // The trace tasks whose output one of <lit> overlaps, <soi> left out, sorted.
  const jointes = (lit, soi) =>
    traces
      .filter(t => t.id !== soi && lit.some(l => recouvre(l, t.ecrit)))
      .map(t => t.id)
      .sort();
  // The paths of data alone declared: the ones a trace writes left out, which git ignores, and the
  // ones holding code, which stay inputs of the build of their package.
  const ecrits = traces.map(t => t.ecrit);
  const donnees = [
    ...new Set([...decls.values()].flatMap(d => [...d.lit, ...d.traces.flatMap(t => t.lit)])),
  ].filter(l => !ecrits.some(e => recouvre(l, e)) && !contientCode(racine, l, ecrits));
  // The inputs of the root's <tache> a package's own extend: the root's, or Turborepo's default
  // when the root sets none (`$TURBO_EXTENDS$` then extends an empty list).
  const base = tache => (deRacine.get(tache)?.inputs ? '$TURBO_EXTENDS$' : '$TURBO_DEFAULT$');
  // The inputs of the root's build a package's build keeps when it names its own: Turborepo's
  // default left out, which would hash every file of the package again.
  const racineBuild = (deRacine.get('build')?.inputs ?? []).filter(e => e !== '$TURBO_DEFAULT$');
  const sm = sousModules(racine);
  const out = new Map();
  for (const { dossier, pkg, hors: exclu } of liste) {
    const taches = {};
    if (exclu) {
      for (const [nom] of racineTaches) taches[nom] = { extends: false };
    } else {
      taches.build = {
        dependsOn: internes(pkg, EXECUTION, construits).map(n => `${n}#build`),
      };
      const dedans = donnees
        .filter(d => d !== dossier && sous(d, dossier))
        .map(d => path.posix.relative(dossier, d))
        .sort();
      const propres = entreesBuild(racine, dossier, pkg, sm);
      const sansDonnees = dedans.map(d => `!${d}/**`);
      if (propres) taches.build.inputs = [...racineBuild, ...propres, ...sansDonnees];
      else if (dedans.length) taches.build.inputs = [base('build'), ...sansDonnees];
      const horsVoisin = TOPOLOGIE.some(c => Object.keys(pkg[c] ?? {}).some(n => hors.has(n)));
      const voisins = internes(pkg, TOPOLOGIE, duCadre);
      // <dependances> with each `^<task>` written out when a neighbour is out of the frame.
      const deplier = dependances =>
        horsVoisin
          ? [
              ...dependances.filter(d => !d.startsWith('^')),
              ...dependances
                .filter(d => d.startsWith('^'))
                .flatMap(d => voisins.map(n => `${n}#${d.slice(1)}`))
                .sort(),
            ]
          : dependances;
      if (horsVoisin) {
        for (const [nom, { dependsOn }] of racineTaches) {
          if (nom === 'build' || !dependsOn.some(d => d.startsWith('^'))) continue;
          taches[nom] = { dependsOn: deplier(dependsOn) };
        }
      }
      const decl = decls.get(dossier);
      if (decl.lit.length) {
        taches[TESTS] = {
          dependsOn: [...deplier(deRacine.get(TESTS)?.dependsOn ?? []), ...jointes(decl.lit)],
          inputs: [
            base(TESTS),
            ...decl.lit.map(l => `$TURBO_ROOT$/${l}/**`),
            ...gitsExclus(decl.lit, sm),
          ],
        };
      }
      for (const t of decl.traces) {
        const ecrit = path.posix.relative(dossier, t.ecrit);
        taches[t.tache] = {
          dependsOn: [...deplier(['build', '^build']), ...jointes(t.lit, t.id)],
          inputs: [
            '$TURBO_DEFAULT$',
            ...t.lit.map(l => `$TURBO_ROOT$/${l}/**`),
            ...gitsExclus(t.lit, sm),
            `!${ecrit}/**`,
          ],
          outputs: [`${ecrit}/**`],
        };
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

// The `env` the `test:vitest` of the root's turbo.json at <racine> must hold, TESTS_CIBLES added
// to the project's, when it lacks it: { f, attendu }; null when it holds it, without a root
// configuration or a `test:vitest` in it, and when it is no JSON.
function testsSansVariable(racine) {
  const r = confRacine(racine);
  const tache = r?.conf.tasks?.[TESTS];
  if (!tache || typeof tache !== 'object') return null;
  const actuel = Array.isArray(tache.env) ? tache.env : [];
  return actuel.includes(TESTS_CIBLES) ? null : { f: r.f, attendu: [...actuel, TESTS_CIBLES] };
}

// The `globalPassThroughEnv` the root's turbo.json at <racine> must hold, each of PASSAGES it
// lacks added to the project's: { f, attendu, manques }; null when it holds them, without a root
// configuration, and when it is no JSON.
function passagesManquants(racine) {
  const r = confRacine(racine);
  if (!r) return null;
  const actuel = Array.isArray(r.conf.globalPassThroughEnv) ? r.conf.globalPassThroughEnv : [];
  const manques = PASSAGES.filter(v => !actuel.includes(v));
  return manques.length ? { f: r.f, attendu: [...actuel, ...manques], manques } : null;
}

// The inputs of the root's turbo.json at <racine> that can reach the `.git` of a submodule its
// .gitmodules declares (a pattern under `$TURBO_ROOT$/` of a task, or a global dependency, whose
// fixed part is the submodule or holds it, then a glob) without its exclusion beside them:
// { f, listes: [{ chemin, attendu, manques: [{ ou, e, m, ligne }] }] }, `attendu` the list with
// each exclusion `!<path>/.git` added after the first pattern lacking it; null when none lacks it,
// without a root configuration or a submodule.
function gitsAbsents(racine) {
  const r = confRacine(racine);
  const sm = r === null ? [] : sousModules(racine);
  if (sm.length === 0) return null;
  const listes = [];
  const examiner = (chemin, entrees, prefixe, ou) => {
    if (!Array.isArray(entrees)) return;
    const attendu = entrees.map(String);
    const manques = [];
    for (const e of entrees.map(String)) {
      if (e.startsWith('!') || !e.startsWith(prefixe)) continue;
      const { fixe, glob } = partieFixe(e.slice(prefixe.length));
      for (const m of sm) {
        const ligne = `!${prefixe}${m}/.git`;
        if (!glob || !(fixe === '' || sous(m, fixe)) || attendu.includes(ligne)) continue;
        attendu.splice(attendu.indexOf(e) + 1, 0, ligne);
        manques.push({ ou, e, m, ligne });
      }
    }
    if (manques.length) listes.push({ chemin, attendu, manques });
  };
  for (const [nom, t] of Object.entries(r.conf.tasks ?? {})) {
    examiner(['tasks', nom, 'inputs'], t?.inputs, '$TURBO_ROOT$/', `l'entrée de \`${nom}\``);
  }
  examiner(['globalDependencies'], r.conf.globalDependencies, '', 'la dépendance globale');
  return listes.length ? { f: r.f, listes } : null;
}

// Writes the turbo.json of each package of <racine>, and in its root's the guards' dependsOn, the
// tests' env and the exclusion of a submodule's `.git` beside each input reaching it; returns the
// paths written.
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
  const tests = testsSansVariable(racine);
  if (tests) {
    const abs = path.join(racine, tests.f);
    const texte = readFileSync(abs, 'utf8');
    const chemin = ['tasks', TESTS, 'env'];
    writeFileSync(abs, applyEdits(texte, modify(texte, chemin, tests.attendu, MISE_EN_FORME)));
    if (!ecrits.includes(tests.f)) ecrits.push(tests.f);
  }
  const passage = passagesManquants(racine);
  if (passage) {
    const abs = path.join(racine, passage.f);
    const texte = readFileSync(abs, 'utf8');
    const chemin = ['globalPassThroughEnv'];
    writeFileSync(abs, applyEdits(texte, modify(texte, chemin, passage.attendu, MISE_EN_FORME)));
    if (!ecrits.includes(passage.f)) ecrits.push(passage.f);
  }
  const gits = gitsAbsents(racine);
  if (gits) {
    const abs = path.join(racine, gits.f);
    let texte = readFileSync(abs, 'utf8');
    for (const { chemin, attendu } of gits.listes) {
      texte = applyEdits(texte, modify(texte, chemin, attendu, MISE_EN_FORME));
    }
    writeFileSync(abs, texte);
    if (!ecrits.includes(gits.f)) ecrits.push(gits.f);
  }
  return ecrits;
}

// Whether <chemin> of <racine> (a directory, or a file, from the root) holds a file of code; what
// lies under one of <exclus> left out, as `parcourir` walks it.
function contientCode(racine, chemin, exclus) {
  if (exclus.some(e => sous(chemin, e))) return false;
  const rel = p => path.relative(racine, p).split(path.sep).join('/');
  return parcourir(path.join(racine, chemin), p => exclus.some(e => sous(rel(p), e))).some(f =>
    CODE.test(f)
  );
}

const gitSort = (racine, args) => spawnSync('git', args, { cwd: racine, encoding: 'utf8' });

// The refusals of the data and traces the packages of <racine> declare: one line per declared
// path absent that no trace writes, per trace written out of its producer,
// followed by git or not ignored, per trace script without declaration and declaration without
// script.
function declarationsRefusees(racine) {
  const decls = declarations(paquets(racine));
  const ecrits = decls.flatMap(d => d.traces.map(t => t.ecrit));
  const refus = [];
  for (const { dossier, pkg, lit, traces } of decls) {
    const ici = `${dossier}/package.json`;
    const declarees = new Set(traces.map(t => t.tache));
    for (const s of Object.keys(pkg.scripts ?? {}).filter(s => s.startsWith(TRACE))) {
      if (!declarees.has(s)) {
        refus.push(
          `⛔ ${ici} : le script \`${s}\` n'a pas de déclaration dans \`grillhouse.traces\` (les dossiers qu'il lit, celui qu'il écrit).`
        );
      }
    }
    for (const t of traces) {
      if (!t.tache.startsWith(TRACE)) {
        refus.push(`⛔ ${ici} : la trace \`${t.tache}\` se nomme \`${TRACE}<nom>\`.`);
      } else if (typeof pkg.scripts?.[t.tache] !== 'string') {
        refus.push(
          `⛔ ${ici} : la trace \`${t.tache}\` n'a pas de script du même nom, sa commande.`
        );
      }
      if (t.ecrit === dossier || !sous(t.ecrit, dossier)) {
        refus.push(
          `⛔ ${ici} : la trace \`${t.tache}\` écrit \`${t.ecrit}\`, hors de son paquet ; une trace vit dans le paquet qui la produit.`
        );
      } else if (gitSort(racine, ['ls-files', '--', t.ecrit]).stdout.trim()) {
        refus.push(
          `⛔ ${ici} : git suit \`${t.ecrit}\`, que la trace \`${t.tache}\` écrit ; une trace se régénère, git l'ignore (\`git rm -r --cached\`).`
        );
      } else if (gitSort(racine, ['check-ignore', '-q', `${t.ecrit}/x`]).status !== 0) {
        refus.push(
          `⛔ ${ici} : \`${t.ecrit}\`, que la trace \`${t.tache}\` écrit, manque au .gitignore ; une trace se régénère, git l'ignore.`
        );
      }
    }
    for (const l of [...new Set([...lit, ...traces.flatMap(t => t.lit)])].sort()) {
      const sortie = ecrits.some(e => recouvre(l, e));
      if (!sortie && !existsSync(path.join(racine, l))) {
        refus.push(
          `⛔ ${ici} : le chemin lu \`${l}\` n'existe pas, et aucune trace ne l'écrit (\`grillhouse.traces\`).`
        );
      }
    }
  }
  return refus;
}

// The refusals of the configurations of Vitest that Vite loads as ESM in a package of the shared
// test material of <racine>: one line per such file, as Vite judges it (`.mjs`, `.mts`, or `.js`,
// `.ts` in a package of `"type": "module"`).
function configsMatiereRefusees(racine) {
  const refus = [];
  for (const { dir } of matieres(racine)) {
    const { type } = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    for (const ext of ['mjs', 'mts', ...(type === 'module' ? ['js', 'ts'] : [])]) {
      const f = path.relative(racine, path.join(dir, `vitest.config.${ext}`));
      if (!existsSync(path.join(racine, f))) continue;
      refus.push(
        `⛔ ${f} : la configuration de Vitest du paquet de la matière s'écrit en CommonJS, \`vitest.config.cjs\` ; Vite écrit un fichier à côté d'une configuration ESM pour la charger, et la matière est en lecture seule chez tout rôle autre que le testeur.`
      );
    }
  }
  return refus;
}

// Whether the pattern <motif> (from the root) can name a file of one of the <dossiers>: its fixed
// part, before the first glob character, lies in one, or holds one under a glob.
function visePaquet(motif, dossiers) {
  const { fixe, glob } = partieFixe(motif);
  return dossiers.some(d => sous(fixe, d) || (glob && (fixe === '' || sous(d, fixe))));
}

// The refusals of the root's turbo.json at <racine> that the generator owns: a task of one package
// (`<package>#<task>`), a trace task, an input (`inputs` of a task, `globalDependencies`) naming a
// package directory.
function racineRefusee(racine) {
  const r = confRacine(racine);
  if (r === null) return [];
  const { f, conf } = r;
  const dossiers = paquets(racine).map(p => p.dossier);
  const refus = [];
  const entree = (e, ou) =>
    refus.push(
      `⛔ ${f} : ${ou} \`${e}\` vise un dossier de paquet ; un paquet déclare les dossiers que ses tests lisent dans son package.json (\`grillhouse.lit\`), et \`${COMMANDE}\` écrit son turbo.json.`
    );
  for (const [nom, t] of Object.entries(conf.tasks ?? {})) {
    const diese = nom.indexOf('#');
    if (diese >= 0 && nom.slice(0, diese) !== '//') {
      refus.push(
        `⛔ ${f} : la tâche \`${nom}\` configure un paquet à la main ; son turbo.json se génère depuis son package.json (\`${COMMANDE}\`).`
      );
    } else if (nom.slice(diese + 1).startsWith(TRACE)) {
      refus.push(
        `⛔ ${f} : la tâche \`${nom}\` est une trace ; elle se déclare au package.json du paquet qui la produit (\`grillhouse.traces\`).`
      );
    }
    for (const e of Array.isArray(t?.inputs) ? t.inputs : []) {
      const motif = String(e).replace(/^!/, '');
      if (motif.startsWith('$TURBO_ROOT$/') && visePaquet(motif.slice(13), dossiers)) {
        entree(e, `l'entrée de \`${nom}\``);
      }
    }
  }
  for (const e of Array.isArray(conf.globalDependencies) ? conf.globalDependencies : []) {
    if (visePaquet(String(e).replace(/^!/, ''), dossiers)) entree(e, 'la dépendance globale');
  }
  return refus;
}

// The refusals of <racine>: one line per package turbo.json absent or other than generated, per
// guard task of the root absent or whose dependsOn differs, for a root `test:vitest` whose `env`
// lacks TESTS_CIBLES, per variable of PASSAGES the root's `globalPassThroughEnv` lacks, per configuration
// of a package written by hand in the root's turbo.json, and per declaration of data or trace
// refused.
export function verifier(racine) {
  const refus = [
    ...racineRefusee(racine),
    ...declarationsRefusees(racine),
    ...configsMatiereRefusees(racine),
  ];
  const gits = gitsAbsents(racine);
  for (const { ou, e, m, ligne } of (gits?.listes ?? []).flatMap(l => l.manques)) {
    refus.push(
      `⛔ ${gits.f} : ${ou} \`${e}\` couvre le sous-module \`${m}\` sans exclure son \`.git\`, un fichier qui nomme la copie où il est posé : chaque copie neuve change l'empreinte, et le cache ne sert jamais ; \`${COMMANDE}\` ajoute \`${ligne}\` à côté.`
    );
  }
  const tests = testsSansVariable(racine);
  if (tests) {
    refus.push(
      `⛔ ${tests.f} : l'\`env\` de \`${TESTS}\` doit nommer ${TESTS_CIBLES}, qui porte les chemins d'une passe ciblée dans le seul hachage des tests ; \`${COMMANDE}\` l'ajoute.`
    );
  }
  const passage = passagesManquants(racine);
  for (const v of passage?.manques ?? []) {
    refus.push(
      `⛔ ${passage.f} : \`globalPassThroughEnv\` doit nommer ${v}, ${POURQUOI[v]} ; \`${COMMANDE}\` l'ajoute.`
    );
  }
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
      'Usage : node scripts/turbo-des-paquets.mjs [--ecrire]   vérifie, ou écrit, le turbo.json de chaque paquet, et à la racine les dépendances des gardes et l’env des tests\n'
    );
    process.exitCode = 2;
  } else {
    try {
      if (args.includes('--ecrire')) {
        ecrire(racine);
      } else {
        const refus = verifier(racine);
        for (const l of refus) process.stderr.write(`${l}\n`);
        // Each refusal judges the root's configuration: a finding without a file of a component.
        ecrireSarif({
          garde: 'turbo-des-paquets',
          racine,
          constats: refus.map(l => ({ message: l })),
        });
        process.exitCode = refus.length ? 1 : 0;
      }
    } catch (e) {
      process.stderr.write(`${e instanceof Error ? e.message : e}\n`);
      process.exitCode = 1;
    }
  }
}
