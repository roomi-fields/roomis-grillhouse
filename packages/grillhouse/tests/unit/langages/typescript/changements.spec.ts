// A pass measured against the last green restricts each package's run to the changes since it
// (scripts/langages/typescript/vitest-config/cibles.mjs, its plugin `ciblage`, and ./changements.mjs): the tests
// Vitest relates to the files changed (`related`, as `vitest --changed` has it), the files a
// targeted run names kept, or every test of the package when a change lies where Vitest's graph
// of a test does not reach (the configuration, a file no module imports, a file removed, the code
// of a package it depends on).
// Witness: Grillhouse (2026-10-21), a full `npm run verifier` red on one wrong test of 2 643 (the
// test, not the code); corrected, it played again whole: 13 min for one test.
//
// Each case gives the plugin the file of the changes a pass writes and reads the test options it
// leaves to Vitest; the chain that plays them (Turborepo, its cache, Vitest) is the night's
// (packages/grillhouse-essais/tests/verifier.depuis-le-vert.nuit.spec.ts).
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ciblage,
  VARIABLE,
} from '../../../../scripts/langages/typescript/vitest-config/cibles.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'changements-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// The variable that names the file of the changes (scripts/dernier-vert.mjs, CHANGEMENTS).
const CHANGEMENTS = 'GRILLHOUSE_CHANGEMENTS';
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

// The repository: package `a` (its code, its shared test material, a note its tests read, two
// test files), package `b` that depends on `a`, package `c` that nothing links to `a`.
function depot() {
  const r = realpathSync(mkdtempSync(path.join(ESSAIS, 'depot-')));
  const ecrire = (f: string, t: string) => {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  };
  ecrire('package.json', json({ name: 'essai', private: true, workspaces: ['packages/*'] }));
  const paquet = (nom: string, plus: Record<string, unknown> = {}) => {
    ecrire(`packages/${nom}/package.json`, json({ name: nom, type: 'module', ...plus }));
    ecrire(`packages/${nom}/vitest.config.mjs`, 'export default {};\n');
  };
  paquet('a');
  ecrire('packages/a/src/index.mjs', 'export const deux = () => 2;\n');
  ecrire('packages/a/test/matiere.mjs', 'export const attendu = 2;\n');
  ecrire('packages/a/test/notes.txt', 'des notes\n');
  ecrire('packages/a/test/un.test.mjs', "import './matiere.mjs';\n");
  ecrire('packages/a/test/deux.test.mjs', "import '../src/index.mjs';\n");
  paquet('b', { devDependencies: { a: '*' } });
  ecrire('packages/b/test/b.test.mjs', '\n');
  paquet('c');
  ecrire('packages/c/test/c.test.mjs', '\n');
  mkdirSync(path.join(r, 'node_modules'));
  for (const p of ['a', 'b', 'c']) {
    symlinkSync(`../packages/${p}`, path.join(r, 'node_modules', p), 'dir');
  }
  return r;
}

type Test = { related?: string[]; include?: string[]; passWithNoTests?: boolean };

// The run of the package <paquet> of <racine> under the changes <fichiers> and <supprimes>, and the
// paths a targeted run names (<nommes>, from the root): the test options the plugin leaves, the
// related files from the root, and the line it writes.
async function restreint(
  racine: string,
  paquet: string,
  fichiers: string[],
  supprimes: string[] = [],
  nommes: string[] = [],
  cible = false
) {
  const f = path.join(mkdtempSync(path.join(ESSAIS, 'changements-')), 'changements.json');
  writeFileSync(
    f,
    JSON.stringify({ racine, fichiers, supprimes, ...(cible ? { cible: true } : {}) })
  );
  const env: Record<string, string> = { [CHANGEMENTS]: f };
  if (nommes.length) {
    env[VARIABLE] = JSON.stringify({ arguments: nommes.map(n => path.join(racine, n)) });
  }
  const lignes: string[] = [];
  const config: { root: string; test?: Test } = { root: path.join(racine, 'packages', paquet) };
  await ciblage(env, (l: string) => lignes.push(l)).config(config);
  const test = config.test ?? {};
  return {
    test,
    related: test.related?.map(a => path.relative(racine, a)).sort(),
    ligne: lignes.join('\n'),
    variables: Object.keys(env),
  };
}

describe('a pass measured against the last green, in each package', () => {
  it('a test corrected relates that test alone', async () => {
    const r = depot();
    const p = await restreint(r, 'a', ['packages/a/test/deux.test.mjs']);
    expect(p.related).toEqual(['packages/a/test/deux.test.mjs']);
    expect(p.test.passWithNoTests).toBe(true);
    expect(p.ligne).toMatch(/les tests que Vitest relie aux 1 fichier\(s\) changé\(s\)/);
  });

  it('the shared test material corrected relates it, for the test that imports it', async () => {
    const r = depot();
    const p = await restreint(r, 'a', ['packages/a/test/matiere.mjs']);
    expect(p.related).toEqual(['packages/a/test/matiere.mjs', 'packages/a/test/un.test.mjs']);
  });

  it('the code changed relates the code, for the tests that read it', async () => {
    const r = depot();
    const p = await restreint(r, 'a', ['packages/a/src/index.mjs']);
    expect(p.related).toEqual(['packages/a/src/index.mjs', 'packages/a/test/deux.test.mjs']);
  });

  it('a package the changes do not reach relates them and passes without a test', async () => {
    const r = depot();
    const p = await restreint(r, 'c', ['packages/a/test/deux.test.mjs']);
    expect(p.related).toEqual(['packages/a/test/deux.test.mjs']);
    expect(p.test.passWithNoTests).toBe(true);
  });

  it('the configuration of Vitest changed plays the whole package', async () => {
    const r = depot();
    const p = await restreint(r, 'a', ['packages/a/vitest.config.mjs']);
    expect(p.test.related).toBeUndefined();
    expect(p.ligne).toMatch(/tous ses tests, la configuration du paquet/);
  });

  it('a file no module imports (data a test reads) plays the whole package', async () => {
    const r = depot();
    const p = await restreint(r, 'a', ['packages/a/test/notes.txt']);
    expect(p.test.related).toBeUndefined();
    expect(p.ligne).toMatch(/tous ses tests, un fichier qu’aucun module n’importe/);
  });

  it('a file removed plays the whole package', async () => {
    const r = depot();
    const p = await restreint(r, 'a', [], ['packages/a/test/notes.txt']);
    expect(p.test.related).toBeUndefined();
    expect(p.ligne).toMatch(/tous ses tests, un fichier supprimé/);
  });

  it('the code of a package it depends on plays the dependent whole; a test of it, none of its', async () => {
    const r = depot();
    const code = await restreint(r, 'b', ['packages/a/src/index.mjs']);
    expect(code.test.related).toBeUndefined();
    expect(code.ligne).toMatch(/tous ses tests, le code d’un paquet dont il dépend/);
    const test = await restreint(r, 'b', ['packages/a/test/deux.test.mjs']);
    expect(test.related).toEqual(['packages/a/test/deux.test.mjs']);
  });

  it('a file a targeted run names plays, changed or not, beside the tests related', async () => {
    const r = depot();
    const p = await restreint(
      r,
      'a',
      ['packages/a/test/deux.test.mjs'],
      [],
      ['packages/a/test/un.test.mjs']
    );
    expect(p.related).toEqual(['packages/a/test/deux.test.mjs', 'packages/a/test/un.test.mjs']);
    expect(p.test.include).toEqual(['test/un.test.mjs']);
  });

  it('a directory named relates the changes alone', async () => {
    const r = depot();
    const p = await restreint(r, 'a', ['packages/a/test/deux.test.mjs'], [], ['packages/a']);
    expect(p.related).toEqual(['packages/a/test/deux.test.mjs']);
  });

  it('the variables are taken out of the environment once read', async () => {
    const r = depot();
    const p = await restreint(r, 'a', ['packages/a/src/index.mjs'], [], ['packages/a']);
    expect(p.variables).toEqual([]);
  });
});

// The circuit's passes measure against the base of the lot, targeted (`cible`), as `vitest
// --changed`: the tests Vitest relates to the lot alone, a file out of its graph relating no test
// by the paths tests read, and the package plays whole only for its configuration, a file removed,
// or the code of a package it depends on; the CI of the ticket's branch and the night play the rest.
// Witness: grillhouse-4nr.21, 7 passes of the 4 235 tests of packages/grillhouse for a lot whose
// tests play in 1 to 10 s, its CHANGELOG and its documents counted as reads of the whole package.
describe('a measure targeted against the base of a lot, in each package', () => {
  // The repository of depot(), with a test of `a` that reads its notes by their path, and a
  // document at the top that `a` declares it reads (`grillhouse.lit`), named by a test.
  function depotDesLectures() {
    const r = depot();
    const ecrire = (f: string, t: string) => {
      mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
      writeFileSync(path.join(r, f), t);
    };
    ecrire(
      'packages/a/package.json',
      json({ name: 'a', type: 'module', grillhouse: { lit: ['docs'] } })
    );
    ecrire('docs/guide.md', '# Le guide\n');
    ecrire(
      'packages/a/test/trois.test.mjs',
      "import { readFileSync } from 'node:fs';\nreadFileSync('notes.txt');\n"
    );
    ecrire(
      'packages/a/test/quatre.test.mjs',
      "import { readFileSync } from 'node:fs';\nreadFileSync('docs/guide.md');\n"
    );
    return r;
  }

  it('a file no module imports plays neither the whole package nor the tests that read it by its path', async () => {
    const r = depotDesLectures();
    const p = await restreint(r, 'a', ['packages/a/test/notes.txt'], [], [], true);
    expect(p.related).toEqual(['packages/a/test/notes.txt']);
    expect(p.ligne).not.toMatch(/tous ses tests/);
  });

  it('a path the package declares it reads plays neither the whole package nor the tests that name it', async () => {
    const r = depotDesLectures();
    const p = await restreint(r, 'a', ['docs/guide.md'], [], [], true);
    expect(p.related).toEqual(['docs/guide.md']);
    expect(p.ligne).not.toMatch(/tous ses tests/);
  });

  it('the tests Vitest relates to the code still play', async () => {
    const r = depotDesLectures();
    const p = await restreint(r, 'a', ['packages/a/src/index.mjs', 'docs/guide.md'], [], [], true);
    expect(p.related).toEqual(['docs/guide.md', 'packages/a/src/index.mjs']);
    expect(p.test.passWithNoTests).toBe(true);
  });

  it('the same changes measured against the last green still play the whole package', async () => {
    const r = depotDesLectures();
    const p = await restreint(r, 'a', ['docs/guide.md']);
    expect(p.test.related).toBeUndefined();
    expect(p.ligne).toMatch(/tous ses tests, un chemin que ses tests déclarent lire/);
  });

  it('the configuration of Vitest changed still plays the whole package', async () => {
    const r = depotDesLectures();
    const p = await restreint(r, 'a', ['packages/a/vitest.config.mjs'], [], [], true);
    expect(p.test.related).toBeUndefined();
    expect(p.ligne).toMatch(/tous ses tests, la configuration du paquet/);
  });

  it('a file removed still plays the whole package', async () => {
    const r = depotDesLectures();
    const p = await restreint(r, 'a', [], ['packages/a/test/notes.txt'], [], true);
    expect(p.test.related).toBeUndefined();
    expect(p.ligne).toMatch(/tous ses tests, un fichier supprimé/);
  });
});

// A night test plays at night alone: a targeted run that names one is refused by its name, in a
// ticket's copy under `.claude/worktrees/` as anywhere else (the one rule `estUnTestDeNuit`).
describe('a targeted run that names a night test', () => {
  it('is refused by its name, the file under a copy of a ticket included', async () => {
    const r = realpathSync(mkdtempSync(path.join(ESSAIS, 'refus-')));
    const paquet = path.join(r, '.claude', 'worktrees', 'demo-1', 'packages', 'a');
    mkdirSync(path.join(paquet, 'tests'), { recursive: true });
    writeFileSync(path.join(paquet, 'tests', 'lourd.nuit.spec.ts'), '\n');
    const env: Record<string, string> = {
      [VARIABLE]: JSON.stringify({ arguments: [path.join(paquet, 'tests', 'lourd.nuit.spec.ts')] }),
    };
    await expect(ciblage(env, () => {}).config({ root: paquet })).rejects.toThrow(
      '⛔ tests/lourd.nuit.spec.ts : un test de nuit se joue la nuit seulement'
    );
  });
});
