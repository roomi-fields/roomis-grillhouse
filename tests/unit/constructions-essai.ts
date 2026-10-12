import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { ouvrirTraces } from '../../scripts/integration/traces.mjs';

// The trial harness of the builds kept under a fingerprint (grillhouse-3uv.67).
//
// The interface these tests fix:
// - The one entry point that builds: `scripts/integration/constructions.mjs`, run from the
//   project's root (`node scripts/integration/constructions.mjs`), exit 0 when every build is green,
//   another code otherwise; FORCER=1 in its environment reads nothing from the store and writes
//   again what it builds. Each passage purges the store first (critères 6, 18), then orders,
//   restores or builds, and stores.
// - The store: `<git common dir>/grillhouse/constructions/<fingerprint>/`, the tree of the
//   component's `dist/` copied as it is (the entry's root is the content of `dist/`), its name the
//   fingerprint, 64 hexadecimal characters.
// - The fingerprint: `ouvrirTraces(racine).empreinteConstruction(dir)` of
//   scripts/integration/traces.mjs, <dir> a component's directory relative to the root, '' for the
//   root (the single build of a project without packages).
// - The traces of the suites keep their store `<git common dir>/grillhouse/suites/`.

const FRAME = path.resolve(__dirname, '../..');
export const POINT_D_ENTREE = path.join(FRAME, 'scripts/integration/constructions.mjs');
const SCRIPTS = path.join(FRAME, 'scripts');

// The build of a package of the trial, run in its directory (`node build.mjs <providers>`): it
// appends the package's directory name to <PRINCIPAL>.builds, refuses (exit 1) when a provider's
// dist/index.js is absent, writes dist/<name>.js for each file of src/ (its content followed by the
// providers' dist/index.js) and dist/bin/run.sh (mode 755). It fails, after writing, when
// CASSE names the package (or is « * »); with SANS_DIST naming it, it ends green without any dist/.
// It lasts LENT milliseconds more when LENT is set.
const BUILD_PAQUET = `import fs from 'node:fs';
import path from 'node:path';
const nom = path.basename(process.cwd());
const vise = v => v === nom || v === '*';
fs.appendFileSync(process.env.PRINCIPAL + '.builds', nom + '\\n');
if (process.env.LENT) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.LENT));
const fournis = process.argv.slice(2).map(b => {
  const f = path.join('..', b, 'dist', 'index.js');
  if (!fs.existsSync(f)) { console.error('manque ' + f); process.exit(1); }
  return fs.readFileSync(f, 'utf8');
});
fs.mkdirSync('dist/bin', { recursive: true });
for (const f of fs.readdirSync('src')) {
  fs.writeFileSync(path.join('dist', f.replace(/\\.ts$/, '.js')), fs.readFileSync(path.join('src', f), 'utf8') + fournis.join(''));
}
fs.writeFileSync('dist/bin/run.sh', '#!/bin/sh\\necho ' + nom + '\\n', { mode: 0o755 });
if (vise(process.env.CASSE)) process.exit(1);
if (vise(process.env.SANS_DIST)) fs.rmSync('dist', { recursive: true, force: true });
`;

// The build of a project without packages, at its root: « racine » appended to <PRINCIPAL>.builds,
// then every file under src/ written to dist/ under the same path (.ts → .js), with the same CASSE,
// SANS_DIST (naming « racine ») and LENT as the package build.
const BUILD_RACINE = `import fs from 'node:fs';
import path from 'node:path';
fs.appendFileSync(process.env.PRINCIPAL + '.builds', 'racine\\n');
if (process.env.LENT) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.LENT));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk('src')) {
  const cible = path.join('dist', path.relative('src', f).replace(/\\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  fs.writeFileSync(cible, fs.readFileSync(f, 'utf8'));
}
if (process.env.CASSE === 'racine') process.exit(1);
if (process.env.SANS_DIST === 'racine') fs.rmSync('dist', { recursive: true, force: true });
`;

// A build that only says it ran: « racine » appended to <PRINCIPAL>.builds, nothing written.
const BUILD_TEMOIN = `import fs from 'node:fs';
fs.appendFileSync(process.env.PRINCIPAL + '.builds', 'racine\\n');
`;

export type Fichiers = Record<string, string>;

// Every file under scripts/ of the frame, as files of a trial project: the entry point is reached
// from the project's root as a project of the frame reaches it.
export function scriptsDuCadre(): Fichiers {
  const out: Fichiers = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
      } else if (e.isFile()) {
        out[path.relative(FRAME, p)] = readFileSync(p, 'utf8');
      }
    }
  };
  walk(SCRIPTS);
  return out;
}

const paquet = (nom: string, build: string | null, extra: Record<string, unknown> = {}) =>
  JSON.stringify(
    { name: `@e/${nom}`, version: '1.0.0', ...(build ? { scripts: { build } } : {}), ...extra },
    null,
    2
  );

// The files of the packages project: packages/a; packages/b consumes a; packages/c consumes b
// (a through b); packages/d has no build; packages/e consumes nothing; src/f, a component under
// src/ with a package.json and a build, consumes nothing. packages/a lists @e/c in its
// devDependencies (a cycle if they counted). The root's build only says it ran (BUILD_TEMOIN);
// outils/ is declared read (grillhouse.lusParLesSuites).
export function fichiersPaquets(racineBuild = 'node racine-build.mjs'): Fichiers {
  return {
    'package.json': JSON.stringify(
      {
        name: 'essai',
        private: true,
        scripts: { build: racineBuild },
        grillhouse: { lusParLesSuites: ['outils'] },
      },
      null,
      2
    ),
    'package-lock.json': '{"lockfileVersion":3}\n',
    '.gitignore': 'node_modules\ndist\n.claude/worktrees/\n',
    'racine-build.mjs': BUILD_TEMOIN,
    'outils/config.json': '{"v":1}\n',
    'autre/notes.txt': 'notes\n',
    'packages/a/package.json': paquet('a', 'node build.mjs', {
      devDependencies: { '@e/c': '1.0.0' },
    }),
    'packages/a/build.mjs': BUILD_PAQUET,
    'packages/a/src/index.ts': 'export const a = 1;\n',
    'packages/b/package.json': paquet('b', 'node build.mjs a'),
    'packages/b/build.mjs': BUILD_PAQUET,
    'packages/b/src/index.ts': "import { a } from '@e/a';\nexport const b = a + 1;\n",
    'packages/c/package.json': paquet('c', 'node build.mjs b'),
    'packages/c/build.mjs': BUILD_PAQUET,
    'packages/c/src/index.ts': "import { b } from '@e/b';\nexport const c = b + 1;\n",
    'packages/d/package.json': paquet('d', null),
    'packages/d/src/index.ts': 'export const d = 4;\n',
    'packages/e/package.json': paquet('e', 'node build.mjs'),
    'packages/e/build.mjs': BUILD_PAQUET,
    'packages/e/src/index.ts': 'export const e = 5;\n',
    'src/f/package.json': paquet('f', 'node build.mjs'),
    'src/f/build.mjs': BUILD_PAQUET,
    'src/f/src/index.ts': 'export const f = 6;\n',
  };
}

// The packages that have a build, by directory.
export const CONSTRUITS = ['packages/a', 'packages/b', 'packages/c', 'packages/e', 'src/f'];

// The files of a project without packages (the frame's own case): src/a and src/b are components
// without a package.json; src/index.ts lies outside every component; the root's build is
// BUILD_RACINE, its output dist/.
export function fichiersUnique(): Fichiers {
  return {
    'package.json': JSON.stringify(
      { name: 'essai', private: true, scripts: { build: 'node build.mjs' } },
      null,
      2
    ),
    'package-lock.json': '{"lockfileVersion":3}\n',
    '.gitignore': 'node_modules\ndist\n.claude/worktrees/\n',
    'build.mjs': BUILD_RACINE,
    'src/index.ts': 'export const index = 0;\n',
    'src/a/index.ts': 'export const a = 1;\n',
    'src/b/index.ts': "import { a } from '../a/index';\nexport const b = a + 1;\n",
  };
}

// A git repository under <essais> holding <fichiers> and the frame's scripts, committed on main.
export function depot(essais: string, fichiers: Fichiers) {
  const repo = mkdtempSync(path.join(essais, 'depot-'));
  const gitDans = (dir: string, ...a: string[]) =>
    execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    });
  const git = (...a: string[]) => gitDans(repo, ...a);
  const ecrire = (rel: string, contenu: string, dir = repo) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), contenu);
  };
  for (const [rel, contenu] of Object.entries({ ...scriptsDuCadre(), ...fichiers })) {
    ecrire(rel, contenu);
  }
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  // Commits <changes> on the current branch of <dir>.
  const commiter = (changes: Fichiers, dir = repo, message = 'change') => {
    for (const [rel, contenu] of Object.entries(changes)) {
      ecrire(rel, contenu, dir);
    }
    gitDans(dir, 'add', '.');
    gitDans(dir, 'commit', '-q', '-m', message);
    return gitDans(dir, 'rev-parse', 'HEAD').trim();
  };
  // A new copy of the repository (a worktree), detached on <ref>.
  let n = 0;
  const copie = (ref = 'HEAD') => {
    const dir = path.join(repo, '.claude/worktrees', `copie-${++n}`);
    git('worktree', 'add', '-q', '--detach', dir, ref);
    return dir;
  };
  const env = (extra: Record<string, string> = {}) => {
    const e: Record<string, string | undefined> = { ...process.env, PRINCIPAL: repo, ...extra };
    if (!('FORCER' in extra)) {
      delete e.FORCER;
    }
    return e;
  };
  // One passage of the entry point in <dir> (the repository by default).
  const passage = (dir = repo, extra: Record<string, string> = {}) =>
    spawnSync('node', [POINT_D_ENTREE], {
      cwd: dir,
      encoding: 'utf8',
      env: env(extra),
      timeout: 60_000,
    });
  // The same, not waited for.
  const passageEnFond = (dir: string, extra: Record<string, string> = {}) =>
    new Promise<{ status: number | null; sortie: string }>(resolve => {
      const p = spawn('node', [POINT_D_ENTREE], { cwd: dir, env: env(extra) });
      let sortie = '';
      p.stdout.on('data', d => (sortie += d));
      p.stderr.on('data', d => (sortie += d));
      p.on('close', status => resolve({ status, sortie }));
    });
  const lireF = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  // The builds run so far, one name per build (a package's directory name, or « racine »).
  const builds = () => lireF(`${repo}.builds`).split('\n').filter(Boolean);
  // The builds run by <faire>.
  const buildsDe = (faire: () => unknown) => {
    const avant = builds().length;
    faire();
    return builds().slice(avant);
  };
  const commun = path.join(repo, '.git');
  const magasin = path.join(commun, 'grillhouse', 'constructions');
  const suites = path.join(commun, 'grillhouse', 'suites');
  // The fingerprint of the build of <comp> ('' for the root) in <dir>.
  const empreinte = (comp: string, dir = repo) =>
    (
      ouvrirTraces(dir) as unknown as { empreinteConstruction: (d: string) => string }
    ).empreinteConstruction(comp);
  // The store entry of the build of <comp> as <dir> holds it.
  const entree = (comp: string, dir = repo) => path.join(magasin, empreinte(comp, dir));
  const entrees = () => (existsSync(magasin) ? readdirSync(magasin).sort() : []);
  return {
    repo,
    git,
    gitDans,
    ecrire,
    commiter,
    copie,
    passage,
    passageEnFond,
    builds,
    buildsDe,
    commun,
    magasin,
    suites,
    empreinte,
    entree,
    entrees,
  };
}

export type Depot = ReturnType<typeof depot>;

// The tree under <dir>: each file by its path, content and mode bits, each directory by its path;
// null when <dir> is absent.
export function arbre(dir: string): Record<string, string> | null {
  if (!existsSync(dir)) {
    return null;
  }
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const rel = path.relative(dir, p);
      if (e.isDirectory()) {
        out[`${rel}/`] = 'dossier';
        walk(p);
      } else {
        const mode = (statSync(p).mode & 0o777).toString(8);
        out[rel] = `${mode}:${readFileSync(p, 'utf8')}`;
      }
    }
  };
  walk(dir);
  return out;
}

// The build of a project without packages whose output holds links and empty folders (critère 24):
// « racine » appended to <PRINCIPAL>.builds, then dist/index.js, dist/lien.js a relative link to
// index.js, dist/bin/run.sh (mode 755), dist/outils a relative link to the folder bin, and two empty
// folders, dist/vide and dist/profond/vide.
const BUILD_LIENS = `import fs from 'node:fs';
fs.appendFileSync(process.env.PRINCIPAL + '.builds', 'racine\\n');
fs.mkdirSync('dist/bin', { recursive: true });
fs.mkdirSync('dist/vide', { recursive: true });
fs.mkdirSync('dist/profond/vide', { recursive: true });
fs.writeFileSync('dist/index.js', fs.readFileSync('src/index.ts', 'utf8'));
fs.writeFileSync('dist/bin/run.sh', '#!/bin/sh\\necho liens\\n', { mode: 0o755 });
fs.symlinkSync('index.js', 'dist/lien.js');
fs.symlinkSync('bin', 'dist/outils');
`;

// The files of a project without packages whose single build writes links and empty folders.
export function fichiersLiens(): Fichiers {
  return { ...fichiersUnique(), 'build.mjs': BUILD_LIENS };
}

// A project outside any git repository under <essais>, holding <fichiers> and the frame's scripts;
// its passages and builds read as those of `depot`.
export function horsGit(essais: string, fichiers: Fichiers) {
  const racine = mkdtempSync(path.join(essais, 'hors-git-'));
  for (const [rel, contenu] of Object.entries({ ...scriptsDuCadre(), ...fichiers })) {
    mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
    writeFileSync(path.join(racine, rel), contenu);
  }
  const passage = () =>
    spawnSync('node', [POINT_D_ENTREE], {
      cwd: racine,
      encoding: 'utf8',
      env: { ...process.env, PRINCIPAL: racine, FORCER: '' },
      timeout: 60_000,
    });
  const lireF = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  const builds = () => lireF(`${racine}.builds`).split('\n').filter(Boolean);
  return { racine, passage, builds };
}

// The tree under <dir> as `arbre` reads it, each link kept as a link: a link by its target as
// written (`lien:<target>`), never followed; null when <dir> is absent.
export function arbreExact(dir: string): Record<string, string> | null {
  if (!existsSync(dir)) {
    return null;
  }
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const rel = path.relative(dir, p);
      if (e.isSymbolicLink()) {
        out[rel] = `lien:${readlinkSync(p)}`;
      } else if (e.isDirectory()) {
        out[`${rel}/`] = 'dossier';
        walk(p);
      } else {
        const mode = (statSync(p).mode & 0o777).toString(8);
        out[rel] = `${mode}:${readFileSync(p, 'utf8')}`;
      }
    }
  };
  walk(dir);
  return out;
}

// Every folder under <dir> made readable again (mode 755), so that a trial that took the rights off
// an entry can be removed; files and links are left as they are.
export function rendreLisible(dir: string) {
  if (!existsSync(dir)) {
    return;
  }
  const walk = (d: string) => {
    chmodSync(d, 0o755);
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        walk(path.join(d, e.name));
      }
    }
  };
  try {
    walk(dir);
  } catch {
    // a folder gone while it is walked
  }
}
