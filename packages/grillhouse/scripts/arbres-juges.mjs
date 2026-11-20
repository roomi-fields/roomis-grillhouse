// The trees judged by a final pass: the file `<git common dir>/grillhouse/arbres-juges.json`, beside
// the last green, keeps the tree each final pass of the circuit (the queue's, on the lot laid on the
// tip of main) and each complete verification of a lot of the direct way judged green. The pre-push
// hook (scripts/branche-de-nuit.mjs) lets a commit go to main only when its tree is there, as bors
// and the merge queues enter only a tree already judged. A tree is judged whatever the commit that
// holds it: an amended or replayed commit of a judged tree is judged too.
//
// The file is shared by the copies (worktrees) of the repository, as the common directory is, and
// is written whole, atomically; a path out of git keeps nothing and judges nothing, and never throws.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sortie } from './etat-du-depot.mjs';

// The file of the repository at <racine>, null out of git.
function fichier(racine) {
  const commun = sortie(racine, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return commun ? path.join(commun, 'grillhouse', 'arbres-juges.json') : null;
}

// The trees kept, in the order they were kept.
function lire(racine) {
  const f = fichier(racine);
  if (!f) {
    return [];
  }
  try {
    const l = JSON.parse(readFileSync(f, 'utf8'));
    return Array.isArray(l) ? l.filter(a => typeof a === 'string') : [];
  } catch {
    return [];
  }
}

/** Whether the tree <arbre> was kept as judged green, in the repository at <racine>. */
export function arbreEstJuge(racine, arbre) {
  return lire(racine).includes(arbre);
}

/** The tree <arbre> kept as judged green; a tree already kept changes nothing, a path out of git does nothing. */
export function garderLArbreJuge(racine, arbre) {
  const f = fichier(racine);
  if (!f) {
    return;
  }
  const gardes = lire(racine);
  if (gardes.includes(arbre)) {
    return;
  }
  mkdirSync(path.dirname(f), { recursive: true });
  const provisoire = `${f}.${process.pid}`;
  writeFileSync(provisoire, `${JSON.stringify([...gardes, arbre], null, 2)}\n`);
  renameSync(provisoire, f);
}

/** Whether the tree of the commit <commit> was judged; an unknown commit or a path out of git, never. */
export function commitEstJuge(racine, commit) {
  const arbre = sortie(racine, ['rev-parse', '--verify', '-q', `${commit}^{tree}`]);
  return arbre ? arbreEstJuge(racine, arbre) : false;
}
