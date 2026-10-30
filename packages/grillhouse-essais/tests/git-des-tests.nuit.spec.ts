// Ticket grillhouse-3uv.72.1: the suite sets git once, by the environment of its tests, as git's
// own test suite does (t/test-lib.sh): the automatic maintenance and garbage collection are off
// (maintenance.auto=false, gc.auto=0) for every git a test launches, day and night. The chain,
// played at night: a script that launches git in its turn, and a night test run by Vitest under
// the night's configuration alone, each in a repository of trial. The setting read by a git of the
// test is the day's (packages/grillhouse/tests/unit/git-des-tests.spec.ts).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lierDependances } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CADRE, RACINE } from './cadre.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'git-des-tests-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = RACINE;
const CONFIG_NUIT = path.join(CADRE, 'scripts/langages/typescript/vitest.nuit.config.mjs');
const LONG = 60_000;
const REGLAGE = { 'maintenance.auto': 'false', 'gc.auto': '0' };
const IDENTITE = ['-c', 'user.name=t', '-c', 'user.email=t@t'];

// A trial repository with one commit, built with the environment of the test.
function depot() {
  const repo = mkdtempSync(path.join(ESSAIS, 'depot-'));
  execFileSync('git', ['init', '-q', repo]);
  writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  execFileSync('git', ['-C', repo, 'add', 'a.txt']);
  execFileSync('git', ['-C', repo, ...IDENTITE, 'commit', '-qm', 'a']);
  return repo;
}

// The environment of the test without the settings it passes to git: what a process outside the
// suite has.
const sansGitConfig = (env: NodeJS.ProcessEnv = process.env) =>
  Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('GIT_CONFIG')));

describe('3uv.72.1 critère 1 : a git launched by a script under test runs with the automatic maintenance off', () => {
  it('critère 1 : a script under test that launches git in its turn hands it the setting', () => {
    const repo = depot();
    const r = spawnSync(
      'bash',
      [
        '-c',
        'git -C "$1" config --get maintenance.auto; git -C "$1" config --get gc.auto',
        '-',
        repo,
      ],
      { encoding: 'utf8' }
    );
    expect(r.stdout.trim().split('\n')).toEqual(['false', '0']);
  });
});

describe('3uv.72.1 critère 1 : the night configuration carries the same setting', () => {
  it(
    'critère 1 : a git launched by a night test, under scripts/vitest.nuit.config.mjs alone, reads maintenance.auto=false and gc.auto=0',
    () => {
      const racine = mkdtempSync(path.join(ESSAIS, 'nuit-'));
      lierDependances(racine, DEPOT);
      const sortie = path.join(racine, 'lu.json');
      writeFileSync(
        path.join(racine, 'sonde.nuit.test.mjs'),
        `import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test } from 'vitest';
const lire = cle => {
  const r = spawnSync('git', ['config', '--get', cle], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};
test('sonde', () => {
  writeFileSync(${JSON.stringify(sortie)}, JSON.stringify({
    'maintenance.auto': lire('maintenance.auto'),
    'gc.auto': lire('gc.auto'),
  }));
});
`
      );
      // The night as scripts/nuit.sh plays it: its configuration alone, from the root of the copy,
      // on an environment that carries no git setting of the day suite.
      const env: NodeJS.ProcessEnv = {};
      for (const [k, v] of Object.entries(sansGitConfig())) {
        if (!k.startsWith('VITEST') && k !== 'NODE_OPTIONS') {
          env[k] = v;
        }
      }
      const r = spawnSync(
        path.join(DEPOT, 'node_modules/.bin/vitest'),
        ['run', '--root', racine, '--config', CONFIG_NUIT],
        { cwd: racine, encoding: 'utf8', env, timeout: LONG }
      );
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(JSON.parse(readFileSync(sortie, 'utf8'))).toEqual(REGLAGE);
    },
    LONG
  );
});
