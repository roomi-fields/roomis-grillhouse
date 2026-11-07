// A measure of time plays at night, at rest. Witness: BPScript, where under load tests ran past
// Vitest's delay (5 s) with nothing wrong and `npm run verifier` refused lots at random; then
// grillhouse-bd7: the day is always loaded, and the measures of time, heavy and long, harm it.
// The frame's base configuration of Vitest (@roomi-fields/grillhouse/vitest-config) notes the
// kernel's CPU pressure (/proc/pressure/cpu, line `some`, `avg10`) at the start and at the end of
// each test, and its duration reporter gives the exit code 75, « à repasser », when every failure
// depends on a duration (a delay past in a night test, a time budget bench, a test marked by
// `mesurerAuRepos`) and at least one took place under load (a pressure at or above 25 %); else
// Vitest's code stands. A delay past in a day test is a red: a delay is a safeguard, not a
// measure (Bazel, Vitest). The model is Bazel's TIMEOUT/FLAKY and CTest's `--repeat
// after-timeout`: classify, then play again at rest, at night.
//
// Each case plays the real Vitest of the repository in a project of trial; the pressure is read
// from the file GRILLHOUSE_PRESSION_CPU names, which the case writes.
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
// <fichiers>, the pressure file at <some> (absent when null), <env> added to the environment.
// `{{trace}}` in a file is the path of the trace, read by `joues`.
function projet(
  fichiers: Record<string, string>,
  some: number | null,
  o: { nuit?: boolean; env?: (repo: string) => Record<string, string> } = {}
) {
  const repo = mkdtempSync(path.join(ESSAIS, 'projet-'));
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(repo, 'node_modules'), 'dir');
  const fichierPression = path.join(repo, 'pression');
  const trace = path.join(repo, 'joues.txt');
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
    writeFileSync(path.join(repo, f), contenu.replaceAll('{{trace}}', JSON.stringify(trace)));
  }
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
    ),
    GRILLHOUSE_PRESSION_CPU: fichierPression,
    ...(o.env?.(repo) ?? {}),
  };
  const r = spawnSync(
    path.join(DEPOT, 'node_modules/.bin/vitest'),
    ['run', '--root', repo, '--config', config],
    { cwd: repo, encoding: 'utf8', env, timeout: 120_000 }
  );
  const joues = existsSync(trace) ? readFileSync(trace, 'utf8').split('\n').filter(Boolean) : [];
  return { status: r.status, sortie: `${r.stdout}\n${r.stderr}`, fichierPression, joues };
}

const MESURE = JSON.stringify(path.join(PAQUET, 'mesure.mjs'));
// A test past its delay (100 ms).
const DELAI = `import { it } from 'vitest';\nit('lent', async () => { await new Promise(r => setTimeout(r, 400)); }, 100);\n`;
// A test that fails on an assertion.
const ROUGE = `import { it, expect } from 'vitest';\nit('faux', () => { expect(1).toBe(2); });\n`;
// A test that writes <nom> to the trace.
const TRACE = (nom: string) =>
  `import { appendFileSync } from 'node:fs';\nimport { it } from 'vitest';\nit('${nom}', () => { appendFileSync({{trace}}, '${nom}\\n'); });\n`;
// A time witness (a file that imports `mesurerAuRepos`) that writes <nom> to the trace, then fails
// its measure.
const TEMOIN = (nom: string) =>
  `import { appendFileSync } from 'node:fs';\nimport { it, expect } from 'vitest';\nimport { mesurerAuRepos } from ${MESURE};\n` +
  `it('${nom}', ctx => mesurerAuRepos(ctx, () => { appendFileSync({{trace}}, '${nom}\\n'); expect(50).toBeLessThan(10); }));\n`;
// The variable of a targeted run (scripts/langages/typescript/vitest-config/cibles.mjs), its paths
// from the project's root.
const CIBLES =
  (...chemins: string[]) =>
  (repo: string) => ({
    GRILLHOUSE_TESTS: JSON.stringify({ arguments: chemins.map(c => path.join(repo, c)) }),
  });

describe('the duration reporter of the base configuration', { timeout: 120_000 }, () => {
  it('critère 3: a delay past under load in a night test gives 75, the pressure and the threshold written', () => {
    const p = projet({ 'tests/a.nuit.test.mjs': DELAI }, CHARGE, { nuit: true });
    expect(p.status, p.sortie).toBe(A_REPASSER);
    expect(p.sortie).toContain('90.0 %');
    expect(p.sortie).toContain(`seuil ${SEUIL_PRESSION} %`);
    expect(p.sortie).toMatch(/à repasser/);
  });
  it('critère 3: a pressure at the threshold at the start of the test only is a load: 75', () => {
    const p = projet(
      {
        'tests/a.nuit.test.mjs': `import { writeFileSync } from 'node:fs';\nimport { it } from 'vitest';\nit('lent', async () => {\n  writeFileSync(process.env.GRILLHOUSE_PRESSION_CPU, ${JSON.stringify(pression(REPOS))});\n  await new Promise(r => setTimeout(r, 400));\n}, 100);\n`,
      },
      SEUIL_PRESSION,
      { nuit: true }
    );
    expect(p.status, p.sortie).toBe(A_REPASSER);
  });
  it('critère 3: a test marked by mesurerAuRepos that fails under load gives 75', () => {
    const marque = projet({ 'tests/a.test.mjs': TEMOIN('mesure') }, CHARGE, { nuit: true });
    expect(marque.status, marque.sortie).toBe(A_REPASSER);
  });
  it('mesurerAuRepos gives back what its function returns, awaited', () => {
    const p = projet(
      {
        'tests/a.test.mjs': `import { it, expect } from 'vitest';\nimport { mesurerAuRepos } from ${MESURE};\nit('valeur', async ctx => {\n  expect(await mesurerAuRepos(ctx, async () => 42)).toBe(42);\n  expect(mesurerAuRepos(ctx, () => 'x')).toBe('x');\n});\n`,
      },
      REPOS,
      { nuit: true }
    );
    expect(p.status, p.sortie).toBe(0);
  });
  // grillhouse-8cf: BPScript's verif-portes.mjs launches each test of a gate with the duration
  // reporter; Vitest loads a reporter by a package's name, so the package publishes it. The project
  // installs the frame's package as npm links a workspace, beside Vitest, without the base.
  it('Vitest loads the reporter by its published name, --reporter=@roomi-fields/grillhouse/vitest-config/duree', () => {
    const repo = mkdtempSync(path.join(ESSAIS, 'nomme-'));
    mkdirSync(path.join(repo, 'node_modules/@roomi-fields'), { recursive: true });
    symlinkSync(path.join(DEPOT, 'node_modules/vitest'), path.join(repo, 'node_modules/vitest'));
    symlinkSync(
      path.join(DEPOT, 'packages/grillhouse'),
      path.join(repo, 'node_modules/@roomi-fields/grillhouse')
    );
    const fichierPression = path.join(repo, 'pression');
    writeFileSync(fichierPression, pression(REPOS));
    writeFileSync(path.join(repo, 'package.json'), '{"type":"module"}\n');
    writeFileSync(path.join(repo, 'vitest.config.mjs'), 'export default {};\n');
    mkdirSync(path.join(repo, 'tests'));
    writeFileSync(path.join(repo, 'tests/a.nuit.test.mjs'), DELAI);
    const env = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
      ),
      GRILLHOUSE_PRESSION_CPU: fichierPression,
    };
    const r = spawnSync(
      path.join(DEPOT, 'node_modules/.bin/vitest'),
      ['run', '--root', repo, '--reporter=@roomi-fields/grillhouse/vitest-config/duree'],
      { cwd: repo, encoding: 'utf8', env, timeout: 120_000 }
    );
    const sortie = `${r.stdout}\n${r.stderr}`;
    expect(sortie).toContain('⏱ tests/a.nuit.test.mjs › lent : délai dépassé');
    expect(sortie).toContain(`seuil ${SEUIL_PRESSION} %`);
    expect(r.status, sortie).toBe(1);
  });
  it('the night configuration: a time budget bench that fails under load gives 75, at rest 1', () => {
    const banc = { 'tests/t.budget.test.mjs': ROUGE };
    const charge = projet(banc, CHARGE, { nuit: true });
    expect(charge.status, charge.sortie).toBe(A_REPASSER);
    const repos = projet(banc, REPOS, { nuit: true });
    expect(repos.status, repos.sortie).toBe(1);
  });
});

// grillhouse-bd7: every measure of time plays at night, in every language. A time witness (a test
// file that imports `mesurerAuRepos`) is out of the day, as a time budget bench is.
describe('bd7 — the time witnesses play at night', { timeout: 120_000 }, () => {
  const FICHIERS = { 'tests/temps.test.mjs': TEMOIN('temoin'), 'tests/x.test.mjs': TRACE('jour') };
  it('critère 1: the day leaves a time witness out and plays its other tests', () => {
    const p = projet(FICHIERS, CHARGE);
    expect(p.status, p.sortie).toBe(0);
    expect(p.joues).toEqual(['jour']);
  });
  it('critère 1: a targeted run that names a directory leaves the witness under it out', () => {
    const p = projet(FICHIERS, CHARGE, { env: CIBLES('tests/') });
    expect(p.status, p.sortie).toBe(0);
    expect(p.joues).toEqual(['jour']);
  });
  it('critère 2: a targeted run that names the file of a witness plays it, under the measure of time: 75 under load, 1 at rest', () => {
    const charge = projet(FICHIERS, CHARGE, { env: CIBLES('tests/temps.test.mjs') });
    expect(charge.status, charge.sortie).toBe(A_REPASSER);
    expect(charge.joues).toEqual(['temoin']);
    const repos = projet(FICHIERS, REPOS, { env: CIBLES('tests/temps.test.mjs') });
    expect(repos.status, repos.sortie).toBe(1);
  });
  it('critère 1: the night configuration plays the witnesses, and no day test', () => {
    const p = projet(FICHIERS, CHARGE, { nuit: true });
    expect(p.status, p.sortie).toBe(A_REPASSER);
    expect(p.joues).toEqual(['temoin']);
  });
  it('critère 1: the night plays its night tests apart from its measures, the witnesses and the benches', () => {
    const fichiers = {
      ...FICHIERS,
      'tests/a.nuit.test.mjs': TRACE('nuit'),
      'tests/t.budget.test.mjs': TRACE('banc'),
    };
    const nuit = projet(fichiers, REPOS, {
      nuit: true,
      env: () => ({ GRILLHOUSE_TESTS_DE_NUIT: 'nuit' }),
    });
    expect(nuit.status, nuit.sortie).toBe(0);
    expect(nuit.joues).toEqual(['nuit']);
    const mesures = projet(fichiers, CHARGE, {
      nuit: true,
      env: () => ({ GRILLHOUSE_TESTS_DE_NUIT: 'mesures' }),
    });
    expect(mesures.status, mesures.sortie).toBe(A_REPASSER);
    expect(mesures.joues.sort()).toEqual(['banc', 'temoin']);
    expect(mesures.sortie).not.toMatch(/a\.nuit\.test/);
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
