// The changes of a project of Python read by git: the elements of a lot (`elementsDuLot`).
//
// - The lot between two commits (`git diff --name-only --no-renames <avant> <apres>`): every file
//   it changes in `fichiers`; the module reads no element of a source of Python, so each `.py` is
//   named in `horsDuService`, which the reviewer surveys himself.
import { spawnSync } from 'node:child_process';

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
