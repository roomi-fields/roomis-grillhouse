// The last green of a branch: the tree of the last pass of `npm run verifier` green on every
// package (scripts/verifier.mjs), against which the next pass measures itself, as
// `vitest --changed <ref>` and `jest --onlyChanged` play the tests a change reaches, and Bazel
// keeps by target the result of a test whose inputs did not move.
//
// - It lives in `<git common dir>/grillhouse/dernier-vert/<branche>.json`, one per branch, so that
//   each copy (worktree) of a ticket keeps its own and no copy replaces another's or main's:
//   `{ commit, arbre }`, HEAD at the start of that pass and the tree of the working tree then, the
//   files git ignores left out, HEAD and the index untouched (a copy of the index, every file added
//   to it, `git add -A`, written as a tree, as the circuit keeps a lot). A pass on a copy whose lot
//   is not committed thus keeps what it played.
// - A pass measures itself against the last green of its branch when it counts, else against
//   main's, the branch of the main tree (HEAD of git's common directory), as `vitest --changed
//   <ref>` and Bazel measure against the last green build of the same branch: the final pass of a
//   ticket relaunched plays what changed since the copy's last green, not since main's. A HEAD
//   detached (the queue's replay onto main, scripts/integration/file.mjs) reads and keeps main's.
// - A last green counts when its commit is an ancestor of HEAD (or HEAD) and its tree is still in
//   the repository. Then the changes are the files that differ between its tree and the tree of the
//   working tree now (`git diff --raw --no-renames`): the files changed or added, and those
//   removed. Any two trees compare: the ancestry keeps the measure to the history it belongs to.
// - A file the last green holds and its commit does not track (untracked, not ignored) lives in
//   the working tree that kept it alone: measured against the last green of another branch (main's,
//   from a copy or from the queue's detached replay), its absence is no removal, as Nx affected and
//   Turborepo's `--filter=[ref]` measure against a commit. Against the branch's own, it is one: the
//   copy created that file, then removed it. Witness: BPScript 320.3.2.1, 54 `.rapport-suite.json`
//   untracked on main, each seen removed by every package of a copy, which played whole 264 times.
// - No last green counts without git, before the first commit, and while a submodule differs
//   from the commit its parent records (its files changed, or its HEAD moved) or the changes
//   reach a submodule: git's tree holds a submodule's commit, not its files. The pass is then
//   complete, and keeps no green.
// - The changes go to the runner of the tests in a file that the variable `GRILLHOUSE_CHANGEMENTS`
//   names (`CHANGEMENTS`; for the module typescript, scripts/vitest-config/changements.mjs reads
//   them in each package); the file lies in a temporary directory of its own, which the pass
//   removes at its end.
// - `npm test` measures itself against the last green under the circuit's mark,
//   `GRILLHOUSE_DEPUIS_LE_VERT` (scripts/tests.mjs, scripts/circuit.mjs); it never keeps one.
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// The variable that names the file of the changes since the last green, which the runner of the
// tests of the module of the language reads in each package.
export const CHANGEMENTS = 'GRILLHOUSE_CHANGEMENTS';
export const DEPUIS_LE_VERT = 'GRILLHOUSE_DEPUIS_LE_VERT';
const SHA = /^[0-9a-f]{40,64}$/;

const git = (racine, args, env = process.env) =>
  spawnSync('git', ['-C', racine, ...args], {
    encoding: 'utf8',
    env,
    maxBuffer: 256 * 1024 * 1024,
  });
const sortie = (racine, args, env) => {
  const r = git(racine, args, env);
  return r.status === 0 ? r.stdout.trim() : null;
};

// The file of the last green of the branch <branche> of the repository at <racine>, null out of
// git.
function fichierDuVert(racine, branche) {
  const commun = sortie(racine, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return commun ? path.join(commun, 'grillhouse', 'dernier-vert', `${branche}.json`) : null;
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
  if (r.status !== 0) return true;
  // An entry of a changed path: `1 <XY> <sub> …` (or `2` for a rename), <sub> `S<c><m><u>` for a
  // submodule whose commit, tracked files or untracked files changed, `N...` for any other path.
  return r.stdout.split('\0').some(e => /^[12] \S+ S/.test(e));
}

// The state of the repository at <racine> as it stands: `{ racine, commit, arbre, branche, main }`,
// its top (its real path), HEAD, the tree of its working tree, the branch of HEAD (null when
// detached) and main (brancheDeMain); `{ raison }` when no last green can count.
function etatDuDepot(racine) {
  const haut = sortie(racine, ['rev-parse', '--show-toplevel']);
  if (!haut) return { raison: 'hors de git' };
  const top = realpathSync(haut);
  const commit = sortie(top, ['rev-parse', '--verify', '-q', 'HEAD^{commit}']);
  if (!commit) return { raison: 'aucun commit' };
  if (sousModuleModifie(top)) return { raison: 'un sous-module diffère de son commit' };
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grillhouse-vert-'));
  try {
    const index = path.join(dir, 'index');
    const reel = sortie(top, ['rev-parse', '--path-format=absolute', '--git-path', 'index']);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    if (reel && existsSync(reel)) copyFileSync(reel, index);
    else if (git(top, ['read-tree', 'HEAD'], env).status !== 0) return { raison: 'git échoue' };
    if (git(top, ['add', '-A'], env).status !== 0) return { raison: 'git échoue' };
    const arbre = sortie(top, ['write-tree'], env);
    if (!arbre) return { raison: 'git échoue' };
    const branche = sortie(top, ['symbolic-ref', '--short', '-q', 'HEAD']);
    return { racine: top, commit, arbre, branche, main: brancheDeMain(top) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The last green that a pass in the state <etat> (etatDuDepot) measures itself against: its
// branch's when it counts, else main's; `{ commit, arbre, branche }`, `{ raison }` when neither
// counts (main's reason, or the branch's without main).
function lireLeVert(etat) {
  const branches = [...new Set([etat.branche, etat.main].filter(Boolean))];
  let vert = { raison: 'aucun vert connu' };
  for (const branche of branches) {
    vert = lireLeVertDe(etat, branche);
    if (!vert.raison) return vert;
  }
  return vert;
}

// The last green of the branch <branche>, when it counts for a pass in the state <etat>:
// `{ commit, arbre, branche }`; `{ raison }` otherwise.
function lireLeVertDe(etat, branche) {
  const f = fichierDuVert(etat.racine, branche);
  let v = null;
  try {
    v = JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return { raison: 'aucun vert connu' };
  }
  if (!SHA.test(v?.commit ?? '') || !SHA.test(v?.arbre ?? '')) {
    return { raison: 'aucun vert connu' };
  }
  if (git(etat.racine, ['cat-file', '-e', `${v.arbre}^{tree}`]).status !== 0) {
    return { raison: 'le dernier vert ne se lit plus' };
  }
  if (git(etat.racine, ['merge-base', '--is-ancestor', v.commit, etat.commit]).status !== 0) {
    return { raison: 'le dernier vert n’est pas un ancêtre de HEAD' };
  }
  return { commit: v.commit, arbre: v.arbre, branche };
}

// Keeps <etat> (etatDuDepot) as the last green of its branch, of main when HEAD is detached.
export function garderLeVert(etat) {
  const branche = etat.branche ?? etat.main;
  const f = branche ? fichierDuVert(etat.racine, branche) : null;
  if (!f) return;
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, `${JSON.stringify({ commit: etat.commit, arbre: etat.arbre }, null, 2)}\n`);
}

// The files that differ between the trees <avant> and <apres> of the repository at <racine>:
// `{ fichiers, supprimes, sousModules }`, each path from its top; null when git fails.
function difference(racine, avant, apres) {
  const r = git(racine, ['diff', '--raw', '--no-renames', '-z', avant, apres]);
  if (r.status !== 0) return null;
  const champs = r.stdout.split('\0');
  const out = { fichiers: [], supprimes: [], sousModules: [] };
  for (let i = 0; i + 1 < champs.length; i += 2) {
    const [modeAvant, modeApres, , , statut] = champs[i].replace(/^:/, '').split(' ');
    const f = champs[i + 1];
    if (modeAvant === '160000' || modeApres === '160000') out.sousModules.push(f);
    else if (statut === 'D') out.supprimes.push(f);
    else out.fichiers.push(f);
  }
  return out;
}

// The files the commit <commit> of the repository at <racine> tracks that the tree <arbre> no longer
// holds, as a Set of paths from its top; null when git fails.
function supprimesDuCommit(racine, commit, arbre) {
  const r = git(racine, [
    'diff',
    '--name-only',
    '--no-renames',
    '--diff-filter=D',
    '-z',
    commit,
    arbre,
  ]);
  return r.status === 0 ? new Set(r.stdout.split('\0').filter(Boolean)) : null;
}

// What a pass in <racine> measures itself against: `{ etat, env, ligne, retirer }`, the state to
// keep once green (null when none can count), the variables to add to the pass's environment (the
// changes since the last green, none for a complete pass), the line that says which, and the
// function that removes the file of the changes. <tout> asks for the complete pass; the file lies
// in <dans>, the base of the pass (scripts/mesure/base-de-passe.mjs), which a killed pass
// leaves to the next one to sweep.
export function mesure(racine, { tout = false, dans = os.tmpdir() } = {}) {
  const etat = etatDuDepot(racine);
  const complete = raison => ({
    etat: etat.raison ? null : etat,
    env: {},
    ligne: `↳ passe complète : ${raison}.`,
    retirer: () => {},
  });
  if (etat.raison) return complete(etat.raison);
  if (tout) return complete('demandée');
  const vert = lireLeVert(etat);
  if (vert.raison) return complete(vert.raison);
  const ch = difference(etat.racine, vert.arbre, etat.arbre);
  if (!ch) return complete('git échoue');
  if (ch.sousModules.length) {
    return { ...complete(`un sous-module a changé (${ch.sousModules[0]})`), etat: null };
  }
  if (vert.branche !== etat.branche) {
    const suivis = supprimesDuCommit(etat.racine, vert.commit, etat.arbre);
    if (!suivis) return complete('git échoue');
    ch.supprimes = ch.supprimes.filter(f => suivis.has(f));
  }
  const dir = mkdtempSync(path.join(dans, 'grillhouse-changements-'));
  const fichier = path.join(dir, 'changements.json');
  writeFileSync(
    fichier,
    JSON.stringify({ racine: etat.racine, fichiers: ch.fichiers, supprimes: ch.supprimes })
  );
  const n = ch.fichiers.length + ch.supprimes.length;
  return {
    etat,
    env: { [CHANGEMENTS]: fichier },
    ligne: `↳ depuis le dernier vert de ${vert.branche} (${vert.commit.slice(0, 12)}, arbre ${vert.arbre.slice(0, 12)}) : ${n} fichier(s) changé(s) ; chaque paquet rejoué joue les tests que ses changements atteignent.`,
    retirer: () => rmSync(dir, { recursive: true, force: true }),
  };
}
