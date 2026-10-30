// Ticket grillhouse-3dr.3.7: the turbo.json of the packages read by Turborepo itself (`turbo run
// --dry=json` in a git repository of trial, its graph and its hashes) and written by the command:
// its cases moved as they were from
// packages/grillhouse/tests/unit/langages/typescript/turbo-des-paquets-donnees.spec.ts, where what
// the generator writes and what its check refuses are tested by day.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CADRE, RACINE, enProcessus } from './cadre.js';

// The generator and its check, each in a process of its own.
const MODULE = 'scripts/langages/typescript/turbo-des-paquets.mjs';
const ecrire = enProcessus<string[]>(MODULE, 'ecrire');
const verifier = enProcessus<string[]>(MODULE, 'verifier');

// The data a package's tests read (Bazel's `data`) and the traces a stage writes (Bazel's
// genrule), declared in its package.json (`grillhouse.lit`, `grillhouse.traces`).
// Witness: BPScript (320.6.6, 320.6.7), whose `060-encoder#test:unit` waited for
// `990-corpus#build`, the build of the shared test material, whose inputs counted its 2043 data
// files: a scene changed replayed the tests of 26 packages. The guarantee: the test task of a
// package depends on its code, on what it imports and on the directories it declares only.

const DEPOT = RACINE;
const SCRIPT = path.join(CADRE, MODULE);
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

  it('a root task without inputs is extended from Turborepo’s default: `$TURBO_EXTENDS$` would hash only the declared data', () => {
    const racine = depotBP(PAQUETS, JSON.parse(lire(DEPOT, 'templates/turbo/paquets.json')));
    ecrire(racine);
    expect(tachesDe(racine, 'packages/040-checker')['test:unit'].inputs).toEqual([
      '$TURBO_DEFAULT$',
      `$TURBO_ROOT$/${SCENES_040}/**`,
    ]);
    expect(tachesDe(racine, CORPUS).build.inputs?.[0]).toBe('$TURBO_DEFAULT$');
    const t = sec(racine, ['test:unit']);
    expect(Object.keys(t.get('040-checker#test:unit')!.inputs)).toContain('src/index.ts');
    expect(Object.keys(t.get('990-corpus#build')!.inputs)).toContain('src/index.ts');
  });
});

// The guarantee, read in Turborepo's own graph and hashes (`turbo run test:unit --dry=json`,
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
    const graphe = sec(racine, ['test:unit']);
    for (const n of Object.keys(PAQUETS).filter(n => graphe.has(`${n}#test:unit`))) {
      const attendu = [...attente(n, decl(n).lit ?? [], new Set())].sort();
      expect([...atteint(graphe, `${n}#test:unit`)].sort(), n).toEqual(attendu);
    }
    // The chain to the stages through the material's dependencies stays, visible: BPScript
    // reduces it in its package.json, the frame does not cut it.
    expect(atteint(graphe, '060-encoder#test:unit')).toContain('040-checker#build');
  });

  it('each input file of a test task out of its package falls under a directory it declares, or a root input', () => {
    const racine = depotBP();
    ecrire(racine);
    const graphe = sec(racine, ['test:unit']);
    for (const n of lecteurs) {
      const dossier = `packages/${n}`;
      const dehors = Object.keys(graphe.get(`${n}#test:unit`)!.inputs)
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
    expect(Object.keys(graphe.get('070-deriver#test:unit')!.inputs)).toContain(
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
      new Map([...sec(racine, ['test:unit'])].map(([id, t]) => [id, t.hash]));
    const avant = empreintes();
    ecrireFichier(racine, `${SCENES_040}/une.json`, '{"scene":2}\n');
    const apres040 = empreintes();
    expect(apres040.get('060-encoder#test:unit')).toBe(avant.get('060-encoder#test:unit'));
    expect(apres040.get('070-deriver#test:unit')).toBe(avant.get('070-deriver#test:unit'));
    expect(apres040.get('990-corpus#build')).toBe(avant.get('990-corpus#build'));
    expect(apres040.get('040-checker#test:unit')).not.toBe(avant.get('040-checker#test:unit'));
    ecrireFichier(racine, `${PAIRES}/profonde/paire.bps`, 'S --> b\n');
    const apresPaires = empreintes();
    expect(apresPaires.get('060-encoder#test:unit')).not.toBe(
      apres040.get('060-encoder#test:unit')
    );
    expect(apresPaires.get('060-encoder#trace:grammaires')).not.toBe(
      apres040.get('060-encoder#trace:grammaires')
    );
    // The reader of the trace follows it.
    expect(apresPaires.get('070-deriver#test:unit')).not.toBe(
      apres040.get('070-deriver#test:unit')
    );
    expect(apresPaires.get('040-checker#test:unit')).toBe(apres040.get('040-checker#test:unit'));
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

  it('its reader’s tests hash it, and the build of the material leaves it out', () => {
    const racine = depotAvecFichier();
    expect(refusDe(racine)).toBe('');
    const graphe = sec(racine, ['test:unit']);
    const lues = Object.keys(graphe.get('040-checker#test:unit')!.inputs).map(f =>
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
      new Map([...sec(racine, ['test:unit'])].map(([id, t]) => [id, t.hash]));
    const avant = empreintes();
    ecrireFichier(racine, LEXIQUE, '{"mot":2}\n');
    const apres = empreintes();
    expect(apres.get('040-checker#test:unit')).not.toBe(avant.get('040-checker#test:unit'));
    expect(apres.get('990-corpus#build')).toBe(avant.get('990-corpus#build'));
    expect(apres.get('060-encoder#test:unit')).toBe(avant.get('060-encoder#test:unit'));
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
    const graphe = sec(racine, ['test:unit']);
    const lues = Object.keys(graphe.get('040-checker#test:unit')!.inputs).map(f =>
      path.posix.normalize(path.posix.join('packages/040-checker', f))
    );
    expect(lues).toContain(TABLES);
    expect(lues).toContain(`${CAPTURES}/capture.mjs`);
    expect(Object.keys(graphe.get('000-forms#build')!.inputs)).toContain('src/tables.ts');
    expect(Object.keys(graphe.get('060-encoder#build')!.inputs)).toContain('test/capture.mjs');
  });

  it('a change of it replays its reader’s tests', () => {
    const racine = depotAvecCode([CAPTURES, TABLES]);
    ecrire(racine);
    const empreintes = () =>
      new Map([...sec(racine, ['test:unit'])].map(([id, t]) => [id, t.hash]));
    const avant = empreintes();
    ecrireFichier(racine, `${CAPTURES}/capture.mjs`, 'console.log(2);\n');
    const apresCaptures = empreintes();
    expect(apresCaptures.get('040-checker#test:unit')).not.toBe(avant.get('040-checker#test:unit'));
    expect(apresCaptures.get('060-encoder#build')).not.toBe(avant.get('060-encoder#build'));
    ecrireFichier(racine, TABLES, 'export const tables = [1];\n');
    const apresTables = empreintes();
    expect(apresTables.get('040-checker#test:unit')).not.toBe(
      apresCaptures.get('040-checker#test:unit')
    );
    expect(apresTables.get('000-forms#build')).not.toBe(apresCaptures.get('000-forms#build'));
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
      new Map([...sec(racine, ['test:unit'])].map(([id, t]) => [id, t.hash]));
    const avant = empreintes();
    ecrireFichier(racine, 'packages/010-parser/test/parser.test.ts', 'export const essai = 2;\n');
    const apres = empreintes();
    expect(apres.get('010-parser#test:unit')).not.toBe(avant.get('010-parser#test:unit'));
    for (const id of ['010-parser#build', '040-checker#build', '990-corpus#build']) {
      expect(apres.get(id), id).toBe(avant.get(id));
    }
    expect(apres.get('040-checker#test:unit')).toBe(avant.get('040-checker#test:unit'));
    // Its source changed moves its build, and what depends on it.
    ecrireFichier(racine, 'packages/010-parser/src/index.ts', "export const nom = 'autre';\n");
    const source = empreintes();
    expect(source.get('010-parser#build')).not.toBe(apres.get('010-parser#build'));
    expect(source.get('040-checker#build')).not.toBe(apres.get('040-checker#build'));
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

  it('witness: after the update, a new copy’s pointer file leaves the tests’ hashes as they are', () => {
    const copies = (racine: string) => {
      const empreinte = () => sec(racine, ['test:unit']).get('040-checker#test:unit')!.hash;
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
    expect(sec(racine, ['test:unit']).get('040-checker#test:unit')!.hash).not.toBe(avec1);
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
    const graphe = sec(racine, ['build']);
    expect(Object.keys(graphe.get('010-parser#build')!.inputs)).toEqual(
      expect.arrayContaining(['package.json', 'tsconfig.build.json', 'tsconfig.json'])
    );
    expect(Object.keys(graphe.get('000-forms#build')!.inputs)).toEqual(
      expect.arrayContaining(['package.json', 'tsconfig.json'])
    );
  });

  it('its reader’s tests hash it', () => {
    const racine = depotLecteur();
    ecrire(racine);
    expect(tachesDe(racine, 'packages/040-checker')['test:unit'].inputs).toEqual([
      '$TURBO_EXTENDS$',
      ...[...CONFIGS, DONNEES, SCENES_040].sort().map(l => `$TURBO_ROOT$/${l}/**`),
    ]);
    const lues = Object.keys(sec(racine, ['test:unit']).get('040-checker#test:unit')!.inputs).map(
      f => path.posix.normalize(path.posix.join('packages/040-checker', f))
    );
    expect(lues).toEqual(expect.arrayContaining([...CONFIGS, `${DONNEES}/une.json`]));
  });

  it('witness: a change of it moves its package’s build and its reader’s tests; a change of the data, the tests only', () => {
    const racine = depotLecteur();
    ecrire(racine);
    const empreintes = () =>
      new Map([...sec(racine, ['test:unit'])].map(([id, t]) => [id, t.hash]));
    const avant = empreintes();
    ecrireFichier(racine, `${PARSER}/tsconfig.json`, json({ include: ['src', 'test', 'bancs'] }));
    const apres = empreintes();
    expect(apres.get('010-parser#build')).not.toBe(avant.get('010-parser#build'));
    expect(apres.get('040-checker#test:unit')).not.toBe(avant.get('040-checker#test:unit'));
    ecrireFichier(racine, `${DONNEES}/une.json`, '{"donnee":2}\n');
    const donnees = empreintes();
    expect(donnees.get('010-parser#build')).toBe(apres.get('010-parser#build'));
    expect(donnees.get('040-checker#test:unit')).not.toBe(apres.get('040-checker#test:unit'));
  });
});
