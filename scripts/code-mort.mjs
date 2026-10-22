#!/usr/bin/env node
// The dead-code guard: refuses a file, an export, a type or a dependency that nothing living
// uses, measured by knip (configured in the project's `knip.json`). Run by `grillhouse:gardes`.
//
// - Each finding is named with its file; exit code 1 when there is one. A finding inscribed in the
//   project's debt (`grillhouse-dette.json`, see `dette.mjs`) passes, keyed by its file and knip's
//   kind of issue (`files`, `exports`, `types`, `dependencies`…).
// - A knip that measured nothing (it failed, or its output is not its report) refuses too: an
//   empty green is the worst green.
// - A finding that is not dead (a format's full table, a public name a consumer outside the
//   repository reads) leaves by its name in `knip.json`, with its reason, never by a wide pattern.
// - The frame's scripts are judged in Grillhouse, not in the project: the `.mjs`, `.cjs` and `.js`
//   files of the frame's list (`.claude/grillhouse/fichiers.txt`, its directories unrolled, read
//   by `lireListe` and `fichiersDuCadre` of `grillhouse-maj.mjs`) are entries of the first run,
//   each in the place that holds it (the deepest workspace whose directory holds it, as
//   `scripts/vitest-config` in a repository of packages; the root otherwise), beside the entries
//   knip gives that place (its defaults when the settings name none). The project's `knip.json`
//   names none of them.
// - The packages listed out of the frame (`docs/agents/hors-cadre.txt`, read by `horsCadre` of
//   `consommateurs.mjs`) are skipped: knip neither reads nor reports them, so a use they make
//   keeps nothing alive. knip then runs on the project's `knip.json` (knip's defaults without
//   one) plus these exclusions and the frame's entries, written to a temporary file outside the
//   repository; the project's `knip.json` is never written.
// - The tests and benches of a component count for the use of its dependencies only. knip runs a
//   first time on the settings above and gives every finding. It runs a second time, restricted
//   to the dependency findings, with the test and bench files of the repository as its only
//   entries, each place receiving its own files: the root (its `.` key, which knip reads as soon
//   as there are `workspaces`) those that no package holds, each package of the repository those
//   under its directory, the deepest package holding a file owning it. The packages are the
//   workspaces knip makes, with its own glob matcher (`picomatch`, loaded from the repository's
//   knip): the directories holding a `package.json` that the `workspaces` of the root
//   `package.json` select or a key of the `knip.json` names, exact or by pattern. Each place
//   receives the settings knip gives it (`getWorkspaceConfig`): those of the key knip chooses
//   (`getConfigKeyForWorkspace`: the keys sorted by knip's `byPathDepth`, the last one that
//   matches), the whole `knip.json` for the root without `workspaces`, empty settings when no key
//   matches; kept to those knip's schema admits in a workspace key, the top-level-only ones
//   (`$schema`, `rules`…) staying at the top level. So a pattern key (`packages/*`) holds for
//   each package it names and a package no key names is covered too. A dependency is unused when
//   both runs report it, so the entries knip takes by itself stay in the first run. The files,
//   exports and types findings are those of the first run.
// - The test and bench files are those git does not ignore (`.gitignore`, as knip reads it): a
//   ticket copy or a build that git ignores counts for nothing. A test file is known by the
//   repository's rule (`isTestFile`, `verrous/verrou.mjs`), plus the benches `*.budget.*` and
//   `*.nuit.*`. A file the top-level or workspace `ignore` targets is not an entry: these patterns
//   become negated entry patterns, which knip matches as its own.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { horsCadre } from './consommateurs.mjs';
import { trancher } from './dette.mjs';
import { fichiersDuCadre, lireListe } from './grillhouse-maj.mjs';
import { isTestFile } from './verrous/verrou.mjs';

const GENRES = {
  files: 'fichier sans appelant',
  exports: 'export sans appelant',
  types: 'type exporté sans appelant',
  enumMembers: "membre d'énumération sans appelant",
  dependencies: 'dépendance sans usage',
  devDependencies: 'dépendance de développement sans usage',
  unlisted: 'dépendance non déclarée',
  unresolved: 'import introuvable',
  binaries: 'commande non déclarée',
  duplicates: 'export en double',
};

// The findings of knip's JSON report, of the given kinds (all by default), each
// `{ fichier, regle, message }`: its file, knip's kind of issue (`exports`, `dependencies`…) and
// its line; null when the report is not knip's.
export function constats(texte, genres = Object.keys(GENRES)) {
  let r;
  try {
    r = JSON.parse(texte);
  } catch {
    return null;
  }
  if (!Array.isArray(r?.issues)) {
    return null;
  }
  const out = [];
  for (const i of r.issues) {
    for (const genre of genres) {
      const nom = GENRES[genre];
      for (const x of i[genre] ?? []) {
        const n = Array.isArray(x) ? x.map(y => y.name).join(', ') : x.name;
        out.push({
          fichier: i.file,
          ...(Array.isArray(x) || !x.line ? {} : { ligne: x.line }),
          regle: genre,
          message: genre === 'files' ? `${i.file} : ${nom}` : `${i.file} : ${nom} — ${n}`,
        });
      }
    }
  }
  return out;
}

const liste = v => (v === undefined ? [] : [v].flat());

// The knip settings of the repository at <racine> with its packages out of the frame skipped:
// its `knip.json` (empty without one) plus `ignoreWorkspaces` for each listed directory under
// `packages/` and `ignore` for each listed directory under `packages/` and `src/`; null when the
// list names nothing.
function reglages(racine) {
  const hors = [...horsCadre(racine)].sort();
  if (!hors.length) {
    return null;
  }
  const fichier = path.join(racine, 'knip.json');
  const r = existsSync(fichier) ? JSON.parse(readFileSync(fichier, 'utf8')) : {};
  const espaces = [];
  const motifs = [];
  for (const nom of hors) {
    for (const parent of ['packages', 'src']) {
      if (!existsSync(path.join(racine, parent, nom))) {
        continue;
      }
      if (parent === 'packages') {
        espaces.push(`packages/${nom}`);
      }
      motifs.push(`${parent}/${nom}/**`);
    }
  }
  return {
    ...r,
    ignore: [...liste(r.ignore), ...motifs],
    ignoreWorkspaces: [...liste(r.ignoreWorkspaces), ...espaces],
  };
}

const CODE = /\.[cm]?[jt]sx?$/;
const BANC = /\.(budget|nuit)\.[cm]?[jt]sx?$/;

// The test and bench files of the repository at <racine>, relative to it with `/` separators,
// as `fichiers`, and the directories holding a `package.json` as `dossiers` (`.` for the root);
// `erreur` is git's message when git fails. git lists every file its ignore rules
// (`.gitignore`) leave in against a fresh empty index, so a file counts whether tracked or not,
// and the user's global ignore file stays out, as knip reads them; a file under `node_modules`
// stays out, as knip skips it.
function fichiersTests(racine) {
  const index = mkdtempSync(path.join(tmpdir(), 'code-mort-git-'));
  try {
    const init = spawnSync('git', ['init', '-q', '--bare', '--template=', index], {
      encoding: 'utf8',
    });
    const r =
      init.status === 0 &&
      spawnSync(
        'git',
        [
          '--git-dir',
          index,
          '--work-tree',
          '.',
          '-c',
          'core.excludesFile=',
          'ls-files',
          '-o',
          '--exclude-standard',
          '-z',
        ],
        { cwd: racine, encoding: 'utf8', maxBuffer: 1 << 28 }
      );
    if (!r || r.status !== 0) {
      return { erreur: (r || init).stderr || `git : code ${(r || init).status}` };
    }
    const tous = r.stdout.split('\0').filter(f => f && !f.split('/').includes('node_modules'));
    const fichiers = tous.filter(
      f => CODE.test(f) && (isTestFile(f) || BANC.test(path.posix.basename(f)))
    );
    const dossiers = tous
      .filter(f => path.posix.basename(f) === 'package.json')
      .map(f => path.posix.dirname(f));
    return { fichiers, dossiers };
  } finally {
    rmSync(index, { recursive: true, force: true });
  }
}

// The parts of the repository's `knip` the guard follows, loaded from its own files:
// `picomatch`, its glob matcher; `byPathDepth` (util/workspace.js), its order of workspace keys;
// `reglagesEspace`, the settings its schema admits in a workspace key
// (`workspaceConfigurationSchema`, schema/configuration.js); `entreesParDefaut`, the entries it
// gives a place whose settings name none (`getDefaultWorkspaceConfig` of ConfigurationChief.js,
// built on `DEFAULT_EXTENSIONS`, constants.js). null when knip is not installed there or lacks
// one of them (the guard then refuses).
async function knipDuDepot(racine) {
  try {
    const entree = createRequire(path.join(racine, 'noeud.js')).resolve('knip');
    const dist = path.dirname(entree);
    const module = f => import(pathToFileURL(path.join(dist, f)).href);
    const { byPathDepth } = await module('util/workspace.js');
    const { workspaceConfigurationSchema } = await module('schema/configuration.js');
    const { DEFAULT_EXTENSIONS } = await module('constants.js');
    const reglagesEspace = new Set(Object.keys(workspaceConfigurationSchema.shape));
    const picomatch = createRequire(entree)('picomatch');
    const ext = [...DEFAULT_EXTENSIONS].map(e => e.slice(1)).join(',');
    const entreesParDefaut = [`{index,cli,main}.{${ext}}!`, `src/{index,cli,main}.{${ext}}!`];
    return typeof byPathDepth === 'function' && reglagesEspace.has('entry') && ext
      ? { picomatch, byPathDepth, reglagesEspace, entreesParDefaut }
      : null;
  } catch {
    return null;
  }
}

// The workspace keys knip reads in <config>: those of its `workspaces` (`.` without them) less the
// ones `ignoreWorkspaces` names (`getConfiguredWorkspaceKeys`).
const clesConfigurees = config =>
  (config?.workspaces ? Object.keys(config.workspaces) : ['.']).filter(
    k => !liste(config?.ignoreWorkspaces).includes(k)
  );

// The key of <cles> knip chooses for the workspace <nom> (`getConfigKeyForWorkspace`): the keys
// sorted by knip's `byPathDepth`, the deepest one that matches; undefined when none does.
const cleDe = ({ picomatch, byPathDepth }, cles, nom) =>
  [...cles]
    .sort(byPathDepth)
    .reverse()
    .find(c => picomatch.isMatch(nom, c));

// The settings knip gives the workspace <nom> in <config> (`getWorkspaceConfig`): those of the key
// it chooses, the whole of <config> when that key is `.` without `workspaces`, empty settings when
// no key matches; kept to the settings a workspace key admits (<knipLu>.reglagesEspace), so they
// can be written under a key of `workspaces`.
function reglagesDeEspace(knipLu, config, nom) {
  const cle = cleDe(knipLu, clesConfigurees(config), nom);
  const brut =
    cle === undefined
      ? {}
      : cle === '.' && !('.' in (config?.workspaces ?? {}))
        ? (config ?? {})
        : (config.workspaces[cle] ?? {});
  return Object.fromEntries(Object.entries(brut).filter(([k]) => knipLu.reglagesEspace.has(k)));
}

// The workspaces of the repository at <racine> among <dossiers> (the directories holding a
// `package.json`), as knip makes them (`getWorkspaces`): those the `workspaces` of the root
// `package.json` select (negated globs exclude), plus those the keys of <config> name, exact or
// by pattern, even when the root `package.json` lists them not; the ones the negated globs and
// `ignoreWorkspaces` of <config> target are left out. The root is not one. Sorted.
function paquets({ picomatch }, racine, dossiers, config) {
  const fichier = path.join(racine, 'package.json');
  const w = existsSync(fichier) ? JSON.parse(readFileSync(fichier, 'utf8')).workspaces : undefined;
  const globs = liste(Array.isArray(w) ? w : w?.packages).map(g => g.replace(/^\.\//, ''));
  const nies = globs.filter(g => g.startsWith('!')).map(g => g.slice(1));
  const cles = clesConfigurees(config).filter(k => k !== '.');
  const retenus = [...globs.filter(g => !g.startsWith('!')), ...cles];
  const ignores = [...nies, ...liste(config?.ignoreWorkspaces).filter(g => !g.endsWith('!'))];
  const exclus = ignores.length ? picomatch(ignores) : () => false;
  return dossiers
    .filter(d => d !== '.' && retenus.some(g => picomatch.isMatch(d, g)) && !exclus(d))
    .sort();
}

// The settings of the dependency pass: <config> whose `workspaces` are replaced by the places
// of the run, each receiving the settings knip gives it in <config> (`reglagesDeEspace`, <knipLu>
// the parts of knip it follows) and as entries its own test and bench files of the repository at
// <racine>, by absolute path: the `.` key the files no package holds, and one exact key per
// package <paquets> the files under its directory (the deepest package owns a file). The keys of
// <config> leave: an exact key per package is the only key knip finds for it. The `ignore`
// patterns follow as negated entry patterns rooted at their directory: the top-level ones in
// every place, those of a key in the place it serves; knip matches them as it matches its own
// patterns, and a file they target is not an entry.
function reglagesDependances(knipLu, racine, config, fichiers, paquets) {
  const r = config ?? {};
  const absolu = (dossier, m) => path.posix.join(racine, dossier === '.' ? '' : dossier, m);
  const sauf = (dossier, motifs) => liste(motifs).map(m => `!${absolu(dossier, m)}`);
  const proprio = f =>
    paquets.filter(p => f.startsWith(`${p}/`)).sort((a, b) => b.length - a.length)[0] ?? '.';
  const parPlace = new Map([['.', []], ...paquets.map(p => [p, []])]);
  for (const f of fichiers) {
    parPlace.get(proprio(f))?.push(path.posix.join(racine, f));
  }
  const racineIgnore = sauf('.', r.ignore);
  const reglagesRacine = reglagesDeEspace(knipLu, r, '.');
  const entryRacine = [...parPlace.get('.'), ...racineIgnore, ...sauf('.', reglagesRacine.ignore)];
  if (!paquets.length && !r.workspaces) {
    return { ...r, entry: entryRacine };
  }
  const espaces = {};
  espaces['.'] = { ...reglagesRacine, entry: entryRacine };
  for (const p of paquets) {
    const reglages = reglagesDeEspace(knipLu, r, p);
    espaces[p] = {
      ...reglages,
      entry: [...parPlace.get(p), ...racineIgnore, ...sauf(p, reglages.ignore)],
    };
  }
  return { ...r, entry: entryRacine, workspaces: espaces };
}

// The frame's scripts installed in the repository at <racine>: the `.mjs`, `.cjs` and `.js` files
// its list (`.claude/grillhouse/fichiers.txt`, read by `lireListe` and `fichiersDuCadre` of
// grillhouse-maj.mjs) covers, its directories unrolled, relative to <racine> with `/`
// separators; none without the list.
function scriptsDuCadre(racine) {
  const liste = path.join(racine, '.claude/grillhouse/fichiers.txt');
  if (!existsSync(liste)) {
    return [];
  }
  const { garder } = lireListe(readFileSync(liste, 'utf8'));
  return fichiersDuCadre(racine, garder)
    .map(f => f.split(path.sep).join('/'))
    .filter(f => /\.[cm]?js$/.test(f));
}

// The settings of the first run: <config> (knip's defaults when null) with the frame's <scripts>
// added to the entries of the place that holds each one, by absolute path: the deepest package
// of <paquets> holding it, the root otherwise. A place keeps the entries knip gives it
// (`reglagesDeEspace`, <knipLu> the parts of knip it follows; knip's default entries when they
// name none); a package receiving scripts gets an exact key, the only key knip then finds for it.
// <config> as it is when there is no script.
function avecScriptsDuCadre(knipLu, racine, config, scripts, paquets) {
  if (!scripts.length) {
    return config;
  }
  const r = config ?? {};
  const proprio = f =>
    paquets.filter(p => f.startsWith(`${p}/`)).sort((a, b) => b.length - a.length)[0] ?? '.';
  const parPlace = new Map();
  for (const f of scripts) {
    const p = proprio(f);
    parPlace.set(p, [...(parPlace.get(p) ?? []), path.posix.join(racine, f)]);
  }
  const entrees = (reglages, fichiers) => [
    ...(reglages.entry === undefined ? knipLu.entreesParDefaut : liste(reglages.entry)),
    ...fichiers,
  ];
  if (!paquets.length && !r.workspaces) {
    return { ...r, entry: entrees(r, parPlace.get('.')) };
  }
  const espaces = { ...(r.workspaces ?? {}) };
  for (const [place, fichiers] of parPlace) {
    const reglages = reglagesDeEspace(knipLu, r, place);
    espaces[place] = { ...reglages, entry: entrees(reglages, fichiers) };
  }
  return { ...r, workspaces: espaces };
}

// Runs knip on <config> (knip's defaults when null), restricted to <include> when given; the
// spawn result.
function knip(config, include) {
  const args = ['--no-install', 'knip', '--reporter', 'json', '--no-progress'];
  if (include) {
    args.push('--include', include);
  }
  let tmp = null;
  try {
    if (config) {
      tmp = mkdtempSync(path.join(tmpdir(), 'code-mort-'));
      const f = path.join(tmp, 'knip.json');
      writeFileSync(f, JSON.stringify(config));
      args.push('--config', f);
    }
    return spawnSync('npx', args, { encoding: 'utf8' });
  } finally {
    if (tmp) {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

// The command on the repository at <racine>: its exit code.
async function codeMort(racine) {
  const hors = reglages(racine);
  const fichierKnip = path.join(racine, 'knip.json');
  const config =
    hors ?? (existsSync(fichierKnip) ? JSON.parse(readFileSync(fichierKnip, 'utf8')) : null);
  const DEPS = ['dependencies', 'devDependencies'];
  const { fichiers, dossiers, erreur } = fichiersTests(racine);
  if (erreur) {
    process.stderr.write(`⛔ CODE MORT — git n'a pas listé les fichiers de test :\n${erreur}\n`);
    return 1;
  }
  const knipLu = await knipDuDepot(racine);
  if (!knipLu) {
    process.stderr.write(
      '⛔ CODE MORT — knip du dépôt illisible : son matcher (picomatch), son ordre des clés (byPathDepth) ou son schéma des espaces manque.\n'
    );
    return 1;
  }
  const premier = knip(
    avecScriptsDuCadre(
      knipLu,
      racine,
      hors ?? config,
      scriptsDuCadre(racine),
      paquets(knipLu, racine, dossiers, hors ?? config)
    )
  );
  const c1 = constats(premier.stdout ?? '');
  const second = fichiers.length
    ? knip(
        reglagesDependances(
          knipLu,
          racine,
          config,
          fichiers,
          paquets(knipLu, racine, dossiers, config)
        ),
        DEPS.join(',')
      )
    : null;
  const c2 = second ? constats(second.stdout ?? '', DEPS) : null;
  let c = null;
  if (c1 && (c2 || !second)) {
    const messages = liste => new Set(liste.map(x => x.message));
    const deps = messages(constats(premier.stdout, DEPS));
    const lus = c2 ? messages(c2) : deps;
    c = c1.filter(x => !deps.has(x.message) || lus.has(x.message));
  }
  if (c === null) {
    const r = c1 ? second : premier;
    process.stderr.write(
      `⛔ CODE MORT — knip n'a rien mesuré :\n${(r.stderr || r.stdout || '').slice(0, 1000)}\n`
    );
    return 1;
  }
  const { refus, lignes } = trancher(racine, 'code-mort', c);
  if (refus.length) {
    process.stderr.write(
      `⛔ CODE MORT — ${refus.length} constat(s) : chacun se supprime, ou sort par son nom dans knip.json avec sa raison.\n`
    );
    for (const x of refus) {
      process.stderr.write(`  ${x.message}\n`);
    }
  }
  for (const l of lignes) {
    process.stderr.write(`${l}\n`);
  }
  return refus.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await codeMort(process.cwd());
}
