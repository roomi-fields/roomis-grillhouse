// The progress of an automatic pass (scripts/avancement.mjs, scripts/mesure/avancement.mjs),
// as Bazel counts its actions « [1 234 / 2 000] » and a CI its steps: while the variable
// GRILLHOUSE_AVANCEMENT names the progress directory of a pass, the reporter of the base
// configuration writes, at each test file done, the files done and planned of its task; the
// reading adds the tasks, a file replayed from Turborepo's cache counts as done, and the total
// planned takes the previous pass of the same kind while every task has not started.
// Witness: Romain, 2026-10-21, a pass frozen 40 min, the machine at rest, that nothing showed.
//
// Each case calls the reporter and the reading of the progress by their interface; the real
// Turborepo and Vitest in a repository of trial are the night's
// (packages/grillhouse-essais/tests/avancement.nuit.spec.ts).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  garderLeTotal,
  inscrireLePlan,
  lireAvancement,
  lireLaMesure,
  ouvrirAvancement,
} from '../../scripts/avancement.mjs';
import { AVANCEMENT } from '../../scripts/mesure/avancement.mjs';
import AvancementReporter, {
  rapportAvancement,
} from '../../scripts/langages/typescript/vitest-config/avancement.reporter.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'avancement-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;
const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

// <fn> under the environment of the run of Vitest of a task <hash> of Turborepo, its progress
// written to <dossier>.
function sous<T>(dossier: string, hash: string, fn: () => T): T {
  const avant = { a: process.env[AVANCEMENT], h: process.env.TURBO_HASH };
  process.env[AVANCEMENT] = dossier;
  process.env.TURBO_HASH = hash;
  try {
    return fn();
  } finally {
    for (const [k, v] of [
      [AVANCEMENT, avant.a],
      ['TURBO_HASH', avant.h],
    ] as const) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}
type Rapporteur = {
  nom: string;
  onInit(ctx: unknown): void;
  onPathsCollected(f: string[]): void;
  onTaskUpdate(p: [string, { state: string }][]): void;
  onFinished(f: unknown[]): void;
};
// The reporter of the run of the task <hash>, as Vitest creates it in the process of the run, each
// of its calls under that run's environment; its record named after its task, as each run's is
// after its package directory and its process.
function rapporteur(dossier: string, hash: string): Omit<Rapporteur, 'nom'> {
  const r = sous(dossier, hash, () => new AvancementReporter() as Rapporteur);
  r.nom = `tache-${hash}`;
  return {
    onInit: ctx => sous(dossier, hash, () => r.onInit(ctx)),
    onPathsCollected: f => sous(dossier, hash, () => r.onPathsCollected(f)),
    onTaskUpdate: p => sous(dossier, hash, () => r.onTaskUpdate(p)),
    onFinished: f => sous(dossier, hash, () => r.onFinished(f)),
  };
}
// A test file of a run, as Vitest's state names it, and its result.
const fichier = (id: string) => {
  const f: { id: string; filepath: string; file?: unknown } = { id, filepath: `/x/${id}` };
  f.file = f;
  return f;
};
const fait = (id: string) => [id, { state: 'pass' }] as [string, { state: string }];

// The records of the tasks in <dossier>.
const taches = (dossier: string) =>
  readdirSync(path.join(dossier, 'taches')).map(
    f =>
      JSON.parse(readFileSync(path.join(dossier, 'taches', f), 'utf8')) as {
        hash: string | null;
        faits: number;
        prevus: number;
      }
  );

describe('the reporter writes the files done and planned of its task', () => {
  it('during the run, the planned files of the task and fewer done; at its end, every file done', () => {
    const dossier = ouvrirAvancement({ racine: ESSAIS, genre: null, dans: ESSAIS });
    const r = rapporteur(dossier, '0123456789abcdef');
    const f = ['x1', 'x2', 'x3'].map(fichier);
    r.onInit({ state: { idMap: new Map(f.map(x => [x.id, x])) } });
    r.onPathsCollected(f.map(x => x.filepath));
    const debut = taches(dossier);
    expect(debut).toHaveLength(1);
    expect(debut[0]).toMatchObject({ hash: '0123456789abcdef', faits: 0, prevus: 3 });
    r.onTaskUpdate([fait('x1'), ['x2', { state: 'run' }]]);
    expect(taches(dossier)[0]).toMatchObject({ faits: 1, prevus: 3 });
    r.onTaskUpdate([fait('x1')]);
    expect(taches(dossier)[0]).toMatchObject({ faits: 1, prevus: 3 });
    r.onFinished(f);
    expect(lireAvancement(dossier)).toMatchObject({ faits: 3, prevus: 3 });
  });

  it('each task writes its own record; the reading adds them', () => {
    const dossier = ouvrirAvancement({ racine: ESSAIS, genre: null, dans: ESSAIS });
    for (const [hash, n] of [
      ['a', 2],
      ['b', 3],
    ] as const) {
      const r = rapporteur(dossier, hash);
      r.onFinished(Array.from({ length: n }, (_, i) => fichier(`${hash}${i}`)));
    }
    expect(taches(dossier)).toHaveLength(2);
    expect(lireAvancement(dossier)).toMatchObject({ faits: 5, prevus: 5 });
  });

  it('without the variable, the base configuration adds no reporter of progress', () => {
    expect(rapportAvancement({})).toEqual([]);
    expect(rapportAvancement({ [AVANCEMENT]: '/x' })).toHaveLength(1);
  });

  it('a directory that does not read gives no progress', () => {
    expect(lireAvancement(path.join(ESSAIS, 'absent'))).toBeNull();
  });
});

// A repository whose git directory keeps the totals.
function depot() {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  spawnSync('git', ['init', '-q', r]);
  return r;
}
// A task of tests <hash> that played <n> files in <dossier>.
const jouer = (dossier: string, hash: string, n: number) =>
  rapporteur(dossier, hash).onFinished(Array.from({ length: n }, (_, i) => fichier(`${hash}${i}`)));

describe('the total planned: the tasks started, the cache, the previous pass of the same kind', () => {
  it('a file replayed from the cache counts as done; while every task has not started, the total of the previous pass of the same kind stands when it is greater', () => {
    const racine = depot();
    // A first pass, its total kept.
    const premier = ouvrirAvancement({ racine, genre: 'verification', dans: ESSAIS });
    inscrireLePlan(premier, {
      racine,
      taches: [
        { hash: 'a', cache: false },
        { hash: 'b', cache: false },
      ],
    });
    jouer(premier, 'a', 2);
    jouer(premier, 'b', 3);
    garderLeTotal(premier, racine);
    expect(lireAvancement(premier)).toMatchObject({ faits: 5, prevus: 5 });

    // The same pass again: both tasks replay from the cache, every file counts as done before
    // Turborepo plays.
    const second = ouvrirAvancement({ racine, genre: 'verification', dans: ESSAIS });
    inscrireLePlan(second, {
      racine,
      taches: [
        { hash: 'a', cache: true },
        { hash: 'b', cache: true },
      ],
    });
    expect(lireAvancement(second)).toMatchObject({ faits: 5, prevus: 5 });

    // b gains a file: a replays from the cache, b has not started; the previous total stands.
    const troisieme = ouvrirAvancement({ racine, genre: 'verification', dans: ESSAIS });
    inscrireLePlan(troisieme, {
      racine,
      taches: [
        { hash: 'a', cache: true },
        { hash: 'b2', cache: false },
      ],
    });
    expect(lireAvancement(troisieme)).toMatchObject({ faits: 2, prevus: 5 });
    // Another kind has no previous total.
    const autre = ouvrirAvancement({ racine, genre: 'preuve packages/b', dans: ESSAIS });
    expect(lireAvancement(autre)).toMatchObject({ faits: 0, prevus: 0 });
    // Every task started: the total is theirs.
    jouer(troisieme, 'b2', 4);
    expect(lireAvancement(troisieme)).toMatchObject({ faits: 6, prevus: 6 });
  });
});

// A measure out of a ticket: `npm run verifier` writes its progress directory beside the lock of
// the machine (a neighbouring file, not the lock itself), read by the board, removed at its end;
// the pass of `npm run verifier` itself is the night's.
describe('a measure out of a ticket names its progress beside the lock of the machine', () => {
  it('the board reads the measure while its process lives and the lock is held', () => {
    const d = mkdtempSync(path.join(ESSAIS, 'lue-'));
    const verrou = path.join(d, 'mesure-lourde.lock');
    const env = { GRILLHOUSE_VERROU_MACHINE: verrou };
    const dossier = ouvrirAvancement({ racine: d, genre: null, dans: d });
    ecrire(dossier, 'taches/x.json', json({ hash: null, faits: 51, prevus: 123, a: 1_000 }));
    const mesure = { depot: 'Grillhouse', commande: 'npm run verifier', dossier, pid: process.pid };
    writeFileSync(`${verrou}.avancement.json`, json(mesure));
    expect(lireLaMesure(env)).toBeNull();
    writeFileSync(verrou, `${process.pid}:marque`);
    expect(lireLaMesure(env)).toMatchObject({
      depot: 'Grillhouse',
      commande: 'npm run verifier',
      faits: 51,
      prevus: 123,
    });
    writeFileSync(`${verrou}.avancement.json`, json({ ...mesure, pid: 2 ** 22 + 7 }));
    expect(lireLaMesure(env)).toBeNull();
  });
});
