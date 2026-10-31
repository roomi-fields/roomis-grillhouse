#!/usr/bin/env node
// The removal of the working copies whose content is on main, run by the night once its steps
// are played (scripts/nuit.sh), as `git worktree prune` and the workspace cleanup at the end of a
// CI pipeline (Jenkins « Workspace Cleanup »): no copy outlives the entry of its content on main.
//
//   node scripts/copies-finies.mjs [<copie à garder>…]   from the main tree of the repository
//
// - First `git worktree prune`: a copy whose folder is gone leaves the list. Then each copy
//   `git worktree list` names, the main tree and the copies named on the command line (the
//   night's) left out, passes through scripts/retirer-copie.sh, without `--jetable`: a copy whose
//   local work has all entered main by its content goes, with its `<copie>.travail`; a refused
//   copy (work that has not entered, a lock) stays, intact, its line naming the refusal.
// - A copy a running circuit holds stays without passing, even without work: its ticket in
//   progress (the copy's folder bears the ticket's id, `.claude/worktrees/<ticket>`, as the
//   circuit and the launcher name it; read by `bd list --status in_progress`), the working
//   directory of its circuit (`<copie>.travail`, which lives as long as the ticket,
//   scripts/circuit.mjs), or, for the integration copy and the queue copy
//   (`.claude/worktrees/integration`, `.claude/worktrees/file`), their lock in git's common
//   directory (`integration.lock`, `file-integration.lock`, scripts/integration/). Tickets in
//   progress that do not read, or not within a minute, hold every copy: none is removed. They are
//   read only when a copy is left to judge: a repository with no copy but the night's calls no bd.
// - A copy whose commits are not on main stays, its line naming the first path that has not
//   entered: retirer-copie.sh judges the local work alone, so the copy's HEAD is judged first, as
//   the removal judges local work: each path HEAD changed since its base with main holds the
//   content and the mode a commit of main after that base gave it (a cherry-pick or a rebase
//   counts, not the commit's identity). A detached HEAD's commits thus never become unreachable.
// - The branch of a copy removed goes (`git branch -D`), its content being HEAD's, on main; main
//   and a branch another copy holds stay.
// - One line per copy removed or kept, on the output, which the night adds to its log. The exit is
//   0 whatever is removed or kept: the removal never changes the night's verdict.
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RETIRER = path.join(import.meta.dirname, 'retirer-copie.sh');
const PRINCIPALE = 'main';
// The copies of the integration and of the queue, each held while its lock stands.
const VERROUS = { integration: 'integration.lock', file: 'file-integration.lock' };

const lancer = (dossier, cmd, args) =>
  spawnSync(cmd, args, { cwd: dossier, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const git = (dossier, ...args) => lancer(dossier, 'git', args);
const reel = p => {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

// The copies `git worktree list` names: `{ chemin, tete, branche }`, the main tree first.
function lesCopies(racine) {
  return git(racine, 'worktree', 'list', '--porcelain')
    .stdout.split('\n\n')
    .map(bloc => bloc.split('\n'))
    .filter(l => l[0]?.startsWith('worktree '))
    .map(l => ({
      chemin: l[0].slice('worktree '.length),
      tete: l.find(x => x.startsWith('HEAD '))?.slice('HEAD '.length),
      branche: l.find(x => x.startsWith('branch refs/heads/'))?.slice('branch refs/heads/'.length),
    }));
}

// What holds <chemin> for a running circuit, or null.
function tenue(chemin, enCours, commun) {
  const nom = path.basename(chemin);
  if (existsSync(`${chemin}.travail`)) {
    return `son circuit a son dossier ${nom}.travail`;
  }
  if (enCours.has(nom)) {
    return `le ticket ${nom} est en cours`;
  }
  const verrou = VERROUS[nom];
  if (verrou && path.dirname(chemin).endsWith(path.join('.claude', 'worktrees'))) {
    if (existsSync(path.join(commun, verrou))) {
      return `le verrou ${verrou} est posé`;
    }
  }
  return null;
}

// The first path the commit or branch <b> changed since its base with main whose content no commit of main
// after that base gave, or null when all its content is on main.
function pasEntre(racine, b) {
  const base = git(racine, 'merge-base', b, PRINCIPALE);
  if (base.status !== 0) {
    return `ses commits n'ont pas de base commune avec ${PRINCIPALE}`;
  }
  const chemins = git(racine, 'diff', '--name-only', '-z', '--no-renames', base.stdout.trim(), b)
    .stdout.split('\0')
    .filter(Boolean);
  for (const p of chemins) {
    const tenu = git(racine, 'ls-tree', b, '--', p).stdout.trim();
    const [mode, , id] = tenu ? tenu.split(/\s+/) : ['000000', '', '0'];
    const donnes = git(
      racine,
      'log',
      `${b}..${PRINCIPALE}`,
      '--no-renames',
      '--format=',
      '--raw',
      '--no-abbrev',
      '--',
      p
    ).stdout.split('\n');
    const entre = donnes.some(l => {
      const [, m, , i] = l.split(/\s+/);
      return m === mode && (i === id || (id === '0' && /^0+$/.test(i ?? '')));
    });
    if (!entre) {
      return `${p} n'est pas sur ${PRINCIPALE}`;
    }
  }
  return null;
}

/**
 * Removes the copies of the repository at <racine> whose content is on main; returns one line per
 * copy removed or kept. <garder> names the copies left out (the night's); <lireEnCours> reads the
 * ids of the tickets in progress, null when they do not read: called once, and only when a copy
 * is left to judge, as a cleanup with nothing to clean asks nothing.
 */
export function retirerLesCopiesFinies(racine, { garder = [], lireEnCours }) {
  const [principale, ...listees] = lesCopies(racine);
  const ecartees = new Set([principale?.chemin, ...garder].filter(Boolean).map(reel));
  if (listees.every(c => ecartees.has(reel(c.chemin)))) {
    return [];
  }
  const enCours = lireEnCours();
  if (enCours === null) {
    return ['✗ les tickets en cours ne se lisent pas (bd list) : aucune copie n’est retirée.'];
  }
  git(racine, 'worktree', 'prune');
  const commun = git(
    racine,
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir'
  ).stdout.trim();
  const copies = lesCopies(racine).slice(1);
  const ici = reel(racine);
  const vu = c => (path.relative(ici, reel(c)).startsWith('..') ? c : path.relative(ici, reel(c)));
  const lignes = [];
  for (const { chemin, tete, branche } of copies) {
    if (ecartees.has(reel(chemin))) {
      continue;
    }
    const raison = tenue(chemin, enCours, commun);
    if (raison) {
      lignes.push(`· copie gardée : ${vu(chemin)} : ${raison}.`);
      continue;
    }
    const commits = tete ? pasEntre(racine, tete) : null;
    if (commits) {
      lignes.push(`· copie gardée : ${vu(chemin)} : ses commits ne sont pas entrés, ${commits}.`);
      continue;
    }
    const r = lancer(racine, 'bash', [RETIRER, chemin]);
    if (r.status !== 0) {
      const refus = String(r.stderr || r.stdout)
        .trim()
        .split('\n');
      lignes.push(`· copie gardée : ${vu(chemin)} : ${refus.join('\n    ')}`);
      continue;
    }
    let ligne = `✓ copie retirée : ${vu(chemin)}`;
    if (branche && branche !== PRINCIPALE) {
      const tenante = lesCopies(racine).find(c => c.branche === branche);
      if (tenante) {
        ligne += ` ; sa branche ${branche} reste : la copie ${vu(tenante.chemin)} la tient`;
      } else {
        const d = git(racine, 'branch', '-D', branche);
        ligne +=
          d.status === 0
            ? ` ; sa branche ${branche} supprimée`
            : ` ; sa branche ${branche} reste : ${d.stderr.trim()}`;
      }
    }
    lignes.push(`${ligne}.`);
  }
  return lignes;
}

// The ids of the tickets in progress, null when they do not read within LECTURE_MS.
const LECTURE_MS = 60_000;
function ticketsEnCours(racine) {
  const r = spawnSync('bd', ['list', '--status', 'in_progress', '--limit', '0', '--json'], {
    cwd: racine,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: LECTURE_MS,
  });
  if (r.status !== 0) {
    return null;
  }
  try {
    return new Set((JSON.parse(r.stdout || '[]') ?? []).map(t => String(t.id)));
  } catch {
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = process.cwd();
  const lignes = retirerLesCopiesFinies(racine, {
    garder: process.argv.slice(2),
    lireEnCours: () => ticketsEnCours(racine),
  });
  if (lignes.length) {
    process.stdout.write(`${lignes.join('\n')}\n`);
  }
}
