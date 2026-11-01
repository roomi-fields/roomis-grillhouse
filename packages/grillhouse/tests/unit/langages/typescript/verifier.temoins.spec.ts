// grillhouse-bd7 — every measure of time plays at night, in every language: `npm run verifier`
// plays no time witness, and no pass of its own for them. Witness: the pass of the witnesses of
// grillhouse-3uv.89, played alone under the lock of the machine after the others, still met the
// load of the day (the day's machine is always loaded), and its waits for rest held the day. As
// Bazel leaves a test tagged `manual` out of a pattern and the benchmarks of Chromium and rustc-perf
// leave the CI of each commit for a machine at rest, the day leaves the witnesses out, and the
// night plays them (scripts/langages/typescript/tests-de-nuit.mjs).
//
// A time witness is a test file that marks its tests as measures of time (`mesurerAuRepos`, imported
// from `@roomi-fields/grillhouse/vitest-config/mesure`).
//
// Each case plays the real Turborepo and the real Vitest of the repository in a repository of trial
// with two packages; the pressure is read from the file GRILLHOUSE_PRESSION_CPU names.
import { spawn } from 'node:child_process';
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

const DEPOT = path.resolve(__dirname, '../../../../../..');
const SCRIPT = path.join(DEPOT, 'packages/grillhouse/scripts/langages/typescript/verifier.mjs');
const BASE = path.join(
  DEPOT,
  'packages/grillhouse/scripts/langages/typescript/vitest-config/base.mjs'
);
const MESURE = path.join(
  DEPOT,
  'packages/grillhouse/scripts/langages/typescript/vitest-config/mesure.mjs'
);
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verifier-temoins-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const pression = (some: number) =>
  `some avg10=${some.toFixed(2)} avg60=0.00 avg300=0.00 total=1\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n`;
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

// An ordinary test that writes « <nom> » to the trace.
const ordinaire = (trace: string, nom: string) =>
  "import { appendFileSync } from 'node:fs';\n" +
  "import { it } from 'vitest';\n" +
  `it('${nom}', () => { appendFileSync(${JSON.stringify(trace)}, '${nom}\\n'); });\n`;
// A time witness that writes « <nom> » to the trace, then fails its measure of time.
const temoin = (trace: string, nom: string) =>
  "import { appendFileSync } from 'node:fs';\n" +
  "import { it, expect } from 'vitest';\n" +
  `import { mesurerAuRepos } from ${JSON.stringify(MESURE)};\n` +
  `it('${nom}', ctx => mesurerAuRepos(ctx, () => {\n` +
  `  appendFileSync(${JSON.stringify(trace)}, '${nom}\\n');\n` +
  '  expect(400).toBeLessThan(100);\n' +
  '}));\n';

// A repository of packages `a` and `b`: each has an ordinary test; the packages <temoins> name
// have a time witness (`temps.test.mjs`) too.
function depot(temoins: ('a' | 'b')[], some: number) {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(r, 'node_modules'), 'dir');
  const trace = path.join(r, 'joues.txt');
  const ecrire = (f: string, t: string) => {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  };
  ecrire(
    'package.json',
    json({ name: 'essai', private: true, workspaces: ['packages/*'], packageManager: 'npm@10.9.8' })
  );
  ecrire(
    'turbo.json',
    json({
      $schema: 'https://turborepo.com/schema.json',
      globalPassThroughEnv: ['GRILLHOUSE_PRESSION_CPU', 'GRILLHOUSE_VERROU_MACHINE'],
      tasks: {
        build: { outputs: [] },
        'grillhouse:gardes': { dependsOn: ['build'], outputs: [] },
        gardes: { dependsOn: ['build'], outputs: [] },
        'test:unit': { dependsOn: ['build'], env: ['GRILLHOUSE_TESTS'], outputs: [] },
        typecheck: { dependsOn: ['build', '^build'], outputs: [] },
      },
    })
  );
  for (const nom of ['a', 'b'] as const) {
    ecrire(
      `packages/${nom}/package.json`,
      json({ name: nom, type: 'module', scripts: { 'test:unit': 'vitest run' } })
    );
    ecrire(
      `packages/${nom}/vitest.config.mjs`,
      `import base from ${JSON.stringify(BASE)};\nexport default base;\n`
    );
    ecrire(`packages/${nom}/test/x.test.mjs`, ordinaire(trace, nom));
    if (temoins.includes(nom)) {
      ecrire(`packages/${nom}/test/temps.test.mjs`, temoin(trace, `${nom}-temoin`));
    }
  }
  ecrire('.gitignore', 'node_modules\n.turbo/\n');
  const fichierPression = path.join(r, 'pression');
  writeFileSync(fichierPression, pression(some));
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
    ),
    PATH: `${path.join(DEPOT, 'node_modules/.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
    TURBO_TELEMETRY_DISABLED: '1',
    DO_NOT_TRACK: '1',
    GRILLHOUSE_PRESSION_CPU: fichierPression,
    GRILLHOUSE_VERROU_MACHINE: path.join(r, 'mesure.lock'),
  };
  const joues = () =>
    existsSync(trace) ? readFileSync(trace, 'utf8').split('\n').filter(Boolean) : [];
  return { racine: r, env, joues };
}

// The script run as `npm run verifier -- <args>` runs it.
function lancer(
  d: ReturnType<typeof depot>,
  args: string[] = []
): Promise<{ status: number | null; sortie: string }> {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [SCRIPT, ...args], { cwd: d.racine, env: d.env });
    let sortie = '';
    const lire = (b: Buffer) => {
      sortie += b.toString();
    };
    p.stdout.on('data', lire);
    p.stderr.on('data', lire);
    p.on('close', status => resolve({ status, sortie }));
  });
}

describe('grillhouse-bd7 — npm run verifier plays no time witness', { timeout: 180_000 }, () => {
  it('critère 1: the witnesses do not play, every other test does, and the pass is green under load', async () => {
    const d = depot(['a', 'b'], 90);
    const r = await lancer(d);
    expect(r.status, r.sortie).toBe(0);
    expect(d.joues().sort()).toEqual(['a', 'b']);
    expect(r.sortie).not.toMatch(/témoins de temps/);
  });

  it('critère 1: --tout, the complete pass, plays no witness either', async () => {
    const d = depot(['a'], 1);
    const r = await lancer(d, ['--tout']);
    expect(r.status, r.sortie).toBe(0);
    expect(d.joues().sort()).toEqual(['a', 'b']);
  });

  it('critère 1: a pass restricted by --filter plays no witness of the packages it chooses', async () => {
    const d = depot(['a', 'b'], 1);
    const r = await lancer(d, ['--filter=a']);
    expect(r.status, r.sortie).toBe(0);
    expect(d.joues()).toEqual(['a']);
  });
});
