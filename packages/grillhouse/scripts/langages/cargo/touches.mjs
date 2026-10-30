// The crates touched since a commit, the demand `touches` of the join (scripts/jointure.d.ts), as
// Turborepo's `--filter=...[<commit>]` reads the packages a change reaches and its global
// dependencies touch them all.
//
// - The files changed: what git sees changed since the commit, the working tree and the untracked
//   files included (`git diff --name-only --no-renames <depuis>`, `git ls-files -o
//   --exclude-standard`).
// - Each file in the crate of the longest folder that holds it (./composants.mjs). A file of the
//   workspace itself, its Cargo.toml or its Cargo.lock at the root, reaches every build: it touches
//   every crate. Any other file out of every crate is out of the graph (`horsGraphe`).
// - The dependents: the members that depend on a touched crate by its path, of any kind, the
//   development dependencies included, transitively.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { composantDans, crates } from './composants.mjs';

// The files of the workspace itself, from its root: a change to one rebuilds every crate.
export const DE_L_ESPACE = ['Cargo.toml', 'Cargo.lock'];

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

/**
 * The crates the files <fichiers> (from <racine>) touch, their dependents, and the files out of
 * the graph: `{ touches, dependants, horsGraphe }`, each list sorted.
 * @param {string} racine the root of the workspace
 * @param {Iterable<string>} fichiers the files changed
 */
export function touchesDesFichiers(racine, fichiers) {
  const tous = crates(racine);
  const liste = tous.map(c => c.composant);
  const touches = new Set();
  const horsGraphe = [];
  for (const f of new Set(fichiers)) {
    if (DE_L_ESPACE.includes(path.normalize(f))) {
      for (const c of liste) {
        touches.add(c);
      }
      continue;
    }
    const c = composantDans(liste, racine, f);
    if (c) {
      touches.add(c);
    } else {
      horsGraphe.push(f);
    }
  }
  const parDossier = new Map(liste.map(c => [c.dossier, c]));
  const lecteursDe = new Map(liste.map(c => [c, new Set()]));
  for (const c of tous) {
    for (const d of c.deps) {
      const lu = parDossier.get(d.dossier);
      if (lu && lu !== c.composant) {
        lecteursDe.get(lu).add(c.composant);
      }
    }
  }
  const dependants = new Set();
  const suivre = c => {
    for (const l of lecteursDe.get(c)) {
      if (touches.has(l) || dependants.has(l)) {
        continue;
      }
      dependants.add(l);
      suivre(l);
    }
  };
  for (const c of touches) {
    suivre(c);
  }
  const parNom = (a, b) => a.nom.localeCompare(b.nom);
  return {
    touches: [...touches].sort(parNom),
    dependants: [...dependants].sort(parNom),
    horsGraphe: horsGraphe.sort(),
  };
}

/** The crates touched in <racine> since the commit <depuis>, their dependents, the files out. */
export function touches(racine, { depuis }) {
  return touchesDesFichiers(racine, [
    ...lignesDeGit(racine, ['diff', '--name-only', '--no-renames', depuis]),
    ...lignesDeGit(racine, ['ls-files', '-o', '--exclude-standard']),
  ]);
}
