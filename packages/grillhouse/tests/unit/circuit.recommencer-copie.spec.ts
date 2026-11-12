// `--recommencer` retire la copie du ticket, ses fiches, son journal et son dossier de travail, et
// seulement eux : le ticket, son plan, ses commentaires et les copies des autres tickets restent
// (scripts/recommencer.mjs, `retirerLaCopieDuTicket`). Une copie réelle de git, aucun serveur.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Le module se charge à l'appel : sans lui, chaque test rougit, le fichier se charge.
const retirerLaCopieDuTicket = async (racine: string, ticket: string): Promise<string> => {
  const m = (await import('../../scripts/recommencer.mjs')) as unknown as {
    retirerLaCopieDuTicket: (racine: string, ticket: string) => string;
  };
  return m.retirerLaCopieDuTicket(racine, ticket);
};

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-recommencer-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A repository with the copies `a` and `b` of two tickets, each with its sheets, its journal and its
// working directory; the copy `a` carries work not committed.
function depot() {
  const racine = path.join(ESSAIS, `depot-${Math.random().toString(36).slice(2)}`);
  mkdirSync(racine);
  const git = (...a: string[]) =>
    spawnSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    });
  git('init', '-q', '-b', 'main');
  writeFileSync(path.join(racine, 'a.txt'), 'x\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'départ');
  const copies = path.join(racine, '.claude', 'worktrees');
  mkdirSync(copies, { recursive: true });
  for (const t of ['essai-a', 'essai-b']) {
    git('worktree', 'add', '-q', '-b', `agent/${t}`, path.join(copies, t));
    writeFileSync(path.join(copies, `${t}.fiches.jsonl`), '{}\n');
    writeFileSync(path.join(copies, `${t}.log`), 'journal\n');
    mkdirSync(path.join(copies, `${t}.travail`));
    writeFileSync(path.join(copies, `${t}.travail`, 'x'), 'x');
  }
  writeFileSync(path.join(copies, 'essai-a', 'travail-non-commite.txt'), 'perdu\n');
  return { racine, copies };
}

describe('la copie d’un ticket retirée pour recommencer', () => {
  it('removes the copy, its sheets, its journal and its working directory, and names the copy', async () => {
    const { racine, copies } = depot();
    const dit = await retirerLaCopieDuTicket(racine, 'essai-a');
    expect(dit).toBe(path.join(copies, 'essai-a'));
    expect(existsSync(path.join(copies, 'essai-a'))).toBe(false);
    expect(existsSync(path.join(copies, 'essai-a.fiches.jsonl'))).toBe(false);
    expect(existsSync(path.join(copies, 'essai-a.log'))).toBe(false);
    expect(existsSync(path.join(copies, 'essai-a.travail'))).toBe(false);
  });

  it('removes a copy that carries work not committed: the gesture is asked for', async () => {
    const { racine, copies } = depot();
    await retirerLaCopieDuTicket(racine, 'essai-a');
    expect(existsSync(path.join(copies, 'essai-a', 'travail-non-commite.txt'))).toBe(false);
  });

  it('leaves the copy of another ticket and everything it holds', async () => {
    const { racine, copies } = depot();
    await retirerLaCopieDuTicket(racine, 'essai-a');
    expect(existsSync(path.join(copies, 'essai-b'))).toBe(true);
    expect(existsSync(path.join(copies, 'essai-b.fiches.jsonl'))).toBe(true);
    expect(existsSync(path.join(copies, 'essai-b.log'))).toBe(true);
    expect(existsSync(path.join(copies, 'essai-b.travail', 'x'))).toBe(true);
    expect(existsSync(path.join(racine, 'a.txt'))).toBe(true);
  });
});
