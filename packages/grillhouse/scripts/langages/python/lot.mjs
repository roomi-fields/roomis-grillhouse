// The changes of a project of Python read by git: the packages touched since a commit (`touches`
// of the join, scripts/jointure.d.ts) and the elements of a lot (`elementsDuLot`).
//
// - The files changed since a commit: what git sees changed, the working tree and the untracked
//   files included (`git diff --name-only --no-renames <depuis>`, `git ls-files -o
//   --exclude-standard`). Each touches the package of the longest folder that holds it
//   (./composants.mjs); a file out of every package is out of the graph. No dependent: the module
//   reads no dependency between packages of Python.
// - The lot between two commits (`git diff --name-only --no-renames <avant> <apres>`): every file
//   it changes in `fichiers`; the module reads no element of a source of Python, so each `.py` is
//   named in `horsDuService`, which the reviewer surveys himself.
import { spawnSync } from 'node:child_process';
import { composantDans, composants } from './composants.mjs';

const lignesDeGit = (racine, args) => {
  const r = spawnSync('git', ['-C', racine, ...args, '-z'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`⛔ git ${args.join(' ')} : ${r.stderr.trim()}`);
  }
  return r.stdout.split('\0').filter(Boolean);
};

/** The packages the files <fichiers> (from <racine>) touch, and the files out of the graph. */
export function touchesDesFichiers(racine, fichiers) {
  const liste = composants(racine);
  const touches = new Set();
  const horsGraphe = [];
  for (const f of new Set(fichiers)) {
    const c = composantDans(liste, racine, f);
    if (c) {
      touches.add(c);
    } else {
      horsGraphe.push(f);
    }
  }
  return {
    touches: [...touches].sort((a, b) => a.nom.localeCompare(b.nom)),
    dependants: [],
    horsGraphe: horsGraphe.sort(),
  };
}

/** The packages touched in <racine> since the commit <depuis>, and the files out of the graph. */
export function touches(racine, { depuis }) {
  return touchesDesFichiers(racine, [
    ...lignesDeGit(racine, ['diff', '--name-only', '--no-renames', depuis]),
    ...lignesDeGit(racine, ['ls-files', '-o', '--exclude-standard']),
  ]);
}

/** The elements of the lot of <racine> between <avant> and <apres>. */
export function elementsDuLot(racine, { avant, apres }) {
  try {
    const fichiers = [
      ...new Set(lignesDeGit(racine, ['diff', '--name-only', '--no-renames', avant, apres])),
    ].sort();
    return {
      etat: 'fait',
      raison: null,
      elements: [],
      horsDuService: fichiers.filter(f => f.endsWith('.py')),
      fichiers,
    };
  } catch (e) {
    return {
      etat: 'impossible',
      raison: `erreur : ${String(e.message).split('\n')[0]}`,
      elements: [],
      horsDuService: [],
      fichiers: [],
    };
  }
}
