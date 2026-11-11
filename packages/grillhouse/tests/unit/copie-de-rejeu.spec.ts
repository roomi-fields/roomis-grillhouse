// The copy a lot is replayed in (scripts/integration/rejeu.mjs) starts clean at each opening: on
// 2026-11-11 the integration copy stayed with a conflict not resolved (`UU docs/INTERFACE.md`)
// after a lot refused, and the next integration must not inherit it.
//
// The case plays the real git in a repository of trial.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ouvrirCopie } from '../../scripts/integration/rejeu.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'copie-de-rejeu-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LONG = 30_000;

const git = (dossier: string, ...args: string[]) =>
  spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });

describe('the copy of a replay opens clean', () => {
  it(
    'a conflict a refused lot left in the copy is gone at the next opening',
    () => {
      const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
      git(racine, 'init', '-q', '-b', 'main');
      git(racine, 'config', 'user.email', 'essai@example.com');
      git(racine, 'config', 'user.name', 'essai');
      writeFileSync(path.join(racine, '.gitignore'), '.claude/worktrees/\n');
      writeFileSync(path.join(racine, 'f.txt'), 'base\n');
      git(racine, 'add', '-A');
      git(racine, 'commit', '-q', '-m', 'base');
      const copie = path.join(racine, '.claude', 'worktrees', 'integration');
      git(racine, 'worktree', 'add', '-q', '--detach', copie);
      // A lot written against « base », applied on a copy where f.txt says otherwise: a conflict.
      writeFileSync(path.join(copie, 'f.txt'), 'lot\n');
      const lot = path.join(ESSAIS, 'lot.patch');
      writeFileSync(lot, git(copie, 'diff').stdout);
      git(copie, 'checkout', '-q', '--', 'f.txt');
      writeFileSync(path.join(copie, 'f.txt'), 'autre\n');
      git(copie, 'add', 'f.txt');
      expect(git(copie, 'apply', '--3way', '--index', lot).status).not.toBe(0);
      expect(git(copie, 'status', '--porcelain').stdout).toContain('UU f.txt');

      const ouverte = ouvrirCopie({ racine, copie, ref: 'HEAD', dire: () => {} });

      expect(ouverte.refus).toBeUndefined();
      expect(git(copie, 'status', '--porcelain').stdout).toBe('');
      expect(git(copie, 'rev-parse', 'HEAD').stdout).toBe(git(racine, 'rev-parse', 'HEAD').stdout);
      expect(readFileSync(path.join(copie, 'f.txt'), 'utf8')).toBe('base\n');
    },
    LONG
  );
});
