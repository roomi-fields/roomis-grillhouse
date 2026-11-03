// grillhouse-61z: `npm run verifier` plays the format check and the lint of the project's root
// beside the guards, the typing and the tests, under the same `--continue` and the same verdict.
// Each case plays the real Turborepo and the real Vitest of the repository in a repository of trial
// with two packages; the root's scripts `format:check` and `lint` are tasks of the root
// (`//#format:check`, `//#lint`), and a script the root lacks is not demanded, as `gardes`.
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
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verifier-lint-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;
const VERT = 'node -e ""';
// A control that names the file it refuses, as ESLint and Prettier do, and exits 1.
const ROUGE = (fichier: string) => `node -e "console.error('${fichier}'); process.exit(1)"`;

type Sorte = 'vert' | 'rouge';
const test = (racine: string, nom: string, sorte: Sorte) =>
  "import { appendFileSync } from 'node:fs';\n" +
  "import { it, expect } from 'vitest';\n" +
  `it('${nom}', () => {\n  appendFileSync(${JSON.stringify(path.join(racine, 'joues.txt'))}, '${nom}\\n');\n` +
  `${sorte === 'rouge' ? '  expect(1).toBe(2);\n' : ''}});\n`;

// A repository of packages `a` and `b`; the root's scripts <racine> (lint, format:check…) and the
// root tasks of the turbo.json for each script it holds.
function depot(
  a: Sorte,
  b: Sorte,
  racine: Record<string, string> = {},
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
    json({
      name: 'essai',
      private: true,
      workspaces: ['packages/*'],
      packageManager: 'npm@10.9.8',
      scripts: racine,
    })
  );
  const tachesDeRacine = Object.fromEntries(
    Object.keys(racine).map(s => [`//#${s}`, { outputs: [] }])
  );
  ecrire(
    'turbo.json',
    json({
      $schema: 'https://turborepo.com/schema.json',
      tasks: {
        build: { outputs: [] },
        'grillhouse:gardes': { dependsOn: ['build'], outputs: [] },
        gardes: { dependsOn: ['build'], outputs: [] },
        'test:unit': { dependsOn: ['build'], outputs: [] },
        typecheck: { dependsOn: ['build', '^build'], outputs: [] },
        ...tachesDeRacine,
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
        scripts: { 'test:unit': 'vitest run', ...(gardes[nom] ?? {}) },
      })
    );
    ecrire(
      `packages/${nom}/vitest.config.mjs`,
      `import base from ${JSON.stringify(BASE)};\nexport default base;\n`
    );
    ecrire(`packages/${nom}/test/x.test.mjs`, test(r, nom, sorte));
  }
  ecrire('.gitignore', 'node_modules\n.turbo/\n');
  const env: NodeJS.ProcessEnv = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
    ),
    PATH: `${path.join(DEPOT, 'node_modules/.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
    TURBO_TELEMETRY_DISABLED: '1',
    DO_NOT_TRACK: '1',
  };
  const joues = () =>
    existsSync(path.join(r, 'joues.txt'))
      ? readFileSync(path.join(r, 'joues.txt'), 'utf8').split('\n').filter(Boolean).sort()
      : [];
  return { racine: r, env, joues };
}

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

describe('npm run verifier plays the lint and the format check', { timeout: 180_000 }, () => {
  it('critère 1: green lint and format check, green tests: 0, the tests played', async () => {
    const d = depot('vert', 'vert', { lint: VERT, 'format:check': VERT });
    const r = await lancer(d);
    expect(r.status, r.sortie).toBe(0);
    expect(d.joues()).toEqual(['a', 'b']);
  });

  it('critère 1: a red lint makes the pass red, 1, naming the task and the file', async () => {
    const d = depot('vert', 'vert', { lint: ROUGE('src/mauvais.ts'), 'format:check': VERT });
    const r = await lancer(d);
    expect(r.status, r.sortie).toBe(1);
    expect(r.sortie).toContain('⛔ //#lint');
    expect(r.sortie).toContain('src/mauvais.ts');
    expect(r.sortie).not.toContain('⛔ //#format:check');
  });

  it('critère 1: a badly formed file makes the pass red, 1, naming the task and the file', async () => {
    const d = depot('vert', 'vert', { lint: VERT, 'format:check': ROUGE('src/mal-forme.ts') });
    const r = await lancer(d);
    expect(r.status, r.sortie).toBe(1);
    expect(r.sortie).toContain('⛔ //#format:check');
    expect(r.sortie).toContain('src/mal-forme.ts');
    expect(r.sortie).not.toContain('⛔ //#lint');
  });

  it('critère 6: a red lint does not hide a red test: both are named, every test played', async () => {
    const d = depot('rouge', 'vert', {
      lint: ROUGE('src/x.ts'),
      'format:check': ROUGE('src/y.ts'),
    });
    const r = await lancer(d);
    expect(r.status, r.sortie).toBe(1);
    expect(r.sortie).toContain('⛔ //#lint');
    expect(r.sortie).toContain('⛔ //#format:check');
    expect(r.sortie).toContain('⛔ a#test:unit');
    expect(d.joues()).toEqual(['a', 'b']);
  });

  it('critère 6: a red guard and a red lint are both named', async () => {
    const d = depot('vert', 'vert', { lint: ROUGE('src/x.ts') }, { a: { gardes: ROUGE('g') } });
    const r = await lancer(d);
    expect(r.status, r.sortie).toBe(1);
    expect(r.sortie).toContain('⛔ //#lint');
    expect(r.sortie).toContain('⛔ a#gardes');
  });

  it('critère 6: a root without lint nor format:check is green, none demanded', async () => {
    const d = depot('vert', 'vert');
    const r = await lancer(d);
    expect(r.status, r.sortie).toBe(0);
    expect(d.joues()).toEqual(['a', 'b']);
  });

  it('critère 6: a root with the lint alone plays it; the missing format:check is not demanded', async () => {
    const d = depot('vert', 'vert', { lint: ROUGE('src/seul.ts') });
    const r = await lancer(d);
    expect(r.status, r.sortie).toBe(1);
    expect(r.sortie).toContain('⛔ //#lint');
    expect(r.sortie).not.toMatch(/format:check/);
  });

  it('critère 6: the root with the format check alone, green, is green', async () => {
    const d = depot('vert', 'vert', { 'format:check': VERT });
    const r = await lancer(d);
    expect(r.status, r.sortie).toBe(0);
  });
});

describe(
  'npm run verifier -- --gardes plays the lint and the format check',
  { timeout: 180_000 },
  () => {
    it('critère 7: green controls: 0, and no test plays', async () => {
      const d = depot('rouge', 'rouge', { lint: VERT, 'format:check': VERT });
      const r = await lancer(d, ['--gardes']);
      expect(r.status, r.sortie).toBe(0);
      expect(d.joues()).toEqual([]);
    });

    it('critère 7: a red lint is red, named, and no test plays', async () => {
      const d = depot('vert', 'vert', { lint: ROUGE('src/x.ts'), 'format:check': VERT });
      const r = await lancer(d, ['--gardes']);
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('⛔ //#lint');
      expect(d.joues()).toEqual([]);
    });

    it('critère 7: a badly formed file is red, named, and no test plays', async () => {
      const d = depot('vert', 'vert', { lint: VERT, 'format:check': ROUGE('src/y.ts') });
      const r = await lancer(d, ['--gardes']);
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('⛔ //#format:check');
      expect(d.joues()).toEqual([]);
    });

    it('critère 7: both red, both named; the repository whole, a script absent is not demanded', async () => {
      const d = depot('vert', 'vert', { lint: ROUGE('a.ts'), 'format:check': ROUGE('b.ts') });
      const r = await lancer(d, ['--gardes']);
      expect(r.sortie).toContain('⛔ //#lint');
      expect(r.sortie).toContain('⛔ //#format:check');
      const sans = await lancer(depot('vert', 'vert'), ['--gardes']);
      expect(sans.status, sans.sortie).toBe(0);
    });
  }
);
