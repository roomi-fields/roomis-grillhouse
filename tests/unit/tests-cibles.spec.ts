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
import { ecrire as ecrireTurbo } from '../../scripts/turbo-des-paquets.mjs';

// Witness: BPScript (31 packages). `npm test -- <files>` was `turbo run test:vitest -- <files>`:
// each package received the files, resolved them from its own directory, matched none, and the
// base configuration's `passWithNoTests` turned each into a green: the run played nothing and
// returned 0, and an agent believed it had played its tests. `npm test` (scripts/tests.mjs) plays
// each file named from the root in the package that holds it, and a run that plays no test fails.

const DEPOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(DEPOT, 'scripts/tests.mjs');
const BASE = path.join(DEPOT, 'scripts/vitest-config/base.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tests-cibles-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

// A test file that, once played, writes <marque> to `joues.txt` at the root of the trial.
const fichierDeTest = (profondeur: number, marque: string) =>
  [
    "import { appendFileSync } from 'node:fs';",
    "import { it } from 'vitest';",
    `it('${marque}', () => {`,
    `  appendFileSync(new URL('${'../'.repeat(profondeur)}joues.txt', import.meta.url), '${marque}\\n');`,
    '});',
    '',
  ].join('\n');
// The configuration of a package: the frame's base, by its path (the trial has no workspace for it).
const configuration = `import base from ${JSON.stringify(BASE)};\nexport default base;\n`;

// A build script that writes <marque> to `construits.txt` at the root of the trial, <profondeur>
// directories up; it fails when <echoue>.
const construction = (profondeur: number, marque: string, echoue = false) =>
  `node -e "require('node:fs').appendFileSync('${'../'.repeat(profondeur)}construits.txt', '${marque}\\n')"${echoue ? ' && exit 1' : ''}`;

// A repository of packages: `a` (two tests), `ab` (a name `a` prefixes), `b`, which depends on
// `socle` (a build, no tests), `gele` listed out of the frame, `outil` without tests, and a test
// file at the root, out of every package. `socle`'s build fails when <socleEchoue>.
function depotAPaquets({ socleEchoue = false } = {}) {
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
  ecrire(r, 'docs/agents/hors-cadre.txt', 'gele v1 gelée\n');
  for (const [nom, tests] of [
    ['a', ['x', 'y']],
    ['ab', ['x', 'y']],
    ['b', ['x']],
    ['gele', ['x']],
  ] as const) {
    ecrire(
      r,
      `packages/${nom}/package.json`,
      json({
        name: nom,
        type: 'module',
        scripts: { 'test:vitest': 'vitest run' },
        ...(nom === 'b' ? { dependencies: { socle: '*' } } : {}),
      })
    );
    ecrire(r, `packages/${nom}/vitest.config.mjs`, configuration);
    for (const t of tests) {
      ecrire(r, `packages/${nom}/test/${t}.test.mjs`, fichierDeTest(3, `${nom}/${t}`));
    }
  }
  ecrire(r, 'packages/outil/package.json', json({ name: 'outil', scripts: { build: 'true' } }));
  ecrire(
    r,
    'packages/socle/package.json',
    json({ name: 'socle', scripts: { build: construction(2, 'socle', socleEchoue) } })
  );
  ecrire(r, 'packages/outil/test/x.test.mjs', fichierDeTest(3, 'outil/x'));
  ecrire(r, 'tests/x.test.mjs', fichierDeTest(1, 'racine/x'));
  ecrire(r, '.gitignore', 'node_modules\n.turbo/\njoues.txt\nconstruits.txt\n');
  // The turbo.json of each package, as the update writes them: `gele` plays no task.
  ecrireTurbo(r);
  return r;
}

// A repository without packages: the root holds the tests, as Grillhouse does.
function depotSansPaquets() {
  const r = mkdtempSync(path.join(ESSAIS, 'sans-paquets-'));
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(r, 'node_modules'), 'dir');
  ecrire(
    r,
    'package.json',
    json({
      name: 'essai',
      type: 'module',
      packageManager: 'npm@10.9.8',
      scripts: { build: construction(0, 'racine'), 'test:vitest': 'vitest run' },
    })
  );
  ecrire(
    r,
    'turbo.json',
    readFileSync(path.join(DEPOT, 'templates/turbo/sans-paquets.json'), 'utf8')
  );
  ecrire(r, 'vitest.config.mjs', configuration);
  ecrire(r, 'tests/x.test.mjs', fichierDeTest(1, 'racine/x'));
  ecrire(r, 'tests/y.test.mjs', fichierDeTest(1, 'racine/y'));
  ecrire(r, '.gitignore', 'node_modules\n.turbo/\njoues.txt\nconstruits.txt\n');
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
// The tests played since the trial began, sorted.
const joues = (racine: string) =>
  existsSync(path.join(racine, 'joues.txt'))
    ? readFileSync(path.join(racine, 'joues.txt'), 'utf8').split('\n').filter(Boolean).sort()
    : [];
const sortie = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`;
// The builds played since the trial began, in order.
const construits = (racine: string) =>
  existsSync(path.join(racine, 'construits.txt'))
    ? readFileSync(path.join(racine, 'construits.txt'), 'utf8').split('\n').filter(Boolean)
    : [];

describe(
  'npm test -- <files>, in a repository of packages, plays the files named from the root',
  { timeout: 60_000 },
  () => {
    it('a file plays in its package, and no other test plays', () => {
      const racine = depotAPaquets();
      const r = lancer(racine, ['packages/a/test/x.test.mjs']);
      expect(r.status, sortie(r)).toBe(0);
      expect(joues(racine)).toEqual(['a/x']);
    });

    it('files of two packages each play in their own package', () => {
      const racine = depotAPaquets();
      const r = lancer(racine, ['packages/a/test/y.test.mjs', 'packages/b/test/x.test.mjs']);
      expect(r.status, sortie(r)).toBe(0);
      expect(joues(racine)).toEqual(['a/y', 'b/x']);
    });

    it('a directory plays the tests under it, and only those: a package its name prefixes is not reached', () => {
      const racine = depotAPaquets();
      const r = lancer(racine, ['packages/a', 'packages/ab/test/x.test.mjs']);
      expect(r.status, sortie(r)).toBe(0);
      expect(joues(racine)).toEqual(['a/x', 'a/y', 'ab/x']);
    });

    it('a path that names no test fails', () => {
      const racine = depotAPaquets();
      const r = lancer(racine, ['packages/a/test/absent.test.mjs']);
      expect(r.status).not.toBe(0);
      expect(joues(racine)).toEqual([]);
    });

    it('a file out of every package is refused, named, and nothing plays', () => {
      const racine = depotAPaquets();
      const r = lancer(racine, ['tests/x.test.mjs']);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('tests/x.test.mjs');
      expect(joues(racine)).toEqual([]);
    });

    it('a file of a package out of the frame is refused, and nothing plays', () => {
      const racine = depotAPaquets();
      const r = lancer(racine, ['packages/gele/test/x.test.mjs', 'packages/a/test/x.test.mjs']);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('packages/gele/test/x.test.mjs');
      expect(r.stderr).toContain('hors-cadre');
      expect(joues(racine)).toEqual([]);
    });

    it('a file of a package without test:vitest is refused, and nothing plays', () => {
      const racine = depotAPaquets();
      const r = lancer(racine, ['packages/outil/test/x.test.mjs']);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('packages/outil/test/x.test.mjs');
      expect(r.stderr).toContain('test:vitest');
      expect(joues(racine)).toEqual([]);
    });

    it('an option written --name=value goes to Vitest', () => {
      const racine = depotAPaquets();
      const r = lancer(racine, ['packages/a', '--testNamePattern=a/y']);
      expect(r.status, sortie(r)).toBe(0);
      expect(joues(racine)).toEqual(['a/y']);
    });

    it('without a file, every package of the frame plays its tests', () => {
      const racine = depotAPaquets();
      const r = lancer(racine, []);
      expect(r.status, sortie(r)).toBe(0);
      expect(joues(racine)).toEqual(['a/x', 'a/y', 'ab/x', 'ab/y', 'b/x']);
    });

    it('a run replays from the cache; --force (npm run test:forcer) plays for real', () => {
      const racine = depotAPaquets();
      expect(lancer(racine, ['packages/b/test/x.test.mjs']).status).toBe(0);
      expect(lancer(racine, ['packages/b/test/x.test.mjs']).status).toBe(0);
      expect(joues(racine)).toEqual(['b/x']);
      const r = lancer(racine, ['--force', 'packages/b/test/x.test.mjs']);
      expect(r.status, sortie(r)).toBe(0);
      expect(joues(racine)).toEqual(['b/x', 'b/x']);
    });

    // Witness: BPScript, whose targeted runs replayed the 12 builds a package depends on: Turborepo
    // passes the arguments after `--` to every task of the graph and counts them in its hash.
    it('the builds a targeted run waits for replay from the cache when another file is named', () => {
      const racine = depotAPaquets();
      const r1 = lancer(racine, ['packages/b/test/x.test.mjs']);
      expect(r1.status, sortie(r1)).toBe(0);
      const r2 = lancer(racine, ['packages/b']);
      expect(r2.status, sortie(r2)).toBe(0);
      expect(construits(racine)).toEqual(['socle']);
      expect(joues(racine)).toEqual(['b/x', 'b/x']);
    });

    it('--force plays the named tests for real, and their builds from the cache', () => {
      const racine = depotAPaquets();
      expect(lancer(racine, ['packages/b/test/x.test.mjs']).status).toBe(0);
      const r = lancer(racine, ['--force', 'packages/b/test/x.test.mjs']);
      expect(r.status, sortie(r)).toBe(0);
      expect(construits(racine)).toEqual(['socle']);
      expect(joues(racine)).toEqual(['b/x', 'b/x']);
    });

    it('a build that fails fails the targeted run, and no test plays', () => {
      const racine = depotAPaquets({ socleEchoue: true });
      const r = lancer(racine, ['packages/b/test/x.test.mjs']);
      expect(r.status).not.toBe(0);
      expect(joues(racine)).toEqual([]);
    });
  }
);

describe('npm test -- <files>, in a repository without packages', { timeout: 60_000 }, () => {
  it('plays the files named from the root, and only those', () => {
    const racine = depotSansPaquets();
    const r = lancer(racine, ['tests/y.test.mjs']);
    expect(r.status, sortie(r)).toBe(0);
    expect(joues(racine)).toEqual(['racine/y']);
  });

  it('a path that names no test fails', () => {
    const racine = depotSansPaquets();
    const r = lancer(racine, ['tests/absent.test.mjs']);
    expect(r.status).not.toBe(0);
    expect(joues(racine)).toEqual([]);
  });

  it('the build replays from the cache when another file is named; --force replays the tests only', () => {
    const racine = depotSansPaquets();
    expect(lancer(racine, ['tests/x.test.mjs']).status).toBe(0);
    const r2 = lancer(racine, ['tests/y.test.mjs']);
    expect(r2.status, sortie(r2)).toBe(0);
    const r3 = lancer(racine, ['--force', 'tests/y.test.mjs']);
    expect(r3.status, sortie(r3)).toBe(0);
    expect(construits(racine)).toEqual(['racine']);
    expect(joues(racine)).toEqual(['racine/x', 'racine/y', 'racine/y']);
  });

  it('without a file, every test plays', () => {
    const racine = depotSansPaquets();
    const r = lancer(racine, []);
    expect(r.status, sortie(r)).toBe(0);
    expect(joues(racine)).toEqual(['racine/x', 'racine/y']);
  });
});
