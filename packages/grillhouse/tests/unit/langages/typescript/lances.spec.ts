// grillhouse-3dr.3.4, the lever (a) of grillhouse-3dr.3: a test plays when a script it launches
// changes, without its package declaring the scripts' directory in its `grillhouse.lit`. As
// Bazel's `data` of a test target and Turborepo's inputs of a task, the frame reads, in the test's
// text, the paths it names (the constant `SCRIPT` of a test that launches a script), with what
// they import and name, from file to file (scripts/langages/typescript/vitest-config/lances.mjs);
// a pass measured against the last green adds those tests to the ones Vitest relates to the
// changed files (scripts/langages/typescript/vitest-config/changements.mjs). A string that names a
// module of the package by a path the frame cannot read is a finding of the guard of the paths of
// the tests (./chemins-des-tests.spec.ts).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { restreindre } from '../../../../scripts/langages/typescript/vitest-config/changements.mjs';
import {
  nonDeclares,
  testsQuiLancent,
} from '../../../../scripts/langages/typescript/vitest-config/lances.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'lances-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A repository of trial whose files are <fichiers>, each path from its top; its top.
function depot(fichiers: Record<string, string>) {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  for (const [f, t] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  }
  return r;
}

// The texts of the repository: a package `a` whose scripts the tests launch by their path.
const ICI = 'const ICI = path.dirname(fileURLToPath(import.meta.url));\n';
const FICHIERS = {
  'package.json': '{"name":"essai","private":true,"workspaces":["packages/*"]}\n',
  'packages/a/package.json':
    '{"name":"a","type":"module","bin":{"outil-d-essai":"bin/outil-d-essai.mjs"}}\n',
  // The package's command, whose table names the script of each subcommand.
  'packages/a/bin/outil-d-essai.mjs': [
    "import path from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    ICI,
    "const TABLE = { go: path.join(ICI, '../commandes/go-d-essai.mjs') };",
    '',
  ].join('\n'),
  'packages/a/commandes/go-d-essai.mjs': 'export {};\n',
  // A hook that launches the command by its link, a path built from its parts.
  'packages/a/crochets/crochet-d-essai.mjs': [
    "import path from 'node:path';",
    "const COMMANDE = path.join(process.cwd(), 'node_modules', '.bin', 'outil-d-essai');",
    '',
  ].join('\n'),
  'packages/a/motifs/un-d-essai.mjs': 'export {};\n',
  'packages/a/scripts/lanceur-d-essai.mjs':
    "import { outil } from './outil-d-essai.mjs';\noutil();\n",
  'packages/a/scripts/outil-d-essai.mjs': 'export const outil = () => 1;\n',
  'packages/a/scripts/chef-d-essai.mjs': [
    "import path from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    ICI,
    "const SOUS = path.join(ICI, 'sous-d-essai.mjs');",
    '',
  ].join('\n'),
  'packages/a/scripts/sous-d-essai.mjs': 'export {};\n',
  'packages/a/scripts/seul-d-essai.mjs': 'export {};\n',
  'packages/a/scripts/neutre-d-essai.mjs': 'export {};\n',
  // A test that launches a script by its path from its own directory.
  'packages/a/tests/lanceur.spec.ts':
    "const SCRIPT = path.resolve(__dirname, '../scripts/lanceur-d-essai.mjs');\nit('l', () => SCRIPT);\n",
  // A test that launches a script which launches another by its path.
  'packages/a/tests/chef.spec.ts':
    "const CHEF = path.resolve(__dirname, '../scripts/chef-d-essai.mjs');\nit('c', () => CHEF);\n",
  // A test that names a script from the top of the repository, the strings of one call together.
  'packages/a/tests/haut.spec.ts':
    "const DEPOT = path.resolve(__dirname, '../../..');\nconst S = path.join(DEPOT, 'packages/a', 'scripts/seul-d-essai.mjs');\nit('h', () => S);\n",
  // A test that launches the hook, which runs a subcommand of the command.
  'packages/a/tests/crochet.spec.ts':
    "const CROCHET = path.resolve(__dirname, '../crochets/crochet-d-essai.mjs');\nit('c', () => [CROCHET, 'go']);\n",
  // A test that runs a subcommand by a command line.
  'packages/a/tests/ligne.spec.ts': "it('l', () => execSync('npx outil-d-essai go'));\n",
  // A test that reads the files a pattern covers, and one whose pattern starts with a wildcard.
  'packages/a/tests/motif.spec.ts': "const M = 'packages/a/motifs/*.mjs';\nit('m', () => M);\n",
  'packages/a/tests/large.spec.ts': "const M = '**/motifs/*.mjs';\nit('g', () => M);\n",
  // A test whose only path is a base: its package, the repository.
  'packages/a/tests/base.spec.ts':
    "const PAQUET = path.resolve(__dirname, '..');\nconst DEPOT = path.resolve(__dirname, '../../..');\nit('b', () => [PAQUET, DEPOT]);\n",
  // A test that names a script by a path built at run time, and another in a comment alone.
  'packages/a/tests/cache.spec.ts':
    "// It never launches neutre-d-essai.mjs.\nconst NOM = 'seul-d-essai.mjs';\nconst S = `${__dirname}/../scripts/${NOM}`;\nit('k', () => S);\n",
};
const R = depot(FICHIERS);
const A = path.join(R, 'packages/a');
const dans = (f: string) => path.join(R, f);
const lanceurs = (f: string) =>
  (testsQuiLancent(A, R, [dans(f)]) as string[]).map(t => path.relative(R, t));

describe('grillhouse-3dr.3.4 — a test plays when a script it launches changes', () => {
  it('a test that names a script plays when a module the script imports changes', () => {
    expect(lanceurs('packages/a/scripts/outil-d-essai.mjs')).toEqual([
      'packages/a/tests/lanceur.spec.ts',
    ]);
  });

  it('a script that names another by its path from its directory leads to it', () => {
    expect(lanceurs('packages/a/scripts/sous-d-essai.mjs')).toEqual([
      'packages/a/tests/chef.spec.ts',
    ]);
  });

  it('a path from the top of the repository, written by the strings of one call, is named', () => {
    expect(lanceurs('packages/a/scripts/seul-d-essai.mjs')).toEqual([
      'packages/a/tests/haut.spec.ts',
    ]);
  });

  it('a hook that launches the command by its link leads to the script of its subcommands', () => {
    expect(lanceurs('packages/a/commandes/go-d-essai.mjs')).toEqual([
      'packages/a/tests/crochet.spec.ts',
      'packages/a/tests/ligne.spec.ts',
    ]);
  });

  it('a pattern of files whose start is fixed names each file it covers', () => {
    expect(lanceurs('packages/a/motifs/un-d-essai.mjs')).toEqual([
      'packages/a/tests/motif.spec.ts',
    ]);
  });

  it('a directory that holds the test, or that is a package, names none of its files', () => {
    expect(lanceurs('packages/a/scripts/neutre-d-essai.mjs')).toEqual([]);
  });

  it('a pass measured against the last green adds the tests that launch a changed script', () => {
    const test: { related?: string[] } = {};
    const lignes: string[] = [];
    const ch = { racine: R, fichiers: ['packages/a/scripts/outil-d-essai.mjs'], supprimes: [] };
    restreindre(test, A, ch, [], (l: string) => lignes.push(l));
    expect(test.related).toContain(dans('packages/a/tests/lanceur.spec.ts'));
    expect(test.related).not.toContain(dans('packages/a/tests/chef.spec.ts'));
    expect(lignes.join('\n')).toMatch(/1 test\(s\) qui en lisent un par son chemin/);
  });
});

describe('grillhouse-3dr.3.4 critère 7 — a script named by a path the frame cannot read is found', () => {
  it('a string that ends the path of a module of the package, out of what the test reads', () => {
    const constats = nonDeclares(A, R, []) as { test: string; fichier: string; chaine: string }[];
    expect(constats).toEqual([
      {
        test: 'packages/a/tests/cache.spec.ts',
        fichier: 'packages/a/scripts/seul-d-essai.mjs',
        chaine: 'seul-d-essai.mjs',
      },
      {
        test: 'packages/a/tests/large.spec.ts',
        fichier: 'packages/a/motifs/un-d-essai.mjs',
        chaine: '**/motifs/*.mjs',
      },
    ]);
  });

  it('a module under a path the package declares in its grillhouse.lit is no finding', () => {
    expect(nonDeclares(A, R, ['packages/a/scripts', 'packages/a/motifs'])).toEqual([]);
  });
});
