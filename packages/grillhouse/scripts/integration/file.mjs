// The gestures of the queue, which brings the branches `agent/<ticket>` the integration committed
// onto main, one at a time, each judged by a final pass on the tree that enters before main moves, as
// bors judges the tree that enters, and as Google's TAP plays the touched tests before the submit and
// the whole suite after it: the workflow of the queue of a project (`file:<racine>`,
// src/temporal/file/deroule.ts) plays them, each in an act of its own (scripts/faits-du-circuit.mjs),
// for the entries the circuits of the tickets send it at their step 5.2, in their order of arrival.
// The CI of the project plays after, on main, by batches (scripts/ci-de-main.mjs): the queue reads no
// CI and pushes no branch of a ticket.
//
// For each branch (`preparerLaBranche`), against the main of the moment:
//  - main is an ancestor of the branch (main has not moved since its base): the branch is the
//    candidate as it is;
//  - main has moved: the branch is replaced on main in the queue's own copy
//    (`.claude/worktrees/file`, made ready by scripts/integration/rejeu.mjs, its dependencies made
//    to agree with the lock file and the manifests: an install that fails makes the branch leave
//    the queue, « Les dépendances de la copie ne s'installent pas. »), and `agent/<ticket>` takes
//    the replaced commit, the candidate. A generated file the project declares
//    (`grillhouse.engendres`, scripts/engendres.mjs, read from the main tree, a faulty key keeping
//    the branch in the queue, named) is never merged, as npm writes package-lock.json again after
//    a merge: a conflict on such files only takes main's version, and once the branch is replaced
//    and installed, the command of each one whose files, or the files it reads, the branch touches
//    writes it again, with the tools of the project, and what it writes enters the branch's
//    commit; a command that fails makes the branch leave the queue, the command and its output
//    named (OSC Bridge, 2026-10-31: four conflicts in one day on the generated files of synthhub
//    and open-synth-descriptors);
//  - a branch with nothing ahead of main does not enter: it leaves the queue, its ticket loses
//    `en-file` and takes a comment, and stays as it is;
//  - a branch that does not replace (the files in conflict) leaves the queue: its ticket loses
//    `en-file`, reopens with a comment that names the files, and the branch stays where it is, for
//    the resumption of its circuit;
//  - a branch whose replay cannot be done (the copy does not get ready, the branch does not take
//    its replaced commit) stays in the queue, the reason written to its ticket, which is neither
//    reopened nor closed, and the queue goes on; the circuit of the ticket stops at
//    « a-repasser », and its resumption sends the branch again.
// The branch stays local: it is never pushed.
// Then the final pass judges the candidate (`jugerLeCandidat`): `npm run verifier` played in the
// queue's copy on the lot laid on the tip of main, measured against that tip (the tests the lot
// reaches, the complete pass being the CI's of main and the night's), unless the tree was already
// judged (scripts/arbres-juges.mjs: a tree a final pass kept green, or a complete verification),
// which plays nothing again. Green, the tree is kept judged and main moves forward onto the
// candidate (`avancerMain`, `merge --ff-only`), the tree the pass judged; main moved meanwhile, the
// workflow replaces the branch again and judges it again. Red, the ticket loses `en-file` and
// reopens, its comment giving the end of the output of the pass; main does not move, and the branch
// stays. To play again (75, the part of the machine awaited), the branch stays in the queue, the
// ticket told, neither reopened nor closed. A flaky test has no path of its own: the red comment
// gives the charter's rule, a test known red goes into quarantine in the test itself, with the
// ticket that fixes it.
// At its entry on main (`fermerLEntree`), the branch's ticket closes « intégré : <commit> », loses
// `en-file`, and the branch is deleted; a branch git does not delete (its copy still in place) is
// written to the ticket, which closes all the same. Then main is pushed to origin, on the branch
// `grillhouse.poussee.commit` of main's package.json (`main` without the key), which the pre-push
// hook lets go as the tree is judged; a refused push is written to the ticket and does not stop the
// queue. The working directory of its circuit (`.claude/worktrees/<ticket>.travail`,
// scripts/circuit.mjs), which lives as long as the ticket, is removed then (`retirerLeTravail`).
// Every comment and change of the queue at a ticket is written under the author `file`, which bd
// reads in BEADS_ACTOR, as the circuit writes its own lines under `circuit`.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  aRejouer,
  couvertPar,
  encoreDeclares,
  engendresDe,
  prendreLesEngendres,
  regenerer,
} from '../engendres.mjs';
import { arbreEstJuge, garderLArbreJuge } from '../arbres-juges.mjs';
import { A_REPASSER } from '../codes-de-sortie.mjs';
import { BASE_DU_LOT } from '../dernier-vert.mjs';
import { avecLesDonnees, donneesDe } from '../donnees-cles.mjs';
import { avecLesOutils, empreintesDe, outilsDe } from '../outils-cles.mjs';
import { lireCommit } from '../poussee-cles.mjs';
import { ouvrirCopie } from './rejeu.mjs';
import { lotSurMain } from './integrer.mjs';
import { ACTEUR, emettre } from '../effets.mjs';
import { SUITE } from '../etapes.mjs';
import { enUneLigne } from '../ticket-du-circuit.mjs';

// The title of the final pass is read from the list of the steps, the only place that spells it.
const TITRE_PASSE_FINALE = SUITE.find(e => e.finale).titre;

// The queue's author.
export const AUTEUR_DE_LA_FILE = 'file';

// The comment <texte> at <ticket> with the tools <o>, by the queue: the effect `commentaire`
// (../effets.mjs), written at once by the queue on its file, gathered by an act of the queue under
// Temporal, which the workflow writes in an activity of its own, under its key.
const commenterAu = (o, ticket, texte) =>
  emettre(o, { genre: 'commentaire', ticket, texte, auteur: AUTEUR_DE_LA_FILE });
// The reason of the closure of a ticket the queue brought onto main, before its commit, which the
// circuit reads to name that commit (scripts/circuit.mjs, the tri of the discoveries).
export const INTEGRE = 'intégré : ';

// The lines of the end of the output of a pass the comment of a red gives.
const FIN_DE_LA_SORTIE = 60;

/**
 * The final pass played in the queue's own copy (`.claude/worktrees/file`) on the commit <commit>:
 * `{ code, sortie }`, the code of `npm run verifier` (0 green, 75 to play again, any other red) and
 * its output. The copy is made ready on <commit> (detached, its dependencies in agreement with the
 * lock file), the pass measured against the tip of main (`GRILLHOUSE_BASE_DU_LOT`, the commit's base
 * as the lot lies on it), as the pass of the circuit measures itself.
 */
function passeDeLaFile(racine, principale, dire) {
  return ({ commit }) => {
    const copie = path.join(racine, '.claude', 'worktrees', 'file');
    const ouverte = ouvrirCopie({ racine, copie, ref: commit, dire });
    if (ouverte.refus) {
      return { code: A_REPASSER, sortie: ouverte.refus };
    }
    const base = spawnSync('git', ['-C', racine, 'rev-parse', `refs/heads/${principale}`], {
      encoding: 'utf8',
    }).stdout.trim();
    const r = spawnSync('bash', ouverte.monter('npm', 'run', 'verifier'), {
      cwd: copie,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: base ? { ...process.env, [BASE_DU_LOT]: base } : process.env,
    });
    return { code: r.status ?? 1, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  };
}

/**
 * The tools of the queue on the main tree <racine>, its lines said by <dire>: `{ racine,
 * principale, bd, passe, dire, avancement }`, bd run under the queue's author (BEADS_ACTOR), the
 * branch of the main tree (null when it is on none), `passe` the final pass played in the queue's
 * copy.
 */
export function outilsDeLaFile(racine, dire, avancement = null) {
  const bd = (...a) => {
    const r = spawnSync('bd', a, {
      cwd: racine,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, [ACTEUR]: AUTEUR_DE_LA_FILE },
    });
    if (r.status !== 0) {
      process.stderr.write(`bd ${a[0]} ${a[1] ?? ''} : ${r.stderr}`);
    }
    return r;
  };
  const principale =
    spawnSync('git', ['-C', racine, 'symbolic-ref', '--short', '-q', 'HEAD'], {
      encoding: 'utf8',
    }).stdout.trim() || null;
  return {
    racine,
    principale,
    bd,
    passe: passeDeLaFile(racine, principale ?? 'main', dire),
    dire,
    avancement,
  };
}

/**
 * The working directory of the circuit of <ticket> in the main tree of <o> removed, once the queue
 * is done with the ticket closed: as the workspace of a pipeline, it lives as long as the ticket.
 */
export function retirerLeTravail(o, ticket) {
  rmSync(path.join(o.racine, '.claude', 'worktrees', `${ticket}.travail`), {
    recursive: true,
    force: true,
  });
}

/**
 * Where the lot of the ticket <ticket> stands, with the tools <o>: `{ statut, raison }`, its status
 * in Beads and its reason of closure.
 */
export function situerLeLot(o, ticket) {
  const show = o.bd('show', ticket, '--json');
  const t = show.status === 0 ? (JSON.parse(show.stdout)[0] ?? {}) : {};
  return { statut: t.status ?? null, raison: t.close_reason ?? null };
}

// The branch at <tip> replaced on the main <tete> in the queue's own copy, with the tools <o>:
// { nouveau } (the replaced commit), or { sortie: [titre, détail] } (it leaves the queue; with
// `conflit: true` when it does not replay on main), or
// { garde } (it stays, the reason).
function remplacer(o, tip, tete) {
  const { racine, dire } = o;
  const copie = path.join(racine, '.claude', 'worktrees', 'file');
  if (existsSync(copie)) {
    spawnSync('git', ['-C', copie, 'rebase', '--abort'], { encoding: 'utf8' });
  }
  // The keys of the project, before any work: its generated files and its tools.
  let engendres;
  let env;
  try {
    engendres = engendresDe(racine);
    env = avecLesDonnees(
      donneesDe(racine),
      avecLesOutils(outilsDe(racine), process.env, empreintesDe(racine))
    );
  } catch (e) {
    return { garde: `une clé grillhouse du package.json est refusée :\n${e.message}` };
  }
  const ouverte = ouvrirCopie({ racine, copie, ref: tete, dire });
  if (ouverte.refus) {
    return { garde: ouverte.refus };
  }
  const { dansCopie, monter, installer } = ouverte;
  if (dansCopie('checkout', '-q', '--detach', tip).status !== 0) {
    return { garde: `la copie ne prend pas ${tip.slice(0, 7)}` };
  }
  // A conflict on generated files the project declares only is no conflict: main's version is
  // taken, and their command writes them again once the branch is replaced (below). One the branch
  // removes from the key (`encoreDeclares`, read in the copy) takes the branch's version, its
  // deletion too, and its command is not played.
  let rebase = dansCopie('rebase', tete);
  let tours = Number(dansCopie('rev-list', '--count', `${tete}..${tip}`).stdout.trim()) || 1;
  while (rebase.status !== 0) {
    const conflits = dansCopie('diff', '--name-only', '--diff-filter=U')
      .stdout.split('\n')
      .filter(Boolean);
    const engendresSeuls =
      tours-- > 0 &&
      conflits.length > 0 &&
      conflits.every(f => engendres.some(e => couvertPar(e.entiers, f))) &&
      prendreLesEngendres({ conflits, vivants: encoreDeclares(engendres, copie), dansCopie });
    if (!engendresSeuls) {
      dansCopie('rebase', '--abort');
      return {
        conflit: true,
        sortie: [
          'elle ne se replace pas sur main.',
          conflits.length
            ? `Fichiers en conflit :\n${conflits.map(f => `  ${f}`).join('\n')}`
            : `Sortie de git :\n${rebase.stdout}${rebase.stderr}`,
        ],
      };
    }
    rebase = dansCopie('-c', 'core.editor=true', 'rebase', '--continue');
  }
  const installation = installer();
  if (installation) {
    return { sortie: [installation, "Le verrou de la branche replacée ne s'installe pas."] };
  }
  const touches = aRejouer(
    engendres,
    copie,
    dansCopie('diff', '--name-only', '--no-renames', '-z', tete, 'HEAD')
      .stdout.split('\0')
      .filter(Boolean)
  );
  if (touches.length) {
    const refus = regenerer({
      refs: touches.map(e => ({ ...e, cadre: false })),
      dansCopie,
      lancer: commande =>
        spawnSync('bash', monter('sh', '-c', commande), {
          cwd: copie,
          encoding: 'utf8',
          maxBuffer: 256 * 1024 * 1024,
          env,
        }),
    });
    if (refus) {
      return { sortie: ['ses fichiers engendrés ne se régénèrent pas sur main.', refus] };
    }
    if (dansCopie('diff', '--cached', '--quiet').status !== 0) {
      const corrige = dansCopie('commit', '-q', '--amend', '--no-edit', '--no-verify');
      if (corrige.status !== 0) {
        return {
          garde: `ses fichiers régénérés n'entrent pas dans son commit :\n${corrige.stderr}`,
        };
      }
    }
    dire(`✓ fichiers engendrés régénérés sur main : ${touches.map(e => e.nom).join(', ')}`);
  }
  return { nouveau: dansCopie('rev-parse', 'HEAD').stdout.trim() };
}

/**
 * The branch of <entree> (`{ ticket, branche }`) made the candidate the final pass judges, with the
 * tools <o>, against the main of the moment, without a word to the ticket: `{ candidat: { commit }
 * }`, the branch on top of main (replaced when main moved), kept local; `{ entre: { commit } }`, a
 * lot already on main (the branch points at the commit of main that delivers its ticket, or each of
 * its commits has its equivalent on main, or the branch is gone), as an attempt played again after
 * its worker died finds it: main does not move again; `{ sortie: [titre, détail] }` (it leaves the
 * queue: gone, not replaced); `{ garde }` (it stays in the queue, the reason); `{ ecartee: true }`
 * (nothing ahead of main).
 */
export function preparerLaBranche(o, entree) {
  const git = (...args) => spawnSync('git', ['-C', o.racine, ...args], { encoding: 'utf8' });
  const refPrincipale = `refs/heads/${o.principale}`;
  const refBranche = `refs/heads/${entree.branche}`;
  const tip = git('rev-parse', '--verify', '-q', refBranche).stdout.trim();
  const livre = lotSurMain(o, entree.ticket);
  // A lot on main whose branch is gone (a closure that failed after its deletion) is entered.
  if (!tip) {
    return livre ? { entre: { commit: livre } } : { sortie: ["la branche n'existe plus.", ''] };
  }
  const enAvance = Number(git('rev-list', '--count', `${refPrincipale}..${tip}`).stdout.trim());
  // The lot is on main when the branch points at the commit of main that delivers the ticket
  // (main moved onto it by fast-forward), or when each commit of the branch has its equivalent on
  // main (the same patch, git cherry), the replay a rebase wrote: a lot of before of a ticket
  // reopened is neither, its branch at main's or ahead of it by new commits.
  if (livre) {
    const cerise = git('cherry', refPrincipale, tip).stdout.split('\n').filter(Boolean);
    const rejeu = enAvance > 0 && cerise.length > 0 && cerise.every(l => l.startsWith('- '));
    if (tip === livre || rejeu) {
      return { entre: { commit: livre } };
    }
  }
  if (enAvance === 0) {
    return { ecartee: true };
  }
  const tete = git('rev-parse', refPrincipale).stdout.trim();
  let candidat = tip;
  if (git('merge-base', '--is-ancestor', tete, tip).status !== 0) {
    const r = remplacer(o, tip, tete);
    if (!r.nouveau) {
      return r;
    }
    const pose = git('update-ref', refBranche, r.nouveau, tip);
    if (pose.status !== 0) {
      return {
        garde: `${entree.branche} ne prend pas ${r.nouveau.slice(0, 7)} :\n${pose.stderr}`.trim(),
      };
    }
    candidat = r.nouveau;
  }
  o.dire(`✓ ${entree.branche} prête en ${candidat.slice(0, 7)} : la passe finale la juge`);
  return { candidat: { commit: candidat } };
}

/**
 * The candidate <commit> of <entree> (`{ ticket, branche, commit }`) judged by the final pass with
 * the tools <o>: `{ juge: true }`, green (or its tree already judged: nothing is played again), its
 * tree kept judged (scripts/arbres-juges.mjs); or `{ issue }`, the issue for the circuit
 * (src/temporal/file/deroule.ts): red, `rouvert`, the end of the output of the pass in the comment,
 * the ticket reopened without `en-file`; to play again (75), `en-file`, the ticket told, neither
 * reopened nor closed. `o.passe({ commit })` gives `{ code, sortie }`.
 */
export function jugerLeCandidat(o, entree) {
  const git = (...args) => spawnSync('git', ['-C', o.racine, ...args], { encoding: 'utf8' });
  const arbre = git('rev-parse', '--verify', '-q', `${entree.commit}^{tree}`).stdout.trim();
  const court = entree.commit.slice(0, 7);
  if (arbre && arbreEstJuge(o.racine, arbre)) {
    o.dire(`✓ arbre de ${court} déjà jugé par une passe finale`);
    return { juge: true };
  }
  const { code, sortie } = o.passe({ commit: entree.commit });
  if (code === 0) {
    if (arbre) {
      garderLArbreJuge(o.racine, arbre);
    }
    o.dire(`✓ passe finale verte sur ${court}`);
    return { juge: true };
  }
  const fin = `${sortie ?? ''}`.trim().split('\n').slice(-FIN_DE_LA_SORTIE).join('\n');
  if (code === A_REPASSER) {
    const texte = `## ${TITRE_PASSE_FINALE} à repasser\n\nLa passe finale de ${court} sur ${entree.branche} est à repasser (code ${code}) :\n\n${fin}\n\n${o.principale} n'avance pas sans son vert ; la branche reste en file, et la reprise du circuit la renvoie.`;
    commenterAu(o, entree.ticket, texte);
    o.dire(`⚠ passe finale de ${court} à repasser`);
    return { issue: { etat: 'en-file', raison: texte } };
  }
  const texte = `## ${TITRE_PASSE_FINALE} rouge\n\nLa passe finale de ${court} sur ${entree.branche}, le lot posé sur la pointe de ${o.principale}, est rouge (code ${code}). La fin de sa sortie :\n\n${fin}\n\n${o.principale} n'avance pas et le ticket est rouvert : sa correction entre sous son numéro. Un test connu instable se met en quarantaine dans le test, avec le ticket qui le corrige.`;
  commenterAu(o, entree.ticket, texte);
  o.bd('update', entree.ticket, '--status', 'open', '--remove-label', 'en-file');
  o.dire(`✗ passe finale de ${court} rouge : ${entree.ticket} rouvert`);
  return {
    issue: { etat: 'rouvert', raison: `La passe finale de ${court} sur ${entree.branche} est rouge.` },
  };
}

/**
 * Main moved forward onto the candidate <commit> of <entree> (`{ ticket, branche, commit }`) once
 * the final pass judged it, with the tools <o>, by fast-forward: the tree that enters is the tree
 * the pass judged. `{ entre: { commit } }`, main at <commit> (or <commit> already on main, an
 * attempt played again); `{ bouge: true }`, main moved meanwhile and the candidate is no longer on
 * top of it, which the workflow replaces and judges again; `{ garde }`, main does not move, the
 * reason.
 */
export function avancerMain(o, entree) {
  const git = (...args) => spawnSync('git', ['-C', o.racine, ...args], { encoding: 'utf8' });
  const refPrincipale = `refs/heads/${o.principale}`;
  // The candidate already on main: an attempt played again after main moved onto it.
  if (git('merge-base', '--is-ancestor', entree.commit, refPrincipale).status === 0) {
    return { entre: { commit: entree.commit } };
  }
  const tete = git('rev-parse', refPrincipale).stdout.trim();
  if (git('merge-base', '--is-ancestor', tete, entree.commit).status !== 0) {
    return { bouge: true };
  }
  const avance = git('merge', '-q', '--ff-only', entree.commit);
  if (avance.status !== 0) {
    if (git('rev-parse', refPrincipale).stdout.trim() !== tete) {
      return { bouge: true };
    }
    return {
      garde:
        `${o.principale} n'avance pas sur ${entree.commit.slice(0, 7)} :\n${avance.stdout}${avance.stderr}`.trim(),
    };
  }
  return { entre: { commit: entree.commit } };
}

// The capabilities of the ticket <ticket> (its `labels`, `export:<capability>` each) delivered by
// `bd ship <capability>`, which sets `provides:<capability>`, the signal that the queue of another
// project reads. A `bd ship` that fails is a fault named, never ignored: its comment at the
// ticket says it whole, `livraison` in one line (the capability and Beads' reason), the other
// capabilities still delivered; null without a fault.
function livrerLesCapacites(o, ticket, labels) {
  const fautes = [];
  for (const cap of labels.filter(l => l.startsWith('export:')).map(l => l.slice(7))) {
    const r = o.bd('ship', cap);
    if (r.status !== 0) {
      const raison = `${r.stderr ?? ''}`.trim() || `${r.stdout ?? ''}`.trim() || `code ${r.status}`;
      commenterAu(
        o,
        ticket,
        `La livraison de la capacité ${cap} n'est pas faite : \`bd ship ${cap}\` échoue :\n${raison}\n\nLe ticket est fermé ; la capacité reste à livrer.`
      );
      o.dire(`⚠ bd ship ${cap} échoue`);
      fautes.push(`bd ship ${cap} échoue : ${enUneLigne(raison)}`);
    }
  }
  return { livraison: fautes.length > 0 ? fautes.join(' ; ') : null };
}

/**
 * The ticket of <entree> (`{ ticket, branche, commit }`) entered on main at <commit>, with the
 * tools <o>: it closes « intégré : <commit> » and loses `en-file` (a ticket already closed is left
 * as it is), the branch is deleted, then main is pushed to origin on the branch
 * `grillhouse.poussee.commit` of main's package.json; the queue is then done with the ticket, and
 * removes the working directory of its circuit (`retirerLeTravail`). Each of its gestures replays
 * without harm (a ticket closed is left closed, a branch gone stays gone, a commit pushed is pushed
 * again as it is), and never reopens the ticket; its comments are effects (`commenterAu`), which
 * the workflow of the queue writes once each. `{ poussee, raison }`: the branch pushed to, or null
 * and why, in one line (`enUneLigne`), its comment at the ticket whole.
 */
export function fermerLEntree(o, entree) {
  const { racine } = o;
  const git = (...args) => spawnSync('git', ['-C', racine, ...args], { encoding: 'utf8' });
  const court = entree.commit.slice(0, 7);
  const commenter = texte => commenterAu(o, entree.ticket, texte);
  const show = o.bd('show', entree.ticket, '--json');
  const lu = show.status === 0 ? (JSON.parse(show.stdout)[0] ?? null) : null;
  if ((lu?.status ?? null) !== 'closed') {
    o.bd('update', entree.ticket, '--remove-label', 'en-file');
    o.bd('close', entree.ticket, '--reason', `${INTEGRE}${court}`);
  }
  // The capabilities the ticket exports (`export:<capability>`) are delivered once it is closed.
  const ferme = livrerLesCapacites(o, entree.ticket, lu?.labels ?? []);
  o.dire(`✓ ${entree.branche} entre sur ${o.principale} : ${court}`);
  if (git('rev-parse', '--verify', '-q', `refs/heads/${entree.branche}`).status === 0) {
    const efface = git('branch', '-D', entree.branche);
    if (efface.status !== 0) {
      commenter(
        `La branche ${entree.branche} reste en place après son entrée sur ${o.principale} (${efface.stderr.trim()}) : sa copie est encore en place. Le ticket est fermé.`
      );
      o.dire(`⚠ ${entree.branche} n'est pas effacée`);
    }
  }
  retirerLeTravail(o, entree.ticket);
  const paquet = git('show', `refs/heads/${o.principale}:package.json`);
  const { commit, faute } = lireCommit(paquet.status === 0 ? JSON.parse(paquet.stdout) : null);
  if (faute) {
    const raison = `Poussée non faite : grillhouse.poussee.commit vaut ${faute}, pas un nom de branche.`;
    commenter(raison);
    return { poussee: null, raison: enUneLigne(raison), ...ferme };
  }
  const sansInvite = { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } };
  const pousse = spawnSync(
    'git',
    ['-C', racine, 'push', 'origin', `${entree.commit}:refs/heads/${commit}`],
    sansInvite
  );
  if (pousse.status !== 0) {
    const raison = `La poussée de ${court} vers origin/${commit} (grillhouse.poussee.commit) est refusée :\n${pousse.stderr.trim()}`;
    commenter(raison);
    o.dire(`⚠ poussée de ${court} refusée`);
    return { poussee: null, raison: enUneLigne(raison), ...ferme };
  }
  o.dire(`✓ poussée : ${court} est sur origin/${commit}`);
  return { poussee: commit, raison: null, ...ferme };
}

/**
 * What the outcome <r> of `preparerLaBranche` or `avancerMain` for <entree> says to its ticket,
 * with the tools <o>: a branch out of the queue reopens it, its files named; a branch set aside
 * loses `en-file`, the ticket left open; a branch kept, the reason. `{ etat, raison }`: `rouvert`
 * (with `conflit: true` for a branch that does not replay on main) or `en-file`, as the circuit
 * reads the queue.
 */
export function direLIssue(o, entree, r) {
  const commenter = texte => commenterAu(o, entree.ticket, texte);
  if (r.sortie) {
    const [titre, detail] = r.sortie;
    const texte = `## Sortie de la file\n\nLa branche ${entree.branche} ne peut pas entrer sur ${o.principale} : ${titre}\n${detail}\n\nLa branche reste en place ; la relance du ticket remet son lot en travail local sur ${o.principale}.`;
    o.bd('update', entree.ticket, '--status', 'open', '--remove-label', 'en-file');
    commenter(texte);
    o.dire(`✗ ${entree.branche} sort de la file : ${titre}`);
    return { etat: 'rouvert', raison: texte, ...(r.conflit ? { conflit: true } : {}) };
  }
  if (r.ecartee) {
    const texte = `## Sortie de la file\n\nLa branche ${entree.branche} n'a rien en avance sur ${o.principale} : elle n'entre pas, et le ticket reste ouvert.`;
    o.bd('update', entree.ticket, '--remove-label', 'en-file');
    commenter(texte);
    o.dire(`⚠ ${entree.branche} n'a rien en avance sur ${o.principale} : elle sort de la file`);
    return { etat: 'rouvert', raison: texte };
  }
  const texte = `## La file garde la branche\n\nLa branche ${entree.branche} reste en file : ${r.garde}`;
  commenter(texte);
  o.dire(`⚠ ${entree.branche} reste en file : ${r.garde}`);
  return { etat: 'en-file', raison: texte };
}
