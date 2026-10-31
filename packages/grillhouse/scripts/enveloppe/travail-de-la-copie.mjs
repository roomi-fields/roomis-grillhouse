#!/usr/bin/env node
// The local work of an agent's copy carried onto main, for the launcher (./lancer.sh), in the copy
// alone: git's stash (refs/stash) is common to every copy of a repository, so the work never goes
// there; the copy keeps it, as a merge or a rebase in conflict does (its conflicts marked in the
// files, the unmerged entries in its own index).
//
//   node scripts/enveloppe/travail-de-la-copie.mjs reporter <copie> <base> <pointe>
//   node scripts/enveloppe/travail-de-la-copie.mjs avancer <copie> <cible>
//
// - `reporter`: the lot from <base> to <pointe> (`git diff --binary`), a branch the queue sent
//   back, becomes local work of the copy: applied three ways (`git apply --3way`), a conflict
//   marked in its file, the rest of the lot there; the index is then left as HEAD has it, so that
//   all of it is local work. Exit 0, the conflicts included: the agent's session resolves them.
// - `avancer`: the copy moves forward to <cible> (the main tree's HEAD) by a fast-forward, its
//   local work kept by the same application: the work as a lot (`git diff --binary HEAD`, the
//   submodules left out, which the launcher sets afterwards; untracked files stay in place), the
//   copy brought back to HEAD, moved forward, the lot applied three ways. The lot waits in the
//   copy's own git directory (`git rev-parse --git-dir`, `grillhouse-travail.patch`) while the
//   copy moves, and goes once it is applied.
//   - Applied without conflict: the index is left as HEAD has it; exit 0.
//   - In conflict: the copy stays as `git merge` leaves it, the conflicts marked in the files and
//     unmerged in the index; the output names the copy and each file in conflict; exit 1.
//   - A copy whose lot still waits in its git directory (git refused it whole, as a deletion of
//     a file main changed) is not touched: the output names the file and how to take it back;
//     exit 1. So no relaunch loses it.
//   - A copy still in conflict (unmerged entries in its index) or whose branch carries commits
//     main has not (no fast-forward) is not touched; the output says why; exit 1. A fast-forward
//     that fails after the work is set aside (an untracked file in the way) gives the work back
//     on HEAD; exit 1.
//   - A copy at <cible> already, or without local work, simply fast-forwards; exit 0.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LOT = 'grillhouse-travail.patch';

const git = (copie, args, input) =>
  spawnSync('git', ['-C', copie, ...args], { input, maxBuffer: 1024 * 1024 * 1024 });
const texte = r => String(r.stderr || r.stdout).trim();
const lignes = r =>
  String(r.stdout)
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

// The files of <copie> unmerged in its index.
const enConflit = copie => lignes(git(copie, ['diff', '--name-only', '--diff-filter=U']));

/**
 * Applies the lot <lot> (a Buffer of `git diff --binary`) three ways to <copie>; returns the files
 * in conflict, null when git refuses the lot outright.
 * @param {string} copie
 * @param {Buffer} lot
 */
function appliquer(copie, lot) {
  const r = git(copie, ['apply', '--3way', '-'], lot);
  const conflits = enConflit(copie);
  return r.status === 0 || conflits.length ? conflits : null;
}

/**
 * The lot from <base> to <pointe> as local work of <copie>; returns `{ ok, message }`.
 * @param {string} copie
 * @param {{ base: string, pointe: string }} o
 */
export function reporter(copie, { base, pointe }) {
  const d = git(copie, ['diff', '--binary', base, pointe]);
  if (d.status !== 0) {
    return { ok: false, message: `⛔ Le lot de ${base} à ${pointe} ne se lit pas : ${texte(d)}` };
  }
  if (appliquer(copie, d.stdout) === null) {
    return { ok: false, message: `⛔ Le lot ne s'applique pas à la copie ${copie}.` };
  }
  const r = git(copie, ['reset', '-q']);
  return r.status === 0 ? { ok: true, message: '' } : { ok: false, message: texte(r) };
}

const conflit = (copie, conflits, entete) =>
  [entete, 'Fichiers en conflit :', ...conflits.map(f => `  ${f}`)].join('\n');

/**
 * Moves <copie> forward to <cible>, its local work kept in the copy; returns `{ ok, message }`.
 * @param {string} copie
 * @param {string} cible
 */
export function avancer(copie, cible) {
  const restants = enConflit(copie);
  if (restants.length) {
    return {
      ok: false,
      message: conflit(
        copie,
        restants,
        `⛔ La copie ${copie} garde des conflits non résolus ; ils se résolvent dans la copie avant une relance.`
      ),
    };
  }
  const garde = path.join(
    path.resolve(copie, String(git(copie, ['rev-parse', '--git-dir']).stdout).trim()),
    LOT
  );
  if (existsSync(garde)) {
    return {
      ok: false,
      message: `⛔ Le travail de la copie ${copie} attend dans ${garde}, que git n'a pas pu remettre en place ; il se reprend à la main (git apply --3way ${garde}, ou il se jette), puis le fichier se retire, avant une relance.`,
    };
  }
  const tete = String(git(copie, ['rev-parse', 'HEAD']).stdout).trim();
  const vise = git(copie, ['rev-parse', '--verify', `${cible}^{commit}`]);
  if (vise.status !== 0) {
    return { ok: false, message: `⛔ ${cible} ne nomme aucun commit : ${texte(vise)}` };
  }
  if (tete === String(vise.stdout).trim()) {
    return { ok: true, message: '' };
  }
  if (git(copie, ['merge-base', '--is-ancestor', 'HEAD', cible]).status !== 0) {
    // git's own refusal, which touches nothing: no fast-forward is possible.
    const refus = git(copie, ['merge', '-q', '--ff-only', cible]);
    return {
      ok: false,
      message: `⛔ La copie ${copie} ne peut pas avancer sur main : sa branche porte des commits que main n'a pas (${texte(refus)}) ; son travail reste en place.`,
    };
  }
  const d = git(copie, ['diff', '--binary', '--ignore-submodules=all', 'HEAD']);
  if (d.status !== 0) {
    return { ok: false, message: `⛔ Le travail de la copie ne se lit pas : ${texte(d)}` };
  }
  if (d.stdout.length === 0) {
    const ff = git(copie, ['merge', '-q', '--ff-only', cible]);
    return ff.status === 0 ? { ok: true, message: '' } : { ok: false, message: texte(ff) };
  }
  writeFileSync(garde, d.stdout);
  const remis = git(copie, ['reset', '-q', '--hard']);
  const ff = remis.status === 0 ? git(copie, ['merge', '-q', '--ff-only', cible]) : remis;
  if (ff.status !== 0) {
    const rendu = appliquer(copie, d.stdout);
    if (rendu !== null && rendu.length === 0 && git(copie, ['reset', '-q']).status === 0) {
      rmSync(garde, { force: true });
      return {
        ok: false,
        message: `⛔ La copie ${copie} ne peut pas avancer sur main : ${texte(ff)}\nSon travail reste en place.`,
      };
    }
    return {
      ok: false,
      message: `⛔ La copie ${copie} ne peut pas avancer sur main : ${texte(ff)}\nSon travail ne se remet pas en place ; il reste dans ${garde}.`,
    };
  }
  const conflits = appliquer(copie, d.stdout);
  if (conflits === null) {
    return {
      ok: false,
      message: `⛔ Le travail de la copie ${copie} ne s'applique pas sur main ; il reste dans ${garde}.`,
    };
  }
  rmSync(garde, { force: true });
  if (conflits.length) {
    return {
      ok: false,
      message: conflit(
        copie,
        conflits,
        `⛔ Le travail en cours de la copie entre en conflit avec main ; il reste dans la copie ${copie}, ses conflits marqués dans ses fichiers.`
      ),
    };
  }
  const r = git(copie, ['reset', '-q']);
  return r.status === 0 ? { ok: true, message: '' } : { ok: false, message: texte(r) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [geste, copie, ...reste] = process.argv.slice(2);
  const r =
    geste === 'reporter' && reste.length === 2
      ? reporter(copie, { base: reste[0], pointe: reste[1] })
      : geste === 'avancer' && reste.length === 1
        ? avancer(copie, reste[0])
        : {
            ok: false,
            message:
              'usage: travail-de-la-copie.mjs reporter <copie> <base> <pointe> | avancer <copie> <cible>',
          };
  if (r.message) {
    process.stdout.write(`${r.message}\n`);
  }
  process.exitCode = r.ok ? 0 : 1;
}
