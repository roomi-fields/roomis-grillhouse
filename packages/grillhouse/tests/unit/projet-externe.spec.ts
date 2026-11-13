// Le dossier d'un projet de `external_projects` (`cheminDuProjetExterne` de
// scripts/file-des-tickets.mjs) : un chemin absolu tel qu'il est posé ; un chemin relatif, que
// `grillhouse maj` écrit, depuis la racine de l'arbre principal du projet, une copie comprise.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cheminDuProjetExterne } from '../../scripts/file-des-tickets.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'projet-externe-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const git = (cwd: string, ...a: string[]) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
    cwd,
    encoding: 'utf8',
  });
  expect(r.status, r.stderr).toBe(0);
};

describe('le dossier d’un projet externe se lit depuis l’arbre principal', () => {
  const projet = path.join(ESSAIS, 'osc-bridge');
  mkdirSync(projet, { recursive: true });
  git(projet, 'init', '-q');
  writeFileSync(path.join(projet, 'a'), 'a\n');
  git(projet, 'add', 'a');
  git(projet, 'commit', '-q', '-m', 'a');
  const copie = path.join(projet, '.claude/worktrees/OB-1');
  git(projet, 'worktree', 'add', '-q', copie);

  it('un chemin absolu reste tel qu’il est posé', () => {
    expect(cheminDuProjetExterne(projet, '/ailleurs/synthhub')).toBe('/ailleurs/synthhub');
  });

  it('un chemin relatif se lit depuis la racine du projet', () => {
    expect(cheminDuProjetExterne(projet, '../synthhub')).toBe(path.join(ESSAIS, 'synthhub'));
  });

  it('depuis une copie, il se lit depuis l’arbre principal, pas depuis la copie', () => {
    expect(cheminDuProjetExterne(copie, '../synthhub')).toBe(path.join(ESSAIS, 'synthhub'));
  });
});
