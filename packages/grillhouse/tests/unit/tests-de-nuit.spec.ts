// grillhouse-3uv.34, critères 4 and 5: the night tests, a category beside the time budget benches
// (`*.budget.test.*`). A night test is a file `*.nuit.test.*` or `*.nuit.spec.*`: `npm test` (the
// integration's included) leaves it out, the night (scripts/nuit.sh) plays it after its full pass
// (`npm run verifier -- --force`). The day keeps a fast guard against a fixed path shared between
// sessions (critère 2), played by `npm test`.
//
// This file: what the frame's base configuration of the day (scripts/langages/typescript/vitest-config/base.mjs)
// leaves out and the night's configuration (scripts/langages/typescript/vitest.nuit.config.mjs) plays, read
// from the configurations themselves, and the guards of the day. The chain (npm test and the night
// in a project of trial) is the night's
// (packages/grillhouse-essais/tests/tests-de-nuit.nuit.spec.ts), and the night script's
// (packages/grillhouse-essais/tests/tests-de-nuit.script-de-nuit.nuit.spec.ts).
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lierDependances } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import base from '../../scripts/langages/typescript/vitest-config/base.mjs';
import nuit from '../../scripts/langages/typescript/vitest.nuit.config.mjs';

// The frame's repository.
const DEPOT = path.resolve(__dirname, '../../../..');

// The trial directories of this run live in one root, removed at its end (critère 2).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tests-de-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const NUIT_RE = /\.nuit\.(test|spec)\.(c|m)?[jt]sx?$/;
const BUDGET_RE = /\.budget\.(test|spec)\.(c|m)?[jt]sx?$/;
const sortie = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`.slice(-3000);

// The files of a project: day tests, night tests of each form and depth, benches, and day tests
// whose name only holds « nuit ».
const JOUR = [
  'tests/jour.spec.ts',
  'tests/profond/jour.test.ts',
  'tests/nuit.spec.ts',
  'tests/la-nuit.test.ts',
];
const NUITS = [
  'tests/a.nuit.test.ts',
  'tests/b.nuit.spec.ts',
  'tests/profond/c.nuit.test.ts',
  'tests/d.nuit.test.mjs',
];
const BANCS = ['tests/temps.budget.test.ts', 'tests/profond/b.budget.spec.mjs'];
// Whether one of the patterns <motifs> names the file <f>, as Vitest's globs do.
const nomme = (motifs: string[], f: string) => motifs.some(m => path.matchesGlob(f, m));

type Config = { test: { exclude: string[]; include?: string[]; env: Record<string, string> } };

describe('critère 4 — the day leaves the night tests and the benches out', () => {
  const exclues = (base as Config).test.exclude;
  it('critère 4: a night test, at any depth and in any form, is excluded by the day', () => {
    for (const f of NUITS) {
      expect(nomme(exclues, f), f).toBe(true);
    }
  });
  it('3uv.75.1 critère 11: a time budget bench is excluded by the day', () => {
    for (const f of BANCS) {
      expect(nomme(exclues, f), f).toBe(true);
    }
  });
  it('critère 4: a file whose name only holds « nuit » stays a day test', () => {
    for (const f of JOUR) {
      expect(nomme(exclues, f), f).toBe(false);
    }
  });
});

describe('critère 4 — the night plays the night tests and the benches, and no day test', () => {
  const n = nuit as Config;
  it('critère 4: its include names every night test and every bench', () => {
    for (const f of [...NUITS, ...BANCS]) {
      expect(nomme(n.test.include ?? [], f), f).toBe(true);
    }
  });
  it('critère 4: it names no day test, and excludes none of the night', () => {
    for (const f of JOUR) {
      expect(nomme(n.test.include ?? [], f), f).toBe(false);
    }
    for (const f of [...NUITS, ...BANCS]) {
      expect(nomme(n.test.exclude, f), f).toBe(false);
    }
  });
  it('takes the common environment of the base configuration', () => {
    expect(n.test.env).toEqual((base as Config).test.env);
  });
});

// The frame's base configuration of the day (`@roomi-fields/grillhouse/vitest-config`, the
// package's scripts/langages/typescript/vitest-config/) carries the exclusions of the night tests and the time
// budget benches and the common environment; the frame's tests and each configuration of a project
// extend it (mergeConfig) without repeating them, and reach it by its name, as the examples of
// Turborepo reach their configuration packages (@repo/eslint-config).
describe('the base configuration of the day leaves the night out of every configuration that extends it', () => {
  const PAQUET = path.join(DEPOT, 'packages/grillhouse/scripts/langages/typescript/vitest-config');
  it('is exported by the frame’s package, typed, and no package of its own', () => {
    const paquet = JSON.parse(
      readFileSync(path.join(DEPOT, 'packages/grillhouse/package.json'), 'utf8')
    ) as { exports: Record<string, unknown> };
    expect(paquet.exports['./vitest-config']).toEqual({
      types: './scripts/langages/typescript/vitest-config/base.d.ts',
      default: './scripts/langages/typescript/vitest-config/base.mjs',
    });
    expect(paquet.exports['./vitest-config/mesure']).toEqual({
      types: './scripts/langages/typescript/vitest-config/mesure.d.ts',
      default: './scripts/langages/typescript/vitest-config/mesure.mjs',
    });
    expect(existsSync(path.join(PAQUET, 'package.json'))).toBe(false);
  });
  it('is a directory of the package; the former file is gone', () => {
    expect(existsSync(path.join(PAQUET, 'base.mjs'))).toBe(true);
    expect(existsSync(path.join(DEPOT, 'packages/grillhouse/scripts/vitest.base.config.mjs'))).toBe(
      false
    );
  });
  it('no file of the repository names the former file', () => {
    const suivis = execFileSync('git', ['-C', DEPOT, 'ls-files'], { encoding: 'utf8' })
      .split('\n')
      .filter(
        f =>
          f !== '' &&
          f !== 'CHANGELOG.md' &&
          !f.startsWith('packages/grillhouse/tests/') &&
          !f.startsWith('.beads/')
      )
      .filter(f => existsSync(path.join(DEPOT, f)));
    const porteurs = suivis.filter(f =>
      readFileSync(path.join(DEPOT, f), 'utf8').includes('vitest.base.config')
    );
    expect(porteurs).toEqual([]);
  });
  it('the configuration of the frame’s tests extends it: its exclusions and its environment, its own include', async () => {
    const racine = (
      (await import(path.join(DEPOT, 'packages/grillhouse/vitest.config.ts'))) as {
        default: Config;
      }
    ).default;
    for (const e of (base as Config).test.exclude) {
      expect(racine.test.exclude).toContain(e);
    }
    expect(racine.test.env).toEqual((base as Config).test.env);
    expect(
      readFileSync(path.join(DEPOT, 'packages/grillhouse/vitest.config.ts'), 'utf8')
    ).not.toMatch(/\.(nuit|budget)\./);
  });
  it('a package whose configuration imports it by its name plays its day tests, and neither its night tests nor its benches', () => {
    const repo = mkdtempSync(path.join(ESSAIS, 'paquets-'));
    lierDependances(repo, DEPOT);
    // The frame's package as npm installs it: its package.json and its scripts (the base
    // configuration of the module typescript, the core's entries it reads), in place of the link
    // to the repository's.
    const installe = path.join(repo, 'node_modules/@roomi-fields/grillhouse');
    rmSync(path.join(repo, 'node_modules/@roomi-fields'), { force: true });
    cpSync(path.join(PAQUET, '../../..'), path.join(installe, 'scripts'), { recursive: true });
    cpSync(
      path.join(DEPOT, 'packages/grillhouse/package.json'),
      path.join(installe, 'package.json')
    );
    const paquet = path.join(repo, 'packages/a');
    const trace = path.join(repo, 'trace');
    // A test file that appends its name to the trace.
    const essai = (nom: string) =>
      `import { appendFileSync } from 'node:fs';\nimport { test } from 'vitest';\n` +
      `test('${nom}', () => {\n  appendFileSync(${JSON.stringify(trace)}, '${nom}\\n');\n});\n`;
    const fichiers: Record<string, string> = {
      'vitest.config.mjs':
        "import { defineConfig, mergeConfig } from 'vitest/config';\n" +
        "import base from '@roomi-fields/grillhouse/vitest-config';\n" +
        'export default mergeConfig(base, defineConfig({ test: { include: ' +
        "['tests/**/*.{test,spec}.{ts,mjs}'] } }));\n",
      'tests/jour.spec.ts': essai('jour.spec.ts'),
      'tests/a.nuit.test.ts': essai('a.nuit.test.ts'),
      'tests/b.budget.spec.ts': essai('b.budget.spec.ts'),
      'tests/profond/c.nuit.spec.mjs': essai('c.nuit.spec.mjs'),
    };
    for (const [f, contenu] of Object.entries(fichiers)) {
      mkdirSync(path.dirname(path.join(paquet, f)), { recursive: true });
      writeFileSync(path.join(paquet, f), contenu);
    }
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
    );
    const r = spawnSync(path.join(repo, 'node_modules/.bin/vitest'), ['run'], {
      cwd: paquet,
      encoding: 'utf8',
      env,
      timeout: 120_000,
    });
    expect(r.status, sortie(r)).toBe(0);
    expect(readFileSync(trace, 'utf8').split('\n').filter(Boolean)).toEqual(['jour.spec.ts']);
  }, 120_000);
});

// The package of the frame's tests.
const CADRE = path.join(DEPOT, 'packages/grillhouse');

// The test files of the frame's package, with their sources, each path from the package.
function testsDuDepot(): { f: string; s: string }[] {
  const out: { f: string; s: string }[] = [];
  const parcourir = (rel: string) => {
    for (const e of readdirSync(path.join(CADRE, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') {
          parcourir(r);
        }
      } else if (/\.(spec|test)\.(c|m)?[jt]sx?$/.test(e.name)) {
        out.push({ f: r, s: readFileSync(path.join(CADRE, r), 'utf8') });
      }
    }
  };
  for (const racine of ['tests', 'src']) {
    if (existsSync(path.join(CADRE, racine))) {
      parcourir(racine);
    }
  }
  return out;
}

const tenant = (motif: RegExp) =>
  testsDuDepot()
    .filter(({ f }) => f !== path.relative(CADRE, __filename))
    .filter(({ s }) => motif.test(s));

describe('critère 4 — the test of critère 1 is a night test', () => {
  it('critère 4: the test of the two simultaneous runs lives in a night file, and only there', () => {
    const fichiers = tenant(/critère 1 — two simultaneous runs/).map(x => x.f);
    expect(fichiers.length).toBeGreaterThan(0);
    for (const f of fichiers) {
      expect(f).toMatch(NUIT_RE);
    }
  });
});

describe('critère 5 — by day, a fast test keeps the trial directories off a fixed shared path', () => {
  const gardes = () =>
    tenant(/critère 2 — no test names a fixed directory under the home/).map(x => x.f);
  it('critère 5: the guard of critère 2 lives in a day file, played by npm test', () => {
    const fichiers = gardes();
    expect(fichiers.length).toBeGreaterThan(0);
    for (const f of fichiers) {
      expect(f).not.toMatch(NUIT_RE);
      expect(f).not.toMatch(BUDGET_RE);
      expect(nomme((base as Config).test.exclude, f), f).toBe(false);
    }
  });
  it('critère 5: the file of the guard starts no process, so that it stays fast', () => {
    const fichiers = gardes();
    expect(fichiers.length).toBeGreaterThan(0);
    for (const f of fichiers) {
      const s = readFileSync(path.join(CADRE, f), 'utf8');
      expect(s, f).not.toMatch(/node:child_process|\bspawn(Sync)?\(|\bexec(File)?(Sync)?\(/);
    }
  });
});
