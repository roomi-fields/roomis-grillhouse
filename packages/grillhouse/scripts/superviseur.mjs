#!/usr/bin/env node
// The lock of the supervisor of a project, and the reading of the questions of its circuits.
// Mechanism: greffon.md, §5.1 and §5.2. Played by the session start (scripts/session-start.sh),
// which writes what it says to the session.
//
//   npx grillhouse superviseur <racine> [<source>]
//
// - Out of a git repository, in an agent's copy (a worktree whose git directory is not the common
//   one) and in a session of a role that the circuit launches (BEADS_ACTOR set), nothing is taken
//   and nothing is said.
// - The lock is `<git common dir>/grillhouse-superviseur.lock`, one for the repository and its
//   copies, taken through scripts/verrou-de-fichier.mjs for the session's own process: the first
//   process above this one named `claude`, whatever stands between them; without one, the first
//   that is not a shell (sh, bash, dash, zsh). It holds as long as that process lives.
// - <source> is the one of the SessionStart hook (`startup` without one). Free, or held by a
//   process that is gone: taken. Held by the session itself: kept, and nothing is said after a
//   compaction or a resume. After a /clear, the session that holds the lock receives « ## Reprise
//   de la supervision après un /clear » (load `grillhouse:pitmaster`, take up the note of
//   resumption, no whole round, put the owner's pending question again at the first turn), then
//   what a session that takes the lock receives. Held by another live session: the section « ## Un
//   autre superviseur tient ce dépôt » names its process and since when, and asks to say so to the
//   owner and to launch no circuit. A declared milestone ends with the context that declared it: it
//   is removed at every opening of the holder but after a compaction.
// - The session whose opening takes the lock (`ouvertureDuSuperviseur`) receives « ## Les questions
//   des circuits », then, when the repository has circuits (read from the Temporal server in one
//   call, scripts/circuits-du-serveur.mjs), « ## Les circuits du dépôt »: each circuit that runs;
//   each circuit stopped on a question, with the command that answers it; each circuit ended
//   without its issue, with the command that resumes it (`--reprendre` from its last state
//   written, else `--depuis <testwriter|developpeur> --contexte <texte>`); a server that does not
//   answer is said; then « ## La file des tickets », the tickets of the queue without their
//   section « ## Architecture », which the queue never starts (scripts/file-des-tickets.mjs).
//   Last, « ## La note de reprise » gives the note of resumption, when one is written.
// Exit 0, whatever it finds.
//
//   npx grillhouse superviseur --jalon <fichier>
//   npx grillhouse superviseur --question <fichier>
//
// - Played by the session that holds the lock, from the root of the repository. The note of
//   resumption, one per repository, is `<git common dir>/grillhouse-reprise.md`. `--jalon` replaces
//   it whole by the text of <fichier> and declares a milestone, which replaces the one before
//   (`<git common dir>/grillhouse-jalon.json`); `--question` adds the text at its end, creating it,
//   and declares nothing. Exit 2 and the reason on the error stream, nothing written, on a file
//   that is absent or empty, a session that does not hold the lock, a session of a role or a copy.
//
//   npx grillhouse superviseur --renouveler <dossier> <arretA> <messageA>
//
// - Played by the greffon at each period: writes the message of resumption when the renewal is due
//   (`renouvellement`), nothing otherwise.
//
//   npx grillhouse superviseur --relever [<dossier>] [--compaction]
//
// - One reading of the circuits for the greffon (mods/grillhouse/hooks/register.tsx), which runs
//   it at each period and submits what it writes. It reads and writes nothing unless the session
//   that runs it holds the lock; a lock whose process is gone is taken over by the session that
//   reads. It writes the message (`texteDesQuestions`) when `relever` gives something, nothing
//   otherwise; exit 1 and the fault on the error stream when `grillhouse.rappel` of the project is
//   at fault, or when the reading of another project of the group fails, the message of the others
//   then written all the same. The message ends with the request to write the note and declare a
//   milestone after a compaction (`--compaction`), and once for each night
//   (`grillhouse.plageDeNuit`) at a reading where no question of a circuit waits for the
//   supervisor.
// - `superviseur --lue <dossier> <lueA> <envoyeesAvant>` marks read the questions sent up to
//   `envoyeesAvant`; `superviseur --chez-le-responsable <dossier> <ticket>` marks a question
//   carried to the owner: silent until the circuit answers.
// - `relever` is the one function of the reading, of the re-presentation and of the file of the
//   stops gone up: a question that never went up, or was read <rappelMs> ago (`grillhouse.rappel`
//   minutes, 10 by default, scripts/circuits-cles.mjs), is given once per due time while its
//   circuit stands on the same stop; one answered leaves the file
//   `.claude/worktrees/questions-remontees.json`. A stop is kept there by its ticket, the run of
//   its workflow, the rank of its question in that run and its stop, with the times of the first
//   going up and of the last presentation. The end of a circuit integrated is given once
//   (`integre`), kept in `.claude/worktrees/integrations-rendues.json`, and the alert of the CI of
//   main (a red, or a CI not read, scripts/ci-de-main.mjs) once per passage
//   (`.claude/worktrees/ci-de-main-rendue.json`), cleared at the next green.
// - The reading covers the project and each other project of its group (`grillhouse.groupe`) that
//   no other live session of supervision holds, each under its name and its folder.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { nuitEnCours, plageDeNuit } from './bilan.mjs';
import { lireEtOuvrirLeDefautDeMain } from './ci-de-main.mjs';
import { lacherVerrou, prendreVerrou } from './verrou-de-fichier.mjs';
import { vivant } from './mesure/base-de-passe.mjs';
import { circuitsDuServeur, ServeurMuet } from './circuits-du-serveur.mjs';
import {
  attendLeSuperviseur,
  cleDe,
  estLue,
  lireLesRemontees,
  remonteesDe,
} from './tableau.mjs';
import { rappelDuProjet, reglageDuRappel } from './circuits-cles.mjs';
import { lireGroupe } from './groupe-cles.mjs';
import {
  etapeDuCircuit,
  libelle,
  REPONSES,
  RESPONSABLE,
  sansLesReponses,
  SUPERVISEUR,
} from './etapes.mjs';
import { sigleDuProjet } from './sigle-du-projet.mjs';
import {
  enFileSansArchitecture,
  enFileSurMain,
  lireLesExternes,
  lireLesTickets,
  lotEstSurMain,
} from './file-des-tickets.mjs';

const VERROU_SUPERVISEUR = 'grillhouse-superviseur.lock';
// In the common directory of git: the note of resumption of the supervisor, its declared milestone,
// and the start of the last night whose request was given.
const NOTE_DE_REPRISE = 'grillhouse-reprise.md';
const JALON = 'grillhouse-jalon.json';
const DEMANDE_DE_NUIT = 'grillhouse-demande-de-nuit.json';
// The message the greffon submits once the /clear of a renewal is done; the note, the questions and
// the circuits come with the opening.
const MESSAGE_DE_REPRISE =
  "Reprends la supervision : ta séance vient de se renouveler au jalon que tu as déclaré. L'ouverture te donne la note de reprise, les questions et les circuits : suis-la.";
const COQUILLES = new Set(['sh', 'bash', 'dash', 'zsh']);
// The name of the process of a session of the engine.
const MOTEUR = 'claude';

// The parent and the name of the process <pid>, from /proc; null when it does not read.
function processus(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fin = stat.lastIndexOf(')');
    const nom = stat.slice(stat.indexOf('(') + 1, fin);
    const parent = Number(stat.slice(fin + 2).split(' ')[1]);
    return { nom, parent };
  } catch {
    return null;
  }
}

/**
 * The session's process above <depart>: the first process named `claude`, whatever stands between
 * it and the command (the hook of the greffon, the frame's command, a shell), all gone at the end
 * of the command; without one (another engine), the first process that is not a shell. <lire>
 * gives the parent and the name of a process, null when it does not read.
 * @param {number} [depart]
 * @param {(pid: number) => { nom: string, parent: number } | null} [lire]
 * @returns {number}
 */
export function seance(depart = process.ppid, lire = processus) {
  let horsCoquille = null;
  let pid = depart;
  for (let i = 0; i < 32 && pid > 1; i++) {
    const p = lire(pid);
    if (!p) {
      break;
    }
    if (p.nom === MOTEUR) {
      return pid;
    }
    if (horsCoquille === null && !COQUILLES.has(p.nom)) {
      horsCoquille = pid;
    }
    pid = p.parent;
  }
  return horsCoquille ?? depart;
}

// Whether the process <pid> is above this one: the session that runs the command, whatever the
// processes between them (the `grillhouse` command's own, a shell).
function estAuDessus(pid) {
  let courant = process.ppid;
  for (let i = 0; i < 32 && courant > 1; i++) {
    if (courant === pid) {
      return true;
    }
    const p = processus(courant);
    if (!p) {
      return false;
    }
    courant = p.parent;
  }
  return false;
}

// The time in ms of <texte>, a `defer_until` as Beads writes it: the local wall time of the
// machine, followed by a « Z » it does not mean (`bd update --defer 17:30` gives `…T17:30:00Z`);
// NaN without one.
const heureMurale = texte => Date.parse(String(texte ?? '').replace(/Z$/, ''));

/**
 * Of the tickets <tickets> (as `bd show --json` gives them), the ids of those whose question does
 * not wait for the supervisor at <maintenant> (ms): closed, or deferred to a later time
 * (`defer_until`, the answer `--reporter <heure>`), as a review's snooze hides a request until its
 * hour, then shows it again.
 * @param {{ id: string, status?: string, defer_until?: string }[]} tickets
 * @param {number} maintenant
 * @returns {Set<string>}
 */
export function horsAttente(tickets, maintenant) {
  return new Set(
    tickets
      .filter(t => t.status === 'closed' || heureMurale(t.defer_until) > maintenant)
      .map(t => t.id)
  );
}

// Of the tickets <ids> of the repository at <racine>, those whose question does not wait now
// (`horsAttente`); null when bd does not read them (unknown, never « none »): a machine under
// load can take seconds to answer. One listing reads them all, whatever their number: `bd show`
// costs more than a second per ticket and overruns the time given when many circuits stand.
export function ticketsHorsAttente(racine, ids) {
  const r = spawnSync('bd', ['list', '--all', '--limit', '0', '--id', ids.join(','), '--json'], {
    cwd: racine,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 256 * 1024 * 1024,
  });
  try {
    const demandes = new Set(ids);
    return horsAttente(
      JSON.parse(r.stdout).filter(t => demandes.has(t.id)),
      Date.now()
    );
  } catch {
    return null;
  }
}

// The step where the circuit <c> stands, in words (« 3.1 Contrôles »), else its state's.
const ou = c => {
  const e = etapeDuCircuit({ ...c, raison: c.arret });
  return e ? libelle(e) : c.etape;
};

// The file of the stops gone up to the session of supervision (`remonteesDe`) is beside the states
// of the circuits (scripts/tableau.mjs reads it: its alerts).
const etatsDe = racine => path.join(racine, '.claude', 'worktrees');

// The integrations given by the waits of the repository at <racine>: `depuis`, the time (ms) of
// the last reading of the last wait, from which an integration is new; `rendues`, the keys of the
// integrations it gave, ended at that time or after. Absent or unreadable: none since <maintenant>.
const integrationsDe = racine => path.join(etatsDe(racine), 'integrations-rendues.json');
function lireLesIntegrations(racine, maintenant) {
  try {
    const lu = JSON.parse(readFileSync(integrationsDe(racine), 'utf8'));
    if (Number.isFinite(lu?.depuis) && Array.isArray(lu?.rendues)) {
      return { depuis: lu.depuis, rendues: new Set(lu.rendues.map(String)) };
    }
  } catch {
    // none yet
  }
  return { depuis: maintenant, rendues: new Set() };
}
// The alert of the CI of main of the project at <racine> (scripts/ci-de-main.mjs), read for the
// supervisor: `{ cle, texte }` for a red or a CI not read, null for a green (the alert clears),
// undefined for a project with no CI to read. The lots entered since the last green are named by
// git; nothing is kept but the reading, for five minutes.
export function ciDeMainDe(racine, o = {}) {
  const a = lireEtOuvrirLeDefautDeMain(racine, o);
  return a ? { cle: a.cle, texte: a.texte } : a;
}

// The alert of the CI of main given by the waits of the repository at <racine>, its key: kept while
// it stands, so that one is given once, cleared at the next green and given again if it comes back.
const ciDeMainRendue = racine => path.join(etatsDe(racine), 'ci-de-main-rendue.json');
function lireLaCiDeMainRendue(racine) {
  try {
    const lu = JSON.parse(readFileSync(ciDeMainRendue(racine), 'utf8'));
    return typeof lu?.cle === 'string' ? lu.cle : null;
  } catch {
    return null;
  }
}
function ecrireLaCiDeMainRendue(racine, cle) {
  const f = ciDeMainRendue(racine);
  try {
    mkdirSync(path.dirname(f), { recursive: true });
    const provisoire = `${f}.${process.pid}`;
    writeFileSync(provisoire, `${JSON.stringify({ cle })}\n`);
    renameSync(provisoire, f);
  } catch {
    // kept as it was
  }
}

// The alert of the CI of main <alerte> (`{ cle, texte }`, null at a green) as a question, when it is
// not the one already given; the file keeps the key that stands.
function releverLaCiDeMain(racine, alerte, toutes) {
  const avant = lireLaCiDeMainRendue(racine);
  const cle = alerte?.cle ?? null;
  if (cle !== avant) {
    ecrireLaCiDeMainRendue(racine, cle);
  }
  if (!alerte || (cle === avant && !toutes)) {
    return [];
  }
  return [
    {
      ticket: 'CI de main',
      etape: '5 Intégration',
      question: alerte.texte,
      qui: SUPERVISEUR,
      commande: 'gh run list --branch main',
      cle: `ci-de-main ${alerte.cle}`,
    },
  ];
}

// A file that cannot be written never costs the batch: the next wait reads the former one.
function ecrireLesIntegrations(racine, depuis, rendues) {
  const f = integrationsDe(racine);
  try {
    mkdirSync(path.dirname(f), { recursive: true });
    const provisoire = `${f}.${process.pid}`;
    writeFileSync(provisoire, `${JSON.stringify({ depuis, rendues: [...rendues].sort() })}\n`);
    renameSync(provisoire, f);
  } catch {
    // kept as it was
  }
}

// The file of the stops gone up as text: each stop with its key, its times, and its reading and its
// mark when it has them, sorted by key.
const enTexteDesRemontees = liste =>
  `${JSON.stringify(
    {
      remontees: liste
        .map(r => ({
          cle: r.cle,
          depuis: r.depuis,
          presentee: r.presentee,
          ...(Number.isFinite(r.lue) ? { lue: r.lue } : {}),
          ...(Number.isFinite(r.chez) ? { chez: r.chez } : {}),
        }))
        .sort((a, b) => a.cle.localeCompare(b.cle, 'en')),
    },
    null,
    2
  )}\n`;

// Writes the file of the stops gone up of <racine> as <ecrit> when it differs from what it holds
// (<rien>: nothing to write when no file yet), by a rename. Under the lock of the file.
function ecrireLesRemontees(racine, ecrit, rien = false) {
  const f = remonteesDe(racine);
  let enFichier = '';
  try {
    enFichier = readFileSync(f, 'utf8');
  } catch {
    // no file yet
  }
  if (ecrit !== enFichier && !rien) {
    const provisoire = `${f}.${process.pid}`;
    writeFileSync(provisoire, ecrit);
    renameSync(provisoire, f);
  }
}

// Changes the entries of the file of the stops gone up of <racine> by <change> (entry → entry), under
// its lock; nothing is written when no file holds a stop.
function changerLesRemontees(racine, change) {
  const f = remonteesDe(racine);
  if (!lireLesRemontees(racine, Date.now()).length) {
    return;
  }
  mkdirSync(path.dirname(f), { recursive: true });
  const verrou = `${f}.verrou`;
  prendreVerrou(verrou, { attendre: true, perime: 30_000 });
  try {
    ecrireLesRemontees(racine, enTexteDesRemontees(lireLesRemontees(racine, Date.now()).map(change)));
  } finally {
    lacherVerrou(verrou);
  }
}

/**
 * A turn of the session read, at <lueA> ms, the messages sent up to <envoyeesAvant> ms: each stop of
 * the file of the stops gone up of <racine> sent by then and not read since its last sending is
 * read at <lueA>. A stop read keeps the time of its reading. The opening and the greffon's turn
 * (`superviseur --lue`) call it.
 * @param {string} racine
 * @param {{ lueA: number, envoyeesAvant: number }} options
 */
export function marquerLues(racine, { lueA, envoyeesAvant }) {
  changerLesRemontees(racine, r =>
    r.presentee <= envoyeesAvant && !estLue(r) ? { ...r, lue: lueA } : r
  );
}

/**
 * The supervisor carried the question of the stop <cle> to the owner, at <depuisA> ms: it is
 * silent until the circuit answers (its stop leaves the file, and the mark with it).
 * @param {string} racine
 * @param {{ cle: string, depuisA: number }} options
 * @returns {boolean} whether the file holds that stop (the question was sent)
 */
export function marquerChezLeResponsable(racine, { cle, depuisA }) {
  changerLesRemontees(racine, r => (r.cle === cle ? { ...r, chez: depuisA } : r));
  return lireLesRemontees(racine, depuisA).some(r => r.cle === cle);
}

/**
 * One reading of the circuits <circuits> (those integrated included) of the repository at <racine>,
 * at <maintenant> ms, under the lock of the file of the stops gone up; what the greffon of the
 * session of supervision submits, and the opening lists. Each stop that waits for the supervisor
 * and never went up, or whose last presentation is <rappelMs> ms old or more (<toutes>: every
 * one), is given, its ticket <fermes> gives closed left out (bd is asked of those alone); a stop
 * given is presented now, and one that goes up has its `depuis` set now. The file is written whole
 * with the stops that still stand, their circuit waiting for the supervisor: a question answered
 * so leaves it, and the next stop of its circuit is new. The end of a circuit integrated since the
 * last reading is given once (`integre`; the file of the integrations holds the time of that
 * reading), and the alert of the CI of main <ciDeMain> (`{ cle, texte }`; null at a green, which
 * clears it; undefined when it is not read, which keeps what was given) once per passage. The
 * result is the questions given, each marked `representee` when it comes back, then the ends, then
 * the alert of the CI of main.
 * @param {string} racine
 * @param {import('./circuits-du-serveur.mjs').CircuitDuServeur[]} circuits
 * @param {{ fermes: (racine: string, ids: string[]) => Set<string> | null, maintenant: number, rappelMs: number, toutes?: boolean, ciDeMain?: { cle: string, texte: string } | null }} options
 * @returns {{ ticket: string, etape: string, question: string, qui: string, commande: string, cle: string, representee?: boolean, integre?: boolean }[]}
 */
export function relever(
  racine,
  circuits,
  { fermes, maintenant, rappelMs, toutes = false, ciDeMain }
) {
  const f = remonteesDe(racine);
  mkdirSync(path.dirname(f), { recursive: true });
  const verrou = `${f}.verrou`;
  // Held for one reading of the circuits: older than that, abandoned.
  prendreVerrou(verrou, { attendre: true, perime: 30_000 });
  try {
    const { depuis: depuisIntegrations, rendues } = lireLesIntegrations(racine, maintenant);
    const integres = circuits
      .filter(
        c => c.integre && c.fin !== null && c.fin >= depuisIntegrations && !rendues.has(cleDe(c))
      )
      .map(enFin)
      .sort((a, b) => a.ticket.localeCompare(b.ticket, 'en'));
    const fins = new Map(circuits.map(c => [cleDe(c), c.fin]));
    ecrireLesIntegrations(
      racine,
      maintenant,
      [...rendues, ...integres.map(i => i.cle)].filter(
        k => (fins.get(k) ?? -Infinity) >= maintenant
      )
    );
    const rouges = ciDeMain === undefined ? [] : releverLaCiDeMain(racine, ciDeMain, toutes);
    circuits = circuits.filter(c => !c.integre);
    const avant = new Map(lireLesRemontees(racine, maintenant).map(r => [r.cle, r]));
    const debout = questionsEnAttente(racine, circuits, { fermes: aucunFerme });
    // A question comes back from its reading, never from its sending: one read, not carried to the
    // owner, whose delay has passed since its reading. One still in the queue (sent, unread) or
    // carried to the owner is never given again.
    const aRendre = debout.filter(q => {
      const r = avant.get(q.cle);
      return (
        toutes ||
        !r ||
        (estLue(r) && r.chez === undefined && maintenant - r.lue >= rappelMs)
      );
    });
    const fermesDe = aRendre.length
      ? fermes(
          racine,
          aRendre.map(q => q.ticket)
        )
      : new Set();
    // Tickets that do not read: nothing is given at this reading, nor counted presented, so that
    // the next reading that reads them gives what still waits.
    const lisible = fermesDe !== null;
    const rendu = lisible
      ? aRendre
          .filter(q => !fermesDe.has(q.ticket))
          .map(q => (avant.has(q.cle) && !toutes ? { ...q, representee: true } : q))
      : [];
    // A question whose ticket is closed is not given, so not counted presented: it is given once
    // its ticket waits again.
    const presentes = new Set(rendu.map(q => q.cle));
    // A question never presented, its ticket unread, is not written: the next reading gives it.
    // Sent now, it is sent: its reading (`lue`) is the turn's, and its mark (`chez`) the supervisor's.
    const ecrit = enTexteDesRemontees(
      debout
        .filter(q => presentes.has(q.cle) || avant.has(q.cle))
        .map(q => {
          const r = avant.get(q.cle);
          return {
            ...(r ?? {}),
            cle: q.cle,
            depuis: r?.depuis ?? maintenant,
            presentee: presentes.has(q.cle) ? maintenant : r.presentee,
          };
        })
    );
    ecrireLesRemontees(racine, ecrit, debout.length === 0 && avant.size === 0);
    return [...rendu, ...integres, ...rouges];
  } finally {
    lacherVerrou(verrou);
  }
}

// The question that waits for the supervisor from the circuit <c>: its ticket, its step, its
// question, who must answer it, the command that answers it, and its stop's key.
const enQuestion = c => ({
  ticket: c.ticket,
  etape: ou(c),
  question:
    c.question ??
    `arrêt ${c.arret}${c.code === null ? '' : ` (code ${c.code})`}${c.raison ? ` : ${c.raison}` : ''}`,
  qui: c.qui ?? SUPERVISEUR,
  // The answers the client accepts, as it gives them (src/temporal/circuit/client.ts).
  commande: c.reponse,
  cle: cleDe(c),
  interrompu: c.interrompu,
  arret: c.arret,
});

// The end of the circuit <c> integrated, given once by the wait: its ticket, its step, and its key.
const enFin = c => ({
  ticket: c.ticket,
  etape: '5 Intégration',
  question: 'son lot est sur main.',
  qui: SUPERVISEUR,
  commande: '',
  cle: cleDe(c),
  integre: true,
});

// Of the circuits <lus> of the repository at <racine>, those whose ticket <fermes> does not give
// closed, sorted by ticket.
function enAttente(lus, racine, fermes) {
  const ferme = lus.length
    ? fermes(
        racine,
        lus.map(c => c.ticket)
      )
    : new Set();
  // Tickets that do not read: no question can be told waiting, none is.
  if (ferme === null) {
    return [];
  }
  return lus
    .filter(c => !ferme.has(c.ticket))
    .sort((a, b) => a.ticket.localeCompare(b.ticket, 'en'));
}

/**
 * The questions that wait for the supervisor among the circuits <circuits> of the repository at
 * <racine> (scripts/circuits-du-serveur.mjs), the one source of the opening
 * (`circuitsALOuverture`) and of the reading (`relever`), by the rule the board's
 * « ⤷ Question » reads too (scripts/tableau.mjs `attendLeSuperviseur`): each circuit stopped on a
 * question (any stop but the supervisor's own « arrete », « à repasser » included) or ended
 * without its issue, those whose stop's key <sauf> holds left out, then those whose ticket
 * <fermes> gives closed (bd is asked of the others alone), sorted by ticket. Each one says whether
 * its circuit ended without its issue (`interrompu`) and its stop (`arret`).
 * @param {string} racine the root of the repository
 * @param {import('./circuits-du-serveur.mjs').CircuitDuServeur[]} circuits
 * @param {{ fermes?: (racine: string, ids: string[]) => Set<string> | null, sauf?: Set<string> }} options
 * @returns {{ ticket: string, etape: string, question: string, qui: string, commande: string, cle: string, interrompu: boolean, arret: string | null }[]}
 */
export function questionsEnAttente(
  racine,
  circuits,
  { fermes = ticketsHorsAttente, sauf = new Set() } = {}
) {
  return enAttente(
    circuits.filter(c => attendLeSuperviseur(c) && !sauf.has(cleDe(c))),
    racine,
    fermes
  ).map(enQuestion);
}

// No ticket closed: the questions read without asking bd.
const aucunFerme = () => new Set();

// The command that answers the question <q>, played from <dossier> when it is another project's:
// the command of the circuit of its ticket, its answer left to the supervisor (the answers are
// listed once, at the opening of the session), or the command of a question of no circuit (the CI
// of main), as it is.
const commandeDe = (q, dossier) => {
  const duCircuit = `npx grillhouse circuit ${q.ticket}`;
  const commande = String(q.commande ?? '').startsWith(`${duCircuit} `)
    ? `${duCircuit} <réponse>`
    : String(q.commande ?? '');
  return commande && dossier ? `env -C ${dossier} ${commande}` : commande;
};

// The head of the line of <q>: what it is, its ticket, its step, its stop, and who answers it when
// it is not the supervisor; under the sigle of its project (<o.sigle>) when it is another one's.
const teteDe = (q, genre, { sigle } = {}) =>
  [
    `${sigle ? `[${sigle}] ` : ''}${genre}`,
    q.ticket,
    q.etape,
    ...(q.arret ? [q.arret] : []),
    ...(q.qui && q.qui !== SUPERVISEUR ? [`au ${q.qui}`] : []),
  ].join(' · ');

/**
 * The lines of one question in the one rendering of the questions, shared by the message of the
 * greffon, the opening and the hooks of the session: its head, its question without the list of
 * the answers, and the command that answers it. A question presented again (`representee`) is its
 * head alone, and one that waits at a hook of the session too (<o.courte>). <o.sigle> and
 * <o.dossier> name the project of the question when it is not the session's.
 */
export const ligneDeQuestion = (q, o = {}) => {
  if (q.representee) {
    const tete = teteDe(q, 'Toujours sans réponse', o);
    const commande = o.courte ? '' : commandeDe(q, o.dossier);
    // The reminder names the answer of a question carried to the owner beside the command of the circuit.
    return commande.endsWith('<réponse>')
      ? `${tete}\n→ ${commande} ou --chez-le-responsable`
      : tete;
  }
  const tete = teteDe(q, 'Question', o);
  const commande = commandeDe(q, o.dossier);
  return o.courte
    ? tete
    : [tete, sansLesReponses(q.question), ...(commande ? [`→ ${commande}`] : [])].join('\n');
};

/**
 * The message the greffon submits to the session of supervision for the questions <questions> of
 * one reading (`relever`), and the lines of the opening: for each one, its ticket, step, who must
 * answer it, its question and the command that answers it; then each end of a circuit integrated
 * (`integre`), its ticket and its step. A question presented again (`representee`) says that it
 * still waits for an answer.
 * @param {{ ticket: string, etape: string, question: string, qui: string, commande: string, representee?: boolean, integre?: boolean }[]} questions
 * @returns {string}
 */
export function texteDesQuestions(questions, o = {}) {
  const fins = questions.filter(q => q.integre);
  const attente = questions.filter(q => !q.integre);
  return [
    ...attente.map(q => ligneDeQuestion(q, o)),
    ...fins.map(q => `${o.sigle ? `[${o.sigle}] ` : ''}Intégré · ${q.ticket}`),
  ].join('\n');
}

/**
 * The section a session of supervision receives at its opening in <racine>, when it takes the lock:
 * what the greffon does (it pushes the questions into the queue of the session, the answer
 * acknowledges them); then the circuits of the repository,
 * those whose ticket <fermes> gives closed left out: each one that runs, named; each one stopped on
 * a question (a stop other than the supervisor's own « arrete »), with its question and the command
 * that answers it, in the lines of the shared rendering (`ligneDeQuestion`); each one ended without
 * its issue, with the command that resumes it. All the questions that wait are listed, those
 * already pushed included, and counted presented: the greffon does not give them again before
 * their re-presentation. Last, « ## La
 * file des tickets » names the tickets of the queue without their section « ## Architecture »
 * (`enFileSansArchitecture` of scripts/file-des-tickets.mjs, the tickets read by <ticketsDe>,
 * `lireLesTickets` by default; a Beads that fails says nothing), which the queue never starts,
 * then those whose lot is already on main (`enFileSurMain`, main read by <surMainDe>,
 * `lotEstSurMain` by default), which it never starts again.
 * @param {string} racine the root of the repository
 * The circuits are read once, by <circuitsDe> (lists of the Temporal server that it filters,
 * scripts/circuits-du-serveur.mjs, by default); a server that does not answer is said, and no
 * question goes up.
 * @param {{ fermes?: (racine: string, ids: string[]) => Set<string> | null,
 *   circuitsDe?: (racine: string) => Promise<import('./circuits-du-serveur.mjs').CircuitDuServeur[]>,
 *   ticketsDe?: (racine: string) => import('./file-des-tickets.mjs').TicketDeBeads[],
 *   surMainDe?: (racine: string) => (id: string) => boolean }} options
 * @returns {Promise<string>}
 */
export async function circuitsALOuverture(
  racine,
  {
    fermes = ticketsHorsAttente,
    circuitsDe = circuitsDuServeur,
    ticketsDe = lireLesTickets,
    surMainDe = lotEstSurMain,
  } = {}
) {
  let circuits = null;
  let panne = null;
  try {
    circuits = await circuitsDe(racine);
  } catch (e) {
    const message = String(e?.message ?? e).split('\n')[0];
    panne =
      e instanceof ServeurMuet
        ? `${e.message} : les circuits ne se lisent pas.`
        : `Les circuits ne se lisent pas : ${message}.`;
  }
  ecrireLesIntegrations(racine, Date.now(), []);
  const ouverteA = Date.now();
  const questions = circuits
    ? relever(racine, circuits, {
        fermes,
        maintenant: ouverteA,
        rappelMs: rappelDuProjet(racine) * 60_000,
        toutes: true,
        ciDeMain: ciDeMainDe(racine),
      }).filter(q => !q.integre)
    : [];
  // The opening lists every question that waits: the session reads them, and their reminder runs
  // from now (a question sent to a closed session, or whose message was never recognised, included).
  marquerLues(racine, { lueA: ouverteA, envoyeesAvant: ouverteA });
  const tournent = enAttente(
    (circuits ?? []).filter(c => c.vivant),
    racine,
    fermes
  ).map(c => ({ ticket: c.ticket, ligne: `- ${c.ticket} tourne, à ${ou(c)}.` }));
  const enLigne = q => ({
    ticket: q.ticket,
    ligne: q.interrompu
      ? `- ${q.ticket} a fini sans son issue (aucun arrêt écrit), à ${q.etape} : relance-le sans attendre le mot du responsable, \`${q.commande}\`.`
      : ligneDeQuestion(q),
  });
  let sansArchitecture = [];
  let dejaSurMain = [];
  try {
    const tickets = ticketsDe(racine);
    const enCours = new Set((circuits ?? []).map(c => c.ticket));
    sansArchitecture = enFileSansArchitecture(tickets, { enCours }).map(t => t.id);
    dejaSurMain = enFileSurMain(tickets, {
      enCours,
      externes: lireLesExternes(racine, tickets),
      surMain: surMainDe(racine),
    }).map(t => t.id);
  } catch {
    // Beads fails: the board says it, the opening names no ticket.
  }
  const nommes = [...tournent, ...questions.map(enLigne)].sort((a, b) =>
    a.ticket.localeCompare(b.ticket, 'en')
  );
  return [
    '## Les questions des circuits',
    "Le greffon de ta séance pousse dans la file de tes messages chaque question neuve d'un circuit du dépôt, quel que soit son lanceur, et chaque fin de circuit, une fois ; il n'y a aucune attente à lancer. Une question sans réponse revient une fois lue, à intervalle réglable depuis sa lecture (`grillhouse.rappel`, 10 min par défaut) : ta réponse au circuit l'acquitte, et répondue elle ne revient plus ; une question que tu as portée au responsable se tait par `npx grillhouse circuit <ticket> --chez-le-responsable`, jusqu'à la réponse du circuit. Tu ne te mets pas en attente du responsable tant qu'une question d'un circuit attend ta réponse : le crochet de fin de tour te le rappelle. Les questions en attente sont listées ci-dessous.",
    ...(panne ? ['', '## Les circuits du dépôt', panne] : []),
    ...(nommes.length ? ['', '## Les circuits du dépôt', ...nommes.map(n => n.ligne)] : []),
    ...(questions.length ? ['', `Les réponses à une question : ${REPONSES}`] : []),
    ...(sansArchitecture.length || dejaSurMain.length ? ['', '## La file des tickets'] : []),
    ...(sansArchitecture.length
      ? [
          `En file sans architecture : ${sansArchitecture.join(', ')}. La file ne démarre pas un ticket sans la section « ## Architecture » de sa description : écris-la (le modèle mûr, l'adresse, le mécanisme commun), puis la file le démarre.`,
        ]
      : []),
    ...(dejaSurMain.length
      ? [
          `En file, lot déjà sur main : ${dejaSurMain.join(', ')}. La file ne relance pas un ticket dont le lot est sur main, resté ouvert ou rouvert : ferme-le (\`bd close <ticket> --reason "intégré : <commit>"\`, une dépendance ouverte levée d'abord), et ouvre un ticket neuf pour ce qui reste à faire.`,
        ]
      : []),
  ].join('\n');
}

const git = (racine, ...args) =>
  spawnSync('git', ['-C', racine, 'rev-parse', '--path-format=absolute', ...args], {
    encoding: 'utf8',
  });

// Where the session of supervision of the directory <dossier> stands: the common directory of git
// and the lock; `refus` says why <dossier> or the session has none (a role's session, out of git, a
// copy).
function depotDuSuperviseur(dossier, env) {
  if (env.BEADS_ACTOR) {
    return { refus: "la séance d'un rôle ne supervise pas" };
  }
  const r = git(dossier, '--git-dir', '--git-common-dir');
  if (r.status !== 0) {
    return { refus: `${dossier} n'est pas dans un dépôt git` };
  }
  const [dossierGit, commun] = r.stdout.trim().split('\n');
  if (path.resolve(dossierGit) !== path.resolve(commun)) {
    return { refus: 'une copie de ticket ne supervise pas : joue la commande à la racine du dépôt' };
  }
  return { commun, verrou: path.join(commun, VERROU_SUPERVISEUR) };
}

// The process the lock <verrou> names; null when no lock reads.
function tenantDe(verrou) {
  try {
    const pid = Number(/^(\d+)/.exec(readFileSync(verrou, 'utf8'))?.[1]);
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

// `depotDuSuperviseur` for the session that holds the lock alone, its process in `tenant`.
function laSeanceQuiTient(dossier, env) {
  const depot = depotDuSuperviseur(dossier, env);
  if (depot.refus) {
    return depot;
  }
  const tenant = tenantDe(depot.verrou);
  return tenant !== null && estAuDessus(tenant)
    ? { ...depot, tenant }
    : { refus: 'cette séance ne tient pas le verrou du superviseur' };
}

// Writes <texte> whole into <f>, by a rename.
function ecrireEntier(f, texte) {
  const provisoire = `${f}.${process.pid}`;
  writeFileSync(provisoire, texte);
  renameSync(provisoire, f);
}

function lireJson(f) {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

function lireTexte(f) {
  try {
    return readFileSync(f, 'utf8');
  } catch {
    return '';
  }
}

// The gesture of the holder of the lock on the note: <ecrire> is given its session and the text of
// <fichier>. Code 2 and the reason, nothing written, when the session or the file is refused.
function surLaNote(dossier, fichier, env, ecrire) {
  const session = laSeanceQuiTient(dossier, env);
  if (session.refus) {
    return { code: 2, raison: session.refus };
  }
  let texte;
  try {
    texte = readFileSync(fichier, 'utf8');
  } catch {
    return { code: 2, raison: `le fichier ${fichier} ne se lit pas` };
  }
  if (!texte.trim()) {
    return { code: 2, raison: `le fichier ${fichier} est vide` };
  }
  ecrire(session, texte);
  return { code: 0, raison: '' };
}

/**
 * The session that holds the lock of the supervisor of <dossier> declares a milestone: the text of
 * <fichier> replaces its note of resumption whole, and the milestone, which holds for the context
 * that declares it, replaces the one before (`superviseur --jalon`).
 * @param {string} dossier
 * @param {string} fichier
 * @param {{ env?: Record<string, string | undefined> }} [options]
 * @returns {Promise<{ code: number, raison: string }>} code 2 and its reason, nothing written, on a
 * refusal
 */
export async function declarerLeJalon(dossier, fichier, { env = process.env } = {}) {
  return surLaNote(dossier, fichier, env, ({ commun, tenant }, texte) => {
    ecrireEntier(path.join(commun, NOTE_DE_REPRISE), texte);
    ecrireEntier(path.join(commun, JALON), `${JSON.stringify({ declareA: Date.now(), tenant })}\n`);
  });
}

/**
 * The session that holds the lock adds the text of <fichier> at the end of its note of resumption,
 * which it creates when there is none; no milestone is declared (`superviseur --question`).
 * @param {string} dossier
 * @param {string} fichier
 * @param {{ env?: Record<string, string | undefined> }} [options]
 * @returns {Promise<{ code: number, raison: string }>} code 2 and its reason, nothing written, on a
 * refusal
 */
export async function ajouterLaQuestion(dossier, fichier, { env = process.env } = {}) {
  return surLaNote(dossier, fichier, env, ({ commun }, texte) => {
    const note = path.join(commun, NOTE_DE_REPRISE);
    const avant = lireTexte(note);
    const joint = avant ? `${avant.replace(/\n*$/, '')}\n\n` : '';
    ecrireEntier(note, `${joint}${texte}`);
  });
}

/**
 * The message of resumption when the renewal of the session of supervision of <dossier> is due,
 * empty otherwise (`superviseur --renouveler`): the session holds the lock, a milestone it declared
 * stands, and a quiet Stop (<arretA>, ms, 0 without one) is later than it. A message of the owner
 * (<messageA>, ms, 0 without one) later than the declaration cancels the milestone. The reading
 * keeps a milestone that is due: the opening that follows the /clear removes it.
 * @param {string} dossier
 * @param {{ arretA: number, messageA: number, env?: Record<string, string | undefined> }} options
 * @returns {Promise<string>}
 */
export async function renouvellement(dossier, { arretA, messageA, env = process.env }) {
  const session = laSeanceQuiTient(dossier, env);
  if (session.refus) {
    return '';
  }
  const f = path.join(session.commun, JALON);
  const jalon = lireJson(f);
  if (!jalon || jalon.tenant !== session.tenant) {
    return '';
  }
  if (messageA > jalon.declareA) {
    rmSync(f, { force: true });
    return '';
  }
  return arretA > jalon.declareA ? MESSAGE_DE_REPRISE : '';
}

// The section the opening gives of the note of resumption <note>; empty when none is written.
function laNote(note) {
  const texte = lireTexte(note).trimEnd();
  return texte
    ? [
        '## La note de reprise',
        `Elle est au fichier \`${note}\` : lis-le en entier si ce texte est coupé.`,
        '',
        texte,
      ].join('\n')
    : '';
}

// What the opening that follows a /clear asks, before the circuits and the note.
const APRES_CLEAR = [
  '## Reprise de la supervision après un /clear',
  'Charge la compétence `grillhouse:pitmaster`, puis reprends la note de reprise donnée plus bas ; ne fais aucun tour complet.',
  'À ton premier tour, quel que soit le message qui l’ouvre, repose au responsable la question que la note tient en attente.',
].join('\n');

/**
 * The check of the supervisor at the opening of a session in <dossier> (greffon.md, §5.2): what it
 * says (empty when nothing), the lock taken when it is free. <source> is the one of the
 * SessionStart hook. The session that takes the lock, and the holder after a /clear, receive the
 * circuits and the note of resumption; every opening of the holder but after a compaction removes
 * the declared milestone.
 * @param {string} dossier the directory the session opens in
 * @param {{ source?: string, env?: Record<string, string | undefined>, circuitsDe?: (racine: string) => Promise<import('./circuits-du-serveur.mjs').CircuitDuServeur[]> }} [options]
 * @returns {Promise<string>}
 */
export async function ouvertureDuSuperviseur(
  dossier,
  { source = 'startup', env = process.env, circuitsDe = circuitsDuServeur } = {}
) {
  const depot = depotDuSuperviseur(dossier, env);
  if (depot.refus) {
    return '';
  }
  const { commun, verrou } = depot;
  const moi = seance();
  const tenait = tenantDe(verrou) === moi;
  if (!tenait && !prendreVerrou(verrou, { attendre: false, pid: moi })) {
    return unAutreSuperviseur(verrou, moi);
  }
  if (source !== 'compact') {
    rmSync(path.join(commun, JALON), { force: true });
  }
  if (tenait && source !== 'clear') {
    return '';
  }
  return [
    source === 'clear' ? APRES_CLEAR : '',
    await circuitsALOuverture(path.dirname(commun), { circuitsDe }),
    laNote(path.join(commun, NOTE_DE_REPRISE)),
  ]
    .filter(Boolean)
    .join('\n\n');
}

// The section a session receives when another live one holds the lock <verrou>; empty when none does.
function unAutreSuperviseur(verrou, moi) {
  const autre = tenantDe(verrou);
  if (!autre || autre === moi || !vivant(autre)) {
    return '';
  }
  let depuis = '';
  try {
    depuis = `, depuis le ${statSync(verrou).mtime.toLocaleString('fr-FR')}`;
  } catch {
    // the lock is gone meanwhile: its date is not said
  }
  return [
    '## Un autre superviseur tient ce dépôt',
    `La séance de supervision du processus ${autre} tient le verrou de ce dépôt (${verrou}${depuis}). Un projet a un seul superviseur, comme Zuul a un seul ordonnanceur : dis-le au responsable dès ta première réponse, et ne lance aucun circuit, ni à la main aucune livraison, tant que cette séance tient le verrou. Il se libère quand elle se ferme ; la séance suivante le reprend.`,
  ].join('\n');
}

// Whether a question of the circuits <circuits> of the repository at <racine> waits for the
// supervisor, read or not: neither addressed to the owner, nor carried to him, nor deferred to a
// later time, its ticket open. null when the tickets do not read.
function uneQuestionAttend(racine, circuits) {
  const chez = new Set(
    lireLesRemontees(racine, Date.now())
      .filter(r => r.chez !== undefined)
      .map(r => r.cle)
  );
  const debout = circuits.filter(
    c => attendLeSuperviseur(c) && c.qui !== RESPONSABLE && !chez.has(cleDe(c))
  );
  if (!debout.length) {
    return false;
  }
  const hors = ticketsHorsAttente(
    racine,
    debout.map(c => c.ticket)
  );
  return hors === null ? null : debout.some(c => !hors.has(c.ticket));
}

// The request the reading submits to the session, for the reason <raison>.
const demandeDuJalon = raison =>
  `Jalon · ${raison} : écris ta note de reprise et déclare le jalon (compétence \`grillhouse:pitmaster\`), par \`npx grillhouse superviseur --jalon <fichier>\`.`;

/**
 * One reading for the greffon of the session of supervision of the repository at <racine>
 * (`npx grillhouse superviseur --relever`): the message of what `relever` gives (the questions of
 * the circuits due, the ends of circuits, the reds of main), empty when it gives nothing, when the
 * circuits do not read, or when the session that runs it is not the one that holds the lock of the
 * supervisor (a role's session, an agent's copy, another project's, a session that took no lock).
 * The interval of the re-presentation is the key `grillhouse.rappel` of the project, applied at
 * each reading. The session reads too each other project of its group (`grillhouse.groupe`) that
 * no other live session of supervision holds (`voisinsSansSuperviseur`): its part follows, under
 * the name and the folder of that project, where its answers are played, with that project's own
 * interval and state. A fault in the reading of one of these projects costs the others nothing: it
 * is thrown once all are read, each project at fault named with its reason, the message of the
 * others in the `texte` of the error. Last comes the request to write the note of resumption and
 * declare a milestone: after a compaction (<compaction>), and once for each night of the project
 * (`grillhouse.plageDeNuit`) at a reading where every project read says that no question waits for
 * the supervisor.
 * @param {string} racine
 * @param {{ env?: Record<string, string | undefined>, compaction?: boolean, circuitsDe?: (racine: string, options?: { integres?: boolean }) => Promise<import('./circuits-du-serveur.mjs').CircuitDuServeur[]> }} [options]
 * @returns {Promise<string>}
 * @throws {Error} `grillhouse.rappel` of the project of the session is at fault, named with its
 * value; or the reading of another project of the group failed (its `texte`: the others' message)
 */
export async function releverPourLeGreffon(
  racine,
  { env = process.env, circuitsDe = circuitsDuServeur, compaction = false } = {}
) {
  const depot = depotDuSuperviseur(racine, env);
  if (depot.refus) {
    return '';
  }
  const { commun, verrou } = depot;
  let tenant = tenantDe(verrou);
  if (tenant === null) {
    return '';
  }
  // A lock whose process is gone is taken over, as the opening does: the session that reads holds it.
  if (!estAuDessus(tenant) && !vivant(tenant)) {
    const moi = seance();
    tenant = prendreVerrou(verrou, { attendre: false, pid: moi }) ? moi : null;
  }
  if (tenant === null || !estAuDessus(tenant)) {
    return '';
  }
  const demandeNocturne = path.join(commun, DEMANDE_DE_NUIT);
  const nuit = nuitEnCours(Date.now(), plageDeNuit(racine));
  const aDemander = nuit !== null && lireJson(demandeNocturne)?.nuit !== nuit;
  const apresCompaction = compaction ? demandeDuJalon('une compaction a eu lieu') : '';
  const parts = [];
  try {
    parts.push(await leReleveDe(racine, circuitsDe, { nocturne: aDemander }));
  } catch (e) {
    throw Object.assign(e, { texte: apresCompaction });
  }
  const fautes = [];
  for (const p of voisinsSansSuperviseur(racine)) {
    try {
      parts.push(await leReleveDe(p.chemin, circuitsDe, { voisin: true, nocturne: aDemander }));
    } catch (e) {
      fautes.push(`${path.basename(p.chemin)} : ${e.message}`);
    }
  }
  let demande = apresCompaction;
  if (aDemander && !fautes.length && parts.every(p => p.attend === false)) {
    ecrireEntier(demandeNocturne, `${JSON.stringify({ nuit })}\n`);
    demande ||= demandeDuJalon('la nuit a commencé');
  }
  const texte = [...parts.map(p => p.texte), demande].filter(Boolean).join('\n\n');
  if (fautes.length) {
    throw Object.assign(new Error(fautes.join('\n')), { texte });
  }
  return texte;
}

// The package.json of the project at <racine>; empty when it does not read.
function paquetDe(racine) {
  try {
    return JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

// One reading of the project at <racine>, under its own interval (`grillhouse.rappel`) and its own
// state of the questions presented: `texte`, its message, empty when it gives nothing or when its
// circuits do not read; `attend`, read for the request of the night (<o.nocturne>), whether a
// question waits for the supervisor (`uneQuestionAttend`), null when unknown. A faulty interval
// throws, the project of the session named (a neighbour is named by the caller, as for any fault of
// its reading).
async function leReleveDe(racine, circuitsDe, { voisin = false, nocturne = false } = {}) {
  const { minutes, faute } = reglageDuRappel(paquetDe(racine));
  if (faute) {
    throw new Error(voisin ? faute : `${path.basename(racine)} : ${faute}`);
  }
  let circuits;
  try {
    circuits = await circuitsDe(racine, { integres: true });
  } catch {
    return { texte: '', attend: null };
  }
  const lot = relever(racine, circuits, {
    fermes: ticketsHorsAttente,
    maintenant: Date.now(),
    rappelMs: minutes * 60_000,
    ciDeMain: ciDeMainDe(racine),
  });
  // Another project's part bears its sigle, and its commands the folder they are played in.
  const projet = voisin
    ? { sigle: sigleDuProjet(racine).sigle ?? path.basename(racine), dossier: racine }
    : {};
  return {
    texte: lot.length ? texteDesQuestions(lot, projet) : '',
    attend: nocturne ? uneQuestionAttend(racine, circuits) : null,
  };
}

// The other projects of the group of the project at <racine> (`grillhouse.groupe`) that no other
// live session of supervision holds: one session supervises them with its own, and reads them
// too; a project whose lock another live session holds is read by that session.
function voisinsSansSuperviseur(racine) {
  const soi = path.resolve(racine);
  const { groupe } = lireGroupe(paquetDe(racine), racine);
  return (groupe?.projets ?? [])
    .filter(p => p.chemin !== soi)
    .filter(p => {
      const r = git(p.chemin, '--git-common-dir');
      if (r.status !== 0) {
        return false;
      }
      let tenant;
      try {
        tenant = Number(
          /^(\d+)/.exec(readFileSync(path.join(r.stdout.trim(), VERROU_SUPERVISEUR), 'utf8'))?.[1]
        );
      } catch {
        return true;
      }
      return !Number.isInteger(tenant) || estAuDessus(tenant) || !vivant(tenant);
    });
}

// The root of the repository at <dossier>, its main tree for a copy; <dossier> out of git.
function racineDe(dossier) {
  const r = git(dossier, '--git-common-dir');
  return r.status === 0 ? path.dirname(r.stdout.trim()) : dossier;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv[2] === '--jalon' || process.argv[2] === '--question') {
    // superviseur --jalon|--question <fichier> : played from the root of the repository.
    const geste = process.argv[2] === '--jalon' ? declarerLeJalon : ajouterLaQuestion;
    const { code, raison } = process.argv[3]
      ? await geste(process.cwd(), process.argv[3])
      : { code: 2, raison: 'le fichier manque' };
    if (raison) {
      process.stderr.write(`${process.argv[2]} : ${raison}.\n`);
    }
    process.exitCode = code;
  } else if (process.argv[2] === '--renouveler') {
    // superviseur --renouveler <dossier> <arretA> <messageA> (the greffon, at each period).
    const [, , , dossier, arretA, messageA] = process.argv;
    const texte = await renouvellement(dossier ?? process.cwd(), {
      arretA: Number(arretA),
      messageA: Number(messageA),
    });
    if (texte) {
      process.stdout.write(`${texte}\n`);
    }
  } else if (process.argv[2] === '--relever') {
    const args = process.argv.slice(3);
    const dossier = args.find(a => a !== '--compaction') ?? process.cwd();
    try {
      const texte = await releverPourLeGreffon(racineDe(dossier), {
        compaction: args.includes('--compaction'),
      });
      if (texte) {
        process.stdout.write(`${texte}\n`);
      }
    } catch (e) {
      if (e.texte) {
        process.stdout.write(`${e.texte}\n`);
      }
      process.stderr.write(`${e.message}\n`);
      process.exitCode = 1;
    }
  } else if (process.argv[2] === '--chez-le-responsable') {
    // superviseur --chez-le-responsable <dossier> <ticket> : the question of the circuit of <ticket>
    // is carried to the owner, now (`grillhouse circuit <ticket> --chez-le-responsable`); exit 2 and
    // its reason on the error stream when the circuit waits for no question, or when the question
    // is not in the file of the stops gone up.
    const [, , , dossier, ticket] = process.argv;
    const racine = racineDe(dossier ?? process.cwd());
    const circuits = await circuitsDuServeur(racine);
    const c = circuits.find(x => x.ticket === ticket);
    if (!c || !attendLeSuperviseur(c)) {
      process.stderr.write(`--chez-le-responsable : le circuit de ${ticket} n'attend aucune question.\n`);
      process.exitCode = 2;
    } else if (!marquerChezLeResponsable(racine, { cle: cleDe(c), depuisA: Date.now() })) {
      process.stderr.write(
        `--chez-le-responsable : la question de ${ticket} n'est pas encore remontée au superviseur.\n`
      );
      process.exitCode = 2;
    }
  } else if (process.argv[2] === '--lue') {
    // superviseur --lue <dossier> <lueA> <envoyeesAvant> : the turn of the session that read, at
    // <lueA> ms, the messages sent up to <envoyeesAvant> ms (the greffon's turn.start).
    const [, , , dossier, lueA, envoyeesAvant] = process.argv;
    if (!dossier || !Number.isFinite(Number(lueA)) || !Number.isFinite(Number(envoyeesAvant))) {
      process.stderr.write('usage : superviseur --lue <dossier> <lueA> <envoyeesAvant>\n');
      process.exitCode = 1;
    } else {
      const racine = racineDe(dossier);
      const lues = { lueA: Number(lueA), envoyeesAvant: Number(envoyeesAvant) };
      marquerLues(racine, lues);
      for (const p of voisinsSansSuperviseur(racine)) {
        marquerLues(p.chemin, lues);
      }
    }
  } else {
    const texte = await ouvertureDuSuperviseur(process.argv[2] ?? process.cwd(), {
      source: process.argv[3] || undefined,
    });
    if (texte) {
      process.stdout.write(`${texte}\n`);
    }
  }
}
