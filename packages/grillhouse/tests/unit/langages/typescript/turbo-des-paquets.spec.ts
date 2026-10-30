import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import { afterAll, describe, expect, it } from 'vitest';
import { codeMortEssai } from './code-mort-essai.js';
import { paquets } from '../../../../scripts/paquets.mjs';
import {
  attendus,
  COMMANDE,
  ecrire,
  verifier,
} from '../../../../scripts/langages/typescript/turbo-des-paquets.mjs';

// Witness: BPScript (322.12), whose stages declare the shared test material (990-corpus) and
// sometimes each other in their devDependencies, while 990-corpus declares them in its
// dependencies: `turbo run build --dry` refused « Cyclic dependency detected ». A build waits for
// its runtime dependencies only (Bazel: a library's deps apart from its test's).

const DEPOT = path.resolve(__dirname, '../../../../../..');
const SCRIPT = path.join(
  DEPOT,
  'packages/grillhouse/scripts/langages/typescript/turbo-des-paquets.mjs'
);
const TURBO = path.join(DEPOT, 'node_modules/.bin/turbo');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'turbo-des-paquets-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrireFichier = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const pkg = (o: Record<string, unknown>) => `${JSON.stringify(o, null, 2)}\n`;
const etage = { build: 'tsc', 'test:unit': 'vitest run' };

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
    const r = turbo(racine, ['build', 'test:unit']);
    expect(r.status, r.stderr).toBe(0);
    const t = taches(r.stdout);
    expect(t['a#build']).toEqual(['socle#build']);
    expect(t['b#build']).toEqual(['socle#build']);
    expect(t['c#build']).toEqual(['socle#build']);
    // A test waits for its own package's build and for everything it imports, devDependencies
    // included (the root's build and ^build): a package tests its built entry.
    expect(t['a#test:unit']).toEqual(['a#build', 'corpus#build', 'socle#build']);
    expect(t['b#test:unit']).toEqual(['b#build', 'c#build', 'corpus#build']);
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
    const t = taches(turbo(depotHorsCadre(), ['build', 'test:unit']).stdout);
    expect(Object.keys(t)).toContain('kronos#test:unit');
    expect(t['banc#test:unit']).toContain('kronos#build');
  });

  it('after generation, no task of a package out of the frame is played, none waited for', () => {
    const racine = depotHorsCadre();
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    const r = turbo(racine, ['build', 'test:unit', 'lint']);
    expect(r.status, r.stderr).toBe(0);
    const t = taches(r.stdout);
    const ids = Object.keys(t);
    expect(ids.filter(id => /^(kronos|audio)#/.test(id))).toEqual([]);
    expect(
      Object.values(t)
        .flat()
        .filter(d => /^(kronos|audio)#/.test(d))
    ).toEqual([]);
    expect(ids).toContain('banc#test:unit');
    expect(ids).toContain('banc#lint');
    // The build waits for its runtime dependencies of the frame; a test for its own build and all
    // it imports.
    expect(t['banc#build']).toEqual(['socle#build']);
    expect(t['banc#test:unit']).toEqual(['banc#build', 'socle#build']);
    expect(t['corpus#build']).toEqual(['banc#build']);
    expect(t['lecteur#test:unit']).toEqual(['corpus#build', 'lecteur#build']);
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
        'test:unit': { extends: false },
        typecheck: { extends: false },
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
        'test:unit': { dependsOn: ['build', 'socle#build'] },
        typecheck: { dependsOn: ['build', 'socle#build'] },
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
      JSON.stringify({ ...gabarit, tasks: { ...gabarit.tasks, lint: {}, 'check-types': {} } })
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
    const t = taches(turbo(racine, ['build', 'test:unit']).stdout);
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

// Witness: BPScript, whose guards (the frame's `grillhouse:gardes`, and its own, which read the
// built form of its packages) ran beside the builds: a `dist/` the build had not yet rewritten
// gave a green, which entered the cache. The guard tasks of the root wait for the build of each
// package of the frame that has one: the generator writes their `dependsOn` in the root's
// turbo.json, the rest of the file stays the project's.
const GARDES_RACINE = ['//#grillhouse:gardes', '//#gardes'];
const TOUS = ['a#build', 'b#build', 'c#build', 'socle#build'];
type Racine = { tasks: Record<string, { dependsOn?: string[] } | undefined> };
const lireRacine = (texte: string) => parseJsonc(texte, [], { allowTrailingComma: true }) as Racine;
const dependances = (texte: string, tache: string) => lireRacine(texte).tasks[tache]?.dependsOn;
// The repository of packages, its root holding the frame's guards (and, <propres>, its own).
function depotAvecGardes(propres = false) {
  const r = depotAPaquets();
  const p = JSON.parse(lire(r, 'package.json')) as Record<string, unknown>;
  const scripts = { 'grillhouse:gardes': 'true', ...(propres ? { gardes: 'true' } : {}) };
  ecrireFichier(r, 'package.json', pkg({ ...p, scripts }));
  return r;
}

describe('the guard tasks of the root wait for the build of each package of the frame', () => {
  it('with the template alone, the guards run beside the builds', () => {
    const racine = depotAvecGardes();
    ecrire(racine);
    ecrireFichier(racine, 'turbo.json', lire(DEPOT, 'templates/turbo/paquets.json'));
    const r = turbo(racine, ['build', 'grillhouse:gardes']);
    expect(r.status, r.stderr).toBe(0);
    expect(taches(r.stdout)['//#grillhouse:gardes']).toEqual([]);
  });

  it('after generation, each guard task of the root waits for every build of the frame, sorted', () => {
    const racine = depotAvecGardes();
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    const texte = lire(racine, 'turbo.json');
    // corpus has no build script: there is none to wait for.
    for (const tache of GARDES_RACINE) {
      expect(dependances(texte, tache), tache).toEqual(TOUS);
    }
    const r = turbo(racine, ['build', 'grillhouse:gardes']);
    expect(r.status, r.stderr).toBe(0);
    expect(taches(r.stdout)['//#grillhouse:gardes']).toEqual(TOUS);
  });

  it('a package out of the frame is not waited for', () => {
    const racine = depotHorsCadre();
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    for (const tache of GARDES_RACINE) {
      expect(dependances(lire(racine, 'turbo.json'), tache), tache).toEqual([
        'banc#build',
        'lecteur#build',
        'socle#build',
      ]);
    }
  });

  it('the project’s own guards wait for the builds too, and Turborepo passes a root without them', () => {
    const racine = depotAvecGardes();
    ecrire(racine);
    // Without a `gardes` script at the root, the task is not played, and the run passes.
    const sans = turbo(racine, ['grillhouse:gardes', 'gardes', 'test:unit']);
    expect(sans.status, sans.stderr).toBe(0);
    const commandes = Object.fromEntries(
      (JSON.parse(sans.stdout) as { tasks: { taskId: string; command: string }[] }).tasks.map(t => [
        t.taskId,
        t.command,
      ])
    );
    expect(commandes['//#grillhouse:gardes']).toBe('true');
    expect(commandes['//#gardes']).toBe('<NONEXISTENT>');
    const avecPropres = depotAvecGardes(true);
    ecrire(avecPropres);
    const avec = turbo(avecPropres, ['grillhouse:gardes', 'gardes', 'test:unit']);
    expect(avec.status, avec.stderr).toBe(0);
    expect(taches(avec.stdout)['//#gardes']).toEqual(TOUS);
  });

  it('the rest of the root’s turbo.json stays as the project wrote it, its comments included', () => {
    const racine = depotAPaquets();
    const propre = [
      '// Le turbo.json du projet.',
      '{',
      '  "$schema": "https://turborepo.com/schema.json",',
      '  "tasks": {',
      '    // la construction de chaque paquet',
      '    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },',
      '    "test:unit": { "dependsOn": ["^build"], "outputs": [] },',
      '    "lint": {},',
      '    "//#grillhouse:gardes": {',
      '      "dependsOn": ["vieux#build"], // périmé',
      '      "outputs": []',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n');
    ecrireFichier(racine, 'turbo.json', propre);
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    const texte = lire(racine, 'turbo.json');
    expect(texte.startsWith('// Le turbo.json du projet.\n{\n')).toBe(true);
    expect(texte).toContain('    // la construction de chaque paquet\n');
    expect(texte).toContain('"build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },\n');
    expect(texte).toContain('"lint": {},\n');
    expect(texte).toContain('// périmé');
    expect(dependances(texte, '//#grillhouse:gardes')).toEqual(TOUS);
    // A guard task the root lacks is added, without outputs.
    expect(lireRacine(texte).tasks['//#gardes']).toEqual({ dependsOn: TOUS, outputs: [] });
    // A second pass writes nothing.
    expect(ecrire(racine)).toEqual([]);
    expect(lire(racine, 'turbo.json')).toBe(texte);
  });

  it('the root may be a turbo.jsonc, written in place', () => {
    const racine = depotAPaquets();
    const texte = `// commenté\n${lire(racine, 'turbo.json')}`;
    rmSync(path.join(racine, 'turbo.json'));
    ecrireFichier(racine, 'turbo.jsonc', texte);
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    expect(readdirSync(racine)).not.toContain('turbo.json');
    const ecrit = lire(racine, 'turbo.jsonc');
    expect(ecrit.startsWith('// commenté\n')).toBe(true);
    expect(dependances(ecrit, '//#gardes')).toEqual(TOUS);
    expect(lancer(racine, []).status).toBe(0);
  });

  it('the check refuses a guard task stale or absent, naming it and the command', () => {
    const racine = depotAPaquets();
    ecrire(racine);
    expect(lancer(racine, []).status).toBe(0);
    // A package gains a build: the list is stale.
    ecrireFichier(
      racine,
      'packages/corpus/package.json',
      pkg({ name: 'corpus', scripts: { build: 'tsc' }, dependencies: { a: '*', b: '*', c: '*' } })
    );
    ecrireFichier(
      racine,
      'packages/corpus/turbo.json',
      attendus(racine).get('packages/corpus/turbo.json') as string
    );
    const perime = lancer(racine, []);
    expect(perime.status).toBe(1);
    expect(perime.stderr).toContain('turbo.json');
    expect(perime.stderr).toContain('//#grillhouse:gardes');
    expect(perime.stderr).toContain(COMMANDE);
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    expect(lancer(racine, []).status).toBe(0);
    // The task taken out of the root: refused.
    const t = lireRacine(lire(racine, 'turbo.json'));
    delete t.tasks['//#gardes'];
    ecrireFichier(racine, 'turbo.json', JSON.stringify(t, null, 2));
    const absente = lancer(racine, []);
    expect(absente.status).toBe(1);
    expect(absente.stderr).toContain('//#gardes');
  });

  it('without packages, the guard tasks wait for the root’s build: the template is a fixed point, Grillhouse’s turbo.json passes', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'sans-paquets-'));
    ecrireFichier(racine, 'package.json', pkg({ name: 'p', scripts: { build: 'tsc' } }));
    ecrireFichier(racine, 'turbo.json', lire(DEPOT, 'templates/turbo/sans-paquets.json'));
    expect(ecrire(racine)).toEqual([]);
    for (const tache of ['grillhouse:gardes', 'gardes']) {
      expect(dependances(lire(racine, 'turbo.json'), tache), tache).toEqual(['build']);
    }
    expect(verifier(DEPOT)).toEqual([]);
    // A turbo.json without the project's guards receives them.
    ecrireFichier(
      racine,
      'turbo.json',
      '{\n  "tasks": {\n    "build": {},\n    "grillhouse:gardes": { "outputs": [] }\n  }\n}\n'
    );
    expect(lancer(racine, []).status).toBe(1);
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    expect(dependances(lire(racine, 'turbo.json'), 'gardes')).toEqual(['build']);
    expect(dependances(lire(racine, 'turbo.json'), 'grillhouse:gardes')).toEqual(['build']);
    expect(lancer(racine, []).status).toBe(0);
  });
});

// grillhouse-kgx.3. Witness: BPScript 320.21.4, whose charter asks every commit to pass the strict
// typing: type errors in test/ showed only at night, since `npm run verifier` played no typing
// (the build types src/ alone, Vitest types nothing). The typing of each package is a task of
// Turborepo, as `check-types` in the examples of create-turbo: the root's turbo.json holds
// `typecheck`, which waits for the build of the package and of its dependencies (`build`,
// `^build`, as `test:unit`: the tests of 990-corpus import its own built entry), and the
// generator keeps it there.
describe('grillhouse-kgx.3 — the root’s typecheck task, which waits for the build of the package and of its dependencies', () => {
  const typage = (racine: string) =>
    (
      parseJsonc(lire(racine, 'turbo.json'), [], { allowTrailingComma: true }) as {
        tasks: Record<string, { dependsOn?: string[]; outputs?: string[] } | undefined>;
      }
    ).tasks.typecheck;

  it('critère 1: both templates hold it, and the generator writes nothing for it', () => {
    const racine = depotAPaquets();
    expect(typage(racine)).toEqual({ dependsOn: ['build', '^build'], outputs: [] });
    ecrire(racine);
    expect(typage(racine)).toEqual({ dependsOn: ['build', '^build'], outputs: [] });
    const sans = mkdtempSync(path.join(ESSAIS, 'sans-paquets-'));
    ecrireFichier(sans, 'package.json', pkg({ name: 'p', scripts: { build: 'tsc' } }));
    ecrireFichier(sans, 'turbo.json', lire(DEPOT, 'templates/turbo/sans-paquets.json'));
    expect(ecrire(sans)).toEqual([]);
    expect(typage(sans)).toEqual({ dependsOn: ['build'], outputs: [] });
    expect(verifier(DEPOT)).toEqual([]);
  });

  it('critère 1: a root without it: the check refuses it, naming the task and the command; the generator adds it', () => {
    const racine = depotAPaquets();
    ecrire(racine);
    const t = JSON.parse(lire(racine, 'turbo.json')) as { tasks: Record<string, unknown> };
    delete t.tasks.typecheck;
    ecrireFichier(racine, 'turbo.json', JSON.stringify(t, null, 2));
    const r = lancer(racine, []);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('`typecheck`');
    expect(r.stderr).toContain(COMMANDE);
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    expect(typage(racine)).toEqual({ dependsOn: ['build', '^build'], outputs: [] });
    expect(lancer(racine, []).status).toBe(0);
  });

  it('critère 1: a root typecheck that does not wait for the builds: refused; the generator adds build and ^build to the project’s entries', () => {
    const racine = depotAPaquets();
    ecrire(racine);
    const t = JSON.parse(lire(racine, 'turbo.json')) as {
      tasks: Record<string, Record<string, unknown>>;
    };
    t.tasks.typecheck = { dependsOn: ['lint'], inputs: ['$TURBO_DEFAULT$'], outputs: [] };
    ecrireFichier(racine, 'turbo.json', JSON.stringify(t, null, 2));
    const r = lancer(racine, []);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('`build`');
    expect(r.stderr).toContain('^build');
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    expect(typage(racine)).toEqual({
      dependsOn: ['lint', 'build', '^build'],
      inputs: ['$TURBO_DEFAULT$'],
      outputs: [],
    });
    expect(lancer(racine, []).status).toBe(0);
  });

  it('critère 1: without packages, a root without it is refused, and the generator adds it', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'sans-paquets-'));
    ecrireFichier(racine, 'package.json', pkg({ name: 'p', scripts: { build: 'tsc' } }));
    const t = JSON.parse(lire(DEPOT, 'templates/turbo/sans-paquets.json')) as {
      tasks: Record<string, unknown>;
    };
    delete t.tasks.typecheck;
    ecrireFichier(racine, 'turbo.json', JSON.stringify(t, null, 2));
    expect(lancer(racine, []).stderr).toContain('`typecheck`');
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    expect(typage(racine)).toEqual({ dependsOn: ['build'], outputs: [] });
    expect(lancer(racine, []).status).toBe(0);
  });

  it('critère 1: after generation, the typing of a package waits for its own build, which its tests import (990-corpus/test-fixtures), and for the build of each package it declares, as Turborepo plans it', () => {
    const racine = depotAPaquets();
    for (const nom of ['a', 'b']) {
      const f = `packages/${nom}/package.json`;
      const p = JSON.parse(lire(racine, f)) as { scripts: Record<string, string> };
      ecrireFichier(
        racine,
        f,
        pkg({ ...p, scripts: { ...p.scripts, typecheck: 'tsc -p tsconfig.json --noEmit' } })
      );
    }
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    const r = turbo(racine, ['typecheck']);
    expect(r.status, r.stderr).toBe(0);
    const t = taches(r.stdout);
    expect(t['a#typecheck']).toEqual(['a#build', 'corpus#build', 'socle#build']);
    expect(t['b#typecheck']).toEqual(['b#build', 'c#build', 'corpus#build']);
  });
});

// Witness: BPScript (ed70d6b86), whose `npx grillhouse maj` to 0.24.14 left its guards red on the
// turbo.json of 140-scheduler, 150-renderer-* and 995-tools: the generator wrote the packages from
// the root's `typecheck` it had not yet corrected, and a second `--ecrire` repaired them. A
// generator reaches its fixed point in one pass, the root, which the packages read, first (make
// orders its targets by their prerequisites).
describe('grillhouse-kgx.3.2 — one pass of the generator reaches its fixed point', () => {
  it('critère 1: a root typecheck waiting for ^build alone, a package deriving its own: one pass, accepted; a second, nothing written', () => {
    const gabarit = JSON.parse(lire(DEPOT, 'templates/turbo/paquets.json')) as {
      tasks: Record<string, Record<string, unknown>>;
    };
    const racine = depotHorsCadre(
      `${JSON.stringify(
        {
          ...gabarit,
          tasks: { ...gabarit.tasks, lint: {}, typecheck: { dependsOn: ['^build'], outputs: [] } },
        },
        null,
        2
      )}\n`
    );
    expect(ecrire(racine).length).toBeGreaterThan(0);
    expect(verifier(racine)).toEqual([]);
    const banc = nonGenere(lire(racine, 'packages/banc/turbo.json')) as {
      tasks: Record<string, unknown>;
    };
    expect(banc.tasks.typecheck).toEqual({ dependsOn: ['build', 'socle#build'] });
    expect(ecrire(racine)).toEqual([]);
  });
});

// Witness: BPScript, whose reviewer measured it: the targeted run played its tests alone (`--only`),
// whose hash left out the builds they wait for. The paths now reach Vitest in a variable the `env`
// of the root's `test:unit` names (scripts/langages/typescript/tests.mjs), which the generator keeps there.
describe('the env of the root’s test:unit names the variable of the targeted runs', () => {
  const env = (racine: string) =>
    (
      parseJsonc(lire(racine, 'turbo.json'), [], { allowTrailingComma: true }) as {
        tasks: Record<string, { env?: string[] }>;
      }
    ).tasks['test:unit']?.env;

  it('both templates hold it, and the generator writes nothing for it', () => {
    const racine = depotAPaquets();
    expect(env(racine)).toEqual(['GRILLHOUSE_TESTS']);
    ecrire(racine);
    expect(env(racine)).toEqual(['GRILLHOUSE_TESTS']);
    const sans = mkdtempSync(path.join(ESSAIS, 'sans-paquets-'));
    ecrireFichier(sans, 'package.json', pkg({ name: 'p', scripts: { build: 'tsc' } }));
    ecrireFichier(sans, 'turbo.json', lire(DEPOT, 'templates/turbo/sans-paquets.json'));
    expect(ecrire(sans)).toEqual([]);
    expect(env(sans)).toEqual(['GRILLHOUSE_TESTS']);
  });

  it('a root test:unit without it: the check refuses it, naming the variable and the command; the generator adds it to the project’s', () => {
    const racine = depotAPaquets();
    ecrire(racine);
    const t = JSON.parse(lire(racine, 'turbo.json')) as {
      tasks: Record<string, Record<string, unknown>>;
    };
    t.tasks['test:unit'] = { ...t.tasks['test:unit'], env: ['CI'] };
    ecrireFichier(racine, 'turbo.json', JSON.stringify(t, null, 2));
    const r = lancer(racine, []);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('GRILLHOUSE_TESTS');
    expect(r.stderr).toContain(COMMANDE);
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    expect(env(racine)).toEqual(['CI', 'GRILLHOUSE_TESTS']);
    expect(lancer(racine, []).status).toBe(0);
  });
});

// The variables that pass to every task without entering any hash: the results directory of a
// run (GRILLHOUSE_RESULTATS, scripts/resultats.mjs) and the changes since the last green
// (GRILLHOUSE_CHANGEMENTS, scripts/dernier-vert.mjs), which the generator keeps in the root's
// `globalPassThroughEnv`.
describe('the globalPassThroughEnv of the root names the results and the changes since the last green', () => {
  const passage = (racine: string) =>
    (
      parseJsonc(lire(racine, 'turbo.json'), [], { allowTrailingComma: true }) as {
        globalPassThroughEnv?: string[];
      }
    ).globalPassThroughEnv;

  it('both templates hold them, and the generator writes nothing for them', () => {
    const racine = depotAPaquets();
    ecrire(racine);
    expect(passage(racine)).toEqual([
      'GRILLHOUSE_RESULTATS',
      'GRILLHOUSE_CHANGEMENTS',
      'GRILLHOUSE_AVANCEMENT',
      'TMPDIR',
    ]);
    const sans = mkdtempSync(path.join(ESSAIS, 'sans-paquets-'));
    ecrireFichier(sans, 'package.json', pkg({ name: 'p', scripts: { build: 'tsc' } }));
    ecrireFichier(sans, 'turbo.json', lire(DEPOT, 'templates/turbo/sans-paquets.json'));
    expect(ecrire(sans)).toEqual([]);
    expect(passage(sans)).toEqual([
      'GRILLHOUSE_RESULTATS',
      'GRILLHOUSE_CHANGEMENTS',
      'GRILLHOUSE_AVANCEMENT',
      'TMPDIR',
    ]);
  });

  it('a root without the changes: the check refuses it, naming the variable and the command; the generator adds it to the project’s', () => {
    const racine = depotAPaquets();
    ecrire(racine);
    const t = JSON.parse(lire(racine, 'turbo.json')) as Record<string, unknown>;
    t.globalPassThroughEnv = ['CI', 'GRILLHOUSE_RESULTATS'];
    ecrireFichier(racine, 'turbo.json', JSON.stringify(t, null, 2));
    const r = lancer(racine, []);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('GRILLHOUSE_CHANGEMENTS');
    expect(r.stderr).toContain(COMMANDE);
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    expect(passage(racine)).toEqual([
      'CI',
      'GRILLHOUSE_RESULTATS',
      'GRILLHOUSE_CHANGEMENTS',
      'GRILLHOUSE_AVANCEMENT',
      'TMPDIR',
    ]);
    expect(lancer(racine, []).status).toBe(0);
  });
});

// Witness: BPScript, whose dead-code guard refused « jsonc-parser: devDependency without use »:
// the generator loaded it by a `require` knip does not follow, and the frame's own tests, which
// import it too, stay in Grillhouse. The generator imports it as any module does.
describe('the generator’s use of jsonc-parser is one the dead-code guard sees', () => {
  it('a project holding the frame’s scripts, jsonc-parser declared, has no finding on it', () => {
    const scripts = [
      'langages/typescript/turbo-des-paquets.mjs',
      'services-du-noyau.mjs',
      'sources.mjs',
      'langages.mjs',
      'jointure.d.ts',
      'arbitrages.mjs',
      'avancement.mjs',
      'dernier-vert.mjs',
      'verrou-de-machine.mjs',
      'verrou-de-fichier.mjs',
      'enveloppe/paquets-du-plan.mjs',
      'paquets.mjs',
      'langages/typescript/consommateurs.mjs',
      'langages/typescript/script-des-tests.mjs',
      'dette.mjs',
      'resultats.mjs',
      'mesure/avancement.mjs',
      'mesure/base-de-passe.mjs',
      'mesure/pression.mjs',
      'langages/typescript/vitest-config/cibles.mjs',
      'langages/typescript/vitest-config/changements.mjs',
      'langages/typescript/vitest-config/resultats.mjs',
    ];
    const r = codeMortEssai(ESSAIS, {
      'package.json': pkg({
        name: 'p',
        private: true,
        type: 'module',
        devDependencies: { 'jsonc-parser': '3.3.1', turbo: '2.11.8', vitest: '2.1.9' },
      }),
      'knip.json': pkg({ entry: ['scripts/**/*.mjs'], project: ['scripts/**/*.mjs'] }),
      ...Object.fromEntries(
        scripts.map(f => {
          const source = path.join(DEPOT, 'packages/grillhouse/scripts', f);
          return [`scripts/${f}`, existsSync(source) ? readFileSync(source, 'utf8') : null];
        })
      ),
    });
    expect(r.sortie).not.toContain('jsonc-parser');
    expect(r.status, r.sortie).toBe(0);
  });
});
