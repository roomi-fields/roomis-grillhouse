// `npm test -- <files>` (scripts/langages/typescript/tests.mjs) plays each file named from the root
// in the package that holds it, with what its tests depend on: the builds and the traces they wait
// for, each hashed by Turborepo. The chain, played at night: the real Turborepo and Vitest in a git
// repository of trial, whose hash of a task reads git's files. The targeting itself is the day's
// (packages/grillhouse/tests/unit/langages/typescript/tests-cibles.spec.ts).
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CADRE, RACINE, enProcessus } from './cadre.js';

const DEPOT = RACINE;
const SCRIPT = path.join(CADRE, 'scripts/langages/typescript/tests.mjs');
const BASE = path.join(CADRE, 'scripts/langages/typescript/vitest-config/base.mjs');
// The turbo.json of each package, as the update writes them, in a process of its own.
const ecrireTurbo = enProcessus<void>(
  'scripts/langages/typescript/turbo-des-paquets.mjs',
  'ecrire'
);
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tests-cibles-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;
// The configuration of a package: the frame's base, by its path (the trial has no workspace for it).
const configuration = `import base from ${JSON.stringify(BASE)};\nexport default base;\n`;

const lancer = (racine: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: racine,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${path.join(DEPOT, 'node_modules/.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
      TURBO_TELEMETRY_DISABLED: '1',
      DO_NOT_TRACK: '1',
      ...env,
    },
  });
// The tests played since the trial began, sorted.
const joues = (racine: string) =>
  existsSync(path.join(racine, 'joues.txt'))
    ? readFileSync(path.join(racine, 'joues.txt'), 'utf8').split('\n').filter(Boolean).sort()
    : [];
const sortie = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`;

// Witness: BPScript, whose reviewer measured it. The targeted run played the tests alone
// (`turbo run test:unit --only`), whose hash then counts neither the builds nor the traces they
// wait for: a change to a package they import replayed from the cache a green of the former code.
// As Bazel's key of a target holds its transitive inputs, a targeted test replays from the cache
// only while what it imports is unchanged.

// A repository of packages: `a` builds `dist/v.txt` from `src/v.txt`, and `b`, which depends on
// `a`, has a test that reads it and writes `b/<what it read>` to `joues.txt`.
function depotAImport() {
  const r = mkdtempSync(path.join(ESSAIS, 'import-'));
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(r, 'node_modules'), 'dir');
  ecrire(
    r,
    'package.json',
    json({ name: 'essai', private: true, workspaces: ['packages/*'], packageManager: 'npm@10.9.8' })
  );
  ecrire(r, 'turbo.json', readFileSync(path.join(DEPOT, 'templates/turbo/paquets.json'), 'utf8'));
  ecrire(r, 'docs/agents/hors-cadre.txt', '');
  ecrire(
    r,
    'packages/a/package.json',
    json({ name: 'a', type: 'module', scripts: { build: 'node construire.mjs' } })
  );
  ecrire(
    r,
    'packages/a/construire.mjs',
    [
      "import { copyFileSync, mkdirSync } from 'node:fs';",
      "mkdirSync('dist', { recursive: true });",
      "copyFileSync('src/v.txt', 'dist/v.txt');",
      '',
    ].join('\n')
  );
  ecrire(r, 'packages/a/src/v.txt', 'v1');
  ecrire(
    r,
    'packages/b/package.json',
    json({
      name: 'b',
      type: 'module',
      dependencies: { a: '*' },
      scripts: { build: 'true', 'test:unit': 'vitest run' },
    })
  );
  ecrire(r, 'packages/b/vitest.config.mjs', configuration);
  ecrire(
    r,
    'packages/b/test/x.test.mjs',
    [
      "import { appendFileSync, readFileSync } from 'node:fs';",
      "import { it } from 'vitest';",
      "it('b/x', () => {",
      "  const lu = readFileSync(new URL('../../a/dist/v.txt', import.meta.url), 'utf8');",
      "  appendFileSync(new URL('../../../joues.txt', import.meta.url), `b/${lu}\\n`);",
      '});',
      '',
    ].join('\n')
  );
  ecrire(r, '.gitignore', 'node_modules\n.turbo/\njoues.txt\ndist/\n');
  ecrireTurbo(r);
  for (const a of [
    ['init', '-q'],
    ['add', '-A'],
    ['commit', '-qm', 'init'],
  ]) {
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: r });
  }
  return r;
}

describe(
  'a targeted run replays its tests from the cache only while what they import is unchanged',
  {
    timeout: 60_000,
  },
  () => {
    it('a package the tests import changed: the tests play again, over its new build', () => {
      const racine = depotAImport();
      const r1 = lancer(racine, ['packages/b/test/x.test.mjs']);
      expect(r1.status, sortie(r1)).toBe(0);
      writeFileSync(path.join(racine, 'packages/a/src/v.txt'), 'v2');
      const r2 = lancer(racine, ['packages/b/test/x.test.mjs']);
      expect(r2.status, sortie(r2)).toBe(0);
      expect(joues(racine)).toEqual(['b/v1', 'b/v2']);
    });

    it('nothing changed: the tests replay from the cache', () => {
      const racine = depotAImport();
      expect(lancer(racine, ['packages/b/test/x.test.mjs']).status).toBe(0);
      const r = lancer(racine, ['packages/b/test/x.test.mjs']);
      expect(r.status, sortie(r)).toBe(0);
      expect(r.stdout).toContain('cache hit');
      expect(joues(racine)).toEqual(['b/v1']);
    });

    // In an envelope the tests play alone (`--only`): their hash holds the agent's package and the
    // paths named, never the code of the neighbours (the header of scripts/langages/typescript/tests.mjs).
    it('in an envelope, a change to the agent’s package plays its tests again', () => {
      const racine = depotAImport();
      const dedans = { GRILLHOUSE_ENVELOPPE: 'packages/b' };
      const construction = spawnSync('turbo', ['run', 'build', '--filter=a'], {
        cwd: racine,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${path.join(DEPOT, 'node_modules/.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
          TURBO_TELEMETRY_DISABLED: '1',
        },
      });
      expect(construction.status, sortie(construction)).toBe(0);
      const r1 = lancer(racine, ['packages/b/test/x.test.mjs'], dedans);
      expect(r1.status, sortie(r1)).toBe(0);
      const test = path.join(racine, 'packages/b/test/x.test.mjs');
      writeFileSync(test, `${readFileSync(test, 'utf8')}// changed\n`);
      const r2 = lancer(racine, ['packages/b/test/x.test.mjs'], dedans);
      expect(r2.status, sortie(r2)).toBe(0);
      expect(joues(racine)).toEqual(['b/v1', 'b/v1']);
    });

    // Turborepo's strict mode of the variables: a variable of a task's `env` enters its hash, and
    // reaches its process, alone.
    it('the variable of the paths enters the hash of the tests alone, never a build’s', () => {
      const racine = depotATrace();
      const plan = (valeur: string) => {
        const r = spawnSync('turbo', ['run', 'test:unit', '--filter=lect', '--dry=json'], {
          cwd: racine,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${path.join(DEPOT, 'node_modules/.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
            TURBO_TELEMETRY_DISABLED: '1',
            GRILLHOUSE_TESTS: valeur,
          },
        });
        expect(r.status, sortie(r)).toBe(0);
        return Object.fromEntries(
          (JSON.parse(r.stdout) as { tasks: { taskId: string; hash: string }[] }).tasks.map(t => [
            t.taskId,
            t.hash,
          ])
        );
      };
      const un = plan('{"arguments":["/x"]}');
      const deux = plan('{"arguments":["/y"]}');
      expect(Object.keys(un).sort()).toEqual([
        'lect#build',
        'lect#test:unit',
        'prod#build',
        'prod#trace:g',
      ]);
      for (const t of ['lect#build', 'prod#build', 'prod#trace:g']) {
        expect(deux[t], t).toBe(un[t]);
      }
      expect(deux['lect#test:unit']).not.toBe(un['lect#test:unit']);
    });
  }
);

// Witness: BPScript (320.6.6). A package whose tests read the trace of another
// (`grillhouse.lit` over its `grillhouse.traces`) has its `test:unit` wait for
// `<producer>#trace:<name>`; the targeted run played the builds, then the tests alone (`--only`),
// and on a copy without the trace the test failed, « trace absente ». As Bazel produces the inputs
// of a test before it, the targeted run plays the traces the tests wait for with the builds.

// A repository of packages: `prod` writes the trace `trace:g` in `trace/g` (each run counted in
// `traces.txt` at the root), and `lect`, whose test reads it, declares it.
function depotATrace() {
  const r = mkdtempSync(path.join(ESSAIS, 'trace-'));
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(r, 'node_modules'), 'dir');
  ecrire(
    r,
    'package.json',
    json({ name: 'essai', private: true, workspaces: ['packages/*'], packageManager: 'npm@10.9.8' })
  );
  ecrire(r, 'turbo.json', readFileSync(path.join(DEPOT, 'templates/turbo/paquets.json'), 'utf8'));
  ecrire(r, 'docs/agents/hors-cadre.txt', '');
  ecrire(
    r,
    'packages/prod/package.json',
    json({
      name: 'prod',
      type: 'module',
      scripts: { build: 'true', 'trace:g': 'node trace.mjs', 'test:unit': 'vitest run' },
      // Its tests read its own trace too, as BPScript's 060-encoder.
      grillhouse: {
        lit: ['packages/prod/trace/g'],
        traces: { 'trace:g': { lit: [], ecrit: 'packages/prod/trace/g' } },
      },
    })
  );
  // The trace copies `source.txt` of its package.
  ecrire(r, 'packages/prod/source.txt', 'v1');
  ecrire(
    r,
    'packages/prod/trace.mjs',
    [
      "import { appendFileSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';",
      "rmSync('trace/g', { recursive: true, force: true });",
      "mkdirSync('trace/g', { recursive: true });",
      "copyFileSync('source.txt', 'trace/g/x.txt');",
      "appendFileSync('../../traces.txt', 'g\\n');",
      '',
    ].join('\n')
  );
  ecrire(r, 'packages/prod/vitest.config.mjs', configuration);
  ecrire(
    r,
    'packages/prod/test/x.test.mjs',
    [
      "import { appendFileSync, readFileSync } from 'node:fs';",
      "import { it } from 'vitest';",
      "it('prod/x', () => {",
      "  const lu = readFileSync(new URL('../trace/g/x.txt', import.meta.url), 'utf8');",
      "  appendFileSync(new URL('../../../joues.txt', import.meta.url), `prod/${lu}\\n`);",
      '});',
      '',
    ].join('\n')
  );
  ecrire(
    r,
    'packages/lect/package.json',
    json({
      name: 'lect',
      type: 'module',
      scripts: { build: 'true', 'test:unit': 'vitest run' },
      grillhouse: { lit: ['packages/prod/trace/g'] },
    })
  );
  ecrire(r, 'packages/lect/vitest.config.mjs', configuration);
  ecrire(
    r,
    'packages/lect/test/x.test.mjs',
    [
      "import { appendFileSync, readFileSync } from 'node:fs';",
      "import { it } from 'vitest';",
      "it('lect/x', () => {",
      "  readFileSync(new URL('../../prod/trace/g/x.txt', import.meta.url));",
      "  appendFileSync(new URL('../../../joues.txt', import.meta.url), 'lect/x\\n');",
      '});',
      '',
    ].join('\n')
  );
  ecrire(r, '.gitignore', 'node_modules\n.turbo/\njoues.txt\ntraces.txt\npackages/prod/trace/\n');
  ecrireTurbo(r);
  // A git repository: the inputs of the trace (`$TURBO_DEFAULT$`) leave out what git ignores, the
  // logs of Turborepo included.
  for (const a of [
    ['init', '-q'],
    ['add', '-A'],
    ['commit', '-qm', 'init'],
  ]) {
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: r });
  }
  return r;
}
// The runs of the trace since the trial began.
const traces = (racine: string) =>
  existsSync(path.join(racine, 'traces.txt'))
    ? readFileSync(path.join(racine, 'traces.txt'), 'utf8').split('\n').filter(Boolean)
    : [];

describe('npm test -- <files> plays the traces its tests wait for', { timeout: 60_000 }, () => {
  it('on a copy without the trace, the targeted run produces it, then the test passes', () => {
    const racine = depotATrace();
    const r = lancer(racine, ['packages/lect/test/x.test.mjs']);
    expect(r.status, sortie(r)).toBe(0);
    expect(traces(racine)).toEqual(['g']);
    expect(joues(racine)).toEqual(['lect/x']);
  });

  it('a second run, the trace gone from the copy, serves it from the cache', () => {
    const racine = depotATrace();
    expect(lancer(racine, ['packages/lect/test/x.test.mjs']).status).toBe(0);
    rmSync(path.join(racine, 'packages/prod/trace'), { recursive: true, force: true });
    const r = lancer(racine, ['packages/lect/test/x.test.mjs']);
    expect(r.status, sortie(r)).toBe(0);
    expect(traces(racine)).toEqual(['g']);
    expect(existsSync(path.join(racine, 'packages/prod/trace/g/x.txt'))).toBe(true);
  });

  it("in an envelope, the run plays no neighbour's trace: the launcher produced them", () => {
    const racine = depotATrace();
    lancer(racine, ['packages/lect/test/x.test.mjs'], { GRILLHOUSE_ENVELOPPE: 'packages/lect' });
    expect(traces(racine)).toEqual([]);
  });

  // The envelope writes the agent's package only, and its own trace lives in it.
  it("in an envelope, the run regenerates the package's own trace, once what it reads changed", () => {
    const racine = depotATrace();
    const dedans = { GRILLHOUSE_ENVELOPPE: 'packages/prod' };
    const r1 = lancer(racine, ['packages/prod/test/x.test.mjs'], dedans);
    expect(r1.status, sortie(r1)).toBe(0);
    writeFileSync(path.join(racine, 'packages/prod/source.txt'), 'v2');
    const r2 = lancer(racine, ['packages/prod/test/x.test.mjs'], dedans);
    expect(r2.status, sortie(r2)).toBe(0);
    expect(joues(racine)).toEqual(['prod/v1', 'prod/v2']);
    expect(traces(racine)).toEqual(['g', 'g']);
  });
});
