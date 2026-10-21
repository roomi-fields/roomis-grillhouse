// The progress of an automatic pass (scripts/avancement.mjs, scripts/vitest-config/avancement.mjs),
// as Bazel counts its actions « [1 234 / 2 000] » and a CI its steps: while the variable
// GRILLHOUSE_AVANCEMENT names the progress directory of a pass, the reporter of the base
// configuration writes, at each test file done, the files done and planned of its task; the
// reading adds the tasks, a file replayed from Turborepo's cache counts as done, and the total
// planned takes the previous pass of the same kind while every task has not started.
// Witness: Romain, 2026-10-21, a pass frozen 40 min, the machine at rest, that nothing showed.
//
// Each case plays the real Turborepo and the real Vitest of the repository in a repository of
// trial with two packages, `a` (two test files) and `b` (three).
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  garderLeTotal,
  lireAvancement,
  lireLaMesure,
  ouvrirAvancement,
  planifier,
} from '../../scripts/avancement.mjs';
import { AVANCEMENT, rapportAvancement } from '../../scripts/vitest-config/avancement.mjs';

const DEPOT = path.resolve(__dirname, '../..');
const BASE = path.join(DEPOT, 'scripts/vitest-config/base.mjs');
const VERIFIER = path.join(DEPOT, 'scripts/verifier.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'avancement-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const LONG = 120_000;

const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;
const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const ENV = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS' && k !== AVANCEMENT
    )
  ),
  PATH: `${path.join(DEPOT, 'node_modules/.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
  TURBO_TELEMETRY_DISABLED: '1',
  DO_NOT_TRACK: '1',
};
const git = (racine: string, ...args: string[]) =>
  spawnSync('git', ['-C', racine, ...args], { encoding: 'utf8', env: ENV });

// A test file; with <sonde>, it writes to <sonde> the record of its task it reads while it plays.
const fichierDeTest = (nom: string, sonde?: string) =>
  [
    "import { readdirSync, readFileSync, writeFileSync } from 'node:fs';",
    "import path from 'node:path';",
    "import { it } from 'vitest';",
    `it('${nom}', () => {`,
    ...(sonde
      ? [
          `  const d = path.join(process.env.${AVANCEMENT}, 'taches');`,
          "  const lus = readdirSync(d).map(f => JSON.parse(readFileSync(path.join(d, f), 'utf8')));",
          `  writeFileSync(${JSON.stringify(sonde)}, JSON.stringify(lus));`,
        ]
      : []),
    '});',
    '',
  ].join('\n');

// The trial repository: packages `a` (2 files) and `b` (3 files), played one file after the
// other, Turborepo's template of the frame, committed.
function depot() {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(r, 'node_modules'), 'dir');
  ecrire(
    r,
    'package.json',
    json({ name: 'essai', private: true, workspaces: ['packages/*'], packageManager: 'npm@10.9.8' })
  );
  ecrire(r, 'turbo.json', readFileSync(path.join(DEPOT, 'templates/turbo/paquets.json'), 'utf8'));
  const sonde = path.join(r, 'sonde.json');
  for (const [nom, n] of [
    ['a', 2],
    ['b', 3],
  ] as const) {
    ecrire(
      r,
      `packages/${nom}/package.json`,
      json({ name: nom, type: 'module', scripts: { 'test:vitest': 'vitest run' } })
    );
    ecrire(
      r,
      `packages/${nom}/vitest.config.mjs`,
      `import { mergeConfig } from 'vitest/config';\nimport base from ${JSON.stringify(BASE)};\nexport default mergeConfig(base, { test: { fileParallelism: false } });\n`
    );
    for (let i = 1; i <= n; i++) {
      ecrire(
        r,
        `packages/${nom}/test/x${i}.test.mjs`,
        fichierDeTest(`${nom}${i}`, nom === 'b' && i === 3 ? sonde : undefined)
      );
    }
  }
  ecrire(r, '.gitignore', 'node_modules\n.turbo/\nsonde.json\n');
  git(r, 'init', '-q');
  git(r, 'add', '-A');
  git(r, '-c', 'user.email=e@x', '-c', 'user.name=e', 'commit', '-q', '-m', 'essai');
  return { racine: r, sonde };
}

// One run of Turborepo's tests in <racine>, its progress written to <dossier>.
const turbo = (racine: string, dossier: string) =>
  spawnSync('turbo', ['run', 'test:vitest'], {
    cwd: racine,
    env: { ...ENV, [AVANCEMENT]: dossier },
    encoding: 'utf8',
  });

describe('the reporter writes the files done and planned of its task', () => {
  it(
    'during the run, the planned files of the task and fewer done; at its end, every file done',
    () => {
      const { racine, sonde } = depot();
      const dossier = ouvrirAvancement({ racine, genre: 'essai', dans: ESSAIS });
      const r = turbo(racine, dossier);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      // Read by the third file of b while it plays: b plans 3 files, and fewer than 3 are done.
      const pendant = JSON.parse(readFileSync(sonde, 'utf8')) as {
        faits: number;
        prevus: number;
        hash: string | null;
      }[];
      const deB = pendant.find(x => x.prevus === 3)!;
      expect(deB).toBeDefined();
      expect(deB.faits).toBeLessThan(3);
      expect(deB.hash).toMatch(/^[0-9a-f]{16}$/);
      // Each task wrote its own record; the reading adds them.
      expect(readdirSync(path.join(dossier, 'taches'))).toHaveLength(2);
      expect(lireAvancement(dossier)).toMatchObject({ faits: 5, prevus: 5 });
    },
    LONG
  );

  it('without the variable, the base configuration adds no reporter of progress', () => {
    expect(rapportAvancement({})).toEqual([]);
    expect(rapportAvancement({ [AVANCEMENT]: '/x' })).toHaveLength(1);
  });

  it('a directory that does not read gives no progress', () => {
    expect(lireAvancement(path.join(ESSAIS, 'absent'))).toBeNull();
  });
});

describe('the total planned: the tasks started, the cache, the previous pass of the same kind', () => {
  it(
    'a file replayed from the cache counts as done; while every task has not started, the total of the previous pass of the same kind stands when it is greater',
    () => {
      const { racine } = depot();
      // A first pass, its total kept.
      const premier = ouvrirAvancement({ racine, genre: 'verification', dans: ESSAIS });
      planifier(premier, { racine, args: ['test:vitest'], env: ENV });
      expect(turbo(racine, premier).status).toBe(0);
      garderLeTotal(premier, racine);
      expect(lireAvancement(premier)).toMatchObject({ faits: 5, prevus: 5 });

      // The same pass again: both tasks replay from the cache, every file counts as done before
      // Turborepo plays.
      const second = ouvrirAvancement({ racine, genre: 'verification', dans: ESSAIS });
      planifier(second, { racine, args: ['test:vitest'], env: ENV });
      expect(lireAvancement(second)).toMatchObject({ faits: 5, prevus: 5 });

      // b gains a file: a replays from the cache, b has not started; the previous total stands.
      ecrire(racine, 'packages/b/test/x4.test.mjs', fichierDeTest('b4'));
      const troisieme = ouvrirAvancement({ racine, genre: 'verification', dans: ESSAIS });
      planifier(troisieme, { racine, args: ['test:vitest'], env: ENV });
      expect(lireAvancement(troisieme)).toMatchObject({ faits: 2, prevus: 5 });
      // Another kind has no previous total.
      const autre = ouvrirAvancement({ racine, genre: 'preuve packages/b', dans: ESSAIS });
      expect(lireAvancement(autre)).toMatchObject({ faits: 0, prevus: 0 });
      // Every task started: the total is theirs.
      expect(turbo(racine, troisieme).status).toBe(0);
      expect(lireAvancement(troisieme)).toMatchObject({ faits: 6, prevus: 6 });
    },
    LONG
  );
});

// A measure out of a ticket: `npm run verifier` writes its progress directory beside the lock of
// the machine (a neighbouring file, not the lock itself), read by the board, removed at its end.
// A stand-in of Turborepo, first on the PATH, copies that file to its trace.
describe('a measure out of a ticket names its progress beside the lock of the machine', () => {
  it(
    'npm run verifier writes it during its pass, the repository and the command named, and removes it at its end',
    () => {
      const d = mkdtempSync(path.join(ESSAIS, 'mesure-'));
      const bin = path.join(d, 'bin');
      mkdirSync(bin);
      const verrou = path.join(d, 'mesure-lourde.lock');
      const trace = path.join(d, 'trace');
      writeFileSync(
        path.join(bin, 'turbo'),
        `#!/bin/sh\ncase "$*" in *--dry*) exit 0;; esac\ncat ${JSON.stringify(`${verrou}.avancement.json`)} >> ${JSON.stringify(trace)} 2>/dev/null\nexit 0\n`
      );
      chmodSync(path.join(bin, 'turbo'), 0o755);
      const projet = path.join(d, 'mon-depot');
      mkdirSync(projet);
      writeFileSync(path.join(projet, 'package.json'), '{ "name": "essai", "private": true }\n');
      const env = {
        ...ENV,
        GRILLHOUSE_VERROU_MACHINE: verrou,
        PATH: `${bin}${path.delimiter}${ENV.PATH}`,
      };
      const r = spawnSync(process.execPath, [VERIFIER, '--gardes'], {
        cwd: projet,
        env,
        encoding: 'utf8',
      });
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const vu = JSON.parse(readFileSync(trace, 'utf8')) as Record<string, unknown>;
      expect(vu).toMatchObject({ depot: 'mon-depot', commande: 'npm run verifier -- --gardes' });
      expect(typeof vu.dossier).toBe('string');
      expect(existsSync(`${verrou}.avancement.json`)).toBe(false);
      expect(existsSync(vu.dossier as string)).toBe(false);
      expect(lireLaMesure(env)).toBeNull();
    },
    LONG
  );

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
