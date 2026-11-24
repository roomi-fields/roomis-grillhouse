// The state of a git repository (packages/grillhouse/docs/architecture/entree.md §4.1: the trees
// judged, the last green and the results are per-repository files) and the place of the per-branch files the frame keeps beside it:
// the layer the last green (scripts/dernier-vert.mjs) and the registry of results
// (scripts/registre-des-resultats.mjs) share. Each keeps `{ … }` per branch under
// `<git common dir>/grillhouse/<sous>/<branche>.json`, and each measures what counts against the
// repository's state as it stands, so the place of the file (`fichierSous`) and the repository's
// identity (`etatDuDepot`) live here, once, for both.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SHA = /^[0-9a-f]{40,64}$/;

// The journal every bd command writes: the tree judged takes its version of the commit.
export const JOURNAL = '.beads/interactions.jsonl';

export const git = (racine, args, env = process.env) =>
  spawnSync('git', ['-C', racine, ...args], {
    encoding: 'utf8',
    env,
    maxBuffer: 256 * 1024 * 1024,
  });

export const sortie = (racine, args, env) => {
  const r = git(racine, args, env);
  return r.status === 0 ? r.stdout.trim() : null;
};

// The file `<git common dir>/grillhouse/<sous>/<branche>.json` of the repository at <racine>, null
// out of git. The last green (`dernier-vert`) and the registry of results (`resultats`,
// scripts/registre-des-resultats.mjs) both live under it, one file per branch.
export function fichierSous(racine, sous, branche) {
  const commun = sortie(racine, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return commun ? path.join(commun, 'grillhouse', sous, `${branche}.json`) : null;
}

// Main, the branch of the main tree of the repository at <racine> (HEAD of git's common
// directory); null when that tree is detached.
function brancheDeMain(racine) {
  const commun = sortie(racine, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return commun
    ? sortie(racine, [`--git-dir=${commun}`, 'symbolic-ref', '--short', '-q', 'HEAD'])
    : null;
}

// Whether a submodule of the repository at <racine> differs from the commit its parent records.
function sousModuleModifie(racine) {
  const r = git(racine, ['status', '--porcelain=v2', '-z', '--ignore-submodules=none']);
  if (r.status !== 0) {
    return true;
  }
  // An entry of a changed path: `1 <XY> <sub> …` (or `2` for a rename), <sub> `S<c><m><u>` for a
  // submodule whose commit, tracked files or untracked files changed, `N...` for any other path.
  return r.stdout.split('\0').some(e => /^[12] \S+ S/.test(e));
}

// The files where the tree judged of the folder at <racine> differs from the tree of its HEAD
// (the journal of bd left out, it takes its version of the commit); [] when none or git fails.
export function ecartsDuDossier(racine) {
  const etat = etatDuDepot(racine);
  if (!etat.arbre) {
    return [];
  }
  const r = git(etat.racine, ['diff-tree', '-r', '--name-only', '-z', etat.commit, etat.arbre]);
  return r.status === 0 ? r.stdout.split('\0').filter(Boolean) : [];
}

// The state of the repository at <racine> as it stands: `{ racine, commit, arbre, branche, main }`,
// its top (its real path), HEAD, the tree of its working tree, the branch of HEAD (null when
// detached) and main (brancheDeMain); `{ raison }` when no last green can count.
export function etatDuDepot(racine) {
  const haut = sortie(racine, ['rev-parse', '--show-toplevel']);
  if (!haut) {
    return { raison: 'hors de git' };
  }
  const top = realpathSync(haut);
  const commit = sortie(top, ['rev-parse', '--verify', '-q', 'HEAD^{commit}']);
  if (!commit) {
    return { raison: 'aucun commit' };
  }
  if (sousModuleModifie(top)) {
    return { raison: 'un sous-module diffère de son commit' };
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grillhouse-vert-'));
  try {
    const index = path.join(dir, 'index');
    const reel = sortie(top, ['rev-parse', '--path-format=absolute', '--git-path', 'index']);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    if (reel && existsSync(reel)) {
      copyFileSync(reel, index);
    } else if (git(top, ['read-tree', 'HEAD'], env).status !== 0) {
      return { raison: 'git échoue' };
    }
    if (git(top, ['add', '-A'], env).status !== 0) {
      return { raison: 'git échoue' };
    }
    // The journal of bd takes its version of the commit (removed when the commit lacks it).
    const dansLeCommit = sortie(top, ['ls-tree', 'HEAD', '--', JOURNAL]);
    const entree = dansLeCommit?.match(/^(\d+) blob ([0-9a-f]+)\t/);
    const retablir = entree
      ? git(top, ['update-index', '--add', '--cacheinfo', `${entree[1]},${entree[2]},${JOURNAL}`], env)
      : git(top, ['update-index', '--force-remove', JOURNAL], env);
    if (retablir.status !== 0) {
      return { raison: 'git échoue' };
    }
    const arbre = sortie(top, ['write-tree'], env);
    if (!arbre) {
      return { raison: 'git échoue' };
    }
    const branche = sortie(top, ['symbolic-ref', '--short', '-q', 'HEAD']);
    return { racine: top, commit, arbre, branche, main: brancheDeMain(top) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
