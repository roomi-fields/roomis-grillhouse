// The reading the greffon asks of the repository (`releverPourLeGreffon`, scripts/superviseur.mjs):
// it gives the message of the questions due only to the session that holds the lock of the
// supervisor of the project, and applies at each reading the interval `grillhouse.rappel` of the
// project's package.json. The circuits are injected; `bd` is a stub on the PATH that finds no
// ticket closed or deferred; the clock is faked, with no real wait.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { releverPourLeGreffon } from '../../scripts/superviseur.mjs';
import { circuitLu } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'releve-pour-le-greffon-'));
const MIN = 60_000;
const T0 = new Date('2026-11-20T10:00:00Z').getTime();

beforeAll(() => {
  // A `bd` that reads every ticket as open and not deferred.
  const bin = path.join(ESSAIS, 'bin');
  mkdirSync(bin);
  const bd = path.join(bin, 'bd');
  writeFileSync(bd, '#!/bin/sh\necho "[]"\n');
  chmodSync(bd, 0o755);
  vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH ?? ''}`);
});
afterEach(() => vi.useRealTimers());
afterAll(() => vi.unstubAllEnvs());
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  }
};

// A repository (with a package.json carrying <pkg>), a copy of work of it, and the lock of the
// supervisor naming <tenant>.
const depot = (pkg: object = {}, tenant: number | null = process.ppid) => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(racine, 'init', '-q');
  writeFileSync(path.join(racine, 'package.json'), JSON.stringify(pkg));
  git(racine, 'add', 'package.json');
  git(racine, 'commit', '-q', '-m', 'init');
  mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
  const copie = path.join(racine, '.claude', 'worktrees', 'copie');
  git(racine, 'worktree', 'add', '-q', '-b', 'agent/copie', copie);
  if (tenant !== null) {
    writeFileSync(path.join(racine, '.git', 'grillhouse-superviseur.lock'), `${tenant}\n`);
  }
  return { racine, copie };
};

const circuits = () =>
  Promise.resolve([
    circuitLu('demo-1', {
      etape: 'controles',
      code: 14,
      arret: 'controles',
      question: 'Quel paquet lève ce rouge ?',
      qui: 'superviseur',
      run: 'run-demo-1',
      numero: 1,
    }),
  ]);
const lire = (racine: string, env: Record<string, string | undefined> = {}) =>
  releverPourLeGreffon(racine, { env, circuitsDe: circuits });

describe('the reading for the greffon gives the message only to the session that holds the lock', () => {
  it('gives the message of the question to the session that holds the lock of the supervisor', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: T0 });
    const { racine } = depot();
    const texte = await lire(racine);
    expect(texte).toContain('demo-1');
    expect(texte).toContain('Quel paquet lève ce rouge ?');
    expect(texte).toContain('npx grillhouse circuit demo-1 --reprendre');
  });

  it('gives nothing to a session when no lock of the supervisor is held', async () => {
    const { racine } = depot({}, null);
    expect(await lire(racine)).toBe('');
  });

  it('gives nothing to a session when another process holds the lock', async () => {
    const { racine } = depot({}, process.pid);
    expect(await lire(racine)).toBe('');
  });

  it('gives nothing to the session of a role, whoever holds the lock', async () => {
    const { racine } = depot();
    expect(await lire(racine, { BEADS_ACTOR: 'testwriter' })).toBe('');
  });

  it('gives nothing from a copy of work, even with the lock held', async () => {
    const { copie } = depot();
    expect(await lire(copie)).toBe('');
  });

  it('gives nothing when the circuits do not read', async () => {
    const { racine } = depot();
    const texte = await releverPourLeGreffon(racine, {
      env: {},
      circuitsDe: () => Promise.reject(new Error('serveur muet')),
    });
    expect(texte).toBe('');
  });
});

describe('the reading for the greffon applies the key grillhouse.rappel at each reading', () => {
  it('refuses a faulty key, naming it with its value', async () => {
    for (const rappel of [0, -3, 'cinq', true]) {
      const { racine } = depot({ grillhouse: { rappel } });
      await expect(lire(racine)).rejects.toThrow(
        new RegExp(
          `grillhouse\\.rappel.*${String(JSON.stringify(rappel)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
        )
      );
    }
  });

  it('gives a question again every 5 minutes by default, not before', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: T0 });
    const { racine } = depot();
    expect(await lire(racine)).toContain('demo-1');
    vi.setSystemTime(T0 + 4 * MIN);
    expect(await lire(racine)).toBe('');
    vi.setSystemTime(T0 + 5 * MIN);
    expect(await lire(racine)).toContain('demo-1');
  });

  it('gives a question again at the interval the key sets, read at each reading', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: T0 });
    const { racine } = depot({ grillhouse: { rappel: 10 } });
    expect(await lire(racine)).toContain('demo-1');
    vi.setSystemTime(T0 + 9 * MIN);
    expect(await lire(racine)).toBe('');
    vi.setSystemTime(T0 + 10 * MIN);
    expect(await lire(racine)).toContain('demo-1');
    vi.setSystemTime(T0 + 19 * MIN);
    expect(await lire(racine)).toBe('');
  });
});
