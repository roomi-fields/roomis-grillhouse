import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

// The trial harness of the tests kept by test file (grillhouse-3uv.75.1): a git repository whose
// frame is this repository's (its scripts/, its day configuration of Vitest, its test command
// `scripts.test` read in its package.json), its dependencies linked to this repository's, and
// test files played by the real Vitest. Each test file appends « <name> <pid> » to TRACE when it
// runs: the files a run played are read there, and the pid tells the call of Vitest that played
// them (one process per call, the frame's configuration running its files in threads).

export const DEPOT = path.resolve(__dirname, '../..');

// The test command of the frame: `scripts.test` of this repository's package.json.
const testDuCadre = () =>
  (
    JSON.parse(readFileSync(path.join(DEPOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    }
  ).scripts.test;

// The dependencies of the repository, linked one by one so that Vitest writes its cache in the
// project of trial.
export function lierDependances(repo: string) {
  mkdirSync(path.join(repo, 'node_modules'), { recursive: true });
  for (const e of readdirSync(path.join(DEPOT, 'node_modules'))) {
    if (e !== '.vite' && e !== '.vitest') {
      symlinkSync(path.join(DEPOT, 'node_modules', e), path.join(repo, 'node_modules', e));
    }
  }
}

// The source of a test file named <nom>: it imports <importe> (paths relative to the file), then
// one test named <nom> that appends « <nom> <pid> » to TRACE, prints « sortie de <nom> », and
// fails with « rouge de <nom> » when `rouge` is true or when ROUGIR (comma-separated names, read
// at the run, outside every fingerprint) names it. When ARRETER names it, it kills the process
// of Vitest by SIGKILL once its line is written.
export function essai(nom: string, o: { importe?: string[]; rouge?: boolean } = {}) {
  const imports = (o.importe ?? []).map(i => `import '${i}';\n`).join('');
  return (
    `import { appendFileSync } from 'node:fs';\nimport { test } from 'vitest';\n${imports}` +
    `test('${nom}', () => {\n` +
    `  appendFileSync(process.env.TRACE ?? '/dev/null', '${nom} ' + process.pid + '\\n');\n` +
    `  console.log('sortie de ${nom}');\n` +
    `  if (process.env.ARRETER === '${nom}') process.kill(process.pid, 'SIGKILL');\n` +
    `  if (${o.rouge === true} || (process.env.ROUGIR ?? '').split(',').includes('${nom}')) {\n` +
    `    throw new Error('rouge de ${nom}');\n  }\n});\n`
  );
}

// The test files of the trial and the name each writes to TRACE.
export const FICHIERS = {
  a: 'src/a/a.spec.ts', // in src/a, imports src/a
  b: 'src/b/b.spec.ts', // in src/b, imports src/b (which imports src/a)
  direct: 'tests/direct.spec.ts', // outside every component, imports src/a
  ricochet: 'tests/ricochet.spec.ts', // outside every component, imports src/b, so src/a by ricochet
  seul: 'tests/seul.spec.ts', // outside every component, imports the helper tests/aide.ts
  libre: 'tests/libre.spec.ts', // imports nothing
} as const;
export type Nom = keyof typeof FICHIERS;
// Every test file of the day, by name.
export const JOUR: Nom[] = ['a', 'b', 'direct', 'ricochet', 'seul', 'libre'];
// The time budget bench and the night test of the trial, each a test file like the others.
const BANC = 'tests/temps.budget.test.ts';
const NUIT = 'tests/long.nuit.test.ts';

const PACKAGE_LOCK = `${JSON.stringify(
  {
    name: 'essai',
    lockfileVersion: 3,
    requires: true,
    packages: { '': { name: 'essai' } },
  },
  null,
  2
)}\n`;

// The project of trial, a git repository with one commit: src/a; src/b imports src/a; src/c holds
// a code file no test imports; the test files of FICHIERS, the bench BANC and the night test NUIT;
// corpus/donnees.txt, a path the project declares read by its suites (`grillhouse.lusParLesSuites`:
// scripts and corpus, not the configuration of Vitest); autre/notes.txt, a file nothing imports
// and nothing declares; the lock file package-lock.json. <pkg> is merged into package.json,
// <enPlus> adds or replaces files (null removes one) before the commit.
export function projetCache(
  essais: string,
  o: { pkg?: Record<string, unknown>; enPlus?: Record<string, string | null> } = {}
) {
  const repo = mkdtempSync(path.join(essais, 'projet-'));
  const bin = mkdtempSync(path.join(essais, 'bin-'));
  const ecrire = (rel: string, contenu: string) => {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    writeFileSync(path.join(repo, rel), contenu);
  };
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    });
  const fichiers: Record<string, string | null> = {
    'package.json': JSON.stringify(
      {
        name: 'essai',
        private: true,
        type: 'module',
        scripts: { test: testDuCadre() },
        grillhouse: { lusParLesSuites: ['scripts', 'corpus'] },
        ...o.pkg,
      },
      null,
      2
    ),
    'package-lock.json': PACKAGE_LOCK,
    '.gitignore': 'node_modules\ndist\n.claude/worktrees/\n',
    'vitest.config.ts': readFileSync(path.join(DEPOT, 'vitest.config.ts'), 'utf8'),
    'src/a/index.ts': 'export const a = 1;\n',
    'src/b/index.ts': "import { a } from '../a/index';\nexport const b = a + 1;\n",
    'src/c/orphelin.ts': 'export const c = 3;\n',
    'tests/aide.ts': 'export const aide = 1;\n',
    [FICHIERS.a]: essai('a', { importe: ['./index'] }),
    [FICHIERS.b]: essai('b', { importe: ['./index'] }),
    [FICHIERS.direct]: essai('direct', { importe: ['../src/a/index'] }),
    [FICHIERS.ricochet]: essai('ricochet', { importe: ['../src/b/index'] }),
    [FICHIERS.seul]: essai('seul', { importe: ['./aide'] }),
    [FICHIERS.libre]: essai('libre'),
    [BANC]: essai('banc'),
    [NUIT]: essai('nuit'),
    'corpus/donnees.txt': 'données\n',
    'autre/notes.txt': 'notes\n',
    ...o.enPlus,
  };
  cpSync(path.join(DEPOT, 'scripts'), path.join(repo, 'scripts'), { recursive: true });
  for (const [rel, contenu] of Object.entries(fichiers)) {
    if (contenu !== null) {
      ecrire(rel, contenu);
    }
  }
  lierDependances(repo);
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-q', '-m', 'base');

  const trace = path.join(bin, 'trace');
  const lignes = () =>
    existsSync(trace) ? readFileSync(trace, 'utf8').split('\n').filter(Boolean) : [];
  // The environment of a run: this process's, without what Vitest set for itself.
  const envDeBase = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
  );
  let n = 0;
  // One `npm test [-- <args>]` in <dans> (the repository by default): its status, its output, the
  // failing tests it wrote to ROUGES, the names of the test files it played (in the order they
  // ran) and the pids of the calls of Vitest that played them.
  const npmTest = (args: string[] = [], env: Record<string, string> = {}, dans: string = repo) => {
    const avant = lignes().length;
    const rouges = path.join(bin, `rouges-${++n}`);
    const r = spawnSync('npm', ['test', ...(args.length > 0 ? ['--', ...args] : [])], {
      cwd: dans,
      encoding: 'utf8',
      env: { ...envDeBase, TRACE: trace, ROUGES: rouges, ...env },
      timeout: 120_000,
    });
    const nouvelles = lignes().slice(avant);
    return {
      status: r.status,
      signal: r.signal,
      stdout: r.stdout ?? '',
      stderr: r.stderr ?? '',
      sortie: `${r.stdout ?? ''}\n${r.stderr ?? ''}`,
      rouges: existsSync(rouges)
        ? readFileSync(rouges, 'utf8')
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean)
        : [],
      joues: nouvelles.map(l => l.split(' ')[0]),
      pids: [...new Set(nouvelles.map(l => l.split(' ')[1]))],
    };
  };
  // The store of the traces: <git common dir>/grillhouse/suites/, its file names (none when absent).
  const magasin = path.join(repo, '.git', 'grillhouse', 'suites');
  const traces = () => (existsSync(magasin) ? readdirSync(magasin).sort() : []);
  return { repo, bin, git, ecrire, npmTest, magasin, traces, env: envDeBase };
}
export type ProjetCache = ReturnType<typeof projetCache>;

// The names of <noms>, sorted: what a run played, compared without its order.
export const tries = (noms: string[]) => [...noms].sort();
// A short view of a run, for the message of a failed expectation.
export const voir = (r: { status: number | null; sortie: string; joues: string[] }) =>
  `status ${r.status}, joués [${r.joues.join(', ')}]\n${r.sortie.slice(-2500)}`;
