// `grillhouse circuit <ticket> --recommencer`: the removal of what a ticket's circuit left, so that
// a fresh launch starts from the testwriter in a fresh copy. The copy (whatever work it carries, the
// gesture being asked for, as a reset of Temporal), its branch, its sheets, its journal and its
// working directory go; the ticket, its description, its plan and its comments are Beads' and stay.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

/**
 * Removes the copy of <ticket> in the repository <racine> with its branch `agent/<ticket>`, its
 * sheets (`<copie>.fiches.jsonl`), its journal (`<copie>.log`) and its working directory
 * (`<copie>.travail`), and nothing else: the copy of another ticket stays. Returns the copy removed.
 */
export function retirerLaCopieDuTicket(racine, ticket) {
  const copie = path.join(racine, '.claude', 'worktrees', ticket);
  const git = (...a) => spawnSync('git', ['-C', racine, ...a], { encoding: 'utf8' });
  if (existsSync(copie)) {
    const r = git('worktree', 'remove', '--force', '--force', copie);
    if (r.status !== 0) {
      rmSync(copie, { recursive: true, force: true });
    }
  }
  git('worktree', 'prune');
  git('branch', '-D', `agent/${ticket}`);
  for (const suite of ['.fiches.jsonl', '.log', '.travail']) {
    rmSync(`${copie}${suite}`, { recursive: true, force: true });
  }
  return copie;
}
