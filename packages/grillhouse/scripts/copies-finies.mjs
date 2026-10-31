#!/usr/bin/env node
// The removal of the working copies whose content is on main, run by the night once its steps
// are played (scripts/nuit.sh) and at the end of each circuit (scripts/circuit.mjs,
// `retirerLesCopiesDuDepot`), as `git worktree prune` and the workspace cleanup at the end of a
// CI pipeline (Jenkins « Workspace Cleanup »): no copy outlives the entry of its content on main,
// and no target directory its ticket (grillhouse-cyr: 34 GB of target/ under synthhub's copies).
//
//   node scripts/copies-finies.mjs [<copie à garder>…]   from the main tree of the repository
//
// - The night's copy (`.claude/worktrees/nuit`) is always left out: the night prepares and
//   removes its own.
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
//   A locked copy (`git worktree lock`, as Claude Code locks the copy of a live agent) stays too.
// - A copy whose commits are not on main stays, its line naming the first path that has not
//   entered: retirer-copie.sh judges the local work alone, so the copy's HEAD is judged first, as
//   the removal judges local work: each path HEAD changed since its base with main holds the
//   content and the mode a commit of main after that base gave it (a cherry-pick or a rebase
//   counts, not the commit's identity). A detached HEAD's commits thus never become unreachable.
//   A file the CHANGELOG's merge driver merges (`.gitattributes`, `merge=grillhouse-changelog`,
//   scripts/fusion-du-changelog.mjs) enters main merged with the entries of the lots beside it:
//   it counts as entered once each line not blank its commits added is a line of it on main.
// - The link `node_modules` of a copy to the main tree's install is no work: when it is all the
//   local work of the copy, it goes before scripts/retirer-copie.sh judges the copy, which goes;
//   beside other work, the copy keeps it, refused with its work.
// - A copy kept that no circuit holds, its ticket closed (read by `bd list --status closed`, once,
//   the copy's folder bearing its id), loses what the tools of its languages wrote there,
//   untracked by git (`git ls-files --others --directory`): each directory the module of the
//   project's language names (`ignorer`: cargo's `target`, typescript's `.turbo`), and each
//   `node_modules`, a link or a directory; its tracked work stays. A copy whose ticket is in
//   progress, or open, keeps everything.
// - The line of each copy kept names the place it holds, as `du -sk` counts it (« 2,7 Go »).
// - The branch of a copy removed goes (`git branch -D`), its content being HEAD's, on main; main
//   and a branch another copy holds stay.
// - One line per copy removed or kept, on the output, which the night adds to its log. The exit is
//   0 whatever is removed or kept: the removal never changes the night's verdict.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PILOTE } from './fusion-du-changelog.mjs';
import { langageDe } from './langages.mjs';

const RETIRER = path.join(import.meta.dirname, 'retirer-copie.sh');
const PRINCIPALE = 'main';
// The copies of the integration and of the queue, each held while its lock stands.
const VERROUS = { integration: 'integration.lock', file: 'file-integration.lock' };
// The install of a copy: a link to the main tree's, or its own directory.
const INSTALLATION = 'node_modules';
// The copy of the night, its own to prepare and to remove (scripts/nuit.sh).
const NUIT = path.join('.claude', 'worktrees', 'nuit');

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

// The copies `git worktree list` names: `{ chemin, tete, branche, verrou }`, the main tree first;
// `verrou` the reason of a locked copy (`git worktree lock`), null for one unlocked.
function lesCopies(racine) {
  return git(racine, 'worktree', 'list', '--porcelain')
    .stdout.split('\n\n')
    .map(bloc => bloc.split('\n'))
    .filter(l => l[0]?.startsWith('worktree '))
    .map(l => ({
      chemin: l[0].slice('worktree '.length),
      tete: l.find(x => x.startsWith('HEAD '))?.slice('HEAD '.length),
      branche: l.find(x => x.startsWith('branch refs/heads/'))?.slice('branch refs/heads/'.length),
      verrou:
        l.find(x => x === 'locked' || x.startsWith('locked '))?.slice('locked '.length) ?? null,
    }));
}

// What holds the copy <chemin> for a running circuit or a live process (its lock), or null.
function tenue({ chemin, verrou: raison }, enCours, commun) {
  const nom = path.basename(chemin);
  if (existsSync(`${chemin}.travail`)) {
    return `son circuit a son dossier ${nom}.travail`;
  }
  if (enCours.has(nom)) {
    return `le ticket ${nom} est en cours`;
  }
  if (raison !== null) {
    return `elle est verrouillée${raison ? ` (${raison})` : ''}`;
  }
  const verrou = VERROUS[nom];
  if (verrou && path.dirname(chemin).endsWith(path.join('.claude', 'worktrees'))) {
    if (existsSync(path.join(commun, verrou))) {
      return `le verrou ${verrou} est posé`;
    }
  }
  return null;
}

// Whether <p> is merged by the frame's driver of the CHANGELOG (`.gitattributes`, `merge=<PILOTE>`).
const fusionneParLePilote = (racine, p) =>
  git(racine, 'check-attr', 'merge', '--', p).stdout.trim().endsWith(`: merge: ${PILOTE}`);

// Whether each entry (a line not blank) the commits of <b> added to <p> since <base> is a line of
// <p> on main: a file the driver merges enters main merged with the entries of the lots beside it,
// never as the copy holds it.
function entreesSurMain(racine, base, b, p) {
  const ajoutees = git(racine, 'diff', '-U0', '--no-renames', base, b, '--', p)
    .stdout.split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++') && l.slice(1).trim());
  const surMain = git(racine, 'show', `${PRINCIPALE}:${p}`);
  if (surMain.status !== 0) {
    return false;
  }
  const lignes = new Set(surMain.stdout.split('\n'));
  return ajoutees.every(l => lignes.has(l.slice(1)));
}

// The first path the commit or branch <b> changed since its base with main whose content no commit of main
// after that base gave, or null when all its content is on main. A file the CHANGELOG's driver
// merges counts as entered once each of its entries is on main (`entreesSurMain`).
function pasEntre(racine, b) {
  const base = git(racine, 'merge-base', b, PRINCIPALE);
  if (base.status !== 0) {
    return `ses commits n'ont pas de base commune avec ${PRINCIPALE}`;
  }
  const depuis = base.stdout.trim();
  const chemins = git(racine, 'diff', '--name-only', '-z', '--no-renames', depuis, b)
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
    if (!entre && !(fusionneParLePilote(racine, p) && entreesSurMain(racine, depuis, b, p))) {
      return `${p} n'est pas sur ${PRINCIPALE}`;
    }
  }
  return null;
}

// The place <chemin> holds on the disk, as `du` counts it (a link not followed): « 2,7 Go ».
function place(chemin) {
  const ko = Number.parseInt(lancer(chemin, 'du', ['-sk', chemin]).stdout, 10);
  if (!Number.isFinite(ko)) {
    return '? Go';
  }
  const [valeur, unite] =
    ko >= 1024 * 1024 ? [ko / 1024 / 1024, 'Go'] : ko >= 1024 ? [ko / 1024, 'Mo'] : [ko, 'Ko'];
  const texte = unite === 'Ko' ? String(valeur) : valeur.toFixed(1).replace('.', ',');
  return `${texte} ${unite}`;
}

// What the tools of the languages wrote in the copy <chemin>, untracked by git: each directory of
// <ignorer> and each install (`node_modules`, a link or a directory), wherever git lists it as
// untracked; their paths from the copy.
function sortiesDesOutils(chemin, ignorer) {
  const noms = new Set([...ignorer, INSTALLATION]);
  return git(chemin, 'ls-files', '-z', '--others', '--directory')
    .stdout.split('\0')
    .map(p => p.replace(/\/$/, ''))
    .filter(p => p && noms.has(path.basename(p)));
}

// Whether the link `node_modules` is the only local work of the copy <chemin>, as
// scripts/retirer-copie.sh reads it (`git status`, submodules included).
function seulLeLien(chemin) {
  const r = git(chemin, 'status', '--porcelain', '-z', '--ignore-submodules=none');
  return r.status === 0 && r.stdout === `?? ${INSTALLATION}\0`;
}

// Removes from the copy <chemin> what the tools of the languages wrote there; their paths.
function retirerLesSorties(chemin, ignorer) {
  const retirees = sortiesDesOutils(chemin, ignorer);
  for (const p of retirees) {
    rmSync(path.join(chemin, p), { recursive: true, force: true });
  }
  return retirees;
}

/**
 * Removes the copies of the repository at <racine> whose content is on main; returns one line per
 * copy removed or kept, a kept copy's with the place it holds. <garder> names the copies left out
 * (the night's); <lireEnCours> reads the ids of the tickets in progress, null when they do not
 * read: called once, and only when a copy is left to judge, as a cleanup with nothing to clean
 * asks nothing; <lireFermes> reads the ids of the tickets closed, called once, when a copy is kept
 * that no circuit holds. A copy kept whose ticket is closed loses what the tools of its languages
 * wrote there (<ignorer>, the directories the module of the language names, and `node_modules`).
 */
export function retirerLesCopiesFinies(racine, { garder = [], lireEnCours, lireFermes, ignorer }) {
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
  let fermes;
  // The line of the copy <chemin> kept for <raison>: what it lost when its ticket is closed, then
  // the place it holds.
  const gardee = (chemin, raison) => {
    fermes ??= lireFermes() ?? new Set();
    const perdues = fermes.has(path.basename(chemin)) ? retirerLesSorties(chemin, ignorer) : [];
    const perte = perdues.length ? ` ; son ticket est fermé : ${perdues.join(', ')} retirés` : '';
    return `· copie gardée : ${vu(chemin)} (${place(chemin)}) : ${raison}${perte}`;
  };
  for (const copie of copies) {
    const { chemin, tete, branche } = copie;
    if (ecartees.has(reel(chemin))) {
      continue;
    }
    const raison = tenue(copie, enCours, commun);
    if (raison) {
      lignes.push(`· copie gardée : ${vu(chemin)} (${place(chemin)}) : ${raison}.`);
      continue;
    }
    const commits = tete ? pasEntre(racine, tete) : null;
    if (commits) {
      lignes.push(`${gardee(chemin, `ses commits ne sont pas entrés, ${commits}`)}.`);
      continue;
    }
    // The copy's link to the main tree's install is no work: when it is all the copy carries, it
    // goes, and the copy with it; beside other work, the copy is judged with it, and keeps it.
    const lien = path.join(chemin, INSTALLATION);
    if (lstatSync(lien, { throwIfNoEntry: false })?.isSymbolicLink() && seulLeLien(chemin)) {
      rmSync(lien);
    }
    const r = lancer(racine, 'bash', [RETIRER, chemin]);
    if (r.status !== 0) {
      const refus = String(r.stderr || r.stdout)
        .trim()
        .split('\n');
      lignes.push(gardee(chemin, refus.join('\n    ')));
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

// The ids of the tickets of status <statut>, null when they do not read within LECTURE_MS.
const LECTURE_MS = 60_000;
function tickets(racine, statut) {
  const r = spawnSync('bd', ['list', '--status', statut, '--limit', '0', '--json'], {
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

// The directories the tools of the project's language write (`ignorer` of its module), none for a
// project that declares no language.
function ignoresDuLangage(racine) {
  try {
    return langageDe(racine).ignorer;
  } catch {
    return [];
  }
}

/**
 * The removal of the copies of the repository at <racine> (`retirerLesCopiesFinies`), the copy of
 * the night and the copies <garder> left out, the tickets read by bd: what the night and the end
 * of each circuit (scripts/circuit.mjs) run. Its lines.
 * @param {string} racine the main tree
 * @param {string[]} [garder]
 * @returns {string[]}
 */
export function retirerLesCopiesDuDepot(racine, garder = []) {
  return retirerLesCopiesFinies(racine, {
    garder: [path.join(racine, NUIT), ...garder],
    lireEnCours: () => tickets(racine, 'in_progress'),
    lireFermes: () => tickets(racine, 'closed'),
    ignorer: ignoresDuLangage(racine),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const lignes = retirerLesCopiesDuDepot(process.cwd(), process.argv.slice(2));
  if (lignes.length) {
    process.stdout.write(`${lignes.join('\n')}\n`);
  }
}
