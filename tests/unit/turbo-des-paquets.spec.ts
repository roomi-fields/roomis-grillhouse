import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { attendus, COMMANDE, ecrire, verifier } from '../../scripts/turbo-des-paquets.mjs';

// Witness: BPScript (322.12), whose stages declare the shared test material (990-corpus) and
// sometimes each other in their devDependencies, while 990-corpus declares them in its
// dependencies: `turbo run build --dry` refused « Cyclic dependency detected ». A build waits for
// its runtime dependencies only (Bazel: a library's deps apart from its test's).

const DEPOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(DEPOT, 'scripts/turbo-des-paquets.mjs');
const TURBO = path.join(DEPOT, 'node_modules/.bin/turbo');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'turbo-des-paquets-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrireFichier = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const pkg = (o: Record<string, unknown>) => `${JSON.stringify(o, null, 2)}\n`;
const etage = { build: 'tsc', 'test:vitest': 'vitest run' };

// A repository of packages of BPScript's form: `socle` a runtime dependency of each stage; the
// corpus (no build, as 990-corpus) depends on the stages, which declare it in their
// devDependencies; `b` and `c` declare each other in their devDependencies (030↔040).
function depotAPaquets() {
  const r = mkdtempSync(path.join(ESSAIS, 'paquets-'));
  ecrireFichier(
    r,
    'package.json',
    pkg({ name: 'essai', private: true, workspaces: ['packages/*'], packageManager: 'npm@10.9.8' })
  );
  ecrireFichier(r, 'turbo.json', lire(DEPOT, 'templates/turbo/paquets.json'));
  ecrireFichier(
    r,
    'packages/socle/package.json',
    pkg({ name: 'socle', scripts: { build: 'tsc' } })
  );
  ecrireFichier(
    r,
    'packages/a/package.json',
    pkg({
      name: 'a',
      scripts: etage,
      dependencies: { socle: '*' },
      devDependencies: { corpus: '*', vitest: '^2.1.9' },
    })
  );
  ecrireFichier(
    r,
    'packages/b/package.json',
    pkg({
      name: 'b',
      scripts: etage,
      peerDependencies: { socle: '*' },
      devDependencies: { c: '*', corpus: '*' },
    })
  );
  ecrireFichier(
    r,
    'packages/c/package.json',
    pkg({
      name: 'c',
      scripts: etage,
      optionalDependencies: { socle: '*' },
      devDependencies: { b: '*', corpus: '*' },
    })
  );
  ecrireFichier(
    r,
    'packages/corpus/package.json',
    pkg({ name: 'corpus', dependencies: { a: '*', b: '*', c: '*', lodash: '*' } })
  );
  return r;
}

const turbo = (racine: string, taches: string[]) =>
  spawnSync(TURBO, ['run', ...taches, '--dry=json', '--cwd', racine], {
    encoding: 'utf8',
    env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' },
  });
type Tache = { taskId: string; dependencies: string[] };
const taches = (sortie: string) =>
  Object.fromEntries(
    (JSON.parse(sortie) as { tasks: Tache[] }).tasks.map(t => [
      t.taskId,
      [...t.dependencies].sort(),
    ])
  );
const lancer = (racine: string, args: string[]) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd: racine, encoding: 'utf8' });

describe('the build of a package waits for its runtime dependencies only', () => {
  it('with the template alone, Turborepo refuses the cycle the devDependencies make', () => {
    const r = turbo(depotAPaquets(), ['build']);
    expect(r.status, r.stdout).not.toBe(0);
    expect(r.stderr).toMatch(/[Cc]yclic dependency/);
  });

  it('after generation, the build and the tests run without a cycle, each test after what it imports', () => {
    const racine = depotAPaquets();
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    const r = turbo(racine, ['build', 'test:vitest']);
    expect(r.status, r.stderr).toBe(0);
    const t = taches(r.stdout);
    expect(t['a#build']).toEqual(['socle#build']);
    expect(t['b#build']).toEqual(['socle#build']);
    expect(t['c#build']).toEqual(['socle#build']);
    // A test waits for everything it imports, devDependencies included (the root's ^build).
    expect(t['a#test:vitest']).toEqual(['corpus#build', 'socle#build']);
    expect(t['b#test:vitest']).toEqual(['c#build', 'corpus#build']);
    expect(t['corpus#build']).toEqual(['a#build', 'b#build', 'c#build']);
  });

  it('a generated turbo.json extends the root and names its runtime dependencies sorted, under a header naming its command', () => {
    const racine = depotAPaquets();
    ecrire(racine);
    const texte = lire(racine, 'packages/corpus/turbo.json');
    const [entete, ...corps] = texte.split('\n');
    expect(entete).toMatch(/^\/\/ Généré par /);
    expect(entete).toContain(COMMANDE);
    expect(JSON.parse(corps.join('\n'))).toEqual({
      $schema: 'https://turborepo.com/schema.json',
      extends: ['//'],
      tasks: { build: { dependsOn: ['a#build', 'b#build', 'c#build'] } },
    });
    // A package without an internal runtime dependency built waits for none.
    expect(JSON.parse(lire(racine, 'packages/socle/turbo.json').replace(/^\/\/.*\n/, ''))).toEqual(
      expect.objectContaining({ tasks: { build: { dependsOn: [] } } })
    );
  });

  it('the output is deterministic: the declaration order of the package.json does not change it', () => {
    const racine = depotAPaquets();
    const avant = attendus(racine);
    ecrireFichier(
      racine,
      'packages/corpus/package.json',
      pkg({ name: 'corpus', dependencies: { lodash: '*', c: '*', b: '*', a: '*' } })
    );
    expect(attendus(racine)).toEqual(avant);
  });
});

describe('the check of the generated turbo.json', () => {
  it('passes on what the generator wrote', () => {
    const racine = depotAPaquets();
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    const r = lancer(racine, []);
    expect(r.status, r.stderr).toBe(0);
    expect(verifier(racine)).toEqual([]);
  });

  it('refuses a missing turbo.json, naming it and the command that writes it', () => {
    const racine = depotAPaquets();
    ecrire(racine);
    rmSync(path.join(racine, 'packages/b/turbo.json'));
    const r = lancer(racine, []);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('packages/b/turbo.json');
    expect(r.stderr).toContain(COMMANDE);
  });

  it('refuses a stale turbo.json: a dependency added to the package.json and not regenerated', () => {
    const racine = depotAPaquets();
    ecrire(racine);
    ecrireFichier(
      racine,
      'packages/a/package.json',
      pkg({ name: 'a', scripts: etage, dependencies: { socle: '*', b: '*' } })
    );
    const r = lancer(racine, []);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('packages/a/turbo.json');
    expect(r.stderr).toContain(COMMANDE);
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    expect(lancer(racine, []).status).toBe(0);
  });

  it('refuses an unknown option, writing nothing', () => {
    const racine = depotAPaquets();
    expect(lancer(racine, ['--help']).status).toBe(2);
    expect(attendus(racine).size).toBe(5);
    expect(readdirSync(path.join(racine, 'packages/a'))).toEqual(['package.json']);
  });
});

describe('a repository without packages', () => {
  it('is left as it is, and passes the check', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'sans-paquets-'));
    ecrireFichier(racine, 'package.json', pkg({ name: 'p', scripts: { build: 'tsc' } }));
    // A packages/ directory the root does not declare as workspaces is no package.
    ecrireFichier(racine, 'packages/x/package.json', pkg({ name: 'x', dependencies: { y: '*' } }));
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    expect(readdirSync(racine).sort()).toEqual(['package.json', 'packages']);
    expect(readdirSync(path.join(racine, 'packages/x'))).toEqual(['package.json']);
    expect(lancer(racine, []).status).toBe(0);
  });
});
