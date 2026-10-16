// `npm run verifier` (scripts/verifier.mjs): Turborepo plays the guards and the tests, then the
// frame reads the exit code of each task in the run's summary. A task at 75 (« à repasser »: every
// failure depended on a duration, one under load, scripts/vitest-config/) is played again alone
// once the CPU pressure is back under the threshold; a task at any other non-zero code is a red.
// Witness: BPScript, where tests past Vitest's delay under load refused lots at random.
//
// Each case plays the real Turborepo and the real Vitest of the repository in a repository of
// trial with two packages; the pressure is read from the file GRILLHOUSE_PRESSION_CPU names, which
// the trial's turbo.json passes to the tasks.
import { spawn, spawnSync } from 'node:child_process';
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
import { A_REPASSER } from '../../scripts/vitest-config/pression.mjs';
import { verifier } from '../../scripts/verifier.mjs';

const DEPOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(DEPOT, 'scripts/verifier.mjs');
const BASE = path.join(DEPOT, 'scripts/vitest-config/base.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verifier-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const pression = (some: number) =>
  `some avg10=${some.toFixed(2)} avg60=0.00 avg300=0.00 total=1\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n`;
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

// A test that writes its name to the trace, then: `vert`; `rouge` (an assertion); `delai` (past its
// delay, every time); `delai-une-fois` (past its delay the first time only).
type Sorte = 'vert' | 'rouge' | 'delai' | 'delai-une-fois';
const fichierDeTest = (racine: string, nom: string, sorte: Sorte) => {
  const trace = JSON.stringify(path.join(racine, 'joues.txt'));
  const marque = JSON.stringify(path.join(racine, `${nom}.deja`));
  const corps = {
    vert: '',
    rouge: '  expect(1).toBe(2);\n',
    delai: '  await new Promise(r => setTimeout(r, 400));\n',
    'delai-une-fois': `  if (!existsSync(${marque})) { writeFileSync(${marque}, ''); await new Promise(r => setTimeout(r, 400)); }\n`,
  }[sorte];
  return (
    "import { appendFileSync, existsSync, writeFileSync } from 'node:fs';\n" +
    "import { it, expect } from 'vitest';\n" +
    `it('${nom}', async () => {\n  appendFileSync(${trace}, '${nom}\\n');\n${corps}}, 100);\n`
  );
};

// A repository of packages `a` and `b`, each with one test of the sort given, the pressure file
// at <some>; <gardes> gives a package its guard scripts (`grillhouse:gardes`, `gardes`).
function depot(
  a: Sorte,
  b: Sorte,
  some: number,
  gardes: Partial<Record<'a' | 'b', Record<string, string>>> = {}
) {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(r, 'node_modules'), 'dir');
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
      globalPassThroughEnv: ['GRILLHOUSE_PRESSION_CPU'],
      tasks: {
        build: { outputs: [] },
        'grillhouse:gardes': { dependsOn: ['build'], outputs: [] },
        gardes: { dependsOn: ['build'], outputs: [] },
        'test:vitest': { dependsOn: ['build'], outputs: [] },
      },
    })
  );
  for (const [nom, sorte] of [
    ['a', a],
    ['b', b],
  ] as const) {
    ecrire(
      `packages/${nom}/package.json`,
      json({
        name: nom,
        type: 'module',
        scripts: { 'test:vitest': 'vitest run', ...(gardes[nom] ?? {}) },
      })
    );
    ecrire(
      `packages/${nom}/vitest.config.mjs`,
      `import base from ${JSON.stringify(BASE)};\nexport default base;\n`
    );
    ecrire(`packages/${nom}/test/x.test.mjs`, fichierDeTest(r, nom, sorte));
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
  };
  const joues = () =>
    existsSync(path.join(r, 'joues.txt'))
      ? readFileSync(path.join(r, 'joues.txt'), 'utf8').split('\n').filter(Boolean)
      : [];
  const ecrirePression = (s: number) => writeFileSync(fichierPression, pression(s));
  return { racine: r, env, joues, ecrirePression };
}

// The script run as `npm run verifier` runs it; <auPremierAttente> runs when its first wait line
// comes out.
function lancer(
  d: ReturnType<typeof depot>,
  args: string[] = [],
  auPremierAttente?: () => void
): Promise<{ status: number | null; sortie: string }> {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [SCRIPT, ...args], { cwd: d.racine, env: d.env });
    let sortie = '';
    let vu = false;
    const lire = (b: Buffer) => {
      sortie += b.toString();
      if (!vu && auPremierAttente && sortie.includes('⏳')) {
        vu = true;
        auPremierAttente();
      }
    };
    p.stdout.on('data', lire);
    p.stderr.on('data', lire);
    p.on('close', status => resolve({ status, sortie }));
  });
}

describe('npm run verifier', { timeout: 180_000 }, () => {
  it('a delay past under load: the task waits for rest, plays again alone, and the pass is green', async () => {
    const d = depot('delai-une-fois', 'vert', 90);
    const r = await lancer(d, [], () => d.ecrirePression(1));
    expect(r.status, r.sortie).toBe(0);
    expect(r.sortie).toContain('90.0 %');
    expect(r.sortie).toContain('↻ a#test:vitest');
    expect(r.sortie).not.toContain('↻ b#test:vitest');
    expect(d.joues().sort()).toEqual(['a', 'a', 'b']);
  });
  it('a real red beside a task at 75 is a red, named, and nothing waits', async () => {
    const d = depot('delai', 'rouge', 90);
    const r = await lancer(d);
    expect(r.status, r.sortie).toBe(1);
    expect(r.sortie).toContain('⛔ b#test:vitest');
    expect(r.sortie).not.toContain('⏳');
    expect(r.sortie).not.toContain('↻');
    expect(d.joues().sort()).toEqual(['a', 'b']);
  });
  it('a task played again at rest that fails is a red', async () => {
    const d = depot('delai', 'vert', 90);
    const r = await lancer(d, [], () => d.ecrirePression(1));
    expect(r.status, r.sortie).toBe(1);
    expect(r.sortie).toContain('↻ a#test:vitest');
    expect(r.sortie).toContain('⛔ a#test:vitest');
  });
  it('the bound reached without rest gives 75, neither green nor red', () => {
    const d = depot('delai', 'vert', 90);
    const lignes: string[] = [];
    const code = verifier({
      racine: d.racine,
      args: [],
      env: d.env,
      borneMs: 1_500,
      pasMs: 100,
      dire: (l: string) => lignes.push(l),
    });
    expect(code, lignes.join('\n')).toBe(A_REPASSER);
    expect(lignes.join('\n')).toMatch(/à repasser/);
  });
  it('green at once is 0, and the summary of the run is removed', async () => {
    const d = depot('vert', 'vert', 90);
    const r = await lancer(d);
    expect(r.status, r.sortie).toBe(0);
    expect(existsSync(path.join(d.racine, '.turbo/runs'))).toBe(false);
  });
  it('the arguments follow: --force plays again what the cache holds', async () => {
    const d = depot('vert', 'vert', 1);
    expect((await lancer(d)).status).toBe(0);
    expect((await lancer(d)).status).toBe(0);
    expect(d.joues()).toHaveLength(2);
    expect((await lancer(d, ['--force'])).status).toBe(0);
    expect(d.joues()).toHaveLength(4);
  });
});

describe('npm run verifier -- --gardes', { timeout: 180_000 }, () => {
  const vert = 'node -e ""';
  const rougeGarde = 'node -e "process.exit(1)"';
  it('plays the guards alone: green, 0, and no test plays', async () => {
    const d = depot('rouge', 'rouge', 1, {
      a: { 'grillhouse:gardes': vert },
      b: { gardes: vert },
    });
    const r = await lancer(d, ['--gardes']);
    expect(r.status, r.sortie).toBe(0);
    expect(d.joues()).toEqual([]);
  });
  it('a red guard is red, each red guard named, and no test plays', async () => {
    const d = depot('vert', 'vert', 1, {
      a: { 'grillhouse:gardes': rougeGarde },
      b: { gardes: rougeGarde },
    });
    const r = await lancer(d, ['--gardes']);
    expect(r.status, r.sortie).toBe(1);
    expect(r.sortie).toContain('⛔ a#grillhouse:gardes');
    expect(r.sortie).toContain('⛔ b#gardes');
    expect(d.joues()).toEqual([]);
  });
});

describe('the root script verifier', () => {
  it('calls the frame’s script', () => {
    const pkg = JSON.parse(readFileSync(path.join(DEPOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.verifier).toBe('node scripts/verifier.mjs');
  });
  it('is a frame file, distributed by the list of the frame', () => {
    const liste = readFileSync(path.join(DEPOT, '.claude/grillhouse/fichiers.txt'), 'utf8');
    expect(liste.split('\n')).toContain('scripts/verifier.mjs');
  });
  it('npm passes its code through: 75 stays 75', () => {
    const r = mkdtempSync(path.join(ESSAIS, 'npm-'));
    writeFileSync(
      path.join(r, 'package.json'),
      json({ name: 'n', scripts: { verifier: 'node -e "process.exit(75)"' } })
    );
    expect(spawnSync('npm', ['run', '--silent', 'verifier'], { cwd: r }).status).toBe(75);
  });
});
