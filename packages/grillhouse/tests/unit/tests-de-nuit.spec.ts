import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
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
import {
  DEPOT,
  PRESSION,
  rangs,
  NUITS,
  essai,
  JOUR,
  lierDependances,
  noms,
  testsDeNuitEssai,
} from './tests-de-nuit-essai.js';

// grillhouse-3uv.34, critères 4 and 5: the night tests, a category beside the time budget benches
// (`*.budget.test.*`). A night test is a file `*.nuit.test.*` or `*.nuit.spec.*`: `npm test` (the
// integration's included) leaves it out, the night (scripts/nuit.sh) plays it after its full pass
// (`npm run verifier -- --force`). The day keeps a fast guard against a fixed path shared between sessions
// (critère 2), played by `npm test`.
//
// Each case plays the real configuration of the repository (its package.json, its Vitest
// configuration, its turbo.json, its scripts, Turborepo itself through the linked dependencies) in
// a project of trial whose test files append their name to a trace. Turborepo runs its tasks in its
// strict environment, which does not pass TRACE: the test files read the path of the trace in the
// file `.trace` at the root of the project of trial, committed with it.
//
// This file: the day leaves the night tests and the benches out, the night plays them, and the
// guards of the day. The night script (scripts/nuit.sh) is tested in tests-de-nuit.script-de-nuit.
// The projects of trial: ./tests-de-nuit-essai.ts.

// The trial directories of this run live in one root, removed at its end (critère 2).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tests-de-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { projet, nuitDe } = testsDeNuitEssai(ESSAIS);

const NUIT_RE = /\.nuit\.(test|spec)\.(c|m)?[jt]sx?$/;
const BUDGET_RE = /\.budget\.(test|spec)\.(c|m)?[jt]sx?$/;
const sortie = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`.slice(-3000);

describe('critère 4 — npm test leaves the night tests out', () => {
  it('critère 4: npm test plays the day tests and no night test, at any depth and in any form', () => {
    const p = projet();
    const r = p.lancer('npm', ['test']);
    expect(r.status, sortie(r)).toBe(0);
    expect(p.joues()).toEqual(noms(JOUR));
  }, 120_000);
  it('critère 4: a red night test leaves npm test green', () => {
    const p = projet({ 'tests/e.nuit.test.ts': essai('e.nuit.test.ts', true) });
    const r = p.lancer('npm', ['test']);
    expect(r.status, sortie(r)).toBe(0);
    expect(p.joues()).not.toContain('e.nuit.test.ts');
  }, 120_000);
  it('critère 4: a file whose name only holds « nuit » stays a day test, played by npm test', () => {
    const p = projet({
      'tests/nuit.spec.ts': essai('nuit.spec.ts'),
      'tests/la-nuit.test.ts': essai('la-nuit.test.ts'),
    });
    const r = p.lancer('npm', ['test']);
    expect(r.status, sortie(r)).toBe(0);
    expect(p.joues()).toEqual(noms([...JOUR, 'nuit.spec.ts', 'la-nuit.test.ts']));
  }, 120_000);
});

// The frame's base configuration of the day (the package @grillhouse/vitest-config, a frame
// directory, scripts/vitest-config/) carries the exclusions of the night tests and the time budget
// benches and the common environment; the root of Grillhouse and each package of a project extend
// it (mergeConfig) without repeating them. A package of a project reaches it by its name, as the
// examples of Turborepo reach their configuration packages (@repo/eslint-config); the root of a
// repository without packages, the package that holds the file, by its path.
describe('the base configuration of the day leaves the night out of every configuration that extends it', () => {
  const PAQUET = path.join(DEPOT, 'packages/grillhouse/scripts/vitest-config');
  const BASE = path.join(PAQUET, 'base.mjs');
  type Config = { test: { exclude: string[]; env: Record<string, string> } };
  it('is a private package, @grillhouse/vitest-config, that exports its configuration, typed', () => {
    expect(JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8'))).toEqual({
      name: '@grillhouse/vitest-config',
      version: '0.0.0',
      private: true,
      type: 'module',
      exports: {
        '.': { types: './base.d.ts', default: './base.mjs' },
        './mesure': { types: './mesure.d.ts', default: './mesure.mjs' },
      },
    });
  });
  it('is a directory of the package; the former file is gone', () => {
    expect(existsSync(path.join(DEPOT, 'packages/grillhouse/scripts/vitest-config/base.mjs'))).toBe(
      true
    );
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
    const base = ((await import(BASE)) as { default: Config }).default;
    const racine = (
      (await import(path.join(DEPOT, 'packages/grillhouse/vitest.config.ts'))) as {
        default: Config;
      }
    ).default;
    for (const e of base.test.exclude) {
      expect(racine.test.exclude).toContain(e);
    }
    expect(racine.test.env).toEqual(base.test.env);
    expect(
      readFileSync(path.join(DEPOT, 'packages/grillhouse/vitest.config.ts'), 'utf8')
    ).not.toMatch(/\.(nuit|budget)\./);
  });
  it('a package whose configuration imports it by its name plays its day tests, and neither its night tests nor its benches', () => {
    const repo = mkdtempSync(path.join(ESSAIS, 'paquets-'));
    lierDependances(repo);
    cpSync(PAQUET, path.join(repo, 'scripts/vitest-config'), { recursive: true });
    // npm links each workspace into node_modules under its name: the project's own, in place of
    // the link to the repository's.
    rmSync(path.join(repo, 'node_modules/@grillhouse'), { force: true });
    mkdirSync(path.join(repo, 'node_modules/@grillhouse'));
    symlinkSync(
      path.join(repo, 'scripts/vitest-config'),
      path.join(repo, 'node_modules/@grillhouse/vitest-config')
    );
    const paquet = path.join(repo, 'packages/a');
    const trace = path.join(repo, 'trace');
    const fichiers: Record<string, string> = {
      'vitest.config.mjs':
        "import { defineConfig, mergeConfig } from 'vitest/config';\n" +
        "import base from '@grillhouse/vitest-config';\n" +
        'export default mergeConfig(base, defineConfig({ test: { include: ' +
        "['tests/**/*.{test,spec}.{ts,mjs}'] } }));\n",
      '.trace': `${trace}\n`,
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

describe('critère 4 — the night plays the night tests', () => {
  it('critère 4: the night plays every night test, and the day tests', () => {
    const p = projet();
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    for (const f of noms(NUITS)) {
      expect(p.joues(), n.journal).toContain(f);
    }
    for (const f of noms(JOUR)) {
      expect(p.joues(), n.journal).toContain(f);
    }
  }, 240_000);
  it('critère 4: a red night test turns the night red', () => {
    const p = projet({ 'tests/e.nuit.test.ts': essai('e.nuit.test.ts', true) });
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(1);
    expect(p.joues()).toContain('e.nuit.test.ts');
  }, 240_000);
});

// grillhouse-3uv.75.1 critères 11 and 17: the night launches its full pass (`npm run verifier -- --force`),
// which plays neither the time budget benches nor the night tests (the day configuration of Vitest
// leaves them out); the night plays its benches itself, after the full pass, even without a night
// test, and a red bench turns the night red.
describe('3uv.75.1 critères 11 et 17 — the day leaves the time budget benches out, the night plays them itself', () => {
  const BANC = 'tests/temps.budget.test.ts';
  it('critères 11 et 17: npm test plays no bench; the night of a project without night test plays its bench itself, once, after its full pass, green', () => {
    const p = projet({ [BANC]: essai('temps.budget.test.ts') }, { nuits: false });
    const jour = p.lancer('npm', ['test']);
    expect(jour.status, sortie(jour)).toBe(0);
    expect(p.joues()).toEqual(noms(JOUR));
    const avant = p.lignes().length;
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    const l = p.lignes().slice(avant);
    expect(
      l.filter(x => x === 'temps.budget.test.ts'),
      `${l.join(', ')}\n${n.journal}`
    ).toHaveLength(1);
    const jourRangs = rangs(l, noms(JOUR));
    expect(jourRangs, `${l.join(', ')}\n${n.journal}`).not.toContain(-1);
    expect(Math.max(...jourRangs), l.join(', ')).toBeLessThan(l.indexOf('temps.budget.test.ts'));
  }, 240_000);
  it('critère 17: a red bench turns the night red, with or without night tests', () => {
    for (const nuits of [true, false]) {
      const p = projet({ [BANC]: essai('temps.budget.test.ts', true) }, { nuits });
      const n = nuitDe(p);
      expect(n.status, `nuits ${nuits}\n${n.journal}`).toBe(1);
      expect(n.dernierVert, `nuits ${nuits}`).toBe('');
      expect(p.lignes(), `nuits ${nuits}`).toContain('temps.budget.test.ts');
    }
  }, 480_000);
});

// A time witness is measured with the CPU at rest: a bench that fails under load is « à repasser »
// (75, scripts/vitest-config/duree.reporter.mjs). The night waits for rest
// (scripts/vitest-config/pression.mjs attendre) and plays its benches once more; à repasser again,
// the night is à repasser: no last green, no ticket.
describe('the night plays again at rest a bench à repasser', () => {
  const BANC = 'tests/temps.budget.test.ts';
  // A bench that writes its name to the trace and fails its measure; its first run ends with the
  // pressure at rest; each later run (when <encore>) writes the pressure under load and fails
  // again, else passes.
  const banc = (encore: boolean) =>
    "import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';\n" +
    "import { test, expect } from 'vitest';\n" +
    "test('banc', () => {\n  const trace = readFileSync('.trace', 'utf8').trim();\n" +
    "  appendFileSync(trace, 'temps.budget.test.ts\\n');\n" +
    '  const p = process.env.GRILLHOUSE_PRESSION_CPU;\n' +
    `  if (!existsSync(trace + '.deja')) { writeFileSync(trace + '.deja', ''); writeFileSync(p, ${JSON.stringify(PRESSION(1))}); }\n` +
    (encore
      ? `  else writeFileSync(p, ${JSON.stringify(PRESSION(90))});\n  expect(50).toBeLessThan(10);\n`
      : '  else return;\n  expect(50).toBeLessThan(10);\n') +
    '});\n';
  it('a bench that fails under load, then passes at rest: the night is green, the bench played twice', () => {
    const p = projet({ [BANC]: banc(false) }, { nuits: false });
    writeFileSync(p.pression, PRESSION(90));
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    expect(p.lignes().filter(x => x === 'temps.budget.test.ts')).toHaveLength(2);
    expect(n.journal).toMatch(/à repasser/);
  }, 240_000);
  it('a bench à repasser twice: the night is à repasser (75), without last green nor ticket', () => {
    const p = projet({ [BANC]: banc(true) }, { nuits: false });
    writeFileSync(p.pression, PRESSION(90));
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(75);
    expect(n.dernierVert).toBe('');
    expect(existsSync(path.join(p.bin, 'appels'))).toBe(false);
    expect(p.lignes().filter(x => x === 'temps.budget.test.ts')).toHaveLength(2);
  }, 240_000);
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
  it('critère 5: npm test plays the guard of critère 2', () => {
    const p = projet();
    for (const f of gardes()) {
      const cible = path.join(p.repo, f);
      mkdirSync(path.dirname(cible), { recursive: true });
      writeFileSync(cible, essai(path.basename(f)));
    }
    const r = p.lancer('npm', ['test']);
    expect(r.status, sortie(r)).toBe(0);
    for (const f of gardes()) {
      expect(p.joues()).toContain(path.basename(f));
    }
  }, 120_000);
});

// The update gives no pretest: Turborepo plays the guards (turbo.json), and a project's own pretest
// stays as it is.
describe('grillhouse-3uv.55 critère 8 — the project of trial stays without the controls of the frame', () => {
  // The pretest a project of trial holds once projet() has brought it to the frame.
  const pretestDe = (p: { repo: string }) =>
    (
      JSON.parse(readFileSync(path.join(p.repo, 'package.json'), 'utf8')) as {
        scripts?: Record<string, string>;
      }
    ).scripts?.pretest;
  it('critère 8: the package.json of the repository gets no pretest from the update', () => {
    expect(pretestDe(projet({}, { nuits: false, dependances: false }))).toBeUndefined();
  });
  it('critère 8: a project of its own without pretest gets none from the update', () => {
    const p = projet(
      {},
      {
        pkg: { name: 'propre', scripts: { test: 'vitest run' } },
        nuits: false,
        jourVitest: false,
        dependances: false,
      }
    );
    expect(pretestDe(p)).toBeUndefined();
  });
  it('critère 8: a project of trial with a pretest of its own keeps it as it was', () => {
    const p = projet(
      {},
      {
        pkg: { name: 'propre', scripts: { test: 'vitest run', pretest: 'node mien.mjs' } },
        nuits: false,
        jourVitest: false,
        dependances: false,
      }
    );
    expect(pretestDe(p)).toBe('node mien.mjs');
  });
});
