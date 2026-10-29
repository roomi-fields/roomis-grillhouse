// A time witness is measured with the CPU at rest. Witness: BPScript, where under load tests ran
// past Vitest's delay (5 s) with nothing wrong and `npm run verifier` refused lots at random. The
// frame's base configuration of Vitest (@roomi-fields/grillhouse/vitest-config) notes the kernel's CPU pressure
// (/proc/pressure/cpu, line `some`, `avg10`) at the start and at the end of each test, and its
// duration reporter gives the exit code 75, « à repasser », when every failure depends on a
// duration (a delay past, a time budget bench, a test marked by `mesurerAuRepos`) and at least one
// took place under load (a pressure at or above 25 %); else Vitest's code stands. The model is
// Bazel's TIMEOUT/FLAKY and CTest's `--repeat after-timeout`: classify, then play again at rest.
//
// Each case plays the real Vitest of the repository in a project of trial; the pressure is read
// from the file GRILLHOUSE_PRESSION_CPU names, which the case writes.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  A_REPASSER,
  attendreLeRepos,
  lirePression,
  SEUIL_PRESSION,
} from '../../scripts/mesure/pression.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const PAQUET = path.join(DEPOT, 'packages/grillhouse/scripts/langages/typescript/vitest-config');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'temps-au-repos-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// The content of /proc/pressure/cpu for a pressure <some> (avg10, in %).
const pression = (some: number) =>
  `some avg10=${some.toFixed(2)} avg60=0.00 avg300=0.00 total=1\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n`;
const CHARGE = 90;
const REPOS = 1;

// A project of trial: the frame's base configuration (or the night's, `nuit`), its tests
// <fichiers>, the pressure file at <some> (absent when null).
function projet(fichiers: Record<string, string>, some: number | null, o: { nuit?: boolean } = {}) {
  const repo = mkdtempSync(path.join(ESSAIS, 'projet-'));
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(repo, 'node_modules'), 'dir');
  const fichierPression = path.join(repo, 'pression');
  if (some !== null) {
    writeFileSync(fichierPression, pression(some));
  }
  const config = o.nuit
    ? path.join(DEPOT, 'packages/grillhouse/scripts/langages/typescript/vitest.nuit.config.mjs')
    : path.join(repo, 'vitest.config.mjs');
  writeFileSync(
    path.join(repo, 'vitest.config.mjs'),
    `import base from ${JSON.stringify(path.join(PAQUET, 'base.mjs'))};\nexport default base;\n`
  );
  writeFileSync(path.join(repo, 'package.json'), '{"type":"module"}\n');
  for (const [f, contenu] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
    writeFileSync(path.join(repo, f), contenu);
  }
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
    ),
    GRILLHOUSE_PRESSION_CPU: fichierPression,
  };
  const r = spawnSync(
    path.join(DEPOT, 'node_modules/.bin/vitest'),
    ['run', '--root', repo, '--config', config],
    { cwd: repo, encoding: 'utf8', env, timeout: 120_000 }
  );
  return { status: r.status, sortie: `${r.stdout}\n${r.stderr}`, fichierPression };
}

const MESURE = JSON.stringify(path.join(PAQUET, 'mesure.mjs'));
// A test past its delay (100 ms).
const DELAI = `import { it } from 'vitest';\nit('lent', async () => { await new Promise(r => setTimeout(r, 400)); }, 100);\n`;
// A test that fails on an assertion.
const ROUGE = `import { it, expect } from 'vitest';\nit('faux', () => { expect(1).toBe(2); });\n`;
const VERT = `import { it } from 'vitest';\nit('juste', () => {});\n`;

describe('the duration reporter of the base configuration', { timeout: 120_000 }, () => {
  it('a delay past under load gives 75, the pressure and the threshold written', () => {
    const p = projet({ 'tests/a.test.mjs': DELAI }, CHARGE);
    expect(p.status, p.sortie).toBe(A_REPASSER);
    expect(p.sortie).toContain('90.0 %');
    expect(p.sortie).toContain(`seuil ${SEUIL_PRESSION} %`);
    expect(p.sortie).toMatch(/à repasser/);
  });
  it('a delay past at rest is a red: 1', () => {
    const p = projet({ 'tests/a.test.mjs': DELAI }, REPOS);
    expect(p.status, p.sortie).toBe(1);
    expect(p.sortie).toContain(`seuil ${SEUIL_PRESSION} %`);
  });
  it('a delay past under load beside a real red is a red: 1', () => {
    const p = projet({ 'tests/a.test.mjs': DELAI, 'tests/b.test.mjs': ROUGE }, CHARGE);
    expect(p.status, p.sortie).toBe(1);
  });
  it('a real red under load alone is a red: 1', () => {
    const p = projet({ 'tests/b.test.mjs': ROUGE }, CHARGE);
    expect(p.status, p.sortie).toBe(1);
  });
  it('a hook past its delay under load gives 75', () => {
    const p = projet(
      {
        'tests/a.test.mjs': `import { it, describe, beforeAll } from 'vitest';\ndescribe('s', () => {\n  beforeAll(async () => { await new Promise(r => setTimeout(r, 400)); }, 100);\n  it('dedans', () => {});\n});\n`,
      },
      CHARGE
    );
    expect(p.status, p.sortie).toBe(A_REPASSER);
  });
  it('a pressure at the threshold at the start of the test only is a load: 75', () => {
    const p = projet(
      {
        'tests/a.test.mjs': `import { writeFileSync } from 'node:fs';\nimport { it } from 'vitest';\nit('lent', async () => {\n  writeFileSync(process.env.GRILLHOUSE_PRESSION_CPU, ${JSON.stringify(pression(REPOS))});\n  await new Promise(r => setTimeout(r, 400));\n}, 100);\n`,
      },
      SEUIL_PRESSION
    );
    expect(p.status, p.sortie).toBe(A_REPASSER);
  });
  it('a test marked by mesurerAuRepos that fails under load gives 75; the same test unmarked, 1', () => {
    const marque = projet(
      {
        'tests/a.test.mjs': `import { it, expect } from 'vitest';\nimport { mesurerAuRepos } from ${MESURE};\nit('mesure', ctx => mesurerAuRepos(ctx, () => { expect(50).toBeLessThan(10); }));\n`,
      },
      CHARGE
    );
    expect(marque.status, marque.sortie).toBe(A_REPASSER);
    const nu = projet(
      {
        'tests/a.test.mjs': `import { it, expect } from 'vitest';\nit('mesure', () => { expect(50).toBeLessThan(10); });\n`,
      },
      CHARGE
    );
    expect(nu.status, nu.sortie).toBe(1);
  });
  it('mesurerAuRepos gives back what its function returns, awaited', () => {
    const p = projet(
      {
        'tests/a.test.mjs': `import { it, expect } from 'vitest';\nimport { mesurerAuRepos } from ${MESURE};\nit('valeur', async ctx => {\n  expect(await mesurerAuRepos(ctx, async () => 42)).toBe(42);\n  expect(mesurerAuRepos(ctx, () => 'x')).toBe('x');\n});\n`,
      },
      REPOS
    );
    expect(p.status, p.sortie).toBe(0);
  });
  it('green under load stays green: 0', () => {
    const p = projet({ 'tests/a.test.mjs': VERT }, CHARGE);
    expect(p.status, p.sortie).toBe(0);
  });
  it('a pressure that does not read leaves the verdict to Vitest, and says so', () => {
    const p = projet({ 'tests/a.test.mjs': DELAI }, null);
    expect(p.status, p.sortie).toBe(1);
    expect(p.sortie).toMatch(/pression CPU illisible/);
  });
  it('the night configuration: a time budget bench that fails under load gives 75, at rest 1', () => {
    const banc = { 'tests/t.budget.test.mjs': ROUGE };
    const charge = projet(banc, CHARGE, { nuit: true });
    expect(charge.status, charge.sortie).toBe(A_REPASSER);
    const repos = projet(banc, REPOS, { nuit: true });
    expect(repos.status, repos.sortie).toBe(1);
  });
});

describe('the reading of the pressure', () => {
  it('reads avg10 of the line some, in %', () => {
    const f = path.join(ESSAIS, 'p');
    writeFileSync(f, pression(31.25));
    expect(lirePression(f)).toBe(31.25);
  });
  it('gives null for a file absent or unreadable', () => {
    expect(lirePression(path.join(ESSAIS, 'absent'))).toBeNull();
    const f = path.join(ESSAIS, 'faux');
    writeFileSync(f, 'rien\n');
    expect(lirePression(f)).toBeNull();
  });
});

describe('the wait for rest', () => {
  // A clock and a pressure of trial: each sleep moves the clock; the pressure follows <suite>.
  const essai = (suite: (t: number) => number | null, borneMs: number) => {
    let t = 0;
    const lignes: string[] = [];
    const repos = attendreLeRepos({
      lire: () => suite(t),
      maintenant: () => t,
      dormir: (ms: number) => {
        t += ms;
      },
      limite: borneMs,
      dire: (l: string) => lignes.push(`${t} ${l}`),
    });
    return { repos, lignes, t };
  };
  it('returns at once at rest, without a line', () => {
    expect(essai(() => REPOS, 60_000)).toEqual({ repos: true, lignes: [], t: 0 });
  });
  it('waits while the pressure stays at or above the threshold, one line per 30 s at most, each with the pressure', () => {
    const e = essai(t => (t < 95_000 ? 40 : REPOS), 15 * 60_000);
    expect(e.repos).toBe(true);
    expect(e.t).toBeGreaterThanOrEqual(95_000);
    expect(e.lignes).toHaveLength(4);
    const instants = e.lignes.map(l => Number(l.split(' ')[0]));
    for (let i = 1; i < instants.length; i++) {
      expect(instants[i] - instants[i - 1]).toBeGreaterThanOrEqual(30_000);
    }
    for (const l of e.lignes) {
      expect(l).toContain('40.0 %');
    }
  });
  it('gives up at its bound', () => {
    const e = essai(() => CHARGE, 15 * 60_000);
    expect(e.repos).toBe(false);
    expect(e.t).toBeGreaterThanOrEqual(15 * 60_000);
    expect(e.lignes.length).toBeLessThanOrEqual(31);
  });
  it('a pressure that does not read ends the wait, and says so', () => {
    const e = essai(() => null, 60_000);
    expect(e.repos).toBe(true);
    expect(e.lignes.join('\n')).toMatch(/illisible/);
  });
});
