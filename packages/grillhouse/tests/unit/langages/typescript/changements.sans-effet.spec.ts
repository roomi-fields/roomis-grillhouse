// A file the measure classes without effect (`sansEffet` in the file of the changes, written by
// scripts/dernier-vert.mjs: a comment changed, a type changed, a document) relates no test
// through Vitest's graph and plays no package whole (rules 6 and 7 of
// scripts/langages/typescript/vitest-config/changements.mjs); a test that reads it by its path, or
// that declares it reads it, keeps its rule, as it reads its text and not its output.
//
// Each case gives the plugin the file of the changes and reads the test options it leaves to
// Vitest.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ciblage } from '../../../../scripts/langages/typescript/vitest-config/cibles.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'changements-sans-effet-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const CHANGEMENTS = 'GRILLHOUSE_CHANGEMENTS';
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

// The repository: a provider `a` (its code, a test that imports it, a test that reads a note by
// its path, a test that declares it reads the documents), packages `b` and `c` that depend on
// `a`, a package `d` that declares it reads `docs`.
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
  ecrire('packages/a/NOTES.md', '# Notes\n');
  ecrire('packages/a/test/deux.test.mjs', "import '../src/index.mjs';\n");
  ecrire(
    'packages/a/test/lecteur.test.mjs',
    "import { readFileSync } from 'node:fs';\nreadFileSync('NOTES.md');\n"
  );
  ecrire(
    'packages/a/test/liste.test.mjs',
    "// @lit docs/**\nimport { readdirSync } from 'node:fs';\n"
  );
  paquet('b', { devDependencies: { a: '*' } });
  ecrire('packages/b/test/b.test.mjs', '\n');
  paquet('c', { dependencies: { a: '*' } });
  ecrire('packages/c/test/c.test.mjs', '\n');
  paquet('d', { grillhouse: { lit: ['docs'] } });
  ecrire('packages/d/test/d.test.mjs', '\n');
  ecrire('docs/guide.md', '# Le guide\n');
  mkdirSync(path.join(r, 'node_modules'));
  for (const p of ['a', 'b', 'c', 'd']) {
    symlinkSync(`../packages/${p}`, path.join(r, 'node_modules', p), 'dir');
  }
  return r;
}

type Test = { related?: string[]; passWithNoTests?: boolean };

// The run of the package <paquet> of <racine> under the changes <fichiers>, the files without
// effect <sansEffet>, the files removed <supprimes>.
async function restreint(
  racine: string,
  paquet: string,
  { fichiers = [], sansEffet = [], supprimes = [], cible = false } = {} as {
    fichiers?: string[];
    sansEffet?: string[];
    supprimes?: string[];
    cible?: boolean;
  }
) {
  const f = path.join(mkdtempSync(path.join(ESSAIS, 'changements-')), 'changements.json');
  writeFileSync(
    f,
    JSON.stringify({ racine, fichiers, supprimes, sansEffet, ...(cible ? { cible: true } : {}) })
  );
  const lignes: string[] = [];
  const config: { root: string; test?: Test } = { root: path.join(racine, 'packages', paquet) };
  await ciblage({ [CHANGEMENTS]: f }, (l: string) => lignes.push(l)).config(config);
  const test = config.test ?? {};
  return {
    test,
    related: (test.related ?? []).map(a => path.relative(racine, a)).sort(),
    ligne: lignes.join('\n'),
  };
}

describe('a file without effect, in the package that holds it and in those that depend on it', () => {
  it('the code of the provider without effect relates no test and plays no dependent whole', async () => {
    const r = depot();
    for (const paquet of ['a', 'b', 'c']) {
      const p = await restreint(r, paquet, { sansEffet: ['packages/a/src/index.mjs'] });
      expect(p.related).toEqual([]);
      expect(p.test.passWithNoTests).toBe(true);
      expect(p.ligne).not.toMatch(/tous ses tests/);
    }
  });

  it('the same file changed in its output keeps the line of the code of a package it depends on', async () => {
    const r = depot();
    for (const paquet of ['b', 'c']) {
      const p = await restreint(r, paquet, { fichiers: ['packages/a/src/index.mjs'] });
      expect(p.test.related).toBeUndefined();
      expect(p.ligne).toMatch(/tous ses tests, le code d’un paquet dont il dépend/);
    }
  });

  it('a document of the package without effect plays no package whole', async () => {
    const r = depot();
    const p = await restreint(r, 'b', { sansEffet: ['packages/a/NOTES.md'] });
    expect(p.related).toEqual([]);
    expect(p.ligne).not.toMatch(/tous ses tests/);
    const propre = await restreint(r, 'a', { sansEffet: ['docs/guide.md'] });
    expect(propre.ligne).not.toMatch(/tous ses tests/);
  });

  it('a file without effect beside a file changed leaves the changed file alone to relate', async () => {
    const r = depot();
    const p = await restreint(r, 'a', {
      fichiers: ['packages/a/test/deux.test.mjs'],
      sansEffet: ['packages/a/src/index.mjs'],
    });
    expect(p.related).toEqual(['packages/a/test/deux.test.mjs']);
  });

  it('a file without effect removes nothing: a file removed still plays the package whole', async () => {
    const r = depot();
    const p = await restreint(r, 'a', {
      sansEffet: ['packages/a/src/index.mjs'],
      supprimes: ['packages/a/test/ancien.test.mjs'],
    });
    expect(p.test.related).toBeUndefined();
    expect(p.ligne).toMatch(/tous ses tests, un fichier supprimé/);
  });
});

describe('a file without effect that tests read as text', () => {
  it('a path the package declares it reads (grillhouse.lit) keeps its rule', async () => {
    const r = depot();
    const p = await restreint(r, 'd', { sansEffet: ['docs/guide.md'] });
    expect(p.test.related).toBeUndefined();
    expect(p.ligne).toMatch(/tous ses tests, un chemin que ses tests déclarent lire/);
  });

  it('a test that declares it reads the file (@lit) plays', async () => {
    const r = depot();
    const p = await restreint(r, 'a', { sansEffet: ['docs/guide.md'] });
    expect(p.related).toEqual(['packages/a/test/liste.test.mjs']);
    expect(p.ligne).toMatch(/1 test\(s\) qui déclarent en lire un \(@lit\)/);
  });

  it('a test that reads the file by its path plays, and the file itself relates nothing', async () => {
    const r = depot();
    const p = await restreint(r, 'a', { sansEffet: ['packages/a/NOTES.md'] });
    expect(p.related).toEqual(['packages/a/test/lecteur.test.mjs']);
    expect(p.ligne).toMatch(/1 test\(s\) qui en lisent un par son chemin/);
  });

  it('a targeted pass keeps its rule for the tests that declare their reads, and plays none by the path read', async () => {
    const r = depot();
    const declare = await restreint(r, 'a', { sansEffet: ['docs/guide.md'], cible: true });
    expect(declare.related).toEqual(['packages/a/test/liste.test.mjs']);
    const lu = await restreint(r, 'a', { sansEffet: ['packages/a/NOTES.md'], cible: true });
    expect(lu.related).toEqual([]);
    expect(lu.ligne).not.toMatch(/tous ses tests/);
  });
});
