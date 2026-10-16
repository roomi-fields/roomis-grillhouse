import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ecrire, verifier } from '../../scripts/turbo-des-paquets.mjs';

// The data a package's tests read (Bazel's `data`) and the traces a stage writes (Bazel's
// genrule), declared in its package.json (`grillhouse.lit`, `grillhouse.traces`).
// Witness: BPScript (320.6.6, 320.6.7), whose `060-encoder#test:vitest` waited for
// `990-corpus#build`, the build of the shared test material, whose inputs counted its 2043 data
// files: a scene changed replayed the tests of 26 packages. The guarantee: the test task of a
// package depends on its code, on what it imports and on the directories it declares only.

const DEPOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(DEPOT, 'scripts/turbo-des-paquets.mjs');
const TURBO = path.join(DEPOT, 'node_modules/.bin/turbo');
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
const etage = { build: 'tsc', 'test:vitest': 'vitest run' };

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
    'test:vitest': {
      dependsOn: ['build', '^build'],
      inputs: ['$TURBO_DEFAULT$', '$TURBO_ROOT$/spec/**'],
      outputs: [],
    },
    '//#grillhouse:gardes': { dependsOn: [], outputs: [] },
    '//#gardes': { dependsOn: [], outputs: [] },
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

const lancer = (racine: string, args: string[]) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd: racine, encoding: 'utf8' });

type TacheSeche = {
  taskId: string;
  package: string;
  dependencies: string[];
  inputs: Record<string, string>;
  hash: string;
};
const sec = (racine: string, taches: string[]): Map<string, TacheSeche> => {
  const r = spawnSync(TURBO, ['run', ...taches, '--dry=json', '--cwd', racine], {
    encoding: 'utf8',
    env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' },
  });
  expect(r.status, r.stderr).toBe(0);
  return new Map((JSON.parse(r.stdout) as { tasks: TacheSeche[] }).tasks.map(t => [t.taskId, t]));
};

const sous = (f: string, dossier: string) => f === dossier || f.startsWith(`${dossier}/`);
const recouvre = (a: string, b: string) => sous(a, b) || sous(b, a);
const net = (d: string) => d.replace(/\/+$/, '');

describe('the turbo.json generated from the declared data and traces', () => {
  it('a reader’s tests wait for the traces it reads and hash the directories it declares', () => {
    const racine = depotBP();
    expect(lancer(racine, ['--ecrire']).status).toBe(0);
    expect(tachesDe(racine, 'packages/070-deriver')['test:vitest']).toEqual({
      dependsOn: ['build', '^build', '060-encoder#trace:grammaires'],
      inputs: ['$TURBO_EXTENDS$', `$TURBO_ROOT$/${GRAMMAIRES}/**`, `$TURBO_ROOT$/${SCENES_070}/**`],
    });
    // A reader whose directories no trace writes waits for what the root's test task waits for.
    expect(tachesDe(racine, 'packages/040-checker')['test:vitest']).toEqual({
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
    expect(tachesDe(racine, 'packages/040-checker')['test:vitest'].inputs).toEqual([
      '$TURBO_DEFAULT$',
      `$TURBO_ROOT$/${SCENES_040}/**`,
    ]);
    expect(tachesDe(racine, CORPUS).build.inputs?.[0]).toBe('$TURBO_DEFAULT$');
    const t = sec(racine, ['test:vitest']);
    expect(Object.keys(t.get('040-checker#test:vitest')!.inputs)).toContain('src/index.ts');
    expect(Object.keys(t.get('990-corpus#build')!.inputs)).toContain('src/index.ts');
  });

  it('the check passes on what the generator wrote, a trace not yet written included', () => {
    const racine = depotBP();
    rmSync(path.join(racine, GRAMMAIRES), { recursive: true });
    ecrire(racine);
    expect(verifier(racine)).toEqual([]);
  });
});

// The guarantee, read in Turborepo's own graph and hashes (`turbo run test:vitest --dry=json`,
// Turborepo 2.11.8): what each test task waits for and hashes is computed from the package.json
// alone.
describe('the guarantee: a test task depends on its code, what it imports and the directories it declares only', () => {
  const noms = new Set(Object.keys(PAQUETS));
  const internes = (p: Record<string, unknown>, champs: string[]) =>
    champs
      .flatMap(c => Object.keys((p[c] as Record<string, string> | undefined) ?? {}))
      .filter(n => noms.has(n));
  const construit = (n: string) =>
    typeof (PAQUETS[n].scripts as Record<string, string> | undefined)?.build === 'string';
  const EXECUTION = ['dependencies', 'peerDependencies', 'optionalDependencies'];
  const TOPOLOGIE = ['dependencies', 'devDependencies', 'optionalDependencies'];
  type Decl = { lit?: string[]; traces?: Record<string, { lit: string[]; ecrit: string }> };
  const decl = (n: string) => (PAQUETS[n].grillhouse ?? {}) as Decl;
  const traces = Object.keys(PAQUETS).flatMap(n =>
    Object.entries(decl(n).traces ?? {}).map(([t, d]) => ({ id: `${n}#${t}`, n, ...d }))
  );
  // A build node and the builds of its runtime dependencies, recursively.
  const construction = (n: string, vu: Set<string>) => {
    if (vu.has(`${n}#build`)) {
      return;
    }
    vu.add(`${n}#build`);
    for (const d of internes(PAQUETS[n], EXECUTION).filter(construit)) {
      construction(d, vu);
    }
  };
  // What a task of <n> reading <lit> waits for: its build, the builds of what it imports, the
  // traces whose output it reads, recursively.
  const attente = (n: string, lit: string[], vu: Set<string>, soi?: string) => {
    construction(n, vu);
    for (const d of internes(PAQUETS[n], TOPOLOGIE)) {
      construction(d, vu);
    }
    for (const t of traces) {
      if (t.id === soi || vu.has(t.id)) {
        continue;
      }
      if (!lit.some(l => recouvre(net(l), t.ecrit))) {
        continue;
      }
      vu.add(t.id);
      attente(t.n, t.lit, vu, t.id);
    }
    return vu;
  };
  const lecteurs = Object.keys(PAQUETS).filter(n => decl(n).lit);
  // What <id> reaches in Turborepo's graph, recursively, the nodes it passes through included.
  const atteint = (graphe: Map<string, TacheSeche>, id: string, vu = new Set<string>()) => {
    for (const d of graphe.get(id)?.dependencies ?? []) {
      if (vu.has(d)) {
        continue;
      }
      vu.add(d);
      atteint(graphe, d, vu);
    }
    return vu;
  };

  it('each test task reaches exactly the tasks its package.json and the declared traces give', () => {
    const racine = depotBP();
    ecrire(racine);
    const graphe = sec(racine, ['test:vitest']);
    for (const n of Object.keys(PAQUETS).filter(n => graphe.has(`${n}#test:vitest`))) {
      const attendu = [...attente(n, decl(n).lit ?? [], new Set())].sort();
      expect([...atteint(graphe, `${n}#test:vitest`)].sort(), n).toEqual(attendu);
    }
    // The chain to the stages through the material's dependencies stays, visible: BPScript
    // reduces it in its package.json, the frame does not cut it.
    expect(atteint(graphe, '060-encoder#test:vitest')).toContain('040-checker#build');
  });

  it('each input file of a test task out of its package falls under a directory it declares, or a root input', () => {
    const racine = depotBP();
    ecrire(racine);
    const graphe = sec(racine, ['test:vitest']);
    for (const n of lecteurs) {
      const dossier = `packages/${n}`;
      const dehors = Object.keys(graphe.get(`${n}#test:vitest`)!.inputs)
        .map(f => path.posix.normalize(path.posix.join(dossier, f)))
        .filter(f => !sous(f, dossier));
      expect(dehors.length, n).toBeGreaterThan(0);
      for (const f of dehors) {
        expect(
          (decl(n).lit ?? []).some(l => sous(f, net(l))) || sous(f, 'spec'),
          `${n} : ${f}`
        ).toBe(true);
      }
    }
    // A trace's output, which git ignores, is hashed by its reader.
    expect(Object.keys(graphe.get('070-deriver#test:vitest')!.inputs)).toContain(
      '../060-encoder/trace/grammaires-du-corpus/grammaire.json'
    );
  });

  it('the build of the material has no input under a declared directory', () => {
    const racine = depotBP();
    ecrire(racine);
    const entrees = Object.keys(sec(racine, ['build']).get('990-corpus#build')!.inputs).map(f =>
      path.posix.join(CORPUS, f)
    );
    expect(entrees).toContain(`${CORPUS}/test/fixtures.ts`);
    expect(entrees).toContain(`${CORPUS}/test/autre/x.json`);
    for (const d of [SCENES_040, PAIRES, SCENES_070]) {
      expect(entrees.filter(f => sous(f, d))).toEqual([]);
    }
  });

  it('witness: another stage’s data leaves a test’s hash as it is; the declared data changes it', () => {
    const racine = depotBP();
    ecrire(racine);
    const empreintes = () =>
      new Map([...sec(racine, ['test:vitest'])].map(([id, t]) => [id, t.hash]));
    const avant = empreintes();
    ecrireFichier(racine, `${SCENES_040}/une.json`, '{"scene":2}\n');
    const apres040 = empreintes();
    expect(apres040.get('060-encoder#test:vitest')).toBe(avant.get('060-encoder#test:vitest'));
    expect(apres040.get('070-deriver#test:vitest')).toBe(avant.get('070-deriver#test:vitest'));
    expect(apres040.get('990-corpus#build')).toBe(avant.get('990-corpus#build'));
    expect(apres040.get('040-checker#test:vitest')).not.toBe(avant.get('040-checker#test:vitest'));
    ecrireFichier(racine, `${PAIRES}/profonde/paire.bps`, 'S --> b\n');
    const apresPaires = empreintes();
    expect(apresPaires.get('060-encoder#test:vitest')).not.toBe(
      apres040.get('060-encoder#test:vitest')
    );
    expect(apresPaires.get('060-encoder#trace:grammaires')).not.toBe(
      apres040.get('060-encoder#trace:grammaires')
    );
    // The reader of the trace follows it.
    expect(apresPaires.get('070-deriver#test:vitest')).not.toBe(
      apres040.get('070-deriver#test:vitest')
    );
    expect(apresPaires.get('040-checker#test:vitest')).toBe(
      apres040.get('040-checker#test:vitest')
    );
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

  it.each([
    ['index.ts'],
    ['profonde/aide.mjs'],
    ['types.d.ts'],
    ['vue.tsx'],
    ['outil.cjs'],
    ['outil.js'],
  ])('a declared directory holding code: %s', fichier => {
    const racine = depotBP();
    ecrireFichier(racine, `${PAIRES}/${fichier}`, 'export {};\n');
    const refus = refusDe(racine);
    expect(refus).toContain(`${PAIRES}/${fichier}`);
    expect(refus).toContain('packages/060-encoder');
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
// but the testeur, and Vite 5 bundles an ESM configuration into a file beside it before loading
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
      tachesRacine(t)['060-encoder#test:vitest'] = { dependsOn: ['build'] };
    });
    expect(refusDe(racine)).toContain('060-encoder#test:vitest');
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
      const tests = tachesRacine(t)['test:vitest'] as { inputs: string[] };
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
