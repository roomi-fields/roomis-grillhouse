// grillhouse-44b.4.1, critère 6: the hook of the plugin (mods/grillhouse/hooks/crochet.mjs), started
// with `CLAUDE_PROJECT_DIR` = a git worktree, finds the main tree by the common directory of git
// (the parent of `git rev-parse --git-common-dir`), runs the command of the frame there, and plays
// it with the worktree as its working directory; outside a worktree it runs the project's own.
// A large test: it mounts a trial repository and its worktree with git, and starts the hook there.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { RACINE } from './cadre.js';

const CROCHET = path.join(RACINE, 'mods/grillhouse/hooks/crochet.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'crochet-worktree-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const GIT = {
  GIT_AUTHOR_NAME: 'essai',
  GIT_AUTHOR_EMAIL: 'essai@example.invalid',
  GIT_COMMITTER_NAME: 'essai',
  GIT_COMMITTER_EMAIL: 'essai@example.invalid',
};
const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT } });
  expect(r.status, `git ${args.join(' ')} : ${r.stderr}`).toBe(0);
};

// A command of the frame that says whose it is, its arguments, its working directory and what
// it reads on its standard input.
function commande(projet: string, nom: string) {
  const f = path.join(projet, 'node_modules/.bin/grillhouse');
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, `#!/usr/bin/env bash\necho "${nom} $* @ $(pwd -P)"\necho "entrée : $(cat)"\n`);
  chmodSync(f, 0o755);
}

// A repository with one commit, its command named « principal »; <copie> a worktree of it.
function depotEtCopie() {
  const principal = path.join(ESSAIS, `principal-${Math.random().toString(36).slice(2)}`);
  mkdirSync(principal, { recursive: true });
  git(principal, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(principal, 'a.txt'), 'a\n');
  git(principal, 'add', 'a.txt');
  git(principal, 'commit', '-q', '-m', 'init');
  commande(principal, 'principal');
  const copie = `${principal}-copie`;
  git(principal, 'worktree', 'add', '-q', copie, '-b', 'copie');
  return { principal: realpathSync(principal), copie: realpathSync(copie) };
}

const crochet = (projet: string, sous: string) =>
  spawnSync(process.execPath, [CROCHET, sous], {
    encoding: 'utf8',
    input: '{"tool_name":"Write"}',
    env: { PATH: process.env.PATH, CLAUDE_PROJECT_DIR: projet, CLAUDE_PLUGIN_ROOT: RACINE },
  });

describe('grillhouse-44b.4.1, critère 6 — le crochet du greffon retrouve l’arbre principal depuis une copie', () => {
  it('critère 6 : depuis une copie, la commande de l’arbre principal est lancée, la copie pour dossier de travail', () => {
    const { principal, copie } = depotEtCopie();
    commande(copie, 'copie');
    const r = crochet(copie, 'verrou');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`principal verrou @ ${copie}`);
    expect(r.stdout).not.toContain('copie verrou');
    expect(r.stdout).toContain('entrée : {"tool_name":"Write"}');
    expect(principal).not.toBe(copie);
  });

  it('critère 6 : la copie sans commande à elle lance quand même celle de l’arbre principal', () => {
    const { copie } = depotEtCopie();
    const r = crochet(copie, 'commande');
    expect(r.stdout).toContain(`principal commande @ ${copie}`);
  });

  it('critère 6 : hors d’une copie (l’arbre principal lui-même), le crochet lance la commande du projet', () => {
    const { principal } = depotEtCopie();
    const r = crochet(principal, 'verrou');
    expect(r.stdout).toContain(`principal verrou @ ${principal}`);
  });

  it('critère 6 : hors d’un dépôt git, le crochet lance la commande du projet', () => {
    const projet = realpathSync(mkdtempSync(path.join(ESSAIS, 'hors-git-')));
    commande(projet, 'projet');
    const r = crochet(projet, 'verrou');
    expect(r.stdout).toContain(`projet verrou @ ${projet}`);
  });
});
