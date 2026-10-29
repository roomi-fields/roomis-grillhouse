// The entries of the suite of conformity (scripts/conformite.mjs) for the module typescript, as
// the valid and invalid cases a rule of ESLint gives its RuleTester: each a trial, built under the
// directory the suite gives, with what a sound module answers on it.
//
// - A repository of four packages: `@e/a`; `@e/b`, which depends on `@e/a`; `@e/c`, which depends
//   on `@e/b`; `@e/m`, the shared test material (it exports `./test-fixtures`). Each has its
//   interface, and the generated files are written by their own commands (the index of the
//   interfaces, the turbo.json of the packages): `aJour`; the same with the interface of `a`
//   changed after, its index out of date: `enRetard`; the same, committed, a file of `a` then
//   changed and a file out of every package added: `change`, measured from its commit.
// - Two results directories of a run: every task and test green (`vert`); `a` at 75, `b` red, a
//   test of `b` failed (`defaut`).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = o => `${JSON.stringify(o, null, 2)}\n`;
const ecrireDans = racine => (rel, texte) => {
  mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
  writeFileSync(path.join(racine, rel), texte);
};
const git = (racine, ...args) => execFileSync('git', ['-C', racine, ...args], { stdio: 'pipe' });
const node = (racine, script, ...args) =>
  execFileSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    cwd: racine,
    stdio: 'pipe',
  });

const PAQUETS = {
  a: { name: '@e/a' },
  b: { name: '@e/b', dependencies: { '@e/a': '*' } },
  c: { name: '@e/c', devDependencies: { '@e/b': '*' } },
  m: { name: '@e/m', exports: { './test-fixtures': './src/index.ts' } },
};

// The repository of the four packages in a new directory under <dans>, its generated files
// written, committed.
function depot(dans) {
  const racine = mkdtempSync(path.join(dans, 'depot-'));
  const ecrire = ecrireDans(racine);
  ecrire('package.json', json({ name: 'e', private: true, workspaces: ['packages/*'] }));
  ecrire(
    'turbo.json',
    json({ $schema: 'https://turborepo.com/schema.json', tasks: { build: { outputs: [] } } })
  );
  for (const [nom, pkg] of Object.entries(PAQUETS)) {
    ecrire(`packages/${nom}/package.json`, json({ type: 'module', ...pkg }));
    ecrire(`packages/${nom}/src/index.ts`, `export const ${nom} = 1;\n`);
    ecrire(
      `packages/${nom}/docs/INTERFACE.md`,
      `# ${nom}\n\n${nom.toUpperCase()} rend un nombre.\n`
    );
  }
  mkdirSync(path.join(racine, 'docs/agents'), { recursive: true });
  node(racine, 'turbo-des-paquets.mjs', '--ecrire');
  node(racine, 'index-interfaces.mjs');
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  git(racine, 'config', 'commit.gpgsign', 'false');
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'essai');
  return racine;
}

// A results directory under <dans> of the tasks <taches> (`[paquet, code]` of `test:vitest`) and
// the test files <fichiers> (`[fichier, nom, etat]`).
function resultats(dans, taches, fichiers) {
  const dossier = mkdtempSync(path.join(dans, 'resultats-'));
  const ecrire = ecrireDans(dossier);
  ecrire(
    'turbo/run.json',
    json({
      tasks: taches.map(([paquet, code]) => ({
        taskId: `${paquet}#test:vitest`,
        package: paquet,
        directory: `packages/${paquet}`,
        task: 'test:vitest',
        execution: { exitCode: code },
        cache: { status: 'MISS' },
        logFile: `packages/${paquet}/.turbo/turbo-test.log`,
      })),
    })
  );
  ecrire(
    'vitest/rapport.json',
    json({
      testResults: fichiers.map(([fichier, nom, etat]) => ({
        name: path.join(dossier, fichier),
        status: etat,
        message: '',
        assertionResults: [{ title: nom, fullName: nom, status: etat, failureMessages: [] }],
      })),
    })
  );
  return dossier;
}

export default {
  // The trials under <dans>.
  preparer(dans) {
    const aJour = depot(dans);
    const enRetard = depot(dans);
    writeFileSync(
      path.join(enRetard, 'packages/a/docs/INTERFACE.md'),
      '# a\n\nA rend un autre nombre.\n'
    );
    const change = depot(dans);
    const depuis = execFileSync('git', ['-C', change, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    writeFileSync(path.join(change, 'packages/a/src/index.ts'), 'export const a = 2;\n');
    writeFileSync(path.join(change, 'notes.txt'), 'hors des paquets\n');
    return {
      racine: aJour,
      composantDe: {
        valide: [
          { fichier: 'packages/a/src/index.ts', composant: 'a' },
          { fichier: 'packages/b/docs/INTERFACE.md', composant: 'b' },
          { fichier: path.join(aJour, 'packages/c/package.json'), composant: 'c' },
          { fichier: 'packages/m/src/index.ts', composant: 'm' },
        ],
        invalide: [{ fichier: 'package.json' }, { fichier: 'docs/agents/index-des-interfaces.md' }],
        attendu: [
          'package.json : hors de tout composant',
          'docs/agents/index-des-interfaces.md : hors de tout composant',
        ],
      },
      touches: {
        valide: { racine: aJour, depuis: 'HEAD' },
        invalide: { racine: change, depuis },
        attendu: ['touché a', 'dépendant b', 'dépendant c', 'hors notes.txt'],
      },
      commandes: {
        valide: ['tester', 'verifier', 'typer'],
        invalide: ['tester', 'deployer'],
        attendu: ['deployer : absente'],
      },
      verdict: {
        valide: resultats(
          dans,
          [
            ['a', 0],
            ['b', 0],
          ],
          [['packages/a/x.test.ts', 'a', 'passed']]
        ),
        invalide: resultats(
          dans,
          [
            ['a', 75],
            ['b', 1],
            ['c', null],
          ],
          [
            ['packages/a/x.test.ts', 'a', 'passed'],
            ['packages/b/x.test.ts', 'b', 'failed'],
          ]
        ),
        attendu: ['a#test:vitest à repasser', 'b#test:vitest rouge (1)', 'test x.test.ts › b'],
      },
      estUnTest: {
        valide: ['packages/a/src/index.ts', 'packages/a/src/testing.ts', 'README.md'],
        invalide: [
          'packages/a/src/index.spec.mjs',
          'packages/a/src/index.test.ts',
          'packages/a/tests/aide.ts',
          'packages/m/src/index.ts',
        ],
        attendu: [
          'packages/a/src/index.spec.mjs : joue, test',
          'packages/a/src/index.test.ts : joue, test',
          'packages/a/tests/aide.ts : test',
          'packages/m/src/index.ts : matiere',
        ],
      },
      fichiersEngendres: {
        valide: aJour,
        invalide: enRetard,
        attendu: ["l'index des interfaces : en retard"],
      },
      gardes: {
        valide: [
          'turbo-des-paquets',
          'index-interfaces',
          'consommateurs',
          'consommateurs-arbitres',
          'frontieres',
          'interfaces-contre-code',
          'code-mort',
          'tailles-des-tests',
        ],
      },
    };
  },
};
