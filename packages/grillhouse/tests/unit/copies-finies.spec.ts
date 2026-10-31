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
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
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
const balayer = (
  racine: string,
  o: { garder?: string[]; enCours?: Set<string> | null; fermes?: Set<string> } = {}
) =>
  retirerLesCopiesFinies(racine, {
    garder: o.garder ?? [],
    lireEnCours: () => (o.enCours === undefined ? new Set<string>() : o.enCours),
    lireFermes: () => o.fermes ?? new Set<string>(),
    ignorer: ['target', '.turbo'],
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
      expect(journal).toMatch(
        /copie gardée : \.claude\/worktrees\/agent-2 \([^)]*\) : .*travail local/
      );
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
      expect(journal).toMatch(
        /copie gardée : \.claude\/worktrees\/agent-3 \([^)]*\) : .*verrouillée/
      );
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
        /copie gardée : \.claude\/worktrees\/agent-4 \([^)]*\) : ses commits ne sont pas entrés, b\.txt n'est pas sur main/
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
        /copie gardée : \.claude\/worktrees\/detachee \([^)]*\) : ses commits ne sont pas entrés, a\.txt n'est pas sur main/
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
      expect(journal).toMatch(
        /copie gardée : \.claude\/worktrees\/proj-1 \([^)]*\) : .*proj-1\.travail/
      );
      expect(journal).toMatch(
        /copie gardée : \.claude\/worktrees\/proj-2 \([^)]*\) : .*proj-2 est en cours/
      );
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
        /copie gardée : \.claude\/worktrees\/integration \([^)]*\) : .*integration\.lock/
      );
      expect(journal).toMatch(
        /copie gardée : \.claude\/worktrees\/file \([^)]*\) : .*file-integration\.lock/
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

// grillhouse-cyr (OSC Bridge, 2026-10-31): the disk at 91-97 %, 34 GB under the copies of
// synthhub, each copy of a circuit of Rust keeping its target/ of 3 to 6.5 GB, a closed ticket's
// included; 58 of the 180 copies of Grillhouse kept for ever, their CHANGELOG entered main merged
// with its neighbours' entries.
describe('grillhouse-cyr — what a kept copy loses, and what the removal names', () => {
  // The tools' output of a copy: target/ and a package's .turbo/ (ignored by the repository), and
  // a node_modules link to the main tree's install, as an agent's copy carries it.
  function sorties(c: string, racine: string) {
    mkdirSync(path.join(c, 'target', 'debug'), { recursive: true });
    writeFileSync(path.join(c, 'target', 'debug', 'gros'), 'x'.repeat(4096));
    mkdirSync(path.join(c, 'paquet', '.turbo'), { recursive: true });
    writeFileSync(path.join(c, 'paquet', '.turbo', 'turbo-build.log'), 'x\n');
    mkdirSync(path.join(racine, 'node_modules'), { recursive: true });
    symlinkSync(path.join(racine, 'node_modules'), path.join(c, 'node_modules'));
  }
  // A repository whose .gitignore ignores what the tools write, and tracks paquet/p.txt.
  function depotOutille() {
    const r = depot();
    writeFileSync(
      path.join(r, '.gitignore'),
      '.claude/worktrees/\ntarget/\n.turbo/\nnode_modules/\n'
    );
    mkdirSync(path.join(r, 'paquet'));
    writeFileSync(path.join(r, 'paquet', 'p.txt'), 'p\n');
    git(r, 'add', '-A');
    git(r, 'commit', '-q', '-m', 'outils');
    return r;
  }

  it(
    'criterion 3b: a copy kept, its ticket closed, loses target, .turbo and node_modules; its tracked work stays',
    () => {
      const racine = depotOutille();
      const c = copie(racine, 'proj-9', 'agent/proj-9');
      engager(c, 'b.txt', 'b9\n');
      writeFileSync(path.join(c, 'a.txt'), 'a local\n');
      sorties(c, racine);
      const journal = balayer(racine, { fermes: new Set(['proj-9']) });
      expect(existsSync(c)).toBe(true);
      expect(existsSync(path.join(c, 'target'))).toBe(false);
      expect(existsSync(path.join(c, 'paquet', '.turbo'))).toBe(false);
      expect(existsSync(path.join(c, 'node_modules'))).toBe(false);
      expect(existsSync(path.join(racine, 'node_modules'))).toBe(true);
      expect(readFileSync(path.join(c, 'a.txt'), 'utf8')).toBe('a local\n');
      expect(readFileSync(path.join(c, 'b.txt'), 'utf8')).toBe('b9\n');
      expect(readFileSync(path.join(c, 'paquet', 'p.txt'), 'utf8')).toBe('p\n');
      expect(journal).toMatch(/copie gardée : \.claude\/worktrees\/proj-9 \(/);
      expect(journal).toMatch(/son ticket est fermé : .*target/);
      expect(journal).toMatch(/son ticket est fermé : .*node_modules/);
      expect(journal).toMatch(/son ticket est fermé : .*paquet\/\.turbo/);
    },
    LONG
  );

  it(
    'criterion 3b: a copy whose ticket is in progress, or open, keeps everything',
    () => {
      const racine = depotOutille();
      const enCours = copie(racine, 'proj-10', 'agent/proj-10');
      sorties(enCours, racine);
      const ouvert = copie(racine, 'proj-11', 'agent/proj-11');
      engager(ouvert, 'b.txt', 'b11\n');
      sorties(ouvert, racine);
      balayer(racine, { enCours: new Set(['proj-10']) });
      for (const c of [enCours, ouvert]) {
        expect(existsSync(path.join(c, 'target', 'debug', 'gros'))).toBe(true);
        expect(existsSync(path.join(c, 'paquet', '.turbo'))).toBe(true);
        expect(existsSync(path.join(c, 'node_modules'))).toBe(true);
      }
    },
    LONG
  );

  it(
    'criterion 3c: the line of each kept copy names the place it holds',
    () => {
      const racine = depotOutille();
      const c = copie(racine, 'agent-12', 'worktree-agent-12');
      engager(c, 'b.txt', 'b12\n');
      mkdirSync(path.join(c, 'target'));
      writeFileSync(path.join(c, 'target', 'gros'), 'x'.repeat(2 * 1024 * 1024));
      const enCours = copie(racine, 'proj-13', 'agent/proj-13');
      const journal = balayer(racine, { enCours: new Set(['proj-13']) });
      expect(journal).toMatch(
        /copie gardée : \.claude\/worktrees\/agent-12 \(\d+(,\d)? Mo\) : ses commits ne sont pas entrés/
      );
      expect(journal).toMatch(
        /copie gardée : \.claude\/worktrees\/proj-13 \(\d+(,\d)? [KMG]o\) : le ticket proj-13 est en cours/
      );
      expect(existsSync(enCours)).toBe(true);
    },
    LONG
  );

  it(
    'a copy whose commits entered main, holding only its node_modules link, goes; a locked copy keeps its link',
    () => {
      const racine = depotOutille();
      const c = copie(racine, 'agent-14', 'worktree-agent-14');
      mkdirSync(path.join(racine, 'node_modules'), { recursive: true });
      symlinkSync(path.join(racine, 'node_modules'), path.join(c, 'node_modules'));
      const tenue = copie(racine, 'agent-15', 'worktree-agent-15');
      symlinkSync(path.join(racine, 'node_modules'), path.join(tenue, 'node_modules'));
      git(racine, 'worktree', 'lock', '--reason', 'claude agent', tenue);
      const journal = balayer(racine);
      expect(existsSync(c)).toBe(false);
      expect(existsSync(path.join(racine, 'node_modules'))).toBe(true);
      expect(existsSync(path.join(tenue, 'node_modules'))).toBe(true);
      expect(journal).toMatch(/copie retirée : \.claude\/worktrees\/agent-14/);
      expect(journal).toMatch(/copie gardée : \.claude\/worktrees\/agent-15 .*verrouillée/);
    },
    LONG
  );

  it(
    'a copy kept for its local work keeps its node_modules link, its ticket open',
    () => {
      const racine = depotOutille();
      const c = copie(racine, 'agent-22', 'worktree-agent-22');
      writeFileSync(path.join(c, 'a.txt'), 'a local\n');
      mkdirSync(path.join(racine, 'node_modules'), { recursive: true });
      symlinkSync(path.join(racine, 'node_modules'), path.join(c, 'node_modules'));
      const journal = balayer(racine);
      expect(existsSync(c)).toBe(true);
      expect(journal).toMatch(/copie gardée : \.claude\/worktrees\/agent-22 .*travail local/);
      expect(lstatSync(path.join(c, 'node_modules')).isSymbolicLink()).toBe(true);
      expect(readFileSync(path.join(c, 'a.txt'), 'utf8')).toBe('a local\n');
    },
    LONG
  );

  // The CHANGELOG enters main merged with the entries of the lots beside it (the merge driver
  // `grillhouse-changelog`, scripts/fusion-du-changelog.mjs): its content is never a commit's of
  // main, so the copy's entries are judged, not its whole file.
  function depotAuJournal(attribut: boolean) {
    const r = depot();
    writeFileSync(path.join(r, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n## 0.1.0\n');
    if (attribut) {
      writeFileSync(path.join(r, '.gitattributes'), 'CHANGELOG.md merge=grillhouse-changelog\n');
    }
    git(r, 'add', '-A');
    git(r, 'commit', '-q', '-m', 'journal');
    return r;
  }
  const avecEntrees = (...entrees: string[]) =>
    `# Changelog\n\n## Unreleased\n\n${entrees.map(e => `- ${e}\n`).join('')}\n## 0.1.0\n`;

  it(
    'a CHANGELOG the driver merges counts as entered once each of its entries is on main',
    () => {
      const racine = depotAuJournal(true);
      const c = copie(racine, 'agent-16', 'worktree-agent-16');
      engager(c, 'CHANGELOG.md', avecEntrees('fix A (proj-16)'));
      engager(c, 'a.txt', 'a16\n');
      // Main receives the lot with its entry merged after a neighbour's.
      engager(racine, 'CHANGELOG.md', avecEntrees('fix B (proj-17)', 'fix A (proj-16)'));
      engager(racine, 'a.txt', 'a16\n');
      const journal = balayer(racine);
      expect(existsSync(c)).toBe(false);
      expect(journal).toMatch(/copie retirée : \.claude\/worktrees\/agent-16/);
    },
    LONG
  );

  it(
    'a CHANGELOG the driver merges, one of its entries absent from main, holds the copy',
    () => {
      const racine = depotAuJournal(true);
      const c = copie(racine, 'agent-18', 'worktree-agent-18');
      engager(c, 'CHANGELOG.md', avecEntrees('fix A (proj-18)', 'fix C (proj-18)'));
      engager(racine, 'CHANGELOG.md', avecEntrees('fix B (proj-19)', 'fix A (proj-18)'));
      const journal = balayer(racine);
      expect(existsSync(c)).toBe(true);
      expect(journal).toMatch(/agent-18 .*CHANGELOG\.md n'est pas sur main/);
    },
    LONG
  );

  it(
    'a CHANGELOG without the driver is judged by its whole content, as any file',
    () => {
      const racine = depotAuJournal(false);
      const c = copie(racine, 'agent-20', 'worktree-agent-20');
      engager(c, 'CHANGELOG.md', avecEntrees('fix A (proj-20)'));
      engager(racine, 'CHANGELOG.md', avecEntrees('fix B (proj-21)', 'fix A (proj-20)'));
      const journal = balayer(racine);
      expect(existsSync(c)).toBe(true);
      expect(journal).toMatch(/agent-20 .*CHANGELOG\.md n'est pas sur main/);
    },
    LONG
  );
});

describe('grillhouse-cyr, critère 3 — le retrait tourne aussi à la fin de chaque circuit', () => {
  it('the end of a circuit (aLaFin of circuit.mjs) runs the removal of the repository', () => {
    const circuit = readFileSync(
      path.join(import.meta.dirname, '../../scripts/circuit.mjs'),
      'utf8'
    );
    const debut = circuit.indexOf('function aLaFin(');
    const fin = circuit.indexOf('\n}\n', debut);
    expect(debut).toBeGreaterThan(0);
    expect(circuit.slice(debut, fin)).toContain('retirerLesCopiesDuDepot(ctx.racine)');
  });
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
