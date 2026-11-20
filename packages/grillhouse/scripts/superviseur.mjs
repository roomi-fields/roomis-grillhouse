#!/usr/bin/env node
// One supervisor per project, as Zuul has one scheduler: a session of supervision holds the lock
// of its repository, and a second one reads it, says so, and launches no circuit. Played by the
// session start (scripts/session-start.sh), which writes what it says to the session.
//
//   npx grillhouse superviseur <racine>
//
// - Out of a git repository, in an agent's copy (a worktree whose git directory is not the common
//   one) and in a session of a role that the circuit launches (BEADS_ACTOR set: the author of its
//   comments at the ticket), nothing is taken and nothing is said.
// - The lock is `<git common dir>/grillhouse-superviseur.lock`, one for the repository and its
//   copies, taken through scripts/verrou-de-fichier.mjs for the session's own process: the first
//   process above this one that is not a shell (sh, bash, dash, zsh), the claude of the session.
//   It holds as long as that process lives: a lock whose process is gone is taken over.
// - Free, or held by a process that is gone: taken, nothing said of it. Held by the session itself
//   (a session reopened in the same process, by a compaction or a /clear): kept, nothing said of
//   it, circuits included. Held by another live session: the
//   lock stays, and the section « ## Un autre superviseur tient ce dépôt » names its process and
//   since when it holds the lock, and asks to say so to the owner and to launch no circuit
//   (skill pitmaster, « Au lancement de la séance »).
// - The session whose opening takes the lock (not one that keeps it) receives
//   (`circuitsALOuverture`) the section « ## Les questions des circuits », which says that the
//   greffon of the session pushes the questions into its queue of messages and that the answer
//   acknowledges them, then, when the repository has some (read from the Temporal server in one
//   call, scripts/circuits-du-serveur.mjs), « ## Les circuits du dépôt »: each circuit that runs,
//   named; each circuit stopped on a question, with its question and the command that answers it; each
//   circuit ended without its issue, with the command that resumes it (`--reprendre` from its last
//   state written, else `--depuis <testwriter|developpeur> --contexte <texte>`), which the
//   supervisor launches without waiting for the owner's word; their ticket open, and the stopped
//   and the ended ones then gone up; a server that does not answer is said; then « ## La file des
//   tickets », the tickets of the queue without their section « ## Architecture », which the
//   queue never starts (scripts/file-des-tickets.mjs), for the supervisor to write it. A circuit
//   runs on the worker of the project, apart from the sessions, its launch returns at once, and its
//   question reaches the supervisor by the push of the greffon (below). The queue of the
//   tickets under Temporal (src/temporal/tickets/) launches the tickets `circuit`, not the opening.
// Exit 0, whatever it finds.
//
//   npx grillhouse superviseur --relever [<dossier>]
//
// - One reading of the circuits for the greffon of the session of supervision (mods/grillhouse/
//   hooks/register.tsx), which runs it at each period and submits what it writes to the session,
//   in the queue of its messages (`$.prompt.submit`): the questions of a circuit are given as a
//   queue gives its messages, and the answer acknowledges them. It reads nothing and writes
//   nothing unless the session that runs it holds the lock of the supervisor (the one above). It
//   writes the message of the reading (`texteDesQuestions`) when `relever` gives something,
//   nothing otherwise; exit 1 and the fault on the error stream when `grillhouse.rappel` is at
//   fault. A reading is one reading: no process waits.
// - `relever` is the one function of the reading, of the re-presentation and of the file of the
//   stops gone up: each question of a circuit that never went up or whose last presentation is
//   <rappelMs> old (`grillhouse.rappel` minutes, 5 by default, scripts/circuits-cles.mjs) is given,
//   once per due time, whatever the state of the session, while its circuit stands on the same stop,
//   as SQS gives a message not acknowledged again after its visibility timeout; one answered (its
//   circuit left the stop) leaves the file `.claude/worktrees/questions-remontees.json` and is not
//   given again. The stops are kept there each by its ticket, the run of its workflow, the rank of
//   its question in that run and its stop, with the time of the first going up and of the last
//   presentation. The end of a circuit integrated is given once (`integre`), kept in
//   `.claude/worktrees/integrations-rendues.json`, and the alert of the CI of main (a red, or a CI
//   not read, scripts/ci-de-main.mjs) once per passage (`.claude/worktrees/ci-de-main-rendue.json`),
//   cleared at the next green.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { alerteDuProjet, ciDeMainGardee } from './ci-de-main.mjs';
import { lacherVerrou, prendreVerrou } from './verrou-de-fichier.mjs';
import { vivant } from './mesure/base-de-passe.mjs';
import { circuitsDuServeur, ServeurMuet } from './circuits-du-serveur.mjs';
import {
  attendLeSuperviseur,
  cleDe,
  lireLesRemontees,
  remonteesDe,
} from './tableau.mjs';
import { rappelDuProjet, reglageDuRappel } from './circuits-cles.mjs';
import { etapeDuCircuit, libelle, SUPERVISEUR } from './etapes.mjs';
import { enFileSansArchitecture, lireLesTickets } from './file-des-tickets.mjs';

const VERROU_SUPERVISEUR = 'grillhouse-superviseur.lock';
const COQUILLES = new Set(['sh', 'bash', 'dash', 'zsh']);

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

// The session's process: the first process above <depart> that is not a shell.
function seance(depart = process.ppid) {
  let pid = depart;
  for (let i = 0; i < 32 && pid > 1; i++) {
    const p = processus(pid);
    if (!p) {
      return depart;
    }
    if (!COQUILLES.has(p.nom)) {
      return pid;
    }
    pid = p.parent;
  }
  return depart;
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
// load can take seconds to answer.
export function ticketsHorsAttente(racine, ids) {
  const r = spawnSync('bd', ['show', ...ids, '--json'], {
    cwd: racine,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 256 * 1024 * 1024,
  });
  try {
    return horsAttente(JSON.parse(r.stdout), Date.now());
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
export function ciDeMainDe(racine) {
  const lecture = ciDeMainGardee(racine);
  if (!lecture) {
    return undefined;
  }
  const a = alerteDuProjet(racine, lecture);
  return a ? { cle: a.cle, texte: a.texte } : null;
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
      .filter(c => c.integre && c.fin !== null && c.fin >= depuisIntegrations && !rendues.has(cleDe(c)))
      .map(enFin)
      .sort((a, b) => a.ticket.localeCompare(b.ticket, 'en'));
    const fins = new Map(circuits.map(c => [cleDe(c), c.fin]));
    ecrireLesIntegrations(
      racine,
      maintenant,
      [...rendues, ...integres.map(i => i.cle)].filter(k => (fins.get(k) ?? -Infinity) >= maintenant)
    );
    const rouges = ciDeMain === undefined ? [] : releverLaCiDeMain(racine, ciDeMain, toutes);
    circuits = circuits.filter(c => !c.integre);
    const avant = new Map(lireLesRemontees(racine, maintenant).map(r => [r.cle, r]));
    const debout = questionsEnAttente(racine, circuits, { fermes: aucunFerme });
    const aRendre = debout.filter(q => {
      const r = avant.get(q.cle);
      return toutes || !r || maintenant - r.presentee >= rappelMs;
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
    const enTexte = liste =>
      `${JSON.stringify(
        {
          remontees: liste
            .map(r => ({ cle: r.cle, depuis: r.depuis, presentee: r.presentee }))
            .sort((a, b) => a.cle.localeCompare(b.cle, 'en')),
        },
        null,
        2
      )}\n`;
    // A question never presented, its ticket unread, is not written: the next reading gives it.
    const ecrit = enTexte(
      debout
        .filter(q => presentes.has(q.cle) || avant.has(q.cle))
        .map(q => {
          const r = avant.get(q.cle);
          return {
            cle: q.cle,
            depuis: r?.depuis ?? maintenant,
            presentee: presentes.has(q.cle) ? maintenant : r.presentee,
          };
        })
    );
    let enFichier = '';
    try {
      enFichier = readFileSync(f, 'utf8');
    } catch {
      // no file yet
    }
    if (ecrit !== enFichier && !(debout.length === 0 && avant.size === 0)) {
      const provisoire = `${f}.${process.pid}`;
      writeFileSync(provisoire, ecrit);
      renameSync(provisoire, f);
    }
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

// The lines of one question in the one rendering of the questions, shared by the message of the
// greffon, the opening and the hooks of the session.
export const ligneDeQuestion = q =>
  [
    `- ${q.ticket}, à ${q.etape}, au ${q.qui}${q.representee ? ' (toujours sans réponse)' : ''} : ${q.question.replace(/\n/g, '\n  ')}`,
    `  La réponse : \`${q.commande}\`.`,
  ].join('\n');

/**
 * The message the greffon submits to the session of supervision for the questions <questions> of
 * one reading (`relever`), and the lines of the opening: for each one, its ticket, step, who must
 * answer it, its question and the command that answers it; then each end of a circuit integrated
 * (`integre`), its ticket and its step. A question presented again (`representee`) says that it
 * still waits for an answer.
 * @param {{ ticket: string, etape: string, question: string, qui: string, commande: string, representee?: boolean, integre?: boolean }[]} questions
 * @returns {string}
 */
export function texteDesQuestions(questions) {
  const fins = questions.filter(q => q.integre);
  const attente = questions.filter(q => !q.integre);
  const neuves = attente.filter(q => !q.representee);
  const titre = neuves.length
    ? attente.length > 1
      ? '## Questions neuves des circuits'
      : "## Question neuve d'un circuit"
    : attente.length > 1
      ? '## Questions toujours sans réponse'
      : '## Question toujours sans réponse';
  const enQuestions = attente.length
    ? [
        titre,
        ...attente.map(ligneDeQuestion),
      ]
    : [];
  const enFins = fins.length
    ? [
        fins.length > 1 ? '## Circuits intégrés' : '## Circuit intégré',
        ...fins.map(q => `- ${q.ticket} est intégré, à ${q.etape} : son lot est sur main.`),
      ]
    : [];
  return [
    ...enQuestions,
    ...(enQuestions.length && enFins.length ? [''] : []),
    ...enFins,
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
 * `lireLesTickets` by default; a Beads that fails says nothing), which the queue never starts.
 * @param {string} racine the root of the repository
 * The circuits are read once, by <circuitsDe> (one call to the Temporal server,
 * scripts/circuits-du-serveur.mjs, by default); a server that does not answer is said, and no
 * question goes up.
 * @param {{ fermes?: (racine: string, ids: string[]) => Set<string> | null,
 *   circuitsDe?: (racine: string) => Promise<import('./circuits-du-serveur.mjs').CircuitDuServeur[]>,
 *   ticketsDe?: (racine: string) => import('./file-des-tickets.mjs').TicketDeBeads[] }} options
 * @returns {Promise<string>}
 */
export async function circuitsALOuverture(
  racine,
  { fermes = ticketsHorsAttente, circuitsDe = circuitsDuServeur, ticketsDe = lireLesTickets } = {}
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
  const questions = circuits
    ? relever(racine, circuits, {
        fermes,
        maintenant: Date.now(),
        rappelMs: rappelDuProjet(racine) * 60_000,
        toutes: true,
        ciDeMain: ciDeMainDe(racine),
      }).filter(q => !q.integre)
    : [];
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
  try {
    sansArchitecture = enFileSansArchitecture(ticketsDe(racine), {
      enCours: new Set((circuits ?? []).map(c => c.ticket)),
    }).map(t => t.id);
  } catch {
    // Beads fails: the board says it, the opening names no ticket.
  }
  const nommes = [...tournent, ...questions.map(enLigne)].sort((a, b) =>
    a.ticket.localeCompare(b.ticket, 'en')
  );
  return [
    '## Les questions des circuits',
    "Le greffon de ta séance pousse dans la file de tes messages chaque question neuve d'un circuit du dépôt, quel que soit son lanceur, et chaque fin de circuit, une fois ; il n'y a aucune attente à lancer. Une question sans réponse revient à intervalle réglable (`grillhouse.rappel`, 5 min par défaut) : ta réponse au circuit l'acquitte, et répondue elle ne revient plus. Tu ne te mets pas en attente du responsable tant qu'une question d'un circuit attend ta réponse : le crochet de fin de tour te le rappelle. Les questions en attente sont listées ci-dessous.",
    ...(panne ? ['', '## Les circuits du dépôt', panne] : []),
    ...(nommes.length ? ['', '## Les circuits du dépôt', ...nommes.map(n => n.ligne)] : []),
    ...(sansArchitecture.length
      ? [
          '',
          '## La file des tickets',
          `En file sans architecture : ${sansArchitecture.join(', ')}. La file ne démarre pas un ticket sans la section « ## Architecture » de sa description : écris-la (le modèle mûr, l'adresse, le mécanisme commun), puis la file le démarre.`,
        ]
      : []),
  ].join('\n');
}

const git = (racine, ...args) =>
  spawnSync('git', ['-C', racine, 'rev-parse', '--path-format=absolute', ...args], {
    encoding: 'utf8',
  });

/**
 * The check of the supervisor at the opening of a session in <racine>: what it says (empty when
 * nothing), the lock taken when it is free.
 * @param {string} racine the directory the session opens in
 * @param {{ env?: Record<string, string | undefined> }} options
 * @returns {Promise<string>}
 */
async function superviseur(racine, { env = process.env } = {}) {
  if (env.BEADS_ACTOR) {
    return '';
  }
  const r = git(racine, '--git-dir', '--git-common-dir');
  if (r.status !== 0) {
    return '';
  }
  const [dossierGit, commun] = r.stdout.trim().split('\n');
  if (path.resolve(dossierGit) !== path.resolve(commun)) {
    return '';
  }
  const verrou = path.join(commun, VERROU_SUPERVISEUR);
  const moi = seance();
  const tenant = () => {
    try {
      return Number(/^(\d+)/.exec(readFileSync(verrou, 'utf8'))?.[1]);
    } catch {
      return null;
    }
  };
  if (tenant() === moi) {
    return '';
  }
  if (prendreVerrou(verrou, { attendre: false, pid: moi })) {
    return circuitsALOuverture(path.dirname(commun));
  }
  const autre = tenant();
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

/**
 * One reading for the greffon of the session of supervision of the repository at <racine>
 * (`npx grillhouse superviseur --relever`): the message of what `relever` gives (the questions of
 * the circuits due, the ends of circuits, the reds of main), empty when it gives nothing, when the
 * circuits do not read, or when the session that runs it is not the one that holds the lock of the
 * supervisor (a role's session, an agent's copy, another project's, a session that took no lock).
 * The interval of the re-presentation is the key `grillhouse.rappel` of the project, applied at
 * each reading.
 * @param {string} racine
 * @param {{ env?: Record<string, string | undefined>, circuitsDe?: (racine: string, options?: { integres?: boolean }) => Promise<import('./circuits-du-serveur.mjs').CircuitDuServeur[]> }} [options]
 * @returns {Promise<string>}
 * @throws {Error} `grillhouse.rappel` is at fault, named with its value
 */
export async function releverPourLeGreffon(
  racine,
  { env = process.env, circuitsDe = circuitsDuServeur } = {}
) {
  if (env.BEADS_ACTOR) {
    return '';
  }
  const r = git(racine, '--git-dir', '--git-common-dir');
  if (r.status !== 0) {
    return '';
  }
  const [dossierGit, commun] = r.stdout.trim().split('\n');
  if (path.resolve(dossierGit) !== path.resolve(commun)) {
    return '';
  }
  let tenant = null;
  try {
    tenant = Number(/^(\d+)/.exec(readFileSync(path.join(commun, VERROU_SUPERVISEUR), 'utf8'))?.[1]);
  } catch {
    return '';
  }
  if (!Number.isInteger(tenant) || !estAuDessus(tenant)) {
    return '';
  }
  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8'));
  } catch {
    // a package.json that does not read sets no key: the default interval
  }
  const { minutes, faute } = reglageDuRappel(pkg);
  if (faute) {
    throw new Error(faute);
  }
  let circuits;
  try {
    circuits = await circuitsDe(racine, { integres: true });
  } catch {
    return '';
  }
  const lot = relever(racine, circuits, {
    fermes: ticketsHorsAttente,
    maintenant: Date.now(),
    rappelMs: minutes * 60_000,
    ciDeMain: ciDeMainDe(racine),
  });
  return lot.length ? texteDesQuestions(lot) : '';
}

// The root of the repository at <dossier>, its main tree for a copy; <dossier> out of git.
function racineDe(dossier) {
  const r = git(dossier, '--git-common-dir');
  return r.status === 0 ? path.dirname(r.stdout.trim()) : dossier;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv[2] === '--relever') {
    try {
      const texte = await releverPourLeGreffon(racineDe(process.argv[3] ?? process.cwd()));
      if (texte) {
        process.stdout.write(`${texte}\n`);
      }
    } catch (e) {
      process.stderr.write(`${e.message}\n`);
      process.exitCode = 1;
    }
  } else {
    const texte = await superviseur(process.argv[2] ?? process.cwd());
    if (texte) {
      process.stdout.write(`${texte}\n`);
    }
  }
}
