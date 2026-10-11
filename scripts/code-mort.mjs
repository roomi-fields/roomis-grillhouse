#!/usr/bin/env node
// The dead-code guard: refuses a file, an export, a type or a dependency that nothing living
// uses, measured by knip (configured in the project's `knip.json`). Run by `grillhouse:gardes`.
//
// - Each finding is named with its file; exit code 1 when there is one.
// - A knip that measured nothing (it failed, or its output is not its report) refuses too: an
//   empty green is the worst green.
// - A finding that is not dead (a format's full table, a public name a consumer outside the
//   repository reads) leaves by its name in `knip.json`, with its reason, never by a wide pattern.
// - The packages listed out of the frame (`docs/agents/hors-cadre.txt`, read by `horsCadre` of
//   `consommateurs.mjs`) are skipped: knip neither reads nor reports them, so a use they make
//   keeps nothing alive. knip then runs on the project's `knip.json` (knip's defaults without
//   one) plus these exclusions, written to a temporary file outside the repository; the
//   project's `knip.json` is never written.
// - The tests and benches of a component count for the use of its dependencies only. knip runs a
//   first time on the settings above and gives every finding. It runs a second time, restricted
//   to the dependency findings, with the test and bench files of the repository as its only
//   entries, in every workspace the `knip.json` names: knip ties each file to the workspace that
//   holds it. A dependency is unused when both runs report it, so the entries knip takes by itself
//   stay in the first run. The files, exports and types findings are those of the first run.
// - The test and bench files are those git does not ignore (`.gitignore`, as knip reads it): a
//   ticket copy or a build that git ignores counts for nothing. A test file is known by the
//   repository's rule (`isTestFile`, `verrous/verrou.mjs`), plus the benches `*.budget.*` and
//   `*.nuit.*`. A file the top-level or workspace `ignore` targets is not an entry: these patterns
//   become negated entry patterns, which knip matches as its own.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { horsCadre } from './consommateurs.mjs';
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

// The findings of knip's JSON report, one line each, of the given kinds (all by default); null
// when the report is not knip's.
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
        out.push(genre === 'files' ? `${i.file} : ${nom}` : `${i.file} : ${nom} — ${n}`);
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
// as `fichiers`; `erreur` is git's message when git fails. git lists every file its ignore rules
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
    const fichiers = r.stdout
      .split('\0')
      .filter(
        f =>
          CODE.test(f) &&
          !f.split('/').includes('node_modules') &&
          (isTestFile(f) || BANC.test(path.posix.basename(f)))
      );
    return { fichiers };
  } finally {
    rmSync(index, { recursive: true, force: true });
  }
}

// The settings of the dependency pass: <config> whose entries, top-level and in each workspace,
// are the test and bench files <fichiers> of the repository at <racine>, by absolute path, so
// that knip ties each file to the workspace that holds it. The `ignore` patterns, top-level and
// of each workspace, follow as negated entry patterns rooted at their directory: knip matches
// them as it matches its own patterns, and a file they target is not an entry.
function reglagesDependances(racine, config, fichiers) {
  const r = config ?? {};
  const sauf = (dossier, motifs) =>
    liste(motifs).map(m => `!${path.posix.join(racine, dossier === '.' ? '' : dossier, m)}`);
  const espaces = Object.entries(r.workspaces ?? {});
  const entry = [
    ...fichiers.map(f => path.posix.join(racine, f)),
    ...sauf('.', r.ignore),
    ...espaces.flatMap(([k, v]) => sauf(k, v.ignore)),
  ];
  if (!r.workspaces) {
    return { ...r, entry };
  }
  return {
    ...r,
    entry,
    workspaces: Object.fromEntries(espaces.map(([k, v]) => [k, { ...v, entry }])),
  };
}

// Runs knip on <config> (knip's defaults when null), restricted to <include> when given; the
// spawn result.
function knip(config, include) {
  const args = ['--no-install', 'knip', '--reporter', 'json', '--no-progress'];
  if (include) {
    args.push('--include', include);
  }
  let tmp = null;
  if (config) {
    tmp = mkdtempSync(path.join(tmpdir(), 'code-mort-'));
    const f = path.join(tmp, 'knip.json');
    writeFileSync(f, JSON.stringify(config));
    args.push('--config', f);
  }
  const r = spawnSync('npx', args, { encoding: 'utf8' });
  if (tmp) {
    rmSync(tmp, { recursive: true, force: true });
  }
  return r;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = process.cwd();
  const hors = reglages(racine);
  const fichierKnip = path.join(racine, 'knip.json');
  const config =
    hors ?? (existsSync(fichierKnip) ? JSON.parse(readFileSync(fichierKnip, 'utf8')) : null);
  const DEPS = ['dependencies', 'devDependencies'];
  const { fichiers, erreur } = fichiersTests(racine);
  if (erreur) {
    process.stderr.write(`⛔ CODE MORT — git n'a pas listé les fichiers de test :\n${erreur}\n`);
    process.exit(1);
  }
  const premier = knip(hors);
  const c1 = constats(premier.stdout ?? '');
  const second = fichiers.length
    ? knip(reglagesDependances(racine, config, fichiers), DEPS.join(','))
    : null;
  const c2 = second ? constats(second.stdout ?? '', DEPS) : null;
  let c = null;
  if (c1 && (c2 || !second)) {
    const deps = new Set(constats(premier.stdout, DEPS));
    const lus = c2 ? new Set(c2) : deps;
    c = c1.filter(l => !deps.has(l) || lus.has(l));
  }
  if (c === null) {
    const r = c1 ? second : premier;
    process.stderr.write(
      `⛔ CODE MORT — knip n'a rien mesuré :\n${(r.stderr || r.stdout || '').slice(0, 1000)}\n`
    );
    process.exit(1);
  }
  if (c.length) {
    process.stderr.write(
      `⛔ CODE MORT — ${c.length} constat(s) : chacun se supprime, ou sort par son nom dans knip.json avec sa raison.\n`
    );
    for (const l of c) {
      process.stderr.write(`  ${l}\n`);
    }
    process.exit(1);
  }
}
