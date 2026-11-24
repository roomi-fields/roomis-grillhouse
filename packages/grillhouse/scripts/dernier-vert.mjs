// The last green of a branch (the tests-and-languages document owns it; entree.md §4.1 names it
// beside the final pass, packages/grillhouse/docs/architecture/entree.md §5.1): the tree of the last pass of `npm run verifier` green on every
// package (scripts/langages/typescript/verifier.mjs), against which the next pass measures itself, as
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
//   copy created that file, then removed it.
// - No last green counts without git, before the first commit, and while a submodule differs
//   from the commit its parent records (its files changed, or its HEAD moved) or the changes
//   reach a submodule: git's tree holds a submodule's commit, not its files. The pass is then
//   complete, and keeps no green.
// - The changes go to the runner of the tests in a file that the variable `GRILLHOUSE_CHANGEMENTS`
//   names (`CHANGEMENTS`; for the module typescript, scripts/langages/typescript/vitest-config/changements.mjs reads
//   them in each package); the file lies in a temporary directory of its own, which the pass
//   removes at its end.
// - `npm test` measures itself against the last green under the circuit's mark,
//   `GRILLHOUSE_DEPUIS_LE_VERT` (scripts/langages/typescript/tests.mjs, scripts/circuit.mjs); it never keeps one.
// - The circuit's passes, in every project, measure themselves against the base of their lot
//   (`lot`, the variable `GRILLHOUSE_BASE_DU_LOT` that the circuit gives to `npm test` and
//   `npm run verifier`, and the queue to its final pass): the copy's HEAD, the tip of main of its
//   time, as Google's presubmit plays the tests a change affects. Their changes carry the mark
//   `cible`: each package plays the tests Vitest relates to them, a file out of its graph playing
//   neither the whole package nor the tests that read it by its path
//   (scripts/langages/typescript/vitest-config/changements.mjs); the complete pass is the CI's of
//   main and the night's. Such a pass keeps no green.
// - Only the measure of the changed files and the keeping of the green live here: the files go to
//   `vitest --changed`, and no module of language chooses the packages it plays by the last green
//   (the tests of a crate or a Python project are tasks of Turborepo, which its cache selects).
//   The green is kept by the one pass of the verification (scripts/langages/typescript/verifier.mjs),
//   once, when every task of every language of the graph is green, and never when one is red.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { garderLArbreJuge } from './arbres-juges.mjs';
import { etatDuDepot, fichierSous, git, SHA, sortie } from './etat-du-depot.mjs';
// The variable that names the file of the changes since the last green, which the runner of the
// tests of the module of the language reads in each package.
export const CHANGEMENTS = 'GRILLHOUSE_CHANGEMENTS';
export const DEPUIS_LE_VERT = 'GRILLHOUSE_DEPUIS_LE_VERT';
// The variable that gives a pass of the circuit the base of its lot, against which it measures
// itself, targeted.
export const BASE_DU_LOT = 'GRILLHOUSE_BASE_DU_LOT';

// The file of the last green of the branch <branche> of the repository at <racine>, null out of
// git (`fichierSous` of scripts/etat-du-depot.mjs).
function fichierDuVert(racine, branche) {
  return fichierSous(racine, 'dernier-vert', branche);
}

// The last green that a pass in the state <etat> (etatDuDepot) measures itself against: its
// branch's when it counts, else main's; `{ commit, arbre, branche }`, `{ raison }` when neither
// counts (main's reason, or the branch's without main).
function lireLeVert(etat) {
  const branches = [...new Set([etat.branche, etat.main].filter(Boolean))];
  let vert = { raison: 'aucun vert connu' };
  for (const branche of branches) {
    vert = lireLeVertDe(etat, branche);
    if (!vert.raison) {
      return vert;
    }
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

// The base <base> given to a pass (`verifier --base <commit>`), when it counts for a pass in the
// state <etat>: `{ commit, arbre, branche: null }`, the tree of the commit; `{ raison }` when it
// has no value, is not a commit id, is not in the repository (the zeros of a first push, a
// rewritten history) or is not an ancestor of HEAD.
function lireLaBase(etat, base) {
  if (!SHA.test(base)) {
    return { raison: base ? 'la base n’est pas un commit' : 'la base est sans valeur' };
  }
  const arbre = sortie(etat.racine, ['rev-parse', '--verify', '-q', `${base}^{tree}`]);
  const commit = sortie(etat.racine, ['rev-parse', '--verify', '-q', `${base}^{commit}`]);
  if (!arbre || !commit) {
    return { raison: 'la base n’est pas dans le dépôt' };
  }
  if (git(etat.racine, ['merge-base', '--is-ancestor', commit, etat.commit]).status !== 0) {
    return { raison: 'la base n’est pas un ancêtre de HEAD' };
  }
  return { commit, arbre, branche: null };
}

// Keeps <etat> (etatDuDepot) as the last green of its branch, of main when HEAD is detached; its
// tree is judged too (scripts/arbres-juges.mjs): the complete verification of a lot of the direct
// way is what lets its commit go to main.
export function garderLeVert(etat) {
  garderLArbreJuge(etat.racine, etat.arbre);
  const branche = etat.branche ?? etat.main;
  const f = branche ? fichierDuVert(etat.racine, branche) : null;
  if (!f) {
    return;
  }
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, `${JSON.stringify({ commit: etat.commit, arbre: etat.arbre }, null, 2)}\n`);
}

// The files that differ between the trees <avant> and <apres> of the repository at <racine>:
// `{ fichiers, supprimes, sousModules }`, each path from its top; null when git fails.
function difference(racine, avant, apres) {
  const r = git(racine, ['diff', '--raw', '--no-renames', '-z', avant, apres]);
  if (r.status !== 0) {
    return null;
  }
  const champs = r.stdout.split('\0');
  const out = { fichiers: [], supprimes: [], sousModules: [], modifies: new Set() };
  for (let i = 0; i + 1 < champs.length; i += 2) {
    const [modeAvant, modeApres, , , statut] = champs[i].replace(/^:/, '').split(' ');
    const f = champs[i + 1];
    if (modeAvant === '160000' || modeApres === '160000') {
      out.sousModules.push(f);
    } else if (statut === 'D') {
      out.supprimes.push(f);
    } else {
      out.fichiers.push(f);
      if (statut === 'M') {
        out.modifies.add(f);
      }
    }
  }
  return out;
}

const CODE = /\.(?:[cm]?[jt]sx?)$/;
const DOCUMENT = /\.mdx?$/;

// The isolated transpilation of the source <texte> of the file <f> (fixed options, comments
// removed, value imports kept): its executable output; null when it fails.
function sortieCompilee(ts, f, texte) {
  const r = ts.transpileModule(texte, {
    fileName: f,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      removeComments: true,
      verbatimModuleSyntax: true,
      sourceMap: false,
    },
  });
  return r.diagnostics?.length ? null : r.outputText;
}

// Moves from <ch>.fichiers to <ch>.sansEffet the files changed (never added, never removed) that
// no test can tell from their previous state: a document, and a file of code whose isolated
// transpilation is identical in the trees <avant> and <apres>. Any doubt leaves the file a change.
function classerSansEffet(racine, avant, apres, ch) {
  let ts = null;
  const lire = (arbre, f) => {
    const r = git(racine, ['show', `${arbre}:${f}`]);
    return r.status === 0 ? r.stdout : null;
  };
  const sansEffet = [];
  for (const f of ch.fichiers) {
    if (!ch.modifies.has(f)) {
      continue;
    }
    if (DOCUMENT.test(f)) {
      sansEffet.push(f);
    } else if (CODE.test(f)) {
      const a = lire(avant, f);
      const b = lire(apres, f);
      if (a === null || b === null) {
        continue;
      }
      try {
        ts ??= createRequire(import.meta.url)('typescript');
        const sa = sortieCompilee(ts, f, a);
        if (sa !== null && sa === sortieCompilee(ts, f, b)) {
          sansEffet.push(f);
        }
      } catch {
        // a transpilation that fails leaves the file a change
      }
    }
  }
  ch.fichiers = ch.fichiers.filter(f => !sansEffet.includes(f));
  ch.sansEffet = sansEffet;
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
// function that removes the file of the changes. <tout> asks for the complete pass; <base>, a base
// given (`verifier --base`); <lot>, the base of a lot of the circuit, measured targeted (`cible`),
// <base> taking precedence; the file lies in <dans>, the base of the pass
// (scripts/mesure/base-de-passe.mjs), which a killed pass leaves to the next one to sweep.
export function mesure(racine, { tout = false, base, lot, dans = os.tmpdir() } = {}) {
  const etat = etatDuDepot(racine);
  const complete = raison => ({
    etat: etat.raison ? null : etat,
    env: {},
    ligne: `↳ passe complète : ${raison}.`,
    retirer: () => {},
  });
  if (etat.raison) {
    return complete(etat.raison);
  }
  if (tout) {
    return complete('demandée');
  }
  // A base given, or the base of a lot, takes precedence over the last green: the pass keeps no
  // green of its own.
  const cible = base === undefined && Boolean(lot);
  const donnee = base !== undefined ? lireLaBase(etat, base) : cible ? lireLaBase(etat, lot) : null;
  if (donnee?.raison) {
    return complete(donnee.raison);
  }
  const vert = donnee ?? lireLeVert(etat);
  if (vert.raison) {
    return complete(vert.raison);
  }
  const ch = difference(etat.racine, vert.arbre, etat.arbre);
  if (!ch) {
    return complete('git échoue');
  }
  if (ch.sousModules.length) {
    return { ...complete(`un sous-module a changé (${ch.sousModules[0]})`), etat: null };
  }
  if (vert.branche !== etat.branche) {
    const suivis = supprimesDuCommit(etat.racine, vert.commit, etat.arbre);
    if (!suivis) {
      return complete('git échoue');
    }
    ch.supprimes = ch.supprimes.filter(f => suivis.has(f));
  }
  classerSansEffet(etat.racine, vert.arbre, etat.arbre, ch);
  const dir = mkdtempSync(path.join(dans, 'grillhouse-changements-'));
  const fichier = path.join(dir, 'changements.json');
  writeFileSync(
    fichier,
    JSON.stringify({
      racine: etat.racine,
      fichiers: ch.fichiers,
      supprimes: ch.supprimes,
      ...(ch.sansEffet.length ? { sansEffet: ch.sansEffet } : {}),
      ...(cible ? { cible: true } : {}),
    })
  );
  const n = ch.fichiers.length + ch.supprimes.length + ch.sansEffet.length;
  return {
    etat: donnee ? null : etat,
    env: { [CHANGEMENTS]: fichier },
    ligne: cible
      ? `↳ depuis la base du lot ${vert.commit.slice(0, 7)} : ${n} fichier(s) changé(s) ; chaque paquet rejoué joue les tests que ses changements atteignent, la passe complète à la CI de main et à la nuit.`
      : donnee
        ? `↳ depuis la base ${vert.commit.slice(0, 7)} : ${n} fichier(s) changé(s) ; chaque paquet rejoué joue les tests que ses changements atteignent.`
        : `↳ depuis le dernier vert de ${vert.branche} (${vert.commit.slice(0, 12)}, arbre ${vert.arbre.slice(0, 12)}) : ${n} fichier(s) changé(s) ; chaque paquet rejoué joue les tests que ses changements atteignent.`,
    retirer: () => rmSync(dir, { recursive: true, force: true }),
  };
}
