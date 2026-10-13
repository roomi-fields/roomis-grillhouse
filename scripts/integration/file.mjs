#!/usr/bin/env node
// The queue: brings the branches `agent/<ticket>` the integration committed onto main, one at a time,
// in their order of arrival (scripts/integration/file-attente.mjs). Run from the main tree by the
// integrateur, after its integration, and by the supervisor by hand.
//
//   node scripts/integration/file.mjs
//
// No argument (exit 2 and the usage otherwise). It takes the branches waiting one by one until none is
// left, then exits 0, whatever became of each branch. A queue launched while another runs exits 0 at
// once, refusing nothing: the running queue takes the branch that arrived (it reads the entries
// again before it lets go of its lock, `.git/file-integration.lock`).
//
// For each branch, against the main of the moment:
//  - main is an ancestor of the branch (main has not moved since its base): main moves forward onto
//    the branch (`merge --ff-only`), nothing replayed;
//  - main has moved: the branch is replaced on main in the queue's own copy
//    (`.claude/worktrees/file`, made ready by scripts/integration/rejeu.mjs), the suites that read
//    what the branch touches (rule `grillhouse.integration`; a suite whose content was already
//    measured is not replayed, scripts/integration/suites-vitest.mjs) and the project's guards are
//    replayed there, the dependencies made to agree with the lock file of the branch once replaced
//    (rejeu.mjs installs before the build, the suites and the guards; an install that fails makes
//    the branch leave the queue, « Les dépendances de la copie ne s'installent pas. », its suites
//    not played), the project built after the lots, as soon as a suite or a guard reads the build
//    (main is built only when one of its suites plays), through the one entry point that builds
//    (scripts/integration/constructions.mjs: a build whose fingerprint is in the store is restored),
//    every command of the project run in the copy leaving its index up to date, for the base and
//    then for the branch replaced (scripts/integration/rejeu.mjs), and main moves forward onto the
//    replaced branch when no failing test is new compared to main;
//  - a branch with nothing ahead of main does not enter: it leaves the queue, its tickets lose
//    `en-file` and take a comment, and stay as they are;
//  - a branch that does not replace (the files in conflict), whose guards refuse or that adds a
//    failing test leaves the queue: each ticket it carries loses `en-file`, reopens with a comment
//    that names the files or the tests, and the branch stays where it is, for the relaunch of its
//    ticket (scripts/enveloppe/lancer.sh);
//  - a branch whose replay cannot be done (the copy does not get ready, main does not take the
//    branch, the main tree holds a file of the lot) stays in the queue, the reason written to its
//    tickets, and the queue goes on; the next queue takes it again.
// At its entry on main, every ticket the branch carries closes « intégré : <commit> », loses
// `en-file`, and the branch is deleted; a branch git does not delete (its copy still in place) is
// written to the tickets, which close all the same. Then main is pushed to origin, on the branch
// `grillhouse.poussee.commit` of main's package.json (`main` without the key); a refused push is
// written to the tickets and does not stop the queue.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lireCommit } from '../poussee-cles.mjs';
import { lacherVerrou, prendreVerrou } from '../verrou-de-fichier.mjs';
import { dossierCommun, lireEntrees, retirerEntree } from './file-attente.mjs';
import { DEPENDANCES_REFUSEES, nouveauxRouges, ouvrirCopie } from './rejeu.mjs';

const ESSAIS_PAR_BRANCHE = 5;

function main(argv) {
  if (argv.length) {
    process.stderr.write('usage: file.mjs (sans argument)\n');
    return 2;
  }
  // The main tree, from git's common directory: launched from a copy, the queue still works on it.
  const racine = path.dirname(
    spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      encoding: 'utf8',
    }).stdout.trim()
  );
  const git = (...args) => spawnSync('git', ['-C', racine, ...args], { encoding: 'utf8' });
  const bd = (...a) => {
    const r = spawnSync('bd', a, { cwd: racine, encoding: 'utf8' });
    if (r.status !== 0) process.stderr.write(`bd ${a[0]} ${a[1] ?? ''} : ${r.stderr}`);
    return r;
  };
  const dire = s => process.stdout.write(`${s}\n`);
  const principale = git('symbolic-ref', '--short', '-q', 'HEAD').stdout.trim();
  if (!principale) {
    process.stderr.write("⛔ L'arbre principal n'est pas sur une branche.\n");
    return 1;
  }
  const refPrincipale = `refs/heads/${principale}`;
  const copie = path.join(racine, '.claude', 'worktrees', 'file');
  const verrou = path.join(dossierCommun(racine), 'file-integration.lock');
  const tmp = mkdtempSync(path.join(tmpdir(), 'file-integration-'));

  const commenter = (tickets, texte) => {
    for (const id of tickets) bd('comments', 'add', id, texte);
  };
  // The branch leaves the queue and stays in place; every ticket it carries reopens.
  const sortir = (entree, titre, detail) => {
    const texte = `## Sortie de la file\n\nLa branche ${entree.branche} ne peut pas entrer sur ${principale} : ${titre}\n${detail}\n\nLa branche reste en place ; la relance du ticket remet son lot en travail local sur ${principale}.`;
    for (const id of entree.tickets) {
      bd('update', id, '--status', 'open', '--remove-label', 'en-file');
      bd('comments', 'add', id, texte);
    }
    retirerEntree(entree);
    dire(`✗ ${entree.branche} sort de la file : ${titre}`);
  };
  // The branch has nothing ahead of main: it leaves the queue, its tickets stay as they are and lose
  // `en-file`.
  const ecarter = entree => {
    const texte = `## Sortie de la file\n\nLa branche ${entree.branche} n'a rien en avance sur ${principale} : elle n'entre pas, et le ticket reste ouvert.`;
    for (const id of entree.tickets) {
      bd('update', id, '--remove-label', 'en-file');
      bd('comments', 'add', id, texte);
    }
    retirerEntree(entree);
    dire(`⚠ ${entree.branche} n'a rien en avance sur ${principale} : elle sort de la file`);
  };
  // The branch stays in the queue, the reason written to its tickets.
  const garder = (entree, raison) => {
    commenter(
      entree.tickets,
      `## La file garde la branche\n\nLa branche ${entree.branche} reste en file : ${raison}`
    );
    dire(`⚠ ${entree.branche} reste en file : ${raison}`);
  };

  // The branch replaced on main, replayed: { nouveau } (the commit to move main onto), or
  // { sortie: [titre, détail] } (it leaves the queue), or { garde } (it stays, the reason).
  const rejouer = (tip, tete) => {
    const base = git('merge-base', tete, tip).stdout.trim();
    const diff = git('diff', '--name-only', '--no-renames', '-z', base, tip);
    if (diff.status !== 0) return { garde: `ses fichiers ne se lisent pas : ${diff.stderr}` };
    const fichiers = diff.stdout.split('\0').filter(Boolean);
    if (existsSync(copie))
      spawnSync('git', ['-C', copie, 'rebase', '--abort'], { encoding: 'utf8' });
    const ouverte = ouvrirCopie({ racine, copie, ref: tete, tmp, dire });
    if (ouverte.refus) return { garde: ouverte.refus };
    const { dansCopie, portee, suites, gardes } = ouverte;
    const { champ, message } = portee(fichiers);
    dire(message);
    let avant = [];
    if (champ.mode !== 'aucun') {
      avant = suites(champ, 'base');
      if (avant.includes(DEPENDANCES_REFUSEES)) return { garde: DEPENDANCES_REFUSEES };
      if (avant.some(n => n.startsWith('(les suites sortent'))) {
        return {
          garde: `la base ne se mesure pas : les suites échouent sur ${principale} sans nommer de test`,
        };
      }
    }
    if (dansCopie('checkout', '-q', '--detach', tip).status !== 0)
      return { garde: `la copie ne prend pas ${tip.slice(0, 7)}` };
    const rebase = dansCopie('rebase', tete);
    if (rebase.status !== 0) {
      const conflits = dansCopie('diff', '--name-only', '--diff-filter=U')
        .stdout.split('\n')
        .filter(Boolean);
      dansCopie('rebase', '--abort');
      return {
        sortie: [
          'elle ne se replace pas sur main.',
          conflits.length
            ? `Fichiers en conflit :\n${conflits.map(f => `  ${f}`).join('\n')}`
            : `Sortie de git :\n${rebase.stdout}${rebase.stderr}`,
        ],
      };
    }
    const apres = champ.mode !== 'aucun' ? suites(champ, 'apres') : [];
    if (apres.includes(DEPENDANCES_REFUSEES)) {
      return {
        sortie: [DEPENDANCES_REFUSEES, "Le verrou de la branche replacée ne s'installe pas."],
      };
    }
    const g = gardes();
    if (g.stderr.includes(DEPENDANCES_REFUSEES)) {
      return {
        sortie: [DEPENDANCES_REFUSEES, "Le verrou de la branche replacée ne s'installe pas."],
      };
    }
    if (g.status !== 0) {
      const fin = `${g.stdout}${g.stderr}`.trim().split('\n').slice(-40).join('\n');
      return { sortie: ['les gardes refusent une fois la branche replacée.', fin] };
    }
    if (champ.mode !== 'aucun') {
      const nouveaux = nouveauxRouges(avant, apres);
      if (nouveaux.length) {
        return {
          sortie: [
            'elle ajoute des tests rouges.',
            `Rouges nouveaux :\n${nouveaux.map(n => `  ✗ ${n}`).join('\n')}`,
          ],
        };
      }
    }
    return { nouveau: dansCopie('rev-parse', 'HEAD').stdout.trim() };
  };

  // Main is at <nouveau>: the tickets close, the branch is deleted, main is pushed.
  const entrer = (entree, nouveau) => {
    const court = nouveau.slice(0, 7);
    for (const id of entree.tickets) {
      bd('update', id, '--remove-label', 'en-file');
      bd('close', id, '--reason', `intégré : ${court}`);
    }
    retirerEntree(entree);
    dire(`✓ ${entree.branche} entre sur ${principale} : ${court}`);
    const efface = git('branch', '-D', entree.branche);
    if (efface.status !== 0) {
      commenter(
        entree.tickets,
        `La branche ${entree.branche} reste en place après son entrée sur ${principale} (${efface.stderr.trim()}) : sa copie est encore en place. Le ticket est fermé.`
      );
      dire(`⚠ ${entree.branche} n'est pas effacée`);
    }
    const paquet = git('show', `${refPrincipale}:package.json`);
    const { commit, faute } = lireCommit(paquet.status === 0 ? JSON.parse(paquet.stdout) : null);
    if (faute) {
      commenter(
        entree.tickets,
        `Poussée non faite : grillhouse.poussee.commit vaut ${faute}, pas un nom de branche.`
      );
      return;
    }
    const pousse = spawnSync(
      'git',
      ['-C', racine, 'push', 'origin', `${nouveau}:refs/heads/${commit}`],
      { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }
    );
    if (pousse.status !== 0) {
      commenter(
        entree.tickets,
        `La poussée de ${court} vers origin/${commit} (grillhouse.poussee.commit) est refusée :\n${pousse.stderr.trim()}`
      );
      dire(`⚠ poussée de ${court} refusée`);
    } else {
      dire(`✓ poussée : ${court} est sur origin/${commit}`);
    }
  };

  // One branch of the queue, against the main of the moment.
  const traiter = entree => {
    const tip = git('rev-parse', '--verify', '-q', `refs/heads/${entree.branche}`).stdout.trim();
    if (!tip) return sortir(entree, "la branche n'existe plus.", '');
    if (Number(git('rev-list', '--count', `${refPrincipale}..${tip}`).stdout.trim()) === 0)
      return ecarter(entree);
    for (let essai = 0; essai < ESSAIS_PAR_BRANCHE; essai++) {
      const tete = git('rev-parse', refPrincipale).stdout.trim();
      let nouveau = tip;
      if (git('merge-base', '--is-ancestor', tete, tip).status !== 0) {
        const r = rejouer(tip, tete);
        if (r.sortie) return sortir(entree, ...r.sortie);
        if (r.garde) return garder(entree, r.garde);
        nouveau = r.nouveau;
      }
      if (nouveau !== tete) {
        const avance = git('merge', '-q', '--ff-only', nouveau);
        if (avance.status !== 0) {
          if (git('rev-parse', refPrincipale).stdout.trim() !== tete) continue;
          return garder(
            entree,
            `${principale} n'avance pas sur ${nouveau.slice(0, 7)} :\n${avance.stdout}${avance.stderr}`.trim()
          );
        }
      }
      return entrer(entree, nouveau);
    }
    return garder(entree, `${principale} bouge sans cesse : cinq essais n'ont pas suffi.`);
  };

  const vues = new Set();
  try {
    for (;;) {
      if (!prendreVerrou(verrou, { attendre: false })) return 0;
      try {
        for (;;) {
          const entree = lireEntrees(racine).find(e => !vues.has(e.fichier));
          if (!entree) break;
          vues.add(entree.fichier);
          traiter(entree);
        }
      } finally {
        lacherVerrou(verrou);
      }
      // An entry written while the lock was let go has no queue running to take it.
      if (!lireEntrees(racine).some(e => !vues.has(e.fichier))) return 0;
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)));
}
