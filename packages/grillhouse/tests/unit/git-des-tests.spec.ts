// Ticket grillhouse-3uv.72.1: the suite sets git once, by the environment of its tests, as git's
// own test suite does (t/test-lib.sh): the automatic maintenance and garbage collection are off
// (maintenance.auto=false, gc.auto=0) for every git a test launches, day and night, so the removal
// of a trial repository never crosses a maintenance git detached in the background. The setting
// lives in the environment only: a test reads it from the command-line scope, a git outside the
// suite does not read it, and no code or configuration file outside the tests carries it but the
// frame's base Vitest configuration, its one address, which the day and night configurations
// read. No test reads a configuration file the suite does not own (the user's, or the real
// repository's).
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { configGit } from '../config-git.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'git-des-tests-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = path.resolve(__dirname, '../../../..');
const CONFIG_NUIT = path.join(DEPOT, 'packages/grillhouse/scripts/vitest.nuit.config.mjs');
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

// What git reads for <cle> in <dir>, under <env> (the environment of the test when absent): its
// value, or null when it reads none.
function lire(dir: string, cle: string, env?: NodeJS.ProcessEnv) {
  const r = spawnSync('git', ['-C', dir, 'config', '--get', cle], { encoding: 'utf8', env });
  return r.status === 0 ? r.stdout.trim() : null;
}
const reglageLu = (dir: string, env?: NodeJS.ProcessEnv) =>
  Object.fromEntries(Object.keys(REGLAGE).map(cle => [cle, lire(dir, cle, env)]));

// The environment of the test without the settings it passes to git: what a process outside the
// suite has.
const sansGitConfig = (env: NodeJS.ProcessEnv = process.env) =>
  Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('GIT_CONFIG')));

describe('3uv.72.1 critères 1 et 2 : a git launched by a day test runs with the automatic maintenance off', () => {
  it('critère 2 : a git on the environment the test inherits reads maintenance.auto=false and gc.auto=0', () => {
    const repo = depot();
    expect(reglageLu(repo)).toEqual(REGLAGE);
    // Outside any repository too: the setting does not depend on the repository.
    expect(reglageLu(ESSAIS)).toEqual(REGLAGE);
  });

  it('critère 1 : a git on an environment that extends the test’s ({ ...process.env, … }) reads it', () => {
    const repo = depot();
    expect(reglageLu(repo, { ...process.env, PATH: process.env.PATH, HOME: ESSAIS })).toEqual(
      REGLAGE
    );
  });

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

  it('critère 1 : a commit in a trial repository starts no automatic maintenance', () => {
    const repo = depot();
    const trace = path.join(ESSAIS, `trace-${path.basename(repo)}.json`);
    writeFileSync(path.join(repo, 'a.txt'), 'b\n');
    execFileSync('git', ['-C', repo, ...IDENTITE, 'commit', '-qam', 'b'], {
      env: { ...process.env, GIT_TRACE2_EVENT: trace },
    });
    // The trace of git names each process it starts; the automatic maintenance is
    // `git maintenance run --auto`.
    const lances = readFileSync(trace, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l) as { event: string; argv?: string[] })
      .filter(e => e.event === 'child_start' || e.event === 'start')
      .map(e => (e.argv ?? []).join(' '));
    expect(lances.filter(a => / maintenance run /.test(` ${a} `))).toEqual([]);
  });

  it('critère 1 : a test’s own git setting composes with the suite’s, by configGit', () => {
    const repo = depot();
    // A setting added keeps the suite's.
    const ajout = { ...process.env, ...configGit([['protocol.file.allow', 'always']]) };
    expect(reglageLu(repo, ajout)).toEqual(REGLAGE);
    expect(lire(repo, 'protocol.file.allow', ajout)).toBe('always');
    // A setting removed (the allowance a script under test runs without) keeps the others.
    const retrait = {
      ...sansGitConfig(ajout),
      ...configGit([], cle => !cle.startsWith('protocol.'), ajout),
    };
    expect(reglageLu(repo, retrait)).toEqual(REGLAGE);
    expect(lire(repo, 'protocol.file.allow', retrait)).toBeNull();
  });

  it('critère 1 : a fresh environment (no process.env) carries the suite’s setting by configGit()', () => {
    const repo = depot();
    const neuf = { PATH: process.env.PATH, HOME: ESSAIS, ...configGit() };
    expect(reglageLu(repo, neuf)).toEqual(REGLAGE);
  });
});

// The dependencies of the repository, linked one by one into <racine>, so that Vitest writes its
// cache there.
function lierDependances(racine: string) {
  mkdirSync(path.join(racine, 'node_modules'));
  for (const e of readdirSync(path.join(DEPOT, 'node_modules'))) {
    if (e !== '.vite' && e !== '.vitest') {
      symlinkSync(path.join(DEPOT, 'node_modules', e), path.join(racine, 'node_modules', e));
    }
  }
}

describe('3uv.72.1 critère 1 : the night configuration carries the same setting', () => {
  it(
    'critère 1 : a git launched by a night test, under scripts/vitest.nuit.config.mjs alone, reads maintenance.auto=false and gc.auto=0',
    () => {
      const racine = mkdtempSync(path.join(ESSAIS, 'nuit-'));
      lierDependances(racine);
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

describe('3uv.72.1 critères 3 et 6 : the setting lives in the environment of the suite alone', () => {
  it('critère 3 : the value a test reads comes from the environment, no configuration file', () => {
    const repo = depot();
    for (const cle of Object.keys(REGLAGE)) {
      const r = spawnSync('git', ['-C', repo, 'config', '--show-origin', '--get', cle], {
        encoding: 'utf8',
      });
      expect(r.stdout.split('\t')[0], cle).toBe('command line:');
    }
  });

  it('critères 3 et 6 : a git outside the suite, on the environment without its settings and isolated from the user’s files, reads none of them', () => {
    const repo = depot();
    // Isolated from the user's global and system configuration: only the trial repository's own
    // configuration and the environment remain, so a value read here comes from the suite.
    const horsSuite = {
      ...sansGitConfig(),
      HOME: ESSAIS,
      XDG_CONFIG_HOME: ESSAIS,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    };
    expect(reglageLu(repo, horsSuite)).toEqual({ 'maintenance.auto': null, 'gc.auto': null });
  });

  // Every tracked code or configuration file outside the tests: scripts, hooks, the Vitest day
  // configuration, the continuous-integration workflows, the deployment scripts. Only prose (.md,
  // the licences) and the data of the ticket tracker (.beads/*.jsonl) stay out. The setting has one
  // address, the frame's base configuration, which the day and night configurations read.
  it('critère 3 : no code or configuration file outside the tests, the CI workflows included, carries the setting, but the base Vitest configuration, its one address', () => {
    const suivis = execFileSync('git', ['-C', DEPOT, 'ls-files'], { encoding: 'utf8' })
      .split('\n')
      .filter(f => f !== '')
      .filter(f => !f.startsWith('packages/grillhouse/tests/'))
      .filter(f => !/\.md$/.test(f) && !/(^|\/)LICENSE/.test(f) && !/^\.beads\/.*\.jsonl$/.test(f))
      .filter(f => f !== 'packages/grillhouse/scripts/vitest-config/base.mjs');
    const porteurs = suivis.filter(f => {
      let texte: string;
      try {
        texte = readFileSync(path.join(DEPOT, f), 'utf8');
      } catch {
        return false;
      }
      return /maintenance\.auto|gc\.auto/.test(texte);
    });
    expect(porteurs).toEqual([]);
  });
});
