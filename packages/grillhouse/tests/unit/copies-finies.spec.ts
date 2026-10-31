// grillhouse-5vv: no working copy outlives the entry of its content on main. After its steps, the
// night (scripts/nuit.sh) passes each copy `git worktree list` names, the main tree and its own
// copy left out, through scripts/retirer-copie.sh (scripts/copies-finies.mjs): a copy whose
// content (its commits and its local work) is all on main goes, a refused one (commits or work
// not entered, a lock) stays, named with its reason; the branch of a copy removed goes, main and a
// branch another copy holds staying; a copy a running circuit holds stays, even without work.
//
// Each case plays the real git in a repository of trial: main (the main tree) and its copies
// under .claude/worktrees, as the circuit and the agents make them.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { retirerLesCopiesFinies } from '../../scripts/copies-finies.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'copies-finies-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LONG = 30_000;

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};

// The repository of trial, committed on <branche>: a.txt, b.txt; its copies ignored.
function depot(branche = 'main') {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(r, 'init', '-q', '-b', branche);
  git(r, 'config', 'user.email', 'essai@example.com');
  git(r, 'config', 'user.name', 'essai');
  writeFileSync(path.join(r, 'a.txt'), 'a\n');
  writeFileSync(path.join(r, 'b.txt'), 'b\n');
  writeFileSync(path.join(r, '.gitignore'), '.claude/worktrees/\n');
  git(r, 'add', '-A');
  git(r, 'commit', '-q', '-m', 'base');
  return r;
}

// The copy .claude/worktrees/<nom> of <racine>, on the new branch <branche> (null: detached).
function copie(racine: string, nom: string, branche: string | null) {
  const c = path.join(racine, '.claude', 'worktrees', nom);
  if (branche) {
    git(racine, 'worktree', 'add', '-q', '-b', branche, c);
  } else {
    git(racine, 'worktree', 'add', '-q', '--detach', c);
  }
  return c;
}

// A commit in <dossier> that writes <texte> to <fichier>.
function engager(dossier: string, fichier: string, texte: string) {
  writeFileSync(path.join(dossier, fichier), texte);
  git(dossier, 'add', '-A');
  git(dossier, 'commit', '-q', '-m', `${fichier} : ${texte.trim()}`);
}

const branches = (racine: string) =>
  git(racine, 'branch', '--format=%(refname:short)').split('\n').filter(Boolean);
const balayer = (racine: string, o: { garder?: string[]; enCours?: Set<string> | null } = {}) =>
  retirerLesCopiesFinies(racine, {
    garder: o.garder ?? [],
    lireEnCours: () => (o.enCours === undefined ? new Set<string>() : o.enCours),
  }).join('\n');

describe('the night removes the copies whose content is on main (grillhouse-5vv)', () => {
  it(
    'criteria 1 and 2: a copy whose work entered main by its content goes, with its branch',
    () => {
      const racine = depot();
      const c = copie(racine, 'agent-1', 'worktree-agent-1');
      engager(c, 'a.txt', 'a2\n');
      // The lot enters main by its content (a cherry-pick: another commit, the same files).
      engager(racine, 'a.txt', 'a2\n');
      const journal = balayer(racine);
      expect(existsSync(c)).toBe(false);
      expect(branches(racine)).toEqual(['main']);
      expect(journal).toContain(`copie retirée : .claude/worktrees/agent-1`);
      expect(journal).toContain('branche worktree-agent-1 supprimée');
    },
    LONG
  );

  it(
    'criterion 1: a copy carrying work that has not entered main stays, named with its reason',
    () => {
      const racine = depot();
      const c = copie(racine, 'agent-2', 'worktree-agent-2');
      writeFileSync(path.join(c, 'b.txt'), 'b local\n');
      const journal = balayer(racine);
      expect(existsSync(c)).toBe(true);
      expect(readFileSync(path.join(c, 'b.txt'), 'utf8')).toBe('b local\n');
      expect(branches(racine)).toContain('worktree-agent-2');
      expect(journal).toMatch(/copie gardée : \.claude\/worktrees\/agent-2 : .*travail local/);
      expect(journal).toContain('b.txt');
    },
    LONG
  );

  it(
    'criterion 1: a locked copy stays, named with its reason',
    () => {
      const racine = depot();
      const c = copie(racine, 'agent-3', 'worktree-agent-3');
      git(racine, 'worktree', 'lock', '--reason', 'agent en cours', c);
      const journal = balayer(racine);
      expect(existsSync(c)).toBe(true);
      expect(journal).toMatch(/copie gardée : \.claude\/worktrees\/agent-3 : .*verrouillée/);
    },
    LONG
  );

  it(
    'criterion 1: a clean copy whose commits are not on main stays, named with the first path',
    () => {
      const racine = depot();
      const c = copie(racine, 'agent-4', 'worktree-agent-4');
      engager(c, 'b.txt', 'b2\n');
      const journal = balayer(racine);
      expect(existsSync(c)).toBe(true);
      expect(branches(racine)).toContain('worktree-agent-4');
      expect(journal).toMatch(
        /copie gardée : \.claude\/worktrees\/agent-4 : ses commits ne sont pas entrés, b\.txt n'est pas sur main/
      );
    },
    LONG
  );

  it(
    'criterion 1: a detached copy carrying a commit absent from main stays, its commit kept',
    () => {
      const racine = depot();
      const c = copie(racine, 'detachee', null);
      engager(c, 'a.txt', 'a detache\n');
      const commit = git(c, 'rev-parse', 'HEAD');
      const journal = balayer(racine);
      expect(existsSync(c)).toBe(true);
      expect(git(c, 'rev-parse', 'HEAD')).toBe(commit);
      expect(journal).toMatch(
        /copie gardée : \.claude\/worktrees\/detachee : ses commits ne sont pas entrés, a\.txt n'est pas sur main/
      );
    },
    LONG
  );

  it(
    'criterion 2: a branch another copy holds stays, and main stays',
    () => {
      const racine = depot('autre');
      git(racine, 'branch', 'main');
      const surMain = copie(racine, 'sur-main', null);
      git(surMain, 'switch', '-q', 'main');
      const c = copie(racine, 'agent-5', 'partagee');
      const tenante = path.join(racine, '.claude', 'worktrees', 'agent-5b');
      git(racine, 'worktree', 'add', '-q', '-f', tenante, 'partagee');
      git(racine, 'worktree', 'lock', tenante);
      const journal = balayer(racine);
      expect(existsSync(surMain)).toBe(false);
      expect(existsSync(c)).toBe(false);
      expect(existsSync(tenante)).toBe(true);
      expect(branches(racine).sort()).toEqual(['autre', 'main', 'partagee']);
      expect(journal).toMatch(/branche partagee reste : .*agent-5b/);
    },
    LONG
  );

  it(
    'criterion 1: the main tree and the copies named to keep (the night) are not touched',
    () => {
      const racine = depot();
      const nuit = copie(racine, 'nuit', null);
      const journal = balayer(racine, { garder: [nuit] });
      expect(existsSync(nuit)).toBe(true);
      expect(existsSync(path.join(racine, 'a.txt'))).toBe(true);
      expect(journal).not.toContain('nuit');
    },
    LONG
  );

  it(
    'criterion 1: a copy whose folder is gone leaves the list (git worktree prune), unnamed',
    () => {
      const racine = depot();
      const c = copie(racine, 'disparue', 'worktree-disparue');
      rmSync(c, { recursive: true, force: true });
      const journal = balayer(racine);
      expect(git(racine, 'worktree', 'list', '--porcelain')).not.toContain('disparue');
      expect(journal).not.toContain('copie gardée');
    },
    LONG
  );

  it(
    'criterion 3: the copy of a ticket whose circuit runs stays, even without work',
    () => {
      const racine = depot();
      const parTravail = copie(racine, 'proj-1', 'agent/proj-1');
      mkdirSync(`${parTravail}.travail`);
      writeFileSync(path.join(`${parTravail}.travail`, 'consigne-1.md'), 'x\n');
      const parTicket = copie(racine, 'proj-2', 'agent/proj-2');
      const journal = balayer(racine, { enCours: new Set(['proj-2']) });
      expect(existsSync(parTravail)).toBe(true);
      expect(existsSync(path.join(`${parTravail}.travail`, 'consigne-1.md'))).toBe(true);
      expect(existsSync(parTicket)).toBe(true);
      expect(journal).toMatch(/copie gardée : \.claude\/worktrees\/proj-1 : .*proj-1\.travail/);
      expect(journal).toMatch(/copie gardée : \.claude\/worktrees\/proj-2 : .*proj-2 est en cours/);
    },
    LONG
  );

  it(
    'criterion 3: the integration copy and the queue copy stay while their lock stands',
    () => {
      const racine = depot();
      const integration = copie(racine, 'integration', null);
      const file = copie(racine, 'file', null);
      const commun = git(racine, 'rev-parse', '--path-format=absolute', '--git-common-dir');
      writeFileSync(path.join(commun, 'integration.lock'), `${process.pid}:x`);
      writeFileSync(path.join(commun, 'file-integration.lock'), `${process.pid}:y`);
      const journal = balayer(racine);
      expect(existsSync(integration)).toBe(true);
      expect(existsSync(file)).toBe(true);
      expect(journal).toMatch(
        /copie gardée : \.claude\/worktrees\/integration : .*integration\.lock/
      );
      expect(journal).toMatch(
        /copie gardée : \.claude\/worktrees\/file : .*file-integration\.lock/
      );
    },
    LONG
  );

  it(
    'criterion 3: the tickets in progress that do not read hold every copy',
    () => {
      const racine = depot();
      const c = copie(racine, 'agent-6', null);
      const journal = balayer(racine, { enCours: null });
      expect(existsSync(c)).toBe(true);
      expect(journal).toContain('aucune copie n’est retirée');
    },
    LONG
  );

  // grillhouse-8ye: the night of 2026-10-31 called bd in every trial of the night, which has no
  // copy but its own; the tests that a green night calls no bd went red.
  it(
    'grillhouse-8ye: with no copy but those left out, the tickets in progress are not read',
    () => {
      const racine = depot();
      const nuit = copie(racine, 'nuit', null);
      let lectures = 0;
      const journal = retirerLesCopiesFinies(racine, {
        garder: [nuit],
        lireEnCours: () => {
          lectures += 1;
          return null;
        },
      });
      expect(journal).toEqual([]);
      expect(lectures).toBe(0);
      expect(existsSync(nuit)).toBe(true);
    },
    LONG
  );

  it(
    'grillhouse-8ye: with a copy to judge, the tickets in progress are read once',
    () => {
      const racine = depot();
      const nuit = copie(racine, 'nuit', null);
      copie(racine, 'agent-7', null);
      copie(racine, 'agent-8', null);
      let lectures = 0;
      retirerLesCopiesFinies(racine, {
        garder: [nuit],
        lireEnCours: () => {
          lectures += 1;
          return new Set<string>();
        },
      });
      expect(lectures).toBe(1);
    },
    LONG
  );
});

describe('the night calls the removal after its steps, its verdict unchanged (grillhouse-5vv)', () => {
  it('criterion 1: nuit.sh runs copies-finies.mjs once its steps are played, whatever its code', () => {
    const nuit = readFileSync(path.join(import.meta.dirname, '../../scripts/nuit.sh'), 'utf8');
    const code = nuit
      .split('\n')
      .filter(l => !l.trim().startsWith('#'))
      .join('\n');
    const verdict = code.indexOf('verdict=$?');
    const appel = code.indexOf('copies-finies.mjs');
    expect(verdict).toBeGreaterThan(0);
    expect(appel).toBeGreaterThan(verdict);
    expect(appel).toBeLessThan(code.indexOf('if [ "$verdict" -eq 75 ]'));
    expect(code.slice(appel, code.indexOf('\n', appel))).toMatch(/\|\| true|; true$/);
  });
});
