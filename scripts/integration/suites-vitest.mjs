#!/usr/bin/env node
// The suites of an integration for a project tested by Vitest: `integration:suites` in
// package.json. Given components' directories (`packages/a src/parser`), it runs the tests that
// cover their files (`vitest related`: the tests that import them, directly or not, and their own
// tests); without argument, every test. It writes the full name of each failing test, one per
// line, to the file named by ROUGES. Its exit code is Vitest's. A time budget bench
// (`*.budget.test.*`, `*.budget.spec.*`) does not run here: the day's load moves its measures,
// and the night (`scripts/nuit.sh`, every test) judges it.
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

const composants = process.argv.slice(2);
const tmp = mkdtempSync(path.join(tmpdir(), 'suites-'));
const rapport = path.join(tmp, 'rapport.json');
const BUDGET = '**/*.budget.{test,spec}.?(c|m)[jt]s?(x)';
const portee = composants.length
  ? [
      'related',
      '--run',
      '--passWithNoTests',
      ...composants.flatMap(fichiers).filter(f => !/\.budget\.(test|spec)\./.test(f)),
    ]
  : ['run', '--passWithNoTests'];
portee.push(`--exclude=${BUDGET}`);
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
