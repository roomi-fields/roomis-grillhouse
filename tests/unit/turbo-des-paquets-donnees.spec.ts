import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import { afterAll, describe, expect, it } from 'vitest';
import { COMMANDE, ecrire, verifier } from '../../scripts/turbo-des-paquets.mjs';

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

// A declared path is a directory or a file: BPScript declares three files. A file is hashed by its
// reader's tests, left out of the build of the package holding it, and refused when absent or code.
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

  it('its reader’s tests hash it, and the build of the material leaves it out', () => {
    const racine = depotAvecFichier();
    expect(refusDe(racine)).toBe('');
    const graphe = sec(racine, ['test:vitest']);
    const lues = Object.keys(graphe.get('040-checker#test:vitest')!.inputs).map(f =>
      path.posix.normalize(path.posix.join('packages/040-checker', f))
    );
    expect(lues).toContain(LEXIQUE);
    const construites = Object.keys(graphe.get('990-corpus#build')!.inputs).map(f =>
      path.posix.join(CORPUS, f)
    );
    expect(construites).not.toContain(LEXIQUE);
    expect(construites).toContain(`${CORPUS}/test/autre/x.json`);
  });

  it('a change of it replays its reader’s tests, and leaves the material’s build as it is', () => {
    const racine = depotAvecFichier();
    ecrire(racine);
    const empreintes = () =>
      new Map([...sec(racine, ['test:vitest'])].map(([id, t]) => [id, t.hash]));
    const avant = empreintes();
    ecrireFichier(racine, LEXIQUE, '{"mot":2}\n');
    const apres = empreintes();
    expect(apres.get('040-checker#test:vitest')).not.toBe(avant.get('040-checker#test:vitest'));
    expect(apres.get('990-corpus#build')).toBe(avant.get('990-corpus#build'));
    expect(apres.get('060-encoder#test:vitest')).toBe(avant.get('060-encoder#test:vitest'));
  });

  it('a declared file absent that no trace writes is refused, named a path read', () => {
    const absent = `${CORPUS}/test/040-checker/absent.json`;
    const refus = refusDe(depotAvecFichier(absent));
    expect(refus).toContain(`le chemin lu \`${absent}\` n'existe pas`);
  });

  it('a declared file of code is refused, named a path read', () => {
    const code = `${CORPUS}/test/040-checker/aide.ts`;
    const racine = depotAvecFichier(code);
    ecrireFichier(racine, code, 'export {};\n');
    const refus = refusDe(racine);
    expect(refus).toContain(`le chemin lu \`${code}\` contient du code (${code})`);
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
    const entrees = Object.keys(sec(racine, ['build']).get('010-parser#build')!.inputs);
    expect(entrees).toContain('src/index.ts');
    expect(entrees).toContain('../../tsconfig.construction.json');
    expect(entrees.filter(f => f.startsWith('test/'))).toEqual([]);
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
    const entrees = Object.keys(sec(racine, ['build']).get('990-corpus#build')!.inputs);
    expect(entrees).toContain('test/fixtures.ts');
    expect(entrees).toContain('test/sources.ts');
    expect(entrees).toContain('tsconfig.fixtures.json');
    expect(entrees.filter(f => f.startsWith('src/'))).toEqual([]);
  });

  it('witness: a test file changed leaves its package’s build and every build and test depending on it as they are', () => {
    const racine = depotConstruit();
    ecrire(racine);
    expect(verifier(racine)).toEqual([]);
    const empreintes = () =>
      new Map([...sec(racine, ['test:vitest'])].map(([id, t]) => [id, t.hash]));
    const avant = empreintes();
    ecrireFichier(racine, 'packages/010-parser/test/parser.test.ts', 'export const essai = 2;\n');
    const apres = empreintes();
    expect(apres.get('010-parser#test:vitest')).not.toBe(avant.get('010-parser#test:vitest'));
    for (const id of ['010-parser#build', '040-checker#build', '990-corpus#build']) {
      expect(apres.get(id), id).toBe(avant.get(id));
    }
    expect(apres.get('040-checker#test:vitest')).toBe(avant.get('040-checker#test:vitest'));
    // Its source changed moves its build, and what depends on it.
    ecrireFichier(racine, 'packages/010-parser/src/index.ts', "export const nom = 'autre';\n");
    const source = empreintes();
    expect(source.get('010-parser#build')).not.toBe(apres.get('010-parser#build'));
    expect(source.get('040-checker#build')).not.toBe(apres.get('040-checker#build'));
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
// Witness: BPScript (si61.8), whose root `test:vitest` hashed `$TURBO_ROOT$/vendor/bp3-engine/**`:
// no copy ever replayed a test from the cache.
describe('an input covering a submodule has its .git left out by the generator', () => {
  const MOTEUR = 'vendor/moteur';
  const GITMODULES = `[submodule "${MOTEUR}"]\n\tpath = ${MOTEUR}\n\turl = https://exemple.org/moteur.git\n`;
  const exclusion = `!$TURBO_ROOT$/${MOTEUR}/.git`;
  // The root's turbo.json of the project, a comment of its own heading it.
  const depotAvecSousModule = (entrees: string[], paquets = PAQUETS, globales?: string[]) => {
    const t = structuredClone(RACINE_BP) as typeof RACINE_BP & { globalDependencies?: string[] };
    t.tasks['test:vitest'].inputs = [...t.tasks['test:vitest'].inputs, ...entrees];
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
      expect(racineLue(racine).tasks['test:vitest'].inputs).toEqual([
        '$TURBO_DEFAULT$',
        '$TURBO_ROOT$/spec/**',
        entree,
        exclusion,
      ]);
      // Only the inputs of the task are rewritten.
      const horsEntrees = (t: string) => t.replace(/"test:vitest": \{[\s\S]*?"outputs"/, '');
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
      expect(racineLue(racine).tasks['test:vitest'].inputs).toEqual([
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
    expect(tachesDe(racine, 'packages/040-checker')['test:vitest'].inputs).toEqual([
      '$TURBO_EXTENDS$',
      `$TURBO_ROOT$/${SCENES_040}/**`,
      `$TURBO_ROOT$/${MOTEUR}/**`,
      exclusion,
    ]);
  });

  it('witness: after the update, a new copy’s pointer file leaves the tests’ hashes as they are', () => {
    const copies = (racine: string) => {
      const empreinte = () => sec(racine, ['test:vitest']).get('040-checker#test:vitest')!.hash;
      writeFileSync(path.join(racine, MOTEUR, '.git'), 'gitdir: ../../.git/worktrees/copie-1\n');
      const avant = empreinte();
      writeFileSync(path.join(racine, MOTEUR, '.git'), 'gitdir: ../../.git/worktrees/copie-2\n');
      return [avant, empreinte()];
    };
    // Without it, the pointer file of each copy moves the hash: the cache never serves.
    const [sans1, sans2] = copies(depotAvecSousModule([`$TURBO_ROOT$/${MOTEUR}/**`]));
    expect(sans2).not.toBe(sans1);
    const racine = depotAvecSousModule([`$TURBO_ROOT$/${MOTEUR}/**`]);
    ecrire(racine);
    const [avec1, avec2] = copies(racine);
    expect(avec2).toBe(avec1);
    writeFileSync(path.join(racine, MOTEUR, 'moteur.json'), '{"v":2}\n');
    expect(sec(racine, ['test:vitest']).get('040-checker#test:vitest')!.hash).not.toBe(avec1);
  });
});
