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
//   (`circuitsALOuverture`) the section « ## L'attente des questions », which asks it to launch the
//   wait of the questions in the background (`--attendre`, below) without waiting for the owner's
//   word, then, when the repository has some (read from the Temporal server in one call,
//   scripts/circuits-du-serveur.mjs), « ## Les circuits du dépôt »: each circuit that runs, named;
//   each circuit stopped on a question, with its question and the command that answers it; each
//   circuit ended without its issue, with the command that resumes it (`--reprendre` from its last
//   state written, else `--depuis <testwriter|developpeur> --contexte <texte>`), which the
//   supervisor launches without waiting for the owner's word; their ticket open, and the stopped
//   and the ended ones then gone up; a server that does not answer is said; then « ## La file des
//   tickets », the tickets of the queue without their section « ## Architecture », which the
//   queue never starts (scripts/file-des-tickets.mjs), for the supervisor to write it. A circuit
//   runs on the worker of the project, apart from the sessions, its launch returns at once, and its
//   question wakes the supervisor by the wait alone (grillhouse-mwz: SyntHub's SH-br0.1 stopped
//   27 s after a relaunch of its session, read only on a word of the owner). The queue of the
//   tickets under Temporal (src/temporal/tickets/) launches the tickets `circuit`, not the opening.
// Exit 0, whatever it finds.
//
//   npx grillhouse superviseur --attendre [<dossier>]
//
// - The wait of the session of supervision (`attendreUneQuestion`), which the supervisor launches
//   in the background, one at a time, the one way a question of a circuit wakes the session (the
//   owner's decision, grillhouse-pq6): it writes the batch of the questions already due at its
//   start, else waits for one, and ENDS once it has written one batch, as `gh run watch` or
//   `kubectl wait` return on their event: the end of its task wakes the session, whatever pipe
//   follows it, and the session launches it again once the batch is dealt with
//   (grillhouse-d4n.9: a wait that never ended, launched behind `| tail`, was read by no one for
//   40 min). A batch holds each question of a circuit that never went up or whose re-presentation
//   is due (`questionsEnAttente`, the one source of the questions that wait for the supervisor,
//   which the opening reads too), whatever launched the circuit (alone, in a queue, by another
//   session): its ticket, step, question and the command that answers it (grillhouse-pq6:
//   SyntHub's SH-ae6.5.2, SH-ae6.5.6 and SH-br0.1.5, launched by a queue, waited hours on their
//   question). The stops gone up, by a wait or named at the opening, are kept in
//   `.claude/worktrees/questions-remontees.json`, each one by its ticket, the run of its workflow,
//   the rank of its question in that run and its stop: one never wakes the session twice before
//   its re-presentation, a session closed then opened again finds every one that waits, and one
//   answered leaves them. The end of a circuit wakes it too: a stop as a question; a circuit
//   integrated once (`integre`), its end after the last reading of the previous wait, kept in
//   `.claude/worktrees/integrations-rendues.json` (the opening sets it to its own time), so that
//   an integration between two waits is not lost. Exit 0 on its batch, 1 when another wait
//   already runs (`.claude/worktrees/attente-des-questions.lock`, which names its process: the
//   presence of the wait that the board and the hooks read).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lacherVerrou, prendreVerrou } from './verrou-de-fichier.mjs';
import { vivant } from './mesure/base-de-passe.mjs';
import { circuitsDuServeur, ServeurMuet } from './circuits-du-serveur.mjs';
import {
  attendLeSuperviseur,
  cleDe,
  lireLesRemontees,
  RAPPEL_PAR_DEFAUT,
  remonteesDe,
  verrouDeLAttente,
} from './tableau.mjs';
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

// Of the tickets <ids> of the repository at <racine>, those that bd gives closed; none when bd does
// not read them.
export function ticketsFermes(racine, ids) {
  const r = spawnSync('bd', ['show', ...ids, '--json'], {
    cwd: racine,
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 256 * 1024 * 1024,
  });
  try {
    return new Set(
      JSON.parse(r.stdout)
        .filter(t => t.status === 'closed')
        .map(t => t.id)
    );
  } catch {
    return new Set();
  }
}

// The step where the circuit <c> stands, in words (« 3.1 Contrôles »), else its state's.
const ou = c => {
  const e = etapeDuCircuit({ ...c, raison: c.arret });
  return e ? libelle(e) : c.etape;
};

// The file of the stops gone up to the session of supervision (`remonteesDe`) and the lock of its
// one wait (`verrouDeLAttente`) are beside the states of the circuits (scripts/tableau.mjs reads
// both: its alerts).
const etatsDe = racine => path.join(racine, '.claude', 'worktrees');
export { verrouDeLAttente };

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

// The stops gone up of the repository at <racine>, its circuits <circuits> read, under the lock of
// their file, at <maintenant> ms. Each stop that waits for the supervisor and never went up, or
// whose last presentation is <rappelMs> ms old or more (<toutes>: every one), is given, its ticket
// <fermes> gives closed left out (bd is asked of those alone); a stop given is presented now, and
// one that goes up has its `depuis` set now. The file is written whole with the stops that still
// stand, their circuit waiting for the supervisor: a question answered so leaves it. The `rendu`
// is the questions given, each marked `representee` when it comes back.
function relever(racine, circuits, { fermes, maintenant, rappelMs, toutes = false }) {
  const f = remonteesDe(racine);
  mkdirSync(path.dirname(f), { recursive: true });
  const verrou = `${f}.verrou`;
  // Held for one reading of the circuits: older than that, abandoned.
  prendreVerrou(verrou, { attendre: true, perime: 30_000 });
  try {
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
    const rendu = aRendre
      .filter(q => !fermesDe.has(q.ticket))
      .map(q => (avant.has(q.cle) && !toutes ? { ...q, representee: true } : q));
    const presentes = new Set(aRendre.map(q => q.cle));
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
    const ecrit = enTexte(
      debout.map(q => {
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
    return rendu;
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
  return lus
    .filter(c => !ferme.has(c.ticket))
    .sort((a, b) => a.ticket.localeCompare(b.ticket, 'en'));
}

/**
 * The questions that wait for the supervisor among the circuits <circuits> of the repository at
 * <racine> (scripts/circuits-du-serveur.mjs), the one source of the opening
 * (`circuitsALOuverture`) and of the wait (`attendreUneQuestion`), by the rule the board's
 * « ⤷ Question » reads too (scripts/tableau.mjs `attendLeSuperviseur`): each circuit stopped on a
 * question (any stop but the supervisor's own « arrete », « à repasser » included) or ended
 * without its issue, those whose stop's key <sauf> holds left out, then those whose ticket
 * <fermes> gives closed (bd is asked of the others alone), sorted by ticket. Each one says whether
 * its circuit ended without its issue (`interrompu`) and its stop (`arret`).
 * @param {string} racine the root of the repository
 * @param {import('./circuits-du-serveur.mjs').CircuitDuServeur[]} circuits
 * @param {{ fermes?: (racine: string, ids: string[]) => Set<string>, sauf?: Set<string> }} options
 * @returns {{ ticket: string, etape: string, question: string, qui: string, commande: string, cle: string, interrompu: boolean, arret: string | null }[]}
 */
export function questionsEnAttente(
  racine,
  circuits,
  { fermes = ticketsFermes, sauf = new Set() } = {}
) {
  return enAttente(
    circuits.filter(c => attendLeSuperviseur(c) && !sauf.has(cleDe(c))),
    racine,
    fermes
  ).map(enQuestion);
}

// No ticket closed: the questions read without asking bd.
const aucunFerme = () => new Set();

/**
 * The wait of the session of supervision of the repository at <racine> (`npx grillhouse
 * superviseur --attendre`): the first batch of questions, given as soon as one is due, after
 * which the wait ends; the session launches it again once the batch is dealt with. A batch holds
 * each question that waits for the supervisor (`questionsEnAttente`), whatever launched its
 * circuit, once it never went up, and again, marked `representee`, every <rappel> minutes (5 by
 * default) while its circuit stands on the same stop, as SQS gives a message not acknowledged
 * again after its visibility timeout; a question answered (its circuit left the stop) leaves those
 * gone up and is not given again. A stop whose key changes is a new question, given at once. The
 * end of a circuit integrated after the last reading of the previous wait (the file of the
 * integrations given; none, the start of this one) is given once, marked `integre`, never again
 * (the circuits integrated read too, by `{ integres: true }`); the supervisor's own « arrete » is
 * never one. The times are those of <maintenant> (`Date.now` by default). It reads the circuits
 * every <pas> ms by <circuitsDe> (one call to the Temporal server, scripts/circuits-du-serveur.mjs,
 * by default), as the UI of Temporal refreshes its list; a reading that fails (the server down) is
 * tried again at the next step, the questions gone up kept. One wait at a time per repository: a
 * second one is refused while the first runs. Its <signal> ends it with an empty batch.
 * @param {{ racine: string, fermes?: (racine: string, ids: string[]) => Set<string>, pas?: number, signal?: AbortSignal, circuitsDe?: (racine: string, options?: { integres?: boolean }) => Promise<import('./circuits-du-serveur.mjs').CircuitDuServeur[]>, maintenant?: () => number, rappel?: number }} options
 * @returns {Promise<{ ticket: string, etape: string, question: string, qui: string, commande: string, cle: string, representee?: boolean, integre?: boolean }[]>}
 * @throws {Error} another wait runs
 */
export async function attendreUneQuestion({
  racine,
  fermes = ticketsFermes,
  pas = 5_000,
  signal,
  circuitsDe = circuitsDuServeur,
  maintenant = Date.now,
  rappel = RAPPEL_PAR_DEFAUT,
}) {
  mkdirSync(etatsDe(racine), { recursive: true });
  const verrou = verrouDeLAttente(racine);
  if (!prendreVerrou(verrou, { attendre: false })) {
    let qui = '';
    try {
      qui = ` (processus ${/^(\d+)/.exec(readFileSync(verrou, 'utf8'))?.[1] ?? '?'})`;
    } catch {
      // the lock is gone meanwhile
    }
    throw new Error(
      `Une attente des questions tourne déjà pour ce dépôt${qui}, ${verrou} : une seule à la fois.`
    );
  }
  // The integrations new since the last reading of the previous wait, each given once.
  const { depuis: debut, rendues } = lireLesIntegrations(racine, maintenant());
  let lue = debut;
  try {
    while (!signal?.aborted) {
      const avant = maintenant();
      let circuits = null;
      try {
        circuits = await circuitsDe(racine, { integres: true });
      } catch {
        circuits = null;
      }
      if (circuits && !signal?.aborted) {
        lue = avant;
        const integres = circuits
          .filter(c => c.integre && c.fin !== null && c.fin >= debut && !rendues.has(cleDe(c)))
          .map(enFin);
        const lot = [
          ...relever(
            racine,
            circuits.filter(c => !c.integre),
            {
              fermes,
              maintenant: maintenant(),
              rappelMs: rappel * 60_000,
            }
          ),
          ...integres,
        ];
        if (lot.length) {
          // The integrations given, those ended since this reading kept, so that the next wait
          // gives none of them again.
          const fins = new Map(circuits.map(c => [cleDe(c), c.fin]));
          ecrireLesIntegrations(
            racine,
            lue,
            [...rendues, ...integres.map(i => i.cle)].filter(k => (fins.get(k) ?? -Infinity) >= lue)
          );
          return lot;
        }
      }
      await attendre(pas, signal);
    }
    return [];
  } finally {
    lacherVerrou(verrou);
  }
}

// Waits <ms> ms, or until <signal> ends the wait.
const attendre = (ms, signal) =>
  new Promise(resolve => {
    const fin = () => {
      clearTimeout(minuteur);
      resolve();
    };
    const minuteur = setTimeout(fin, ms);
    signal?.addEventListener('abort', fin, { once: true });
  });

// The relaunch of the wait, which ends on each batch: the last line of a batch.
const RELANCE =
  "Ce lot traité, relance l'attente en arrière-plan (`run_in_background`), sans tube ni veille à durée : `npx grillhouse superviseur --attendre`. Sa fin te réveille au lot suivant.";

/**
 * The text that wakes the session of supervision on the questions <questions>: for each one, its
 * ticket, step, who must answer it, its question and the command that answers it; then each end of
 * a circuit integrated (`integre`), its ticket and its step; last, the wait to launch again once
 * the batch is dealt with, since the wait ended on it. A question presented again (`representee`)
 * says that it still waits for an answer.
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
        ...attente.map(q =>
          [
            `- ${q.ticket}, à ${q.etape}, au ${q.qui}${q.representee ? ' (toujours sans réponse)' : ''} : ${q.question.replace(/\n/g, '\n  ')}`,
            `  La réponse : \`${q.commande}\`.`,
          ].join('\n')
        ),
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
    '',
    RELANCE,
  ].join('\n');
}

/**
 * The section a session of supervision receives at its opening in <racine>, when it takes the lock:
 * the wait of the questions to launch in the background (`npx grillhouse superviseur --attendre`),
 * the one way a question of a circuit wakes the session; then the circuits of the repository,
 * those whose ticket <fermes> gives closed left out: each one that runs, named; each one stopped on
 * a question (a stop other than the supervisor's own « arrete »), with its question and the command
 * that answers it; each one ended without its issue, with the command that resumes it. The
 * stopped and the ended ones are then gone up: the wait does not give them again. Last, « ## La
 * file des tickets » names the tickets of the queue without their section « ## Architecture »
 * (`enFileSansArchitecture` of scripts/file-des-tickets.mjs, the tickets read by <ticketsDe>,
 * `lireLesTickets` by default; a Beads that fails says nothing), which the queue never starts.
 * @param {string} racine the root of the repository
 * The circuits are read once, by <circuitsDe> (one call to the Temporal server,
 * scripts/circuits-du-serveur.mjs, by default); a server that does not answer is said, and no
 * question goes up.
 * @param {{ fermes?: (racine: string, ids: string[]) => Set<string>,
 *   circuitsDe?: (racine: string) => Promise<import('./circuits-du-serveur.mjs').CircuitDuServeur[]>,
 *   ticketsDe?: (racine: string) => import('./file-des-tickets.mjs').TicketDeBeads[] }} options
 * @returns {Promise<string>}
 */
export async function circuitsALOuverture(
  racine,
  { fermes = ticketsFermes, circuitsDe = circuitsDuServeur, ticketsDe = lireLesTickets } = {}
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
        rappelMs: RAPPEL_PAR_DEFAUT * 60_000,
        toutes: true,
      })
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
      : [
          `- ${q.ticket} est arrêté sur une question (${q.arret}), à ${q.etape}, au ${q.qui} : ${q.question.replace(/\n/g, '\n  ')}`,
          `  La réponse : \`${q.commande}\`.`,
        ].join('\n'),
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
    "## L'attente des questions",
    "Dès ta première réponse, sans attendre le mot du responsable, lance l'attente des questions en arrière-plan (`run_in_background`), sans tube ni veille à durée : `npx grillhouse superviseur --attendre`. Elle imprime un lot (une question neuve d'un circuit, quel que soit son lanceur, une fin de circuit) et se termine : sa fin te réveille. Relance-la après chaque lot traité. Une question sans réponse revient toutes les 5 min (`--rappel <minutes>` règle l'intervalle) jusqu'à sa réponse. Un lancement de circuit rend la main tout de suite ; la fin d'un circuit te réveille aussi, un arrêt comme une question, une intégration une fois. Tu ne te mets pas en attente du responsable tant qu'une question d'un circuit attend ta réponse, ni tant qu'un circuit tourne sans attente vivante : le crochet de fin de tour te le rappelle.",
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

// The root of the repository at <dossier>, its main tree for a copy; <dossier> out of git.
function racineDe(dossier) {
  const r = git(dossier, '--git-common-dir');
  return r.status === 0 ? path.dirname(r.stdout.trim()) : dossier;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv[2] === '--attendre') {
    try {
      const args = process.argv.slice(3);
      const i = args.indexOf('--rappel');
      let rappel = RAPPEL_PAR_DEFAUT;
      if (i !== -1) {
        rappel = Number(args[i + 1]);
        if (!(rappel > 0)) {
          throw new Error('--rappel attend un nombre de minutes supérieur à 0.');
        }
        args.splice(i, 2);
      }
      const lot = await attendreUneQuestion({
        racine: racineDe(args[0] ?? process.cwd()),
        rappel,
      });
      process.stdout.write(`${texteDesQuestions(lot)}\n`);
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
