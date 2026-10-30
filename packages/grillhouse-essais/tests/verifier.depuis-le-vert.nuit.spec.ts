// `npm run verifier` measures a pass against the last green (scripts/dernier-vert.mjs): it keeps
// the tree of its last pass green, and the next pass plays, in each package Turborepo plays again,
// the tests Vitest relates to the files changed since that green, as `vitest --changed` does; a
// package whose inputs did not move replays from Turborepo's cache.
// Witness: Grillhouse (2026-10-21), a full `npm run verifier` red on one wrong test of 2 643 (the
// test, not the code); corrected, it played again whole: 13 min for one test.
//
// The chain, played at night: the real Turborepo, Vitest and git of the repository in a repository
// of trial, package `a` (two test files, `un` importing the shared material and the code, `deux`
// the code) and package `c` that nothing links to `a`. What each change plays in a package is the
// day's (packages/grillhouse/tests/unit/langages/typescript/changements.spec.ts), and so is the
// measure against the last green (packages/grillhouse/tests/unit/dernier-vert.spec.ts).
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
const BASE = path.join(CADRE, 'scripts/langages/typescript/vitest-config/base.mjs');
const TESTS = path.join(CADRE, 'scripts/langages/typescript/tests.mjs');
const VERIFIER = path.join(CADRE, 'scripts/langages/typescript/verifier.mjs');
// The summaries of Turborepo's runs a results directory holds, read in a process of its own.
const lireResumes = enProcessus<{ script: string; paquet: string; cache: string }[]>(
  'scripts/langages/typescript/verdict.mjs',
  'lireResumes'
);
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'depuis-le-vert-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

// A test file that writes <marque> to the trace when it plays; <imports> are its imports, <corps>
// what its test asserts.
const fichierDeTest = (trace: string, marque: string, imports = '', corps = '') =>
  "import { appendFileSync } from 'node:fs';\n" +
  "import { expect, it } from 'vitest';\n" +
  imports +
  `it('${marque}', () => {\n  appendFileSync(${JSON.stringify(trace)}, '${marque}\\n');\n${corps}});\n`;

const UN_IMPORTS =
  "import { attendu } from './matiere.mjs';\nimport { deux } from '../src/index.mjs';\n";
const DEUX_IMPORTS = "import { deux } from '../src/index.mjs';\n";

// The repository of trial, committed.
function depot() {
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
      globalPassThroughEnv: ['GRILLHOUSE_RESULTATS', 'GRILLHOUSE_CHANGEMENTS'],
      tasks: {
        build: { outputs: [] },
        'grillhouse:gardes': { dependsOn: ['build'], outputs: [] },
        gardes: { dependsOn: ['build'], outputs: [] },
        'test:unit': { dependsOn: ['build', '^build'], env: ['GRILLHOUSE_TESTS'], outputs: [] },
        typecheck: { dependsOn: ['build', '^build'], outputs: [] },
      },
    })
  );
  const config = `import base from ${JSON.stringify(BASE)};\nexport default base;\n`;
  const paquet = (nom: string) => {
    ecrire(
      `packages/${nom}/package.json`,
      json({
        name: nom,
        type: 'module',
        scripts: { build: 'node -e 0', 'test:unit': 'vitest run' },
      })
    );
    ecrire(`packages/${nom}/vitest.config.mjs`, config);
  };
  paquet('a');
  ecrire('packages/a/src/index.mjs', 'export const deux = () => 2;\n');
  ecrire('packages/a/test/matiere.mjs', 'export const attendu = 2;\n');
  ecrire('packages/a/test/notes.txt', 'des notes\n');
  ecrire(
    'packages/a/test/un.test.mjs',
    fichierDeTest(trace, 'a/un', UN_IMPORTS, '  expect(deux()).toBe(attendu);\n')
  );
  ecrire(
    'packages/a/test/deux.test.mjs',
    fichierDeTest(trace, 'a/deux', DEUX_IMPORTS, '  expect(deux()).toBe(2);\n')
  );
  paquet('c');
  ecrire('packages/c/test/c.test.mjs', fichierDeTest(trace, 'c'));
  ecrire('.gitignore', 'node_modules\n.turbo/\njoues.txt\nmesure.lock\n');
  const env: Record<string, string | undefined> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS' && !k.startsWith('GRILLHOUSE_')
      )
    ),
    PATH: `${path.join(DEPOT, 'node_modules/.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
    TURBO_TELEMETRY_DISABLED: '1',
    DO_NOT_TRACK: '1',
    // The trial repository's own lock of the heavy measure: the machine's is held by the pass this
    // test plays in.
    GRILLHOUSE_VERROU_MACHINE: path.join(r, 'mesure.lock'),
    GIT_AUTHOR_NAME: 'essai',
    GIT_AUTHOR_EMAIL: 'essai@essai.invalid',
    GIT_COMMITTER_NAME: 'essai',
    GIT_COMMITTER_EMAIL: 'essai@essai.invalid',
  };
  const git = (...a: string[]) => {
    const g = spawnSync('git', a, { cwd: r, env, encoding: 'utf8' });
    expect(g.status, `git ${a.join(' ')}: ${g.stderr}`).toBe(0);
    return g.stdout.trim();
  };
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'essai');
  // The marks the tests played wrote since the last read, sorted.
  let lus = 0;
  const joues = () => {
    const tout = existsSync(trace) ? readFileSync(trace, 'utf8').split('\n').filter(Boolean) : [];
    const neufs = tout.slice(lus);
    lus = tout.length;
    return neufs.sort();
  };
  // One pass of verifier with <args>, in a process of its own: its code, its output, the cache of
  // each task of tests.
  const passe = (args: string[] = []) => {
    const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
    const v = spawnSync(process.execPath, [VERIFIER, ...args], {
      cwd: r,
      env: { ...env, GRILLHOUSE_RESULTATS: resultats },
      encoding: 'utf8',
    });
    const cache: Record<string, string> = Object.fromEntries(
      lireResumes(resultats)
        .filter(t => t.script === 'test:unit')
        .map(t => [t.paquet, t.cache])
    );
    return { code: v.status, sortie: `${v.stdout}${v.stderr}`, cache, joues: joues() };
  };
  // `npm test -- <args>` as the circuit plays it, under <plus>.
  const npmTest = (args: string[], plus: Record<string, string> = {}) => {
    const t = spawnSync(process.execPath, [TESTS, ...args], {
      cwd: r,
      env: { ...env, ...plus },
      encoding: 'utf8',
    });
    return { code: t.status, sortie: `${t.stdout}${t.stderr}`, joues: joues() };
  };
  return { racine: r, ecrire, git, passe, npmTest, joues };
}

// A green first pass, which keeps its tree as the last green.
const premierVert = (d: ReturnType<typeof depot>) => {
  const p = d.passe();
  expect(p.code, p.sortie).toBe(0);
  return p;
};

describe('npm run verifier measured against the last green', { timeout: 240_000 }, () => {
  it('without a green known, the pass is complete, and its green becomes the last green', () => {
    const d = depot();
    const p = premierVert(d);
    expect(p.sortie).toMatch(/passe complète/);
    expect(p.joues).toEqual(['a/deux', 'a/un', 'c']);
    // Nothing changed since: Turborepo replays every task of tests from its cache.
    const q = d.passe();
    expect(q.code, q.sortie).toBe(0);
    expect(q.sortie).toMatch(/depuis le dernier vert/);
    expect(q.joues).toEqual([]);
  });

  it('a test corrected plays that test alone, and an untouched package replays from the cache', () => {
    const d = depot();
    premierVert(d);
    d.ecrire(
      'packages/a/test/deux.test.mjs',
      fichierDeTest(
        path.join(d.racine, 'joues.txt'),
        'a/deux',
        DEUX_IMPORTS,
        '  expect(2).toBe(2);\n'
      )
    );
    const p = d.passe();
    expect(p.code, p.sortie).toBe(0);
    expect(p.sortie).toMatch(/depuis le dernier vert/);
    expect(p.joues).toEqual(['a/deux']);
    expect(p.cache.c).toBe('HIT');
    expect(p.cache.a).toBe('MISS');
  });

  it('--tout plays every test for real, whatever the last green and the cache', () => {
    const d = depot();
    premierVert(d);
    const p = d.passe(['--tout']);
    expect(p.code, p.sortie).toBe(0);
    expect(p.sortie).toMatch(/passe complète/);
    expect(p.joues).toEqual(['a/deux', 'a/un', 'c']);
  });

  it('a red pass keeps the last green: the fix plays against it', () => {
    const d = depot();
    premierVert(d);
    const trace = path.join(d.racine, 'joues.txt');
    d.ecrire(
      'packages/a/test/deux.test.mjs',
      fichierDeTest(trace, 'a/deux', DEUX_IMPORTS, '  expect(deux()).toBe(3);\n')
    );
    const rouge = d.passe();
    expect(rouge.code, rouge.sortie).toBe(1);
    expect(rouge.joues).toEqual(['a/deux']);
    d.ecrire(
      'packages/a/test/deux.test.mjs',
      fichierDeTest(trace, 'a/deux', DEUX_IMPORTS, '  expect(deux()).toBe(1 + 1);\n')
    );
    const p = d.passe();
    expect(p.code, p.sortie).toBe(0);
    expect(p.joues).toEqual(['a/deux']);
  });

  it("npm test under the circuit's mark plays, in a package named, the tests related since the last green", () => {
    const d = depot();
    premierVert(d);
    d.ecrire(
      'packages/a/test/deux.test.mjs',
      fichierDeTest(
        path.join(d.racine, 'joues.txt'),
        'a/deux',
        DEUX_IMPORTS,
        '  expect(2).toBe(2);\n'
      )
    );
    const marque = { GRILLHOUSE_DEPUIS_LE_VERT: '1' };
    const t = d.npmTest(['packages/a'], marque);
    expect(t.code, t.sortie).toBe(0);
    expect(t.joues).toEqual(['a/deux']);
    // A file named itself plays, changed or not.
    const u = d.npmTest(['packages/a/test/un.test.mjs'], marque);
    expect(u.code, u.sortie).toBe(0);
    expect(u.joues).toEqual(['a/un']);
    // Without the mark, npm test plays every test of the package named (for real: the run with
    // the mark holds the same paths, and its green is in the cache).
    const v = d.npmTest(['--force', 'packages/a']);
    expect(v.code, v.sortie).toBe(0);
    expect(v.joues).toEqual(['a/deux', 'a/un']);
  });
});
