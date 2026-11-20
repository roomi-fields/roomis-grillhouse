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
import { ecrire as ecrireTurbo } from '../../scripts/langages/typescript/turbo-des-paquets.mjs';

// A run that names a whole package of the graph plays the same task, under the same cache key, as
// the complete pass (Bazel: `bazel test //pkg/...` and `bazel test //...` share each target's cached
// result). The cache key is observed through what replays: a test file appends its mark to
// `joues.txt` each time it really plays, and a cache hit plays nothing.

const DEPOT = path.resolve(__dirname, '../../../..');
const SCRIPT = path.join(DEPOT, 'packages/grillhouse/scripts/langages/typescript/tests.mjs');
const BASE = path.join(
  DEPOT,
  'packages/grillhouse/scripts/langages/typescript/vitest-config/base.mjs'
);
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tests-paquet-entier-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

const fichierDeTest = (profondeur: number, marque: string) =>
  [
    "import { appendFileSync } from 'node:fs';",
    "import { it } from 'vitest';",
    `it('${marque}', () => {`,
    `  appendFileSync(new URL('${'../'.repeat(profondeur)}joues.txt', import.meta.url), '${marque}\\n');`,
    '});',
    '',
  ].join('\n');
const configuration = `import base from ${JSON.stringify(BASE)};\nexport default base;\n`;

// Packages `a` (tests x and y, the second also under `test/sous/`), `b` (x), and `rouge` (a test
// that plays then fails).
function depot() {
  const r = mkdtempSync(path.join(ESSAIS, 'paquets-'));
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(r, 'node_modules'), 'dir');
  ecrire(
    r,
    'package.json',
    json({
      name: 'essai',
      private: true,
      workspaces: ['packages/*'],
      packageManager: 'npm@10.9.8',
    })
  );
  ecrire(r, 'turbo.json', readFileSync(path.join(DEPOT, 'templates/turbo/paquets.json'), 'utf8'));
  for (const [nom, tests] of [
    ['a', ['test/x', 'test/y', 'test/sous/z']],
    ['b', ['test/x']],
  ] as const) {
    ecrire(
      r,
      `packages/${nom}/package.json`,
      json({ name: nom, type: 'module', scripts: { 'test:unit': 'vitest run' } })
    );
    ecrire(r, `packages/${nom}/vitest.config.mjs`, configuration);
    for (const t of tests) {
      const profondeur = t.split('/').length + 1;
      ecrire(
        r,
        `packages/${nom}/${t}.test.mjs`,
        fichierDeTest(profondeur, `${nom}/${t.replace('test/', '')}`)
      );
    }
  }
  ecrire(
    r,
    'packages/rouge/package.json',
    json({ name: 'rouge', type: 'module', scripts: { 'test:unit': 'vitest run' } })
  );
  ecrire(r, 'packages/rouge/vitest.config.mjs', configuration);
  ecrire(
    r,
    'packages/rouge/test/r.test.mjs',
    `${fichierDeTest(3, 'rouge/r')}import { expect, it } from 'vitest';\nit('rouge', () => { expect(1).toBe(2); });\n`
  );
  ecrire(r, 'tests/x.test.mjs', fichierDeTest(1, 'racine/x'));
  ecrire(r, '.gitignore', 'node_modules\n.turbo/\n.cache-outils/\njoues.txt\n');
  ecrireTurbo(r);
  return r;
}

const lancer = (racine: string, args: string[]) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: racine,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${path.join(DEPOT, 'node_modules/.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
      TURBO_TELEMETRY_DISABLED: '1',
      DO_NOT_TRACK: '1',
    },
  });
const joues = (racine: string) =>
  existsSync(path.join(racine, 'joues.txt'))
    ? readFileSync(path.join(racine, 'joues.txt'), 'utf8').split('\n').filter(Boolean).sort()
    : [];
const sortie = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`;

describe(
  'a package named whole shares the cache of the complete pass',
  { timeout: 120_000 },
  () => {
    // Each form names the root of the package `a` exactly.
    for (const forme of ['packages/a', 'packages/a/', './packages/a', 'ABSOLU']) {
      it(`the complete pass reads from the cache what a run of « ${forme} » just played`, () => {
        const racine = depot();
        const nom = forme === 'ABSOLU' ? path.join(racine, 'packages/a') : forme;
        const r1 = lancer(racine, [nom]);
        expect(r1.status, sortie(r1)).toBe(0);
        expect(joues(racine)).toEqual(['a/sous/z', 'a/x', 'a/y']);
        // The complete pass plays `b` and `rouge` (red), and nothing of `a` again.
        lancer(racine, []);
        expect(joues(racine).filter(m => m.startsWith('a/'))).toEqual(['a/sous/z', 'a/x', 'a/y']);
        expect(joues(racine)).toContain('b/x');
      });
    }

    it('the run of a whole package reads from the cache what the complete pass played', () => {
      const racine = depot();
      lancer(racine, []);
      const avant = joues(racine);
      const r = lancer(racine, ['packages/a']);
      expect(r.status, sortie(r)).toBe(0);
      expect(joues(racine)).toEqual(avant);
    });

    it('the second run of a whole package plays nothing', () => {
      const racine = depot();
      lancer(racine, ['packages/b']);
      lancer(racine, ['packages/b']);
      expect(joues(racine)).toEqual(['b/x']);
    });
  }
);

describe('a run that names files keeps a hash of its own', { timeout: 120_000 }, () => {
  it('a file run, then its package whole: the package plays again, and the file run is cached', () => {
    const racine = depot();
    lancer(racine, ['packages/a/test/x.test.mjs']);
    lancer(racine, ['packages/a/test/x.test.mjs']);
    expect(joues(racine)).toEqual(['a/x']);
    const r = lancer(racine, ['packages/a']);
    expect(r.status, sortie(r)).toBe(0);
    expect(joues(racine)).toEqual(['a/sous/z', 'a/x', 'a/x', 'a/y']);
  });

  it('a sub-folder of a package is no whole package: it keeps its own hash', () => {
    const racine = depot();
    lancer(racine, ['packages/a/test/sous']);
    expect(joues(racine)).toEqual(['a/sous/z']);
    lancer(racine, ['packages/a/test/sous']);
    expect(joues(racine)).toEqual(['a/sous/z']);
    lancer(racine, ['packages/a']);
    expect(joues(racine)).toEqual(['a/sous/z', 'a/sous/z', 'a/x', 'a/y']);
  });

  it('the test folder of a package is no whole package either', () => {
    const racine = depot();
    lancer(racine, ['packages/a/test']);
    lancer(racine, ['packages/a']);
    expect(joues(racine)).toEqual(['a/sous/z', 'a/sous/z', 'a/x', 'a/x', 'a/y', 'a/y']);
  });

  it('a path out of every package stays refused, code 2, nothing plays', () => {
    const racine = depot();
    const r = lancer(racine, ['tests/x.test.mjs']);
    expect(r.status).toBe(2);
    expect(joues(racine)).toEqual([]);
  });
});

describe('a run that mixes a whole package and files of another', { timeout: 120_000 }, () => {
  it('plays the whole package under the complete pass hash and the files under their own', () => {
    const racine = depot();
    const r = lancer(racine, ['packages/a', 'packages/b/test/x.test.mjs']);
    expect(r.status, sortie(r)).toBe(0);
    expect(joues(racine)).toEqual(['a/sous/z', 'a/x', 'a/y', 'b/x']);
    // `a` is the complete pass's: a run of `a` alone plays nothing.
    lancer(racine, ['packages/a']);
    expect(joues(racine)).toEqual(['a/sous/z', 'a/x', 'a/y', 'b/x']);
    // `b` has a hash of its own: the same mixed run replays nothing...
    lancer(racine, ['packages/a', 'packages/b/test/x.test.mjs']);
    expect(joues(racine)).toEqual(['a/sous/z', 'a/x', 'a/y', 'b/x']);
    // ...and `b` whole, under the complete pass's hash, plays again.
    lancer(racine, ['packages/b']);
    expect(joues(racine)).toEqual(['a/sous/z', 'a/x', 'a/y', 'b/x', 'b/x']);
  });

  it('the code is the first that is not 0, and the other run plays all the same', () => {
    const racine = depot();
    const r = lancer(racine, ['packages/rouge', 'packages/b/test/x.test.mjs']);
    expect(r.status, sortie(r)).not.toBe(0);
    expect(joues(racine)).toEqual(['b/x', 'rouge/r']);
  });

  it('the code of the whole package is the one given when the files pass', () => {
    const racine = depot();
    const r = lancer(racine, ['packages/b/test/x.test.mjs', 'packages/rouge']);
    expect(r.status, sortie(r)).not.toBe(0);
    expect(joues(racine)).toEqual(['b/x', 'rouge/r']);
  });
});

describe(
  'a whole package named with an option or --force keeps a hash of its own',
  { timeout: 120_000 },
  () => {
    it('an option moves the hash, never the folder of the package, and the next run without option reads the complete pass', () => {
      const racine = depot();
      lancer(racine, ['packages/a', '--testNamePattern=a/y']);
      expect(joues(racine)).toEqual(['a/y']);
      lancer(racine, ['packages/a', '--testNamePattern=a/y']);
      expect(joues(racine)).toEqual(['a/y']);
      lancer(racine, ['packages/a']);
      expect(joues(racine)).toEqual(['a/sous/z', 'a/x', 'a/y', 'a/y']);
      // The run without option is the complete pass's: a second one, and the pass, play nothing.
      lancer(racine, ['packages/a']);
      lancer(racine, []);
      expect(joues(racine).filter(m => m.startsWith('a/'))).toEqual([
        'a/sous/z',
        'a/x',
        'a/y',
        'a/y',
      ]);
    });

    it('--force plays for real, and the next run without it reads the complete pass cache', () => {
      const racine = depot();
      lancer(racine, ['packages/a']);
      lancer(racine, ['--force', 'packages/a']);
      expect(joues(racine)).toEqual(['a/sous/z', 'a/sous/z', 'a/x', 'a/x', 'a/y', 'a/y']);
      lancer(racine, ['packages/a']);
      lancer(racine, []);
      expect(joues(racine).filter(m => m.startsWith('a/'))).toHaveLength(6);
    });
  }
);
