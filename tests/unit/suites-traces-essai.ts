import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

// The trial harness of the suites' traces (grillhouse-3uv.65): a fake `npx` that stands in for
// Vitest, and a project whose components consume one another, played by the frame's suites
// command (scripts/integration/suites-vitest.mjs, `integration:suites`).

export const ADAPTATEUR = path.resolve(__dirname, '../../scripts/integration/suites-vitest.mjs');

// One test file of the plan: <fichier> relative to the project root, in the component <comp>
// ('' for a test file outside every component: the root suite), lasting <duree> seconds; each
// test is red when `rouge` is true, or when the file `si` (relative to the directory the suites
// run in) exists. A file with `signal` kills the run by SIGTERM. A root test file reaches the
// components named in `importe` (what `vitest related` follows). A file with `present` is
// reported only while it exists in the directory the suites run in (a file a lot adds). A file
// with `sansDuree` is reported without its start and end times (never measured). A file with
// `echecSansTest` makes the call exit 1 though no test is reported red (Vitest failing outside any
// test: an unhandled error, a setup that throws).
export interface FichierDuPlan {
  fichier: string;
  comp: string;
  duree?: number;
  signal?: boolean;
  importe?: string[];
  present?: boolean;
  sansDuree?: boolean;
  echecSansTest?: boolean;
  tests: { nom: string; rouge?: boolean; si?: string }[];
}

// One call of the fake npx: its working directory, its arguments (after `npx`), and the test
// files of the plan it ran, relative to the project root.
export interface Appel {
  cwd: string;
  args: string[];
  choisis: string[];
}

// The fake npx: it writes the JSON report of Vitest (`--outputFile=`) for the files of
// <bin>/plan.json it selects, and appends { cwd, args, choisis } as a JSON line to <bin>/appels-npx:
// - `vitest run [filters]`: every file of the plan, or those whose path holds one of the filters;
// - `vitest related <files>`: the test files given, the files whose component holds one of the
//   files given, and the root test files that reach that component (`importe`);
// a positional argument may be absolute or relative to the working directory. A file matched by an
// `--exclude=` glob, or whose base name an `--exclude=` pattern holds, is left out. It exits 1 when
// a test it reports is red or a selected file has `echecSansTest`, 0 otherwise; a selected file with `signal` kills it by SIGTERM, once
// the call is recorded.
const FAUX_NPX = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const ici = path.dirname(fs.realpathSync(process.argv[1]));
const args = process.argv.slice(2);
const planF = path.join(ici, 'plan.json');
const plan = fs.existsSync(planF) ? JSON.parse(fs.readFileSync(planF, 'utf8')) : [];
const sortie = args.find(a => a.startsWith('--outputFile='));
const exclus = args.filter(a => a.startsWith('--exclude=')).map(a => a.slice(10));
const positionnels = args
  .slice(2)
  .filter(a => !a.startsWith('-'))
  .map(a => path.relative(process.cwd(), path.resolve(a)));
const dans = (p, comp) => comp !== '' && (p === comp || p.startsWith(comp + '/'));
const choisis = plan.filter(f => {
  if (f.present && !fs.existsSync(f.fichier)) return false;
  if (exclus.some(e => path.matchesGlob(f.fichier, e) || e.includes(path.basename(f.fichier)))) return false;
  if (args[1] === 'run') return positionnels.length === 0 || positionnels.some(p => f.fichier.includes(p));
  if (args[1] !== 'related') return false;
  return positionnels.some(
    p => p === f.fichier || dans(p, f.comp) || (f.importe ?? []).some(c => dans(p, c))
  );
});
fs.appendFileSync(
  path.join(ici, 'appels-npx'),
  JSON.stringify({ cwd: process.cwd(), args, choisis: choisis.map(f => f.fichier) }) + '\\n'
);
if (choisis.some(f => f.signal)) process.kill(process.pid, 'SIGTERM');
let rouge = false;
const testResults = choisis.map(f => {
  const assertionResults = f.tests.map(t => {
    const r = t.rouge === true || (t.si !== undefined && fs.existsSync(t.si));
    if (r) rouge = true;
    return { fullName: t.nom, status: r ? 'failed' : 'passed' };
  });
  const temps = f.sansDuree
    ? {}
    : { startTime: 1000, endTime: 1000 + Math.round((f.duree ?? 0.1) * 1000) };
  return {
    name: path.join(process.cwd(), f.fichier),
    status: assertionResults.some(t => t.status === 'failed') ? 'failed' : 'passed',
    ...temps,
    assertionResults,
  };
});
if (sortie) fs.writeFileSync(sortie.slice(13), JSON.stringify({ testResults }));
const echec = choisis.some(f => f.echecSansTest);
setTimeout(() => process.exit(rouge || echec ? 1 : 0), 0);
`;

// Writes the fake npx into <bin>, and returns its plan setter and its calls.
export function fauxNpx(bin: string) {
  writeFileSync(path.join(bin, 'npx'), FAUX_NPX, { mode: 0o755 });
  const fichierAppels = path.join(bin, 'appels-npx');
  const planifier = (plan: FichierDuPlan[]) =>
    writeFileSync(path.join(bin, 'plan.json'), JSON.stringify(plan));
  const appels = (): Appel[] =>
    existsSync(fichierAppels)
      ? readFileSync(fichierAppels, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map(l => JSON.parse(l) as Appel)
      : [];
  return { planifier, appels };
}

// True when the call ran a test file of the component <comp>.
export const joue = (a: Appel, comp: string) => a.choisis.some(f => f.startsWith(`${comp}/`));
// The test files <appels> ran, each once, sorted.
export const fichiersJoues = (appels: Appel[]) =>
  [...new Set(appels.flatMap(a => a.choisis))].sort();
// The `--exclude=` patterns of a call.
export const exclusions = (a: Appel) =>
  a.args.filter(x => x.startsWith('--exclude=')).map(x => x.slice(10));

// The project of the trial, a git repository: src/a; src/b consumes a; src/c consumes b; src/d
// consumes nothing; src/e and src/f consume each other (a cycle). Each component has an index and
// a test file; src/b has a slow test file (30 s) and a fast one. Outside every component, the root
// suite: tests/r.spec.ts, which reaches src/d, and tests/s.spec.ts, which reaches no component;
// tests/aide.ts is a helper, autre/notes.txt a file no suite reads. <pkg> is merged into
// package.json.
export function projetTraces(essais: string, pkg: Record<string, unknown> = {}) {
  const repo = mkdtempSync(path.join(essais, 'projet-'));
  const bin = mkdtempSync(path.join(essais, 'bin-'));
  const npx = fauxNpx(bin);
  const ecrire = (rel: string, contenu: string) => {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    writeFileSync(path.join(repo, rel), contenu);
  };
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    });
  ecrire('package.json', JSON.stringify({ name: 'essai', private: true, ...pkg }, null, 2));
  ecrire('.gitignore', 'node_modules\ndist\n.claude/worktrees/\n');
  ecrire('src/a/index.ts', 'export const a = 1;\n');
  ecrire('src/b/index.ts', "import { a } from '../a/index';\nexport const b = a + 1;\n");
  ecrire('src/c/index.ts', "import { b } from '../b/index';\nexport const c = b + 1;\n");
  ecrire('src/d/index.ts', 'export const d = 4;\n');
  ecrire('src/e/index.ts', "import { f } from '../f/index';\nexport const e = () => f;\n");
  ecrire('src/f/index.ts', "import { e } from '../e/index';\nexport const f = () => e;\n");
  for (const c of ['a', 'b', 'c', 'd', 'e', 'f']) {
    ecrire(`src/${c}/${c}.spec.ts`, `// ${c}\n`);
  }
  ecrire('src/b/lent.spec.ts', '// lent\n');
  ecrire('src/b/rapide.spec.ts', '// rapide\n');
  ecrire('tests/aide.ts', 'export const aide = 1;\n');
  ecrire('tests/r.spec.ts', "import { d } from '../src/d/index';\n");
  ecrire('tests/s.spec.ts', '// s\n');
  ecrire('autre/notes.txt', 'notes\n');
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  // Every test file green, src/b's slow file at 30 s.
  const PLAN: FichierDuPlan[] = [
    ...['a', 'c', 'd', 'e', 'f'].map(c => ({
      fichier: `src/${c}/${c}.spec.ts`,
      comp: `src/${c}`,
      tests: [{ nom: `${c} ok` }],
    })),
    { fichier: 'src/b/b.spec.ts', comp: 'src/b', tests: [{ nom: 'b ok' }] },
    { fichier: 'src/b/lent.spec.ts', comp: 'src/b', duree: 30, tests: [{ nom: 'lent ok' }] },
    { fichier: 'src/b/rapide.spec.ts', comp: 'src/b', duree: 0.5, tests: [{ nom: 'rapide ok' }] },
    { fichier: 'tests/r.spec.ts', comp: '', importe: ['src/d'], tests: [{ nom: 'r ok' }] },
    { fichier: 'tests/s.spec.ts', comp: '', tests: [{ nom: 's ok' }] },
  ];
  npx.planifier(PLAN);

  let n = 0;
  // One run of the suites command in the project (or in <dans>, a copy of it): its status, its
  // output, the failing tests it wrote to ROUGES, and the npx calls it made.
  const suites = (args: string[], env: Record<string, string> = {}, dans = repo) => {
    const avant = npx.appels().length;
    const rouges = path.join(bin, `rouges-${++n}`);
    const r = spawnSync('node', [ADAPTATEUR, ...args], {
      cwd: dans,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ROUGES: rouges, ...env },
      timeout: 60_000,
    });
    const noms = existsSync(rouges)
      ? readFileSync(rouges, 'utf8')
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean)
      : [];
    return { ...r, rouges: noms, appels: npx.appels().slice(avant) };
  };
  return { repo, bin, git, ecrire, suites, PLAN, ...npx };
}

// Every file under <dir>, recursively, relative to it: the files a run leaves behind are the
// difference of two such lists.
export function tousLesFichiers(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
      } else if (e.isFile()) {
        out.push(path.relative(dir, p));
      }
    }
  };
  walk(dir);
  return out;
}
