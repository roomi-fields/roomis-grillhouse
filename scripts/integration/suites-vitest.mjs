#!/usr/bin/env node
// The suites of an integration for a project tested by Vitest: `integration:suites` in
// package.json. It runs the tests of the packages given as arguments (`packages/<x>`), or every
// test without argument, and writes the full name of each failing test, one per line, to the
// file named by ROUGES. Its exit code is Vitest's.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = mkdtempSync(path.join(tmpdir(), 'suites-'));
const rapport = path.join(tmp, 'rapport.json');
const r = spawnSync(
  'npx',
  ['vitest', 'run', '--reporter=json', `--outputFile=${rapport}`, ...process.argv.slice(2)],
  { stdio: ['ignore', 'inherit', 'inherit'] }
);
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
