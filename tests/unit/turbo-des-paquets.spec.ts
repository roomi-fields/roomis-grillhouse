import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { attendus, COMMANDE, ecrire, paquets, verifier } from '../../scripts/turbo-des-paquets.mjs';

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

// A project may write a negation in its `workspaces` (`"!packages/kanopi"`): npm
// (@npmcli/map-workspaces) and Turborepo then ignore the package, and the frame lists the packages
// as npm does.
function depotNie(workspaces: unknown) {
  const r = mkdtempSync(path.join(ESSAIS, 'nie-'));
  ecrireFichier(r, 'package.json', pkg({ name: 'essai', private: true, workspaces }));
  for (const nom of ['a', 'b', 'kanopi']) {
    ecrireFichier(r, `packages/${nom}/package.json`, pkg({ name: nom, scripts: { build: 'tsc' } }));
  }
  return r;
}
const dossiers = (racine: string): string[] =>
  (paquets(racine) as { dossier: string }[]).map(p => p.dossier);
// The workspaces npm maps for <racine>, as `npm pkg get name --workspaces` reads them.
const selonNpm = (racine: string) => {
  const r = spawnSync('npm', ['pkg', 'get', 'name', '--workspaces'], {
    cwd: racine,
    encoding: 'utf8',
  });
  expect(r.status, r.stderr).toBe(0);
  return Object.keys(JSON.parse(r.stdout) as Record<string, string>)
    .map(n => `packages/${n}`)
    .sort();
};

describe('the packages of a repository are the workspaces npm maps, negations applied', () => {
  for (const [cas, workspaces, attendu] of [
    [
      'a negation takes out what the patterns before it took',
      ['packages/*', '!packages/kanopi'],
      ['packages/a', 'packages/b'],
    ],
    [
      'a negation before the pattern still takes the package out',
      ['!packages/kanopi', 'packages/*'],
      ['packages/a', 'packages/b'],
    ],
    [
      'a later pattern the negation matches puts the package back',
      ['packages/*', '!packages/kanopi', 'packages/kanopi'],
      ['packages/a', 'packages/b', 'packages/kanopi'],
    ],
    [
      'the `packages` key holds the same patterns',
      { packages: ['packages/*', '!packages/kanopi/'] },
      ['packages/a', 'packages/b'],
    ],
    [
      'two « ! » cancel each other',
      ['packages/a', '!!packages/kanopi'],
      ['packages/a', 'packages/kanopi'],
    ],
  ] as const) {
    it(`${cas}, as npm maps it`, () => {
      const racine = depotNie(workspaces);
      expect(dossiers(racine)).toEqual(attendu);
      expect(selonNpm(racine)).toEqual(attendu);
    });
  }

  it('a package taken out receives no turbo.json', () => {
    const racine = depotNie(['packages/*', '!packages/kanopi']);
    expect([...attendus(racine).keys()]).toEqual([
      'packages/a/turbo.json',
      'packages/b/turbo.json',
    ]);
  });
});

// Witness: BPScript, whose `docs/agents/hors-cadre.txt` lists its frozen v1 (kronos, runtime-audio…)
// and kanopi; `turbo run build` played them, kanopi red. Benches of its v2 import them by their
// name (140-scheduler reads kronos), so they stay workspaces; Turborepo builds and tests none of
// them: each receives a package configuration that excludes every task of the root
// (`"extends": false`), and no task of the frame's packages waits for one of them.
const HORS_CADRE = 'kronos v1 gelée\naudio v1 gelée\n';
const avecLint = { ...etage, lint: 'eslint .' };
function depotHorsCadre(turboRacine?: string) {
  const r = mkdtempSync(path.join(ESSAIS, 'hors-cadre-'));
  ecrireFichier(
    r,
    'package.json',
    pkg({ name: 'essai', private: true, workspaces: ['packages/*'], packageManager: 'npm@10.9.8' })
  );
  const gabarit = JSON.parse(lire(DEPOT, 'templates/turbo/paquets.json')) as {
    tasks: Record<string, unknown>;
  };
  ecrireFichier(
    r,
    'turbo.json',
    turboRacine ??
      `// Le turbo.json du projet, commenté.\n${JSON.stringify({ ...gabarit, tasks: { ...gabarit.tasks, lint: {} } }, null, 2)}\n`
  );
  ecrireFichier(r, 'docs/agents/hors-cadre.txt', HORS_CADRE);
  ecrireFichier(r, 'packages/kronos/package.json', pkg({ name: 'kronos', scripts: avecLint }));
  ecrireFichier(
    r,
    'packages/audio/package.json',
    pkg({ name: 'audio', scripts: avecLint, dependencies: { kronos: '*' } })
  );
  ecrireFichier(r, 'packages/socle/package.json', pkg({ name: 'socle', scripts: avecLint }));
  // The bench: a package of the frame that imports the frozen packages by their name.
  ecrireFichier(
    r,
    'packages/banc/package.json',
    pkg({
      name: 'banc',
      scripts: avecLint,
      dependencies: { audio: '*', socle: '*' },
      devDependencies: { kronos: '*', vitest: '^2.1.9' },
    })
  );
  // A package of the frame without scripts (as 990-corpus) that depends on a frozen package.
  ecrireFichier(
    r,
    'packages/corpus/package.json',
    pkg({ name: 'corpus', dependencies: { kronos: '*', banc: '*' } })
  );
  ecrireFichier(
    r,
    'packages/lecteur/package.json',
    pkg({ name: 'lecteur', scripts: etage, devDependencies: { corpus: '*' } })
  );
  return r;
}
const nonGenere = (texte: string) => JSON.parse(texte.replace(/^\/\/.*\n/, '')) as unknown;

describe('a package out of the frame stays a workspace, and Turborepo plays none of its tasks', () => {
  it('with the root configuration alone, Turborepo plays the packages out of the frame', () => {
    const t = taches(turbo(depotHorsCadre(), ['build', 'test:vitest']).stdout);
    expect(Object.keys(t)).toContain('kronos#test:vitest');
    expect(t['banc#test:vitest']).toContain('kronos#build');
  });

  it('after generation, no task of a package out of the frame is played, none waited for', () => {
    const racine = depotHorsCadre();
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    const r = turbo(racine, ['build', 'test:vitest', 'lint']);
    expect(r.status, r.stderr).toBe(0);
    const t = taches(r.stdout);
    const ids = Object.keys(t);
    expect(ids.filter(id => /^(kronos|audio)#/.test(id))).toEqual([]);
    expect(
      Object.values(t)
        .flat()
        .filter(d => /^(kronos|audio)#/.test(d))
    ).toEqual([]);
    expect(ids).toContain('banc#test:vitest');
    expect(ids).toContain('banc#lint');
    // The build waits for its runtime dependencies of the frame; a test for all it imports.
    expect(t['banc#build']).toEqual(['socle#build']);
    expect(t['banc#test:vitest']).toEqual(['socle#build']);
    expect(t['corpus#build']).toEqual(['banc#build']);
    expect(t['lecteur#test:vitest']).toEqual(['corpus#build']);
  });

  it('a package out of the frame receives the exclusion of each task of the root', () => {
    const racine = depotHorsCadre();
    ecrire(racine);
    expect(nonGenere(lire(racine, 'packages/kronos/turbo.json'))).toEqual({
      $schema: 'https://turborepo.com/schema.json',
      extends: ['//'],
      tasks: {
        build: { extends: false },
        lint: { extends: false },
        'test:vitest': { extends: false },
      },
    });
    expect(lire(racine, 'packages/audio/turbo.json')).toBe(
      lire(racine, 'packages/kronos/turbo.json')
    );
    expect(lire(racine, 'packages/kronos/turbo.json')).toMatch(/^\/\/ Généré par /);
  });

  it('a package of the frame that declares one has each task waiting on « ^ » written out without it', () => {
    const racine = depotHorsCadre();
    ecrire(racine);
    expect(nonGenere(lire(racine, 'packages/banc/turbo.json'))).toEqual({
      $schema: 'https://turborepo.com/schema.json',
      extends: ['//'],
      tasks: {
        build: { dependsOn: ['socle#build'] },
        'test:vitest': { dependsOn: ['socle#build'] },
      },
    });
    // A package that declares none keeps the root's tests.
    expect(nonGenere(lire(racine, 'packages/lecteur/turbo.json'))).toEqual(
      expect.objectContaining({ tasks: { build: { dependsOn: [] } } })
    );
  });

  it('the root may be a turbo.jsonc', () => {
    const racine = depotHorsCadre();
    const texte = lire(racine, 'turbo.json');
    rmSync(path.join(racine, 'turbo.json'));
    ecrireFichier(racine, 'turbo.jsonc', texte);
    expect(attendus(racine)).toEqual(attendus(depotHorsCadre()));
  });

  it('the check passes on what the generator wrote, a package out of the frame in the workspaces', () => {
    const racine = depotHorsCadre();
    ecrire(racine);
    const r = lancer(racine, []);
    expect(r.status, r.stderr).toBe(0);
  });

  it('refuses a package out of the frame that Turborepo would play: a task added to the root', () => {
    const racine = depotHorsCadre();
    ecrire(racine);
    const gabarit = JSON.parse(lire(DEPOT, 'templates/turbo/paquets.json')) as {
      tasks: Record<string, unknown>;
    };
    ecrireFichier(
      racine,
      'turbo.json',
      JSON.stringify({ ...gabarit, tasks: { ...gabarit.tasks, lint: {}, typecheck: {} } })
    );
    const r = lancer(racine, []);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('packages/kronos/turbo.json');
    expect(r.stderr).toContain(COMMANDE);
  });

  it('refuses a package newly listed out of the frame, until regenerated', () => {
    const racine = depotHorsCadre();
    ecrire(racine);
    ecrireFichier(racine, 'docs/agents/hors-cadre.txt', `${HORS_CADRE}socle neuf\n`);
    const r = lancer(racine, []);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('packages/socle/turbo.json');
    expect(r.stderr).toContain(COMMANDE);
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    expect(lancer(racine, []).status).toBe(0);
    const t = taches(turbo(racine, ['build', 'test:vitest']).stdout);
    expect(Object.keys(t).filter(id => id.startsWith('socle#'))).toEqual([]);
  });

  it('a repository without workspaces is not concerned', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'sans-espaces-'));
    ecrireFichier(racine, 'package.json', pkg({ name: 'p' }));
    ecrireFichier(racine, 'packages/kanopi/package.json', pkg({ name: 'kanopi' }));
    ecrireFichier(racine, 'docs/agents/hors-cadre.txt', 'kanopi projet voisin, rouge\n');
    expect(verifier(racine)).toEqual([]);
  });
});

// A configuration package (@grillhouse/vitest-config, as Turborepo's @repo/eslint-config) is
// declared in the devDependencies of each package it configures: it orders no build.
describe('a configuration package in devDependencies orders no build', () => {
  it('a package that declares it in its devDependencies does not wait for its build, and no cycle forms', () => {
    const racine = depotAPaquets();
    ecrireFichier(
      racine,
      'packages/config/package.json',
      pkg({
        name: '@grillhouse/vitest-config',
        private: true,
        scripts: { build: 'true' },
        dependencies: { a: '*' },
      })
    );
    ecrireFichier(
      racine,
      'packages/a/package.json',
      pkg({
        name: 'a',
        scripts: etage,
        dependencies: { socle: '*' },
        devDependencies: { '@grillhouse/vitest-config': '*', corpus: '*' },
      })
    );
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    const r = turbo(racine, ['build']);
    expect(r.status, r.stderr).toBe(0);
    expect(taches(r.stdout)['a#build']).toEqual(['socle#build']);
  });
});
