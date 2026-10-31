// The trial repositories of the witnesses (grillhouse-3dr.2.1): what ./enregistrer.mjs records on
// the code of a commit, and what the specifications of the join of the languages compare to it,
// built the same way on both sides. Each builder takes the directory it builds in.
//
// - `depotDuReleve`: BPScript 320.8 (tests/cas-reels/bp-320.8), a package per component of its
//   title, 000-forms's interface after the lot, a reader by import and a reader by a test; its
//   description is the ticket's.
// - `depotDuClassement` and `CHEMINS`: 30 paths of a repository with a package of the shared test
//   material, the testwriter's rule of ownership and its locks.
// - The trials of the verdicts are in ./depots-de-verdict.mjs.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const DEPOT = path.resolve(ICI, '../../../..');
const CAS = path.join(ICI, '../cas-reels/bp-320.8');
export const json = o => `${JSON.stringify(o, null, 2)}\n`;

// The docs/ARCHITECTURE.md of a trial of TypeScript: the column « Langage » declares its language.
export const ARCHITECTURE_TYPESCRIPT =
  '# Architecture\n\n| Composant | Langage |\n| --- | --- |\n| `.` | typescript |\n';

export const ecrireDans = racine => (rel, texte) => {
  mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
  writeFileSync(path.join(racine, rel), texte);
};

export const git = (racine, ...args) =>
  execFileSync('git', ['-C', racine, ...args], { stdio: 'pipe' });
export const initialiser = racine => {
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  git(racine, 'config', 'commit.gpgsign', 'false');
};

// BPScript 320.8: `{ racine, description }`.
export function depotDuReleve(racine) {
  const [ticket] = JSON.parse(readFileSync(path.join(CAS, 'ticket.json'), 'utf8'));
  const noms = ticket.title.split(' — ').at(-1).split(', ');
  const ecrire = ecrireDans(racine);
  ecrire(
    'package.json',
    json({
      name: 'bp',
      private: true,
      workspaces: ['packages/*'],
    })
  );
  ecrire('docs/ARCHITECTURE.md', ARCHITECTURE_TYPESCRIPT);
  for (const nom of noms) {
    ecrire(`packages/${nom}/package.json`, json({ name: nom, type: 'module' }));
    ecrire(`packages/${nom}/src/index.ts`, `export const ${nom.replace(/\W/g, '_')}_ = 1;\n`);
  }
  ecrire(
    'packages/000-forms/docs/INTERFACE.md',
    readFileSync(path.join(CAS, 'INTERFACE.apres.md'), 'utf8')
  );
  const tsconfig = json({
    compilerOptions: { strict: true, module: 'ESNext', moduleResolution: 'Bundler', noEmit: true },
    include: ['src', 'tests'],
  });
  ecrire(
    'packages/000-forms/src/index.ts',
    'export function memberData(n: number): number {\n  return n;\n}\nexport const heldName = (s: string) => s;\n'
  );
  ecrire('packages/000-forms/tsconfig.json', tsconfig);
  ecrire(
    'packages/020-loader/src/lire.ts',
    "import { memberData } from '000-forms';\nexport const k = memberData(1);\n"
  );
  ecrire('packages/020-loader/tsconfig.json', tsconfig);
  ecrire(
    'packages/030-binder/tests/cle.test.ts',
    "import { heldName } from '000-forms';\nit('heldName', () => heldName('a'));\n"
  );
  return { racine, description: ticket.description };
}

// The 30 paths of the classing, from the root of `depotDuClassement`.
export const CHEMINS = [
  'packages/a/src/index.ts',
  'packages/a/src/index.test.ts',
  'packages/a/src/index.spec.mjs',
  'packages/a/test/aide.ts',
  'packages/a/tests/x.spec.ts',
  'packages/a/__tests__/y.js',
  'packages/a/src/testing.ts',
  'packages/a/src/tests.ts',
  'packages/a/docs/INTERFACE.md',
  'packages/a/package.json',
  'packages/matiere/src/generer.ts',
  'packages/matiere/fixtures/un.txt',
  'packages/matiere/package.json',
  'packages/matiere/src/x.spec.ts',
  'tests/a.spec.ts',
  'tests/outil.ts',
  'src/a.ts',
  'src/a.test.tsx',
  'scripts/b.cjs',
  'packages/a/src/c.test.cjs',
  'packages/a/src/c.spec.jsx',
  'packages/a/src/d.bench.ts',
  'packages/a/src/e.nuit.test.ts',
  'packages/a/src/f.test.md',
  'packages/a/test-fixtures/g.ts',
  'packages/a/src/test/h.ts',
  'README.md',
  'packages/a/src/i.spec.mts',
  'packages/a/src/j.test.js.map',
  'packages/a/src/k.spec.cts',
];

// A git repository of a package `a` and a package of the shared test material, `matiere`.
export function depotDuClassement(racine) {
  const ecrire = ecrireDans(racine);
  ecrire(
    'package.json',
    json({
      name: 'c',
      private: true,
      workspaces: ['packages/*'],
    })
  );
  ecrire('docs/ARCHITECTURE.md', ARCHITECTURE_TYPESCRIPT);
  ecrire('packages/a/package.json', json({ name: 'a', type: 'module' }));
  ecrire(
    'packages/matiere/package.json',
    json({ name: 'matiere', type: 'module', exports: { './test-fixtures': './src/generer.ts' } })
  );
  initialiser(racine);
  return racine;
}
