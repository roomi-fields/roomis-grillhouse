// The copy a lot is replayed in (scripts/integration/rejeu.mjs) starts clean at each opening: on
// 2026-11-11 the integration copy stayed with a conflict not resolved (`UU docs/INTERFACE.md`)
// after a lot refused, and the next integration must not inherit it.
//
// A copy's install writes its own node_modules: one that is a link to another tree's is removed at
// the opening, which `npm ci` would empty.
//
// The cases play the real git and the real npm, offline, in a repository of trial.
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
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

describe('the install of a replay copy stays in the copy', () => {
  afterEach(() => vi.unstubAllEnvs());

  it(
    'leaves as it was the node_modules of another tree that the copy linked',
    () => {
      // No registry: the only package of the lock file is a workspace of the repository.
      vi.stubEnv('npm_config_offline', 'true');
      vi.stubEnv('npm_config_cache', path.join(ESSAIS, 'cache-npm'));
      const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
      const ecrire = (dossier: string, f: string, texte: string) => {
        mkdirSync(path.dirname(path.join(dossier, f)), { recursive: true });
        writeFileSync(path.join(dossier, f), texte);
      };
      const racineDuProjet = { name: 'essai', workspaces: ['packages/*'] };
      const a = { name: 'a', version: '1.0.0' };
      git(racine, 'init', '-q', '-b', 'main');
      git(racine, 'config', 'user.email', 'essai@example.com');
      git(racine, 'config', 'user.name', 'essai');
      ecrire(racine, '.gitignore', 'node_modules\n.claude/worktrees/\n');
      ecrire(racine, 'package.json', JSON.stringify(racineDuProjet));
      ecrire(racine, 'packages/a/package.json', JSON.stringify(a));
      ecrire(
        racine,
        'package-lock.json',
        JSON.stringify({
          name: 'essai',
          lockfileVersion: 3,
          requires: true,
          packages: {
            '': racineDuProjet,
            'node_modules/a': { resolved: 'packages/a', link: true },
            'packages/a': { version: a.version },
          },
        })
      );
      git(racine, 'add', '-A');
      git(racine, 'commit', '-q', '-m', 'base');
      const hote = mkdtempSync(path.join(ESSAIS, 'hote-'));
      ecrire(hote, 'node_modules/precieux/index.js', 'precieux\n');
      ecrire(hote, 'node_modules/.package-lock.json', 'hote\n');
      // Every entry of the other tree's node_modules, each file with its text.
      const contenu = () =>
        readdirSync(path.join(hote, 'node_modules'), { recursive: true, encoding: 'utf8' })
          .sort()
          .map(f => {
            const p = path.join(hote, 'node_modules', f);
            return [f, statSync(p).isFile() ? readFileSync(p, 'utf8') : null];
          });
      const avant = contenu();
      const copie = path.join(racine, '.claude', 'worktrees', 'integration');
      git(racine, 'worktree', 'add', '-q', '--detach', copie);
      symlinkSync(path.join(hote, 'node_modules'), path.join(copie, 'node_modules'), 'dir');

      const ouverte = ouvrirCopie({ racine, copie, ref: 'HEAD', dire: () => {} });

      expect(ouverte.refus).toBeUndefined();
      expect(contenu()).toEqual(avant);
      expect(readdirSync(path.join(copie, 'node_modules'))).toContain('a');
    },
    LONG
  );
});
