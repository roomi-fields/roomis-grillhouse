import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import { afterAll, describe, expect, it } from 'vitest';
import {
  COMMANDE,
  ecrire,
  verifier,
} from '../../../../scripts/langages/typescript/turbo-des-paquets.mjs';

// The data a package's tests read (Bazel's `data`) and the traces a stage writes (Bazel's
// genrule), declared in its package.json (`grillhouse.lit`, `grillhouse.traces`). What the generator
// writes and what its check refuses are the day's; Turborepo's own graph and hashes on what it
// writes, and the command, are the night's
// (packages/grillhouse-essais/tests/turbo-des-paquets-donnees.nuit.spec.ts).
// Witness: BPScript (320.6.6, 320.6.7), whose `060-encoder#test:unit` waited for
// `990-corpus#build`, the build of the shared test material, whose inputs counted its 2043 data
// files: a scene changed replayed the tests of 26 packages. The guarantee: the test task of a
// package depends on its code, on what it imports and on the directories it declares only.

const DEPOT = path.resolve(__dirname, '../../../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'turbo-des-paquets-donnees-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrireFichier = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;
const git = (racine: string, args: string[]) => {
  const r = spawnSync('git', args, { cwd: racine, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
};
// The tasks of a generated turbo.json, its header line left out.
const tachesDe = (racine: string, dossier: string) =>
  (
    JSON.parse(lire(racine, `${dossier}/turbo.json`).replace(/^\/\/.*\n/, '')) as {
      tasks: Record<string, Record<string, string[]>>;
    }
  ).tasks;

const CORPUS = 'packages/990-corpus';
const PAIRES = `${CORPUS}/test/060-encoder/paires-v1`;
const SCENES_040 = `${CORPUS}/test/040-checker/scenes`;
const SCENES_070 = `${CORPUS}/test/070-deriver/scenes`;
const GRAMMAIRES = 'packages/060-encoder/trace/grammaires-du-corpus';
const etage = { build: 'tsc', 'test:unit': 'vitest run' };

// The package.json of each package of a repository of BPScript's form: the stages declare the
// shared test material (990-corpus) in their devDependencies, which declares them in its
// dependencies (its types); 005-types has no build (a node Turborepo passes through); 060-encoder
// writes a trace of the corpus's grammars, which 070-deriver reads.
const PAQUETS: Record<string, Record<string, unknown>> = {
  '000-forms': { name: '000-forms', scripts: { build: 'tsc' } },
  '005-types': { name: '005-types' },
  '010-parser': {
    name: '010-parser',
    scripts: etage,
    dependencies: { '000-forms': '*' },
    devDependencies: { '990-corpus': '*' },
  },
  '040-checker': {
    name: '040-checker',
    scripts: etage,
    dependencies: { '000-forms': '*', '010-parser': '*' },
    devDependencies: { '990-corpus': '*' },
    grillhouse: { lit: [SCENES_040] },
  },
  '060-encoder': {
    name: '060-encoder',
    scripts: { ...etage, 'trace:grammaires': 'node trace.mjs' },
    dependencies: { '000-forms': '*', '005-types': '*' },
    devDependencies: { '990-corpus': '*' },
    grillhouse: {
      lit: [PAIRES],
      traces: { 'trace:grammaires': { lit: [PAIRES], ecrit: GRAMMAIRES } },
    },
  },
  '070-deriver': {
    name: '070-deriver',
    scripts: etage,
    dependencies: { '000-forms': '*' },
    devDependencies: { '990-corpus': '*' },
    grillhouse: { lit: [`${SCENES_070}/`, GRAMMAIRES] },
  },
  '990-corpus': {
    name: '990-corpus',
    scripts: { build: 'tsc' },
    dependencies: {
      '000-forms': '*',
      '010-parser': '*',
      '040-checker': '*',
      '060-encoder': '*',
      '070-deriver': '*',
    },
  },
};

// The root's turbo.json of BPScript's form: the build and the tests read root files.
const RACINE_BP = {
  $schema: 'https://turborepo.com/schema.json',
  ui: 'stream',
  tasks: {
    build: {
      dependsOn: ['^build'],
      inputs: ['$TURBO_DEFAULT$', '$TURBO_ROOT$/tsconfig.construction.json'],
      outputs: ['dist/**'],
    },
    'test:unit': {
      dependsOn: ['build', '^build'],
      inputs: ['$TURBO_DEFAULT$', '$TURBO_ROOT$/spec/**'],
      outputs: [],
    },
    '//#grillhouse:gardes': { dependsOn: [], outputs: [] },
    '//#gardes': { dependsOn: [], outputs: [] },
    typecheck: { dependsOn: ['build', '^build'], outputs: [] },
  },
};

function depotBP(paquets = PAQUETS, racineTurbo: unknown = RACINE_BP) {
  const r = mkdtempSync(path.join(ESSAIS, 'bp-'));
  ecrireFichier(
    r,
    'package.json',
    json({ name: 'bp', private: true, workspaces: ['packages/*'], packageManager: 'npm@10.9.8' })
  );
  ecrireFichier(r, 'turbo.json', json(racineTurbo));
  ecrireFichier(r, '.gitignore', `node_modules/\n.turbo/\ndist/\n${GRAMMAIRES}/\n`);
  ecrireFichier(r, 'tsconfig.construction.json', '{}\n');
  ecrireFichier(r, 'spec/langage.md', '# Le langage\n');
  for (const [nom, p] of Object.entries(paquets)) {
    ecrireFichier(r, `packages/${nom}/package.json`, json(p));
    ecrireFichier(r, `packages/${nom}/src/index.ts`, `export const nom = '${nom}';\n`);
  }
  ecrireFichier(r, `${CORPUS}/test/fixtures.ts`, 'export const scenes = [];\n');
  ecrireFichier(r, `${SCENES_040}/une.json`, '{"scene":1}\n');
  ecrireFichier(r, `${SCENES_040}/types.d.json`, '{}\n');
  ecrireFichier(r, `${PAIRES}/paire.json`, '{"paire":1}\n');
  ecrireFichier(r, `${PAIRES}/profonde/paire.bps`, 'S --> a\n');
  ecrireFichier(r, `${SCENES_070}/une.json`, '{"scene":7}\n');
  // Data no package declares stays an input of the material's build.
  ecrireFichier(r, `${CORPUS}/test/autre/x.json`, '{}\n');
  ecrireFichier(r, 'packages/060-encoder/trace.mjs', 'console.log(1);\n');
  ecrireFichier(r, `${GRAMMAIRES}/grammaire.json`, '{"g":1}\n');
  git(r, ['init', '-q']);
  git(r, ['add', '-A']);
  return r;
}

describe('the turbo.json generated from the declared data and traces', () => {
  it('a reader’s tests wait for the traces it reads and hash the directories it declares', () => {
    const racine = depotBP();
    ecrire(racine);
    expect(tachesDe(racine, 'packages/070-deriver')['test:unit']).toEqual({
      dependsOn: ['build', '^build', '060-encoder#trace:grammaires'],
      inputs: ['$TURBO_EXTENDS$', `$TURBO_ROOT$/${GRAMMAIRES}/**`, `$TURBO_ROOT$/${SCENES_070}/**`],
    });
    // A reader whose directories no trace writes waits for what the root's test task waits for.
    expect(tachesDe(racine, 'packages/040-checker')['test:unit']).toEqual({
      dependsOn: ['build', '^build'],
      inputs: ['$TURBO_EXTENDS$', `$TURBO_ROOT$/${SCENES_040}/**`],
    });
  });

  it('a producer’s trace task reads its declared directories and writes its directory, inside the producer', () => {
    const racine = depotBP();
    ecrire(racine);
    expect(tachesDe(racine, 'packages/060-encoder')['trace:grammaires']).toEqual({
      dependsOn: ['build', '^build'],
      inputs: ['$TURBO_DEFAULT$', `$TURBO_ROOT$/${PAIRES}/**`, '!trace/grammaires-du-corpus/**'],
      outputs: ['trace/grammaires-du-corpus/**'],
    });
  });

  it('the build of the package holding declared directories leaves them out of its inputs', () => {
    const racine = depotBP();
    ecrire(racine);
    expect(tachesDe(racine, CORPUS).build).toEqual({
      dependsOn: [
        '000-forms#build',
        '010-parser#build',
        '040-checker#build',
        '060-encoder#build',
        '070-deriver#build',
      ],
      inputs: [
        '$TURBO_EXTENDS$',
        '!test/040-checker/scenes/**',
        '!test/060-encoder/paires-v1/**',
        '!test/070-deriver/scenes/**',
      ],
    });
    // A trace's output is no input of a build: git ignores it, and the producer's build is left as is.
    expect(tachesDe(racine, 'packages/060-encoder').build).toEqual({
      dependsOn: ['000-forms#build'],
    });
  });

  it('a root task without inputs is extended from Turborepo’s default: `$TURBO_EXTENDS$` would hash only the declared data', () => {
    const racine = depotBP(PAQUETS, JSON.parse(lire(DEPOT, 'templates/turbo/paquets.json')));
    ecrire(racine);
    expect(tachesDe(racine, 'packages/040-checker')['test:unit'].inputs).toEqual([
      '$TURBO_DEFAULT$',
      `$TURBO_ROOT$/${SCENES_040}/**`,
    ]);
    expect(tachesDe(racine, CORPUS).build.inputs?.[0]).toBe('$TURBO_DEFAULT$');
  });

  it('the check passes on what the generator wrote, a trace not yet written included', () => {
    const racine = depotBP();
    rmSync(path.join(racine, GRAMMAIRES), { recursive: true });
    ecrire(racine);
    expect(verifier(racine)).toEqual([]);
  });
});

// A declaration the generator refuses: the check (`grillhouse:gardes`) names it.
const avec = (nom: string, change: (p: Record<string, unknown>) => void) => {
  const p = structuredClone(PAQUETS);
  change(p[nom]);
  return p;
};
const refusDe = (racine: string) => {
  ecrire(racine);
  return verifier(racine).join('\n');
};

describe('the check refuses a declaration the guarantee cannot hold on', () => {
  it('a declared directory absent that no trace writes', () => {
    const racine = depotBP(
      avec('040-checker', p => {
        p.grillhouse = { lit: [SCENES_040, `${CORPUS}/test/040-checker/absentes`] };
      })
    );
    const refus = refusDe(racine);
    expect(refus).toContain('packages/040-checker');
    expect(refus).toContain(`${CORPUS}/test/040-checker/absentes`);
  });

  // A file listed then gone before it is read (here a dangling link), as Vite's temporary file
  // beside a configuration of Vitest, while the guards play beside the tests: the check gives its
  // verdict; that temporary file is no code of the directory.
  it('a declared directory whose file vanishes during the walk, or holding Vite’s temporary file, passes', () => {
    const racine = depotBP();
    symlinkSync(path.join(racine, 'absent.json'), path.join(racine, PAIRES, 'disparu.json'));
    ecrireFichier(racine, `${PAIRES}/vitest.config.ts.timestamp-1712345678901-4f2a9c.mjs`, '');
    expect(refusDe(racine)).toBe('');
  });

  it('a trace written out of its producer', () => {
    const racine = depotBP(
      avec('060-encoder', p => {
        p.grillhouse = {
          lit: [PAIRES],
          traces: { 'trace:grammaires': { lit: [PAIRES], ecrit: `${CORPUS}/gen` } },
        };
      })
    );
    ecrireFichier(racine, '.gitignore', `node_modules/\n${CORPUS}/gen/\n`);
    expect(refusDe(racine)).toContain(`${CORPUS}/gen`);
  });

  it('a trace git does not ignore', () => {
    const racine = depotBP();
    ecrireFichier(racine, '.gitignore', 'node_modules/\n');
    expect(refusDe(racine)).toContain(GRAMMAIRES);
  });

  it('a trace git follows, though ignored', () => {
    const racine = depotBP();
    git(racine, ['add', '-f', `${GRAMMAIRES}/grammaire.json`]);
    expect(refusDe(racine)).toContain(GRAMMAIRES);
  });

  it('a trace script without declaration', () => {
    const racine = depotBP(
      avec('070-deriver', p => {
        p.scripts = { ...etage, 'trace:scenes': 'node t.mjs' };
      })
    );
    expect(refusDe(racine)).toMatch(/packages\/070-deriver.*trace:scenes/);
  });

  it('a trace declared without its script', () => {
    const racine = depotBP(
      avec('060-encoder', p => {
        p.scripts = etage;
      })
    );
    expect(refusDe(racine)).toMatch(/packages\/060-encoder.*trace:grammaires/);
  });

  it('a trace whose name is not trace:<name>', () => {
    const racine = depotBP(
      avec('060-encoder', p => {
        p.scripts = { ...etage, grammaires: 'node trace.mjs' };
        p.grillhouse = {
          lit: [PAIRES],
          traces: { grammaires: { lit: [PAIRES], ecrit: GRAMMAIRES } },
        };
      })
    );
    expect(refusDe(racine)).toMatch(/packages\/060-encoder.*grammaires/);
  });

  it('data files of any other kind pass: JSON, text, scenes', () => {
    const racine = depotBP();
    expect(refusDe(racine)).toBe('');
  });
});

// Witness: BPScript (packages/990-corpus). The shared test material is read-only for every role
// but the testwriter, and Vite 5 bundles an ESM configuration into a file beside it before loading
// it: a test of the material could not play in another role's envelope. Its configuration of
// Vitest is CommonJS, which Vite loads in memory.
describe('the check refuses an ESM configuration of Vitest in the shared test material', () => {
  const matiere = (type?: string) =>
    avec('990-corpus', p => {
      p.exports = { './test-fixtures': './test/fixtures.ts' };
      if (type) {
        p.type = type;
      }
    });

  it.each([
    ['vitest.config.mts', undefined],
    ['vitest.config.mjs', undefined],
    ['vitest.config.ts', 'module'],
    ['vitest.config.js', 'module'],
  ])('%s (type %s), naming the file expected and the reason', (fichier, type) => {
    const racine = depotBP(matiere(type));
    ecrireFichier(racine, `${CORPUS}/${fichier}`, 'export default {};\n');
    const refus = refusDe(racine);
    expect(refus).toContain(`${CORPUS}/${fichier}`);
    expect(refus).toContain('vitest.config.cjs');
    expect(refus).toContain('lecture seule');
  });

  it.each([
    ['vitest.config.cjs', 'module'],
    ['vitest.config.cts', 'module'],
    ['vitest.config.ts', undefined],
    ['vitest.config.js', 'commonjs'],
  ])('passes a CommonJS configuration: %s (type %s)', (fichier, type) => {
    const racine = depotBP(matiere(type));
    ecrireFichier(racine, `${CORPUS}/${fichier}`, 'module.exports = {};\n');
    expect(refusDe(racine)).toBe('');
  });

  it('passes an ESM configuration of a package that is not the material', () => {
    const racine = depotBP(
      avec('010-parser', p => {
        p.type = 'module';
      })
    );
    ecrireFichier(racine, 'packages/010-parser/vitest.config.ts', 'export default {};\n');
    expect(refusDe(racine)).toBe('');
  });
});

// A declared path is a directory or a file: BPScript declares three files. A file is hashed by its
// reader's tests, left out of the build of the package holding it, and refused when absent.
describe('a declared file is treated as a declared directory', () => {
  const LEXIQUE = `${CORPUS}/test/040-checker/lexique.json`;
  const depotAvecFichier = (fichier = LEXIQUE) => {
    const racine = depotBP(
      avec('040-checker', p => {
        p.grillhouse = { lit: [SCENES_040, fichier] };
      })
    );
    ecrireFichier(racine, LEXIQUE, '{"mot":1}\n');
    return racine;
  };

  it('its reader’s tests read it, and the build of the material leaves it out', () => {
    const racine = depotAvecFichier();
    expect(refusDe(racine)).toBe('');
    expect(tachesDe(racine, 'packages/040-checker')['test:unit'].inputs).toContain(
      `$TURBO_ROOT$/${LEXIQUE}/**`
    );
    expect(tachesDe(racine, CORPUS).build.inputs).toContain('!test/040-checker/lexique.json/**');
  });

  it('a declared file absent that no trace writes is refused, named a path read', () => {
    const absent = `${CORPUS}/test/040-checker/absent.json`;
    const refus = refusDe(depotAvecFichier(absent));
    expect(refus).toContain(`le chemin lu \`${absent}\` n'existe pas`);
  });
});

// A declared path may hold code, as Bazel's `data` takes any file. Witness: BPScript 320.3, whose
// 995-tools reads `packages/900-driver/test` (capture scripts) and
// `packages/000-forms/src/tables.ts`. Such a path stays an input of its own package's build, data
// alone being left out, and its reader's tests hash it.
describe('a declared path holding code, a neighbour’s', () => {
  const CAPTURES = 'packages/060-encoder/test';
  const TABLES = 'packages/000-forms/src/tables.ts';
  const depotAvecCode = (lit: string[]) => {
    const racine = depotBP(
      avec('040-checker', p => {
        p.grillhouse = { lit: [SCENES_040, ...lit] };
      })
    );
    ecrireFichier(racine, `${CAPTURES}/capture.mjs`, 'console.log(1);\n');
    ecrireFichier(racine, TABLES, 'export const tables = [];\n');
    return racine;
  };

  it.each([
    ['index.ts'],
    ['profonde/aide.mjs'],
    ['types.d.ts'],
    ['vue.tsx'],
    ['outil.cjs'],
    ['outil.js'],
  ])('a declared directory holding code passes, and its package’s build keeps it: %s', fichier => {
    const racine = depotBP();
    ecrireFichier(racine, `${PAIRES}/${fichier}`, 'export {};\n');
    expect(refusDe(racine)).toBe('');
    expect(tachesDe(racine, CORPUS).build.inputs).toEqual([
      '$TURBO_EXTENDS$',
      '!test/040-checker/scenes/**',
      '!test/070-deriver/scenes/**',
    ]);
  });

  it('a neighbour’s directory of scripts and file of source pass the check', () => {
    expect(refusDe(depotAvecCode([CAPTURES, TABLES]))).toBe('');
  });

  it('its reader’s tests hash it; its own package’s build keeps it in its inputs', () => {
    const racine = depotAvecCode([CAPTURES, TABLES]);
    ecrire(racine);
    expect(tachesDe(racine, 'packages/040-checker')['test:unit'].inputs).toEqual([
      '$TURBO_EXTENDS$',
      `$TURBO_ROOT$/${TABLES}/**`,
      `$TURBO_ROOT$/${CAPTURES}/**`,
      `$TURBO_ROOT$/${SCENES_040}/**`,
    ]);
    expect(tachesDe(racine, 'packages/000-forms').build).toEqual({ dependsOn: [] });
    expect(tachesDe(racine, 'packages/060-encoder').build).toEqual({
      dependsOn: ['000-forms#build'],
    });
  });

  it('the data declared inside it stay left out of its package’s build, the path itself kept', () => {
    const racine = depotAvecCode([`${CORPUS}/test`]);
    expect(refusDe(racine)).toBe('');
    expect(tachesDe(racine, CORPUS).build.inputs).toEqual([
      '$TURBO_EXTENDS$',
      '!test/040-checker/scenes/**',
      '!test/060-encoder/paires-v1/**',
      '!test/070-deriver/scenes/**',
    ]);
  });
});

// The root's turbo.json is the project's; what the generator owns there is refused by hand.
describe('the check refuses a root turbo.json that configures a package by hand', () => {
  const racineAvec = (change: (t: Record<string, unknown>) => void) => {
    const t = structuredClone(RACINE_BP) as unknown as Record<string, unknown>;
    change(t);
    return depotBP(PAQUETS, t);
  };
  const tachesRacine = (t: Record<string, unknown>) => t.tasks as Record<string, unknown>;

  it('passes the guard tasks of the root and inputs out of the packages', () => {
    const racine = racineAvec(t => {
      t.globalDependencies = ['tsconfig.construction.json', 'spec/**'];
    });
    expect(refusDe(racine)).toBe('');
  });

  it('a task of one package', () => {
    const racine = racineAvec(t => {
      tachesRacine(t)['060-encoder#test:unit'] = { dependsOn: ['build'] };
    });
    expect(refusDe(racine)).toContain('060-encoder#test:unit');
  });

  it('a trace task', () => {
    const racine = racineAvec(t => {
      tachesRacine(t)['trace:grammaires'] = { outputs: ['trace/**'] };
    });
    expect(refusDe(racine)).toContain('trace:grammaires');
  });

  it.each([
    ['an input', `$TURBO_ROOT$/${PAIRES}/**`],
    ['an input negated', `!$TURBO_ROOT$/${CORPUS}/test/**`],
    ['an input over every package', '$TURBO_ROOT$/packages/**'],
  ])('%s naming a package directory', (_cas, entree) => {
    const racine = racineAvec(t => {
      const tests = tachesRacine(t)['test:unit'] as { inputs: string[] };
      tests.inputs = [...tests.inputs, entree];
    });
    expect(refusDe(racine)).toContain(entree);
  });

  it('a global dependency naming a package directory', () => {
    const racine = racineAvec(t => {
      t.globalDependencies = [`${CORPUS}/test/**`];
    });
    expect(refusDe(racine)).toContain(`${CORPUS}/test/**`);
  });
});

// The inputs of a package's build are what its build reads: the files its tsconfig.build.json
// includes, its configurations and its package.json, as Turborepo's `inputs` limit what
// invalidates a task (https://turborepo.dev/docs/reference/configuration#inputs).
// Witness: BPScript (si61.8), whose `030-binder#build` hashed every file of its package
// (`$TURBO_DEFAULT$`) while its build compiles `src` only: one test file changed moved its build,
// then the build of each package depending on it, and the whole descent replayed its tests
// (~14 min of 33).
describe('the build of a package hashes what its tsconfig.build.json reads', () => {
  const BASE = { compilerOptions: { strict: true }, include: ['src', 'test'] };
  // 010-parser and the material in BPScript's form: a tsconfig.build.json extending the package's
  // tsconfig.json and the root's options; the material builds its test fixtures only, then again
  // through tsconfig.fixtures.json.
  const depotConstruit = () => {
    const paquets = avec('990-corpus', p => {
      p.scripts = { build: 'tsc -p tsconfig.build.json && tsc -p tsconfig.fixtures.json' };
    });
    paquets['010-parser'].scripts = { ...etage, build: 'tsc -p tsconfig.build.json' };
    const racine = depotBP(paquets);
    const parser = 'packages/010-parser';
    ecrireFichier(racine, `${parser}/tsconfig.json`, json(BASE));
    ecrireFichier(
      racine,
      `${parser}/tsconfig.build.json`,
      `{\n  // The published code.\n  "extends": ["./tsconfig.json", "../../tsconfig.construction.json"],\n  "include": ["src"]\n}\n`
    );
    ecrireFichier(racine, `${parser}/test/parser.test.ts`, 'export const essai = 1;\n');
    ecrireFichier(racine, `${CORPUS}/tsconfig.json`, json({ include: ['test'] }));
    ecrireFichier(
      racine,
      `${CORPUS}/tsconfig.build.json`,
      json({
        extends: ['./tsconfig.json', '../../tsconfig.construction.json'],
        include: [],
        files: ['test/fixtures.ts'],
      })
    );
    ecrireFichier(
      racine,
      `${CORPUS}/tsconfig.fixtures.json`,
      json({ extends: './tsconfig.build.json', include: [], files: ['test/fixtures.ts'] })
    );
    ecrireFichier(racine, `${CORPUS}/test/sources.ts`, 'export const sources = [];\n');
    git(racine, ['add', '-A']);
    return racine;
  };

  it('a package building src hashes src, its configurations and its package.json, the root’s inputs kept', () => {
    const racine = depotConstruit();
    ecrire(racine);
    expect(tachesDe(racine, 'packages/010-parser').build).toEqual({
      dependsOn: ['000-forms#build'],
      inputs: [
        '$TURBO_ROOT$/tsconfig.construction.json',
        'package.json',
        'src/**',
        'tsconfig.build.json',
        'tsconfig.json',
      ],
    });
  });

  it('a package whose tsconfig.build.json includes a file under test/ hashes it, and the files beside it it imports', () => {
    const racine = depotConstruit();
    ecrire(racine);
    expect(tachesDe(racine, CORPUS).build.inputs).toEqual([
      '$TURBO_ROOT$/tsconfig.construction.json',
      'package.json',
      'test/**',
      'tsconfig.build.json',
      'tsconfig.fixtures.json',
      'tsconfig.json',
      '!test/040-checker/scenes/**',
      '!test/060-encoder/paires-v1/**',
      '!test/070-deriver/scenes/**',
    ]);
  });

  // A command whose reads are unknown never gives a stale cache: the build hashes every file.
  it.each([
    ['tsc -p tsconfig.build.json && node copier.mjs dist'],
    ['vite build'],
    ['tsc -p tsconfig.build.json; esbuild src/index.ts --outdir=dist'],
    ['rm -rf dist || tsc -p tsconfig.build.json'],
  ])(
    'a build script running %s beside a tsconfig.build.json leaves the build on Turborepo’s default',
    build => {
      const racine = depotConstruit();
      const parser = 'packages/010-parser';
      ecrireFichier(
        racine,
        `${parser}/package.json`,
        json({ ...PAQUETS['010-parser'], scripts: { ...etage, build } })
      );
      ecrireFichier(racine, `${parser}/copier.mjs`, 'console.log(1);\n');
      ecrire(racine);
      expect(tachesDe(racine, parser).build).toEqual({ dependsOn: ['000-forms#build'] });
    }
  );

  it('a build script of tsc commands only gives what each compiles', () => {
    const racine = depotConstruit();
    const parser = 'packages/010-parser';
    ecrireFichier(
      racine,
      `${parser}/package.json`,
      json({
        ...PAQUETS['010-parser'],
        scripts: { ...etage, build: 'tsc -p tsconfig.build.json && npx tsc -p tsconfig.json' },
      })
    );
    ecrire(racine);
    expect(tachesDe(racine, parser).build.inputs).toEqual([
      '$TURBO_ROOT$/tsconfig.construction.json',
      'package.json',
      'src/**',
      'test/**',
      'tsconfig.build.json',
      'tsconfig.json',
    ]);
  });

  it.each([
    ['absent', null],
    ['not JSON', '{ "include": ['],
    ['extending a base that cannot be read', json({ extends: './absente.json', include: ['src'] })],
    ['without include nor files, tsc’s default taking every file', json({ compilerOptions: {} })],
    ['including a path out of the package', json({ include: ['../000-forms/src'] })],
  ])('a tsconfig.build.json %s leaves the build on Turborepo’s default', (_cas, texte) => {
    const racine = depotConstruit();
    const f = path.join(racine, 'packages/010-parser/tsconfig.build.json');
    if (texte === null) {
      rmSync(f);
    } else {
      writeFileSync(f, texte);
    }
    ecrire(racine);
    expect(tachesDe(racine, 'packages/010-parser').build).toEqual({
      dependsOn: ['000-forms#build'],
    });
  });
});

// A submodule's `.git` is a pointer file naming the copy it was set in (a worktree): an input
// covering the submodule without leaving it out changes every hash in each new copy. The update
// of the frame writes the exclusion beside each such input.
// Witness: BPScript (si61.8), whose root `test:unit` hashed `$TURBO_ROOT$/vendor/bp3-engine/**`:
// no copy ever replayed a test from the cache.
describe('an input covering a submodule has its .git left out by the generator', () => {
  const MOTEUR = 'vendor/moteur';
  const GITMODULES = `[submodule "${MOTEUR}"]\n\tpath = ${MOTEUR}\n\turl = https://exemple.org/moteur.git\n`;
  const exclusion = `!$TURBO_ROOT$/${MOTEUR}/.git`;
  // The root's turbo.json of the project, a comment of its own heading it.
  const depotAvecSousModule = (entrees: string[], paquets = PAQUETS, globales?: string[]) => {
    const t = structuredClone(RACINE_BP) as typeof RACINE_BP & { globalDependencies?: string[] };
    t.tasks['test:unit'].inputs = [...t.tasks['test:unit'].inputs, ...entrees];
    if (globales) {
      t.globalDependencies = globales;
    }
    const racine = depotBP(paquets, t);
    ecrireFichier(racine, 'turbo.json', `// Le turbo.json du projet.\n${json(t)}`);
    // The root's turbo.json as the update leaves it before the submodule is declared.
    ecrire(racine);
    ecrireFichier(racine, '.gitmodules', GITMODULES);
    ecrireFichier(racine, `${MOTEUR}/moteur.json`, '{}\n');
    return racine;
  };
  const racineLue = (racine: string) =>
    parseJsonc(lire(racine, 'turbo.json')) as {
      tasks: Record<string, { inputs?: string[] }>;
      globalDependencies?: string[];
    };

  it.each([
    [`$TURBO_ROOT$/${MOTEUR}/**`],
    ['$TURBO_ROOT$/vendor/**'],
    ['$TURBO_ROOT$/vendor/*/**'],
  ])(
    'an input %s of the root receives the exclusion beside it, the rest of the file as it was',
    entree => {
      const racine = depotAvecSousModule([entree]);
      const avant = lire(racine, 'turbo.json');
      // The check names the line to add and the command that adds it.
      const refus = verifier(racine).join('\n');
      expect(refus).toContain(entree);
      expect(refus).toContain(exclusion);
      expect(refus).toContain(COMMANDE);
      expect(ecrire(racine)).toContain('turbo.json');
      const apres = lire(racine, 'turbo.json');
      expect(racineLue(racine).tasks['test:unit'].inputs).toEqual([
        '$TURBO_DEFAULT$',
        '$TURBO_ROOT$/spec/**',
        entree,
        exclusion,
      ]);
      // Only the inputs of the task are rewritten.
      const horsEntrees = (t: string) => t.replace(/"test:unit": \{[\s\S]*?"outputs"/, '');
      expect(horsEntrees(apres)).toBe(horsEntrees(avant));
      expect(apres.startsWith('// Le turbo.json du projet.\n')).toBe(true);
      expect(verifier(racine)).toEqual([]);
      // A second update changes nothing.
      expect(ecrire(racine)).toEqual([]);
      expect(lire(racine, 'turbo.json')).toBe(apres);
    }
  );

  it('an input with the exclusion, or inside the submodule where it cannot reach its .git, is left as it is', () => {
    for (const entrees of [
      [`$TURBO_ROOT$/${MOTEUR}/**`, exclusion],
      [`$TURBO_ROOT$/${MOTEUR}/src/**`],
    ]) {
      const racine = depotAvecSousModule(entrees);
      ecrire(racine);
      const avant = lire(racine, 'turbo.json');
      expect(verifier(racine)).toEqual([]);
      expect(ecrire(racine)).toEqual([]);
      expect(lire(racine, 'turbo.json')).toBe(avant);
      expect(racineLue(racine).tasks['test:unit'].inputs).toEqual([
        '$TURBO_DEFAULT$',
        '$TURBO_ROOT$/spec/**',
        ...entrees,
      ]);
    }
  });

  it('a global dependency covering it receives the exclusion beside it', () => {
    const racine = depotAvecSousModule([], PAQUETS, [`${MOTEUR}/**`, 'spec/**']);
    ecrire(racine);
    expect(racineLue(racine).globalDependencies).toEqual([
      `${MOTEUR}/**`,
      `!${MOTEUR}/.git`,
      'spec/**',
    ]);
    expect(verifier(racine)).toEqual([]);
  });

  it('a package reading the submodule has the exclusion written in its turbo.json', () => {
    const racine = depotAvecSousModule(
      [],
      avec('040-checker', p => {
        p.grillhouse = { lit: [SCENES_040, MOTEUR] };
      })
    );
    expect(refusDe(racine)).toBe('');
    expect(tachesDe(racine, 'packages/040-checker')['test:unit'].inputs).toEqual([
      '$TURBO_EXTENDS$',
      `$TURBO_ROOT$/${SCENES_040}/**`,
      `$TURBO_ROOT$/${MOTEUR}/**`,
      exclusion,
    ]);
  });
});

// A file may be read by the build of its package and by a neighbour's tests, as in Bazel a file is
// `srcs` of one target and `data` of another: a reader's declaration never changes the inputs of
// the owner's build. Witness: BPScript (320.21.4.3), whose 995-tools declares the package.json and
// tsconfig*.json of the numbered packages its benches read: each was left out of its own
// package's build (`!package.json/**`), and BPScript withdrew the 94 declarations.
describe('a declared file the build of its package reads', () => {
  const FORMES = 'packages/000-forms';
  const PARSER = 'packages/010-parser';
  const DONNEES = `${PARSER}/test/donnees`;
  const CONFIGS = [
    `${FORMES}/package.json`,
    `${FORMES}/tsconfig.json`,
    `${PARSER}/package.json`,
    `${PARSER}/tsconfig.build.json`,
    `${PARSER}/tsconfig.json`,
  ];
  // 010-parser builds src through its tsconfig.build.json; 000-forms has none (Turborepo's
  // default); 040-checker reads their configurations and a directory of data of 010-parser.
  const depotLecteur = () => {
    const paquets = avec('040-checker', p => {
      p.grillhouse = { lit: [SCENES_040, ...CONFIGS, DONNEES] };
    });
    paquets['010-parser'].scripts = { ...etage, build: 'tsc -p tsconfig.build.json' };
    const racine = depotBP(paquets);
    ecrireFichier(racine, `${FORMES}/tsconfig.json`, json({ include: ['src'] }));
    ecrireFichier(racine, `${PARSER}/tsconfig.json`, json({ include: ['src', 'test'] }));
    ecrireFichier(
      racine,
      `${PARSER}/tsconfig.build.json`,
      json({ extends: './tsconfig.json', include: ['src'] })
    );
    ecrireFichier(racine, `${DONNEES}/une.json`, '{"donnee":1}\n');
    git(racine, ['add', '-A']);
    return racine;
  };

  it('stays an input of its package’s build, a directory of data alone still left out', () => {
    const racine = depotLecteur();
    expect(refusDe(racine)).toBe('');
    expect(tachesDe(racine, PARSER).build).toEqual({
      dependsOn: ['000-forms#build'],
      inputs: [
        '$TURBO_ROOT$/tsconfig.construction.json',
        'package.json',
        'src/**',
        'tsconfig.build.json',
        'tsconfig.json',
        '!test/donnees/**',
      ],
    });
    // A build on Turborepo's default reads its package.json and tsconfig*.json too.
    expect(tachesDe(racine, FORMES).build).toEqual({ dependsOn: [] });
  });

  it('its reader’s tests hash it', () => {
    const racine = depotLecteur();
    ecrire(racine);
    expect(tachesDe(racine, 'packages/040-checker')['test:unit'].inputs).toEqual([
      '$TURBO_EXTENDS$',
      ...[...CONFIGS, DONNEES, SCENES_040].sort().map(l => `$TURBO_ROOT$/${l}/**`),
    ]);
  });
});
