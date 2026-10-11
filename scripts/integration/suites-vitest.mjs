#!/usr/bin/env node
// The suites of an integration for a project tested by Vitest: `integration:suites` in
// package.json. Its call is `--tous`, every test, or a non-empty list of components' directories
// (`packages/a src/parser`), the tests that cover their files (`vitest related`: the tests that
// import them, directly or not, and their own tests). A call without argument, or `--tous` with
// directories, is ambiguous: refused, exit 2, nothing runs. It writes the full name of each failing test, one per
// line, to the file named by ROUGES. Its exit code is Vitest's. Two categories do not run here,
// in either call: a time budget bench (`*.budget.test.*`, `*.budget.spec.*`), whose measures the
// day's load moves, and a night test (`*.nuit.test.*`, `*.nuit.spec.*`), too long for the day.
// The night (`scripts/nuit.sh`) plays both: the bench in `npm test`, the night test after it
// (scripts/vitest.nuit.config.mjs).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|svelte|vue)$/;
const fichiers = dir => {
  const out = [];
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', 'dist', 'docs'].includes(e.name) || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (CODE.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
};

const args = process.argv.slice(2);
const tous = args.includes('--tous');
if (args.length === 0 || (tous && args.length > 1)) {
  process.stderr.write(
    'usage: suites-vitest.mjs --tous | <dossier de composant>… (--tous seul, ou une liste non vide de dossiers)\n'
  );
  process.exit(2);
}
const composants = tous ? [] : args;
const tmp = mkdtempSync(path.join(tmpdir(), 'suites-'));
const rapport = path.join(tmp, 'rapport.json');
const HORS_DU_JOUR = ['budget', 'nuit'];
const portee = !tous
  ? [
      'related',
      '--run',
      '--passWithNoTests',
      ...composants
        .flatMap(fichiers)
        .filter(f => !new RegExp(`\\.(${HORS_DU_JOUR.join('|')})\\.(test|spec)\\.`).test(f)),
    ]
  : ['run', '--passWithNoTests'];
for (const c of HORS_DU_JOUR) portee.push(`--exclude=**/*.${c}.{test,spec}.?(c|m)[jt]s?(x)`);
const r = spawnSync('npx', ['vitest', ...portee, '--reporter=json', `--outputFile=${rapport}`], {
  stdio: ['ignore', 'inherit', 'inherit'],
});
const rouges = [];
if (existsSync(rapport)) {
  const { testResults = [] } = JSON.parse(readFileSync(rapport, 'utf8'));
  for (const fichier of testResults) {
    const rel = path.relative(process.cwd(), fichier.name);
    const tests = fichier.assertionResults ?? [];
    for (const t of tests) {
      if (t.status === 'failed') rouges.push(`${rel} > ${t.fullName}`);
    }
    // A file that fails without any failing test (a collect error) is named by itself.
    if (fichier.status === 'failed' && !tests.some(t => t.status === 'failed')) rouges.push(rel);
  }
}
if (process.env.ROUGES) writeFileSync(process.env.ROUGES, rouges.map(n => `${n}\n`).join(''));
rmSync(tmp, { recursive: true, force: true });
process.exit(r.status ?? 1);
