#!/usr/bin/env node
// The local work of an agent's copy carried onto main, and the preparation of that copy, for the
// launcher (./lancer.sh) and for the circuit before each pass that judges the lot
// (scripts/circuit.mjs, `avantLaPasse`), in the copy alone: git's stash (refs/stash) is common to
// every copy of a repository, so the work never goes there; the copy keeps it, as a merge or a
// rebase in conflict does (its conflicts marked in the files, the unmerged entries in its own
// index).
//
//   node scripts/enveloppe/travail-de-la-copie.mjs reporter <copie> <base> <pointe>
//   node scripts/enveloppe/travail-de-la-copie.mjs preparer <copie> [<cible>]
//
// - `preparer`: the one preparation of a copy, which the launcher plays before each session and
//   the circuit before each pass that judges the lot. With <cible> (an existing copy), the guard
//   of its submodules (scripts/sous-modules.sh `garde`), then `avancer`; then, for every copy,
//   the pose of its submodules (`pose`, the shared ones linked, the others set at the commit of
//   HEAD), the check that their read-only mount plays (`monter … true`), and, when the copy has a
//   package.json, the installation (`npm install --no-save`, under that mount) when node_modules
//   is missing or the lock file is newer than the installation (`node_modules/.package-lock.json`).
//   It prints on stdout the list its pose fixes, its messages on stderr; exit 1 on the first step
//   that fails, named, its output after (BPScript: the lock file changed 27 times in two weeks,
//   and the submodule vendor/bp3-engine, both stale in a copy moved forward without them).
// - `reporter`: the lot from <base> to <pointe> (`git diff --binary`), a branch the queue sent
//   back, becomes local work of the copy: applied three ways (`git apply --3way`), a conflict
//   marked in its file, the rest of the lot there; the index is then left as HEAD has it, so that
//   all of it is local work. Exit 0, the conflicts included: the agent's session resolves them.
// - The advance (`avancer`, a step of `preparer`): the copy moves forward to <cible> (the main tree's HEAD) by a fast-forward, its
//   local work kept by the same application: the work as a lot (`git diff --binary HEAD`, the
//   submodules left out, which the launcher sets afterwards; untracked files stay in place), the
//   copy brought back to HEAD, moved forward, the lot applied three ways. The lot waits in the
//   copy's own git directory (`git rev-parse --git-dir`, `grillhouse-travail.patch`) while the
//   copy moves, and goes once it is applied.
//   - The lot applies file by file (one `git apply --3way` per file, its patch alone): a file that
//     fails touches none of the others. A file in conflict keeps its marks; a file git refuses
//     without marks (a deletion of a file main changed) stays alone in the lot kept in the git
//     directory, named in the message; the untracked files stay in place.
//   - Applied without conflict: the index is left as HEAD has it; exit 0.
//   - In conflict: the copy stays as `git merge` leaves it, the conflicts marked in the files and
//     unmerged in the index; the output names the copy and each file in conflict; exit 1.
//   - A copy whose lot still waits in its git directory is not touched: the output names the files
//     and how to take them back; exit 1. So no relaunch loses it.
//   - With `--role <role>` (`ecrit`), the launch of a session of the role that writes at least one
//     of the files in conflict or of the lot kept is accepted (exit 0): its session receives its
//     files alone, the marks in the copy or the lot as it waits, the other role's files staying
//     marked or in the lot until its own session. A role that writes none gets the refusal. The
//     circuit plays the same rule before a pass (scripts/circuit.mjs `avantLaPasse`, the gesture
//     `conflit-de-l-avance`): the testwriter first for a test or the shared test material
//     (`estUnTest`), then the developpeur, the session of each coming back to the pass, which
//     prepares the copy again (`suspects`, the files of the conflict whose marks are looked for
//     even when the index no longer says them in conflict); a conflict the session of the role
//     does not lift goes up to the supervisor, the stop « lancement », each file named. A file
//     without marker left in the copy counts as resolved (put in the index by the circuit).
//   - A copy still in conflict (unmerged entries in its index) or whose branch has left main
//     (commits on both sides, no fast-forward) is not touched; the output says why; exit 1. A
//     fast-forward that fails after the work is set aside (an untracked file in the way) gives
//     the work back on HEAD; exit 1.
//   - A copy at <cible> already, or ahead of it (<cible> an ancestor of its HEAD, as a branch
//     whose commits main has not entered yet), is not touched, as `git merge --ff-only` answers
//     « Already up to date »; a copy without local work simply fast-forwards; exit 0.
// - Both: a generated file the project declares (`grillhouse.engendres`, scripts/engendres.mjs,
//   read from the main tree) is not merged, as npm writes package-lock.json again after a merge:
//   when the lot touches one of its files, or one it reads (the copy's untracked files counting),
//   the application leaves its files out (main's version stays), then its command writes them
//   again in the copy, the lot applied, with the tools of the project (`grillhouse.outils`), out
//   of the envelope. A command that fails stops, exit 1, the command, its code and its output
//   named, the rest of the lot in the copy; a faulty key refuses, named, before the copy is
//   touched (OSC Bridge, 2026-10-31: four conflicts in one day on the generated files of synthhub
//   and open-synth-descriptors, each copy moved by hand). A lot in conflict on another file is not
//   regenerated: its conflicts come first.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { couvertPar, engendresDe, regenerer, touchesPar } from '../engendres.mjs';
import { avecLesDonnees, donneesDe } from '../donnees-cles.mjs';
import { avecLesOutils, outilsDe } from '../outils-cles.mjs';

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

// The files the lot <lot> touches in <copie>: each added, modified or deleted, a rename its source
// and its destination.
const fichiersDuLot = (copie, lot) =>
  String(git(copie, ['apply', '--numstat', '-z', '-'], lot).stdout)
    .split('\0')
    .map(l => (l.includes('\t') ? l.split('\t')[2] : l))
    .filter(Boolean);

/**
 * The keys of the project that holds <copie>, read before any work: `{ engendres, env }`, its
 * generated files and the environment of their commands with its tools, or `{ refus }`.
 * @param {string} copie
 * @returns {{ engendres: any[], env: NodeJS.ProcessEnv, refus?: undefined } | { refus: string }}
 */
function lesCles(copie) {
  try {
    return {
      engendres: engendresDe(copie),
      env: avecLesDonnees(donneesDe(copie), avecLesOutils(outilsDe(copie), process.env)),
    };
  } catch (e) {
    return {
      refus: `⛔ Une clé grillhouse du package.json est refusée :\n${/** @type {Error} */ (e).message}`,
    };
  }
}

/**
 * Applies the lot <lot> (a Buffer of `git diff --binary`) three ways to <copie>, file by file:
 * `conflits`, the files that keep their marks; `enAttente`, the files git refuses without marks (a
 * deletion of a file main changed), whose patches are `restant`. With <cles> (`lesCles`), the
 * generated files the lot (or one of <autres>, the copy's untracked files) touches are left out,
 * then written again by their command once the lot applies without conflict; `refus`, a command
 * that fails.
 * @param {string} copie
 * @param {Buffer} lot
 * @param {{ engendres: any[], env: NodeJS.ProcessEnv } | null} [cles]
 * @param {string[]} [autres]
 * @returns {{ conflits: string[], enAttente: string[], restant: Buffer, refus?: string | null }}
 */
function appliquer(copie, lot, cles = null, autres = []) {
  const fichiers = cles ? [...fichiersDuLot(copie, lot), ...autres] : [];
  const touches = cles ? touchesPar(cles.engendres, fichiers) : [];
  const exclus = fichiers.filter(f => touches.some(e => couvertPar(e.entiers, f)));
  // One call of `git apply --3way` per file: a file that fails touches none of the others.
  const conflits = [];
  const enAttente = [];
  const gardes = [];
  for (const morceau of morceauxDuLot(lot)) {
    const noms = fichiersDuLot(copie, morceau);
    if (noms.length && noms.every(f => exclus.includes(f))) {
      continue;
    }
    const r = git(copie, ['apply', '--3way', '--allow-empty', '-'], morceau);
    if (r.status === 0) {
      continue;
    }
    const marques = enConflit(copie).filter(f => noms.includes(f));
    if (marques.length) {
      conflits.push(...marques);
    } else {
      enAttente.push(...noms.slice(-1));
      gardes.push(morceau);
    }
  }
  const restant = Buffer.concat(gardes);
  if (conflits.length || enAttente.length || !touches.length || !cles) {
    return { conflits, enAttente, restant };
  }
  const refus = regenerer({
    refs: touches.map(e => ({ ...e, cadre: false })),
    lancer: commande =>
      spawnSync('bash', ['-c', commande], {
        cwd: copie,
        encoding: 'utf8',
        env: cles.env,
        maxBuffer: 1024 * 1024 * 1024,
      }),
    dansCopie: (...args) => spawnSync('git', ['-C', copie, ...args], { encoding: 'utf8' }),
  });
  return { conflits, enAttente, restant, refus };
}

/**
 * The lot <lot> cut into the patch of each file (`diff --git` to the next), as Buffers.
 * @param {Buffer} lot
 * @returns {Buffer[]}
 */
function morceauxDuLot(lot) {
  return String(lot.toString('latin1'))
    .split(/(?=^diff --git )/m)
    .filter(m => m.startsWith('diff --git '))
    .map(m => Buffer.from(m, 'latin1'));
}

// Whether the file <f> of <copie> carries a conflict marker (`<<<<<<< ` or `>>>>>>> ` at the head
// of a line), as git writes them.
function porteDesMarques(copie, f) {
  const chemin = path.join(copie, f);
  return existsSync(chemin) && /^(<{7}|>{7}) /m.test(readFileSync(chemin, 'latin1'));
}

// The files of <copie> that carry no conflict marker any more, among those unmerged: the work of a
// session that resolved them. Each goes to the index as resolved; the index is then left as HEAD has
// it once no conflict remains.
function releverLesResolus(copie) {
  const a = enConflit(copie);
  const resolus = a.filter(f => existsSync(path.join(copie, f)) && !porteDesMarques(copie, f));
  for (const f of resolus) {
    git(copie, ['add', '--', f]);
  }
  if (resolus.length && resolus.length === a.length) {
    git(copie, ['reset', '-q']);
  }
}

/**
 * The files of <fichiers> by role: `{ testwriter, developpeur, roles }`, the testwriter's those
 * <estUnTest> (the rule of a test file of the module of the language) judges, the developpeur's the
 * others; `roles`, the order of the sessions, the testwriter first, a role without file absent.
 * @param {string[]} fichiers
 * @param {(fichier: string) => unknown} estUnTest
 */
export function rolesDuConflit(fichiers, estUnTest) {
  const testwriter = fichiers.filter(f => Boolean(estUnTest(f)));
  const developpeur = fichiers.filter(f => !estUnTest(f));
  const roles = [
    testwriter.length ? 'testwriter' : null,
    developpeur.length ? 'developpeur' : null,
  ];
  return { testwriter, developpeur, roles: roles.filter(r => r !== null) };
}

/**
 * Whether the role <role> writes a file, as a function of the file: the testwriter those
 * <estUnTest> judges, the developpeur the others, any other role none (undefined).
 * @param {string} role
 * @param {(fichier: string) => unknown} estUnTest
 */
export function ecritPar(role, estUnTest) {
  if (role === 'testwriter') {
    return f => Boolean(estUnTest(f));
  }
  if (role === 'developpeur') {
    return f => !estUnTest(f);
  }
  return undefined;
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
  const cles = lesCles(copie);
  if (cles.refus !== undefined) {
    return { ok: false, message: cles.refus };
  }
  const a = appliquer(copie, d.stdout, cles);
  if (a.enAttente.length) {
    return {
      ok: false,
      message: `⛔ Le lot ne s'applique pas à la copie ${copie} pour : ${a.enAttente.join(', ')}.`,
    };
  }
  const r = git(copie, ['reset', '-q']);
  if (a.refus) {
    return { ok: false, message: `⛔ ${a.refus}` };
  }
  return r.status === 0 ? { ok: true, message: '' } : { ok: false, message: texte(r) };
}

const lotEnAttente = (copie, garde, fichiers) =>
  `⛔ Le travail de la copie ${copie} attend dans ${garde}, que git n'a pas pu remettre en place pour :\n${fichiers.map(f => `  ${f}`).join('\n')}\nIl se reprend à la main (git apply --3way ${garde}, ou il se jette), puis le fichier se retire, avant une relance ; le circuit relance le rôle qui écrit ces fichiers.`;

const conflit = (copie, conflits, entete) =>
  [entete, 'Fichiers en conflit :', ...conflits.map(f => `  ${f}`)].join('\n');

/**
 * Moves <copie> forward to <cible>, its local work kept in the copy; returns `{ ok, message,
 * conflits, enAttente }`, the files that keep their marks and those that wait alone in the kept
 * lot. With <ecrit> (whether the role relaunched writes a file), a copy that keeps conflicts or a
 * lot waiting is accepted (`ok`) when that role writes one of their files. <suspects>, the files
 * an earlier advance left in conflict: one that still carries its marks counts as in conflict,
 * even when the index no longer says so (a session wrote it, or put it in the index, unresolved).
 * @param {string} copie
 * @param {string} cible
 * @param {{ ecrit?: (fichier: string) => boolean, suspects?: string[] }} [o]
 */
export function avancer(copie, cible, { ecrit, suspects = [] } = {}) {
  releverLesResolus(copie);
  const restants = [
    ...new Set([...enConflit(copie), ...suspects.filter(f => porteDesMarques(copie, f))]),
  ];
  const garde = path.join(
    path.resolve(copie, String(git(copie, ['rev-parse', '--git-dir']).stdout).trim()),
    LOT
  );
  // The deletions a session has done in the copy leave the kept lot.
  if (existsSync(garde)) {
    const morceaux = morceauxDuLot(readFileSync(garde));
    const reste = morceaux.filter(m =>
      fichiersDuLot(copie, m).some(f => existsSync(path.join(copie, f)))
    );
    if (morceaux.length && reste.length < morceaux.length) {
      if (reste.length) {
        writeFileSync(garde, Buffer.concat(reste));
      } else {
        rmSync(garde, { force: true });
      }
    }
  }
  const attendus = existsSync(garde) ? fichiersDuLot(copie, readFileSync(garde)) : [];
  if (restants.length || existsSync(garde)) {
    const voulu = ecrit ? [...restants, ...attendus].some(f => ecrit(f)) : false;
    // The role relaunched receives its files alone.
    const siens = liste => (voulu ? liste.filter(f => ecrit(f)) : liste);
    const message = [
      restants.length
        ? conflit(
            copie,
            restants,
            `⛔ La copie ${copie} garde des conflits non résolus ; ils se résolvent dans la copie avant une relance.`
          )
        : null,
      existsSync(garde) ? lotEnAttente(copie, garde, attendus) : null,
    ]
      .filter(Boolean)
      .join('\n');
    return {
      ok: voulu,
      message: voulu ? '' : message,
      conflits: siens(restants),
      enAttente: siens(attendus),
    };
  }
  const cles = lesCles(copie);
  if (cles.refus !== undefined) {
    return { ok: false, message: cles.refus };
  }
  const tete = String(git(copie, ['rev-parse', 'HEAD']).stdout).trim();
  const vise = git(copie, ['rev-parse', '--verify', `${cible}^{commit}`]);
  if (vise.status !== 0) {
    return { ok: false, message: `⛔ ${cible} ne nomme aucun commit : ${texte(vise)}` };
  }
  // At <cible>, or ahead of it (<cible> an ancestor of HEAD): nothing to move, as git's
  // `merge --ff-only` answers « Already up to date ».
  if (
    tete === String(vise.stdout).trim() ||
    git(copie, ['merge-base', '--is-ancestor', cible, 'HEAD']).status === 0
  ) {
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
    if (
      rendu.conflits.length === 0 &&
      rendu.enAttente.length === 0 &&
      git(copie, ['reset', '-q']).status === 0
    ) {
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
  const libres = lignes(git(copie, ['ls-files', '--others', '--exclude-standard']));
  const { conflits, enAttente, restant, refus } = appliquer(copie, d.stdout, cles, libres);
  if (enAttente.length) {
    writeFileSync(garde, restant);
  } else {
    rmSync(garde, { force: true });
  }
  if (conflits.length || enAttente.length) {
    if (!conflits.length) {
      git(copie, ['reset', '-q']);
    }
    const message = [
      conflits.length
        ? conflit(
            copie,
            conflits,
            `⛔ Le travail en cours de la copie entre en conflit avec main ; il reste dans la copie ${copie}, ses conflits marqués dans ses fichiers.`
          )
        : null,
      enAttente.length ? lotEnAttente(copie, garde, enAttente) : null,
    ]
      .filter(Boolean)
      .join('\n');
    const voulu = ecrit ? [...conflits, ...enAttente].some(f => ecrit(f)) : false;
    const siens = liste => (voulu ? liste.filter(f => ecrit(f)) : liste);
    return {
      ok: voulu,
      message: voulu ? '' : message,
      conflits: siens(conflits),
      enAttente: siens(enAttente),
    };
  }
  const r = git(copie, ['reset', '-q']);
  if (refus) {
    return {
      ok: false,
      message: `⛔ ${refus}\nLe travail de la copie ${copie} est sur main, ses fichiers engendrés à la version de main.`,
    };
  }
  return r.status === 0 ? { ok: true, message: '' } : { ok: false, message: texte(r) };
}

const SOUS_MODULES = path.join(import.meta.dirname, '..', 'sous-modules.sh');

/**
 * Prepares <copie> for a pass or a session (see the header, `preparer`): with <cible>, the guard of
 * its submodules and its advance to <cible>; then the pose of its submodules, the check of their
 * read-only mount, and the installation when the lock file is newer than it. The output of each
 * command goes to the file descriptor <sortie>; returns `{ ok, message, partages }`.
 * @param {string} copie
 * @param {string | null} cible
 * @param {{ env?: NodeJS.ProcessEnv, sortie?: number, ecrit?: (fichier: string) => boolean,
 *   suspects?: string[] }} [o]
 */
export function preparer(copie, cible, { env = process.env, sortie = 2, ecrit, suspects } = {}) {
  // A command of the submodules whose error output is read: kept on <sortie> as well when it
  // succeeds, as the launcher's log kept it.
  const bash = (args, stdio) => {
    const r = spawnSync('bash', [SOUS_MODULES, ...args], {
      env,
      stdio,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status === 0 && r.stderr?.length) {
      writeSync(sortie, r.stderr);
    }
    return r;
  };
  const echec = (r, quoi) => ({
    ok: false,
    message: `⛔ ${quoi} de la copie ${copie} échoue (code ${r.status ?? r.signal}).${r.stderr?.length ? `\n${String(r.stderr).trim()}` : ''}`,
    partages: '',
  });
  if (cible !== null) {
    const g = bash(['garde', copie], ['ignore', sortie, 'pipe']);
    if (g.status !== 0) {
      return echec(g, 'La garde des sous-modules');
    }
    const a = avancer(copie, cible, { ecrit, suspects });
    if (!a.ok) {
      return { ...a, partages: '' };
    }
  }
  const p = bash(['pose', copie], ['ignore', 'pipe', 'pipe']);
  if (p.status !== 0) {
    return echec(p, 'La pose des sous-modules');
  }
  // As `$(…)` reads it: the final newlines dropped.
  const partages = String(p.stdout).replace(/\n+$/, '');
  const monter = (...commande) =>
    bash(['monter', copie, '--partages', partages, ...commande], ['ignore', sortie, 'pipe']);
  const m = monter('true');
  if (m.status !== 0) {
    return echec(m, 'Le montage des sous-modules partagés');
  }
  if (existsSync(path.join(copie, 'package.json'))) {
    // As `[ lock -nt installed ]`: the lock newer than the installation, or no installation.
    const verrou = path.join(copie, 'package-lock.json');
    const installe = path.join(copie, 'node_modules', '.package-lock.json');
    const plusRecent =
      existsSync(verrou) &&
      (!existsSync(installe) || statSync(verrou).mtimeMs > statSync(installe).mtimeMs);
    if (!existsSync(path.join(copie, 'node_modules')) || plusRecent) {
      // --no-save leaves the lock file as committed, so a clean copy stays clean.
      const i = monter(
        'npm',
        '--prefix',
        copie,
        'install',
        '--no-save',
        '--no-audit',
        '--no-fund',
        '--silent'
      );
      if (i.status !== 0) {
        return echec(i, "L'installation");
      }
    }
  }
  return { ok: true, message: '', partages };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [geste, copie, ...tout] = process.argv.slice(2);
  // `--role <role>` (preparer): the role the session launched is, whose files a conflict or a lot
  // kept may be.
  const iRole = tout.indexOf('--role');
  const role = iRole >= 0 ? tout[iRole + 1] : null;
  const reste = iRole >= 0 ? tout.filter((_, i) => i !== iRole && i !== iRole + 1) : tout;
  let ecrit;
  if (geste === 'preparer' && role) {
    const { langageDe } = await import('../langages.mjs');
    ecrit = ecritPar(role, f => langageDe(copie).estUnTest(f, copie));
  }
  const r =
    geste === 'reporter' && reste.length === 2
      ? reporter(copie, { base: reste[0], pointe: reste[1] })
      : geste === 'preparer' && reste.length <= 1
        ? preparer(copie, reste[0] ?? null, { ecrit })
        : {
            ok: false,
            message:
              'usage: travail-de-la-copie.mjs reporter <copie> <base> <pointe> | preparer <copie> [<cible>] [--role <role>]',
          };
  // `preparer` prints the list its pose fixes on stdout, its messages on stderr.
  if (geste === 'preparer') {
    if (r.message) {
      process.stderr.write(`${r.message}\n`);
    }
    process.stdout.write(r.partages ?? '');
  } else if (r.message) {
    process.stdout.write(`${r.message}\n`);
  }
  process.exitCode = r.ok ? 0 : 1;
}
