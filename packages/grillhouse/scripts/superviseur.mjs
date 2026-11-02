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
//   word, then, when the repository has some (read by scripts/tableau.mjs `lireCircuits`), « ## Les
//   circuits du dépôt »: each circuit that runs, named; each circuit stopped on a question, with
//   its question and the command that answers it; each circuit dead without a final state, with
//   the command that resumes it (`--reprendre`), which the supervisor launches without waiting for
//   the owner's word; their ticket open, and the stopped and the dead ones then gone up. A circuit
//   runs detached from the sessions (scripts/demon.mjs), its launch returns at once, and its
//   question wakes the supervisor by the wait alone (grillhouse-mwz: SyntHub's SH-br0.1 stopped
//   27 s after a relaunch of its session, read only on a word of the owner). The same opening
//   launches the queue of the project (« ## La file des tickets », scripts/file-des-tickets.mjs):
//   each ticket `circuit` whose dependencies are all closed, by Beads priority; each waits for a
//   place of the machine (scripts/places-de-la-machine.mjs).
// Exit 0, whatever it finds.
//
//   npx grillhouse superviseur --attendre [<dossier>]
//
// - The wait of the session of supervision (`attendreUneQuestion`), which the supervisor keeps in
//   the background, one at a time, the one way a question of a circuit wakes the session (the
//   owner's decision, grillhouse-pq6): it ends only when a question of a circuit appears that never
//   went up (`questionsEnAttente`, the one source of the questions that wait for the supervisor,
//   which the opening reads too), whatever launched the circuit (alone, in a queue, by another
//   session), and writes each one, its ticket, step, question and the command that answers it;
//   the end of its task wakes the session, which spends nothing while it waits (grillhouse-pq6:
//   SyntHub's SH-ae6.5.2, SH-ae6.5.6 and SH-br0.1.5, launched by a queue, waited hours on their
//   question). The stops gone up, by a wait or named at the opening, are kept in
//   `.claude/worktrees/questions-remontees.json`, each one by its ticket, the run of its circuit
//   and its stop: one never wakes the session twice, and one answered leaves them. Exit 0 on its
//   questions, 1 when another wait already runs (`.claude/worktrees/attente-des-questions.lock`).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, statSync, watch, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lacherVerrou, prendreVerrou } from './verrou-de-fichier.mjs';
import { vivant } from './mesure/base-de-passe.mjs';
import { lancerLaFile } from './file-des-tickets.mjs';
import { attendLeSuperviseur, lireCircuits } from './tableau.mjs';
import { etapeDuCircuit, libelle, SUPERVISEUR } from './etapes.mjs';

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
function ticketsFermes(racine, ids) {
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

// One stop of the circuit <c>: its ticket, the run that wrote it (`processus`, `depart`) and its
// stop, so that the next stop of a circuit resumed is another one.
const cleDe = c =>
  [c.ticket, c.processus ?? '?', c.depart ?? '?', c.arret ?? 'interrompu'].join(':');

// The step where the circuit <c> stands, in words (« 3.1 Contrôles »), else its state's.
const ou = c => {
  const e = etapeDuCircuit({ ...c, raison: c.arret });
  return e ? libelle(e) : c.etape;
};

// The file of the stops gone up to the session of supervision of the repository at <racine>, and
// the lock of its one wait, beside the states of the circuits.
const etatsDe = racine => path.join(racine, '.claude', 'worktrees');
const remonteesDe = racine => path.join(etatsDe(racine), 'questions-remontees.json');
const verrouDeLAttente = racine => path.join(etatsDe(racine), 'attente-des-questions.lock');

// The stops gone up to the session of supervision of the repository at <racine>: their keys.
function lireRemontees(racine) {
  try {
    const lu = JSON.parse(readFileSync(remonteesDe(racine), 'utf8'));
    return new Set(Array.isArray(lu?.remontees) ? lu.remontees.map(String) : []);
  } catch {
    return new Set();
  }
}

// The stops gone up of the repository at <racine>, under the lock of their file: <faire>(<avant>,
// those gone up before) returns the keys it makes go up (`cles`) and what it gives (`rendu`); the
// file is written whole with them and those of <avant> whose stop still stands, its circuit waiting
// for the supervisor, or alive and stopped, a question its caller read on its output
// (`inscrireLaQuestionLue`) until its process ends. A question answered so leaves them. Its
// `rendu`.
function remonter(racine, faire) {
  const f = remonteesDe(racine);
  mkdirSync(path.dirname(f), { recursive: true });
  const verrou = `${f}.verrou`;
  // Held for one reading of the states: older than that, abandoned.
  prendreVerrou(verrou, { attendre: true, perime: 30_000 });
  try {
    const avant = lireRemontees(racine);
    const { cles, rendu } = faire(avant);
    const debout = new Set(
      lireCircuits({ racine })
        .filter(c => attendLeSuperviseur(c) || (c.vivant && c.arret))
        .map(cleDe)
    );
    const apres = new Set([...cles, ...[...avant].filter(c => debout.has(c))]);
    if (avant.size !== apres.size || [...apres].some(c => !avant.has(c))) {
      const provisoire = `${f}.${process.pid}`;
      writeFileSync(provisoire, `${JSON.stringify({ remontees: [...apres].sort() }, null, 2)}\n`);
      renameSync(provisoire, f);
    }
    return rendu;
  } finally {
    lacherVerrou(verrou);
  }
}

/**
 * Inscribes as gone up the question of the circuit of <ticket>, its run (`processus`, `depart`)
 * stopped on <arret>, that its caller read on its output (grillhouse-pq6.1: a launch in the
 * foreground that stops before any session, scripts/circuit.mjs `monter`): the wait of the
 * questions does not wake on it, by the one source of the stops gone up.
 * @param {string} racine
 * @param {{ ticket: string, processus: number, depart: string, arret: string }} arret
 */
export function inscrireLaQuestionLue(racine, arret) {
  remonter(racine, () => ({ cles: [cleDe(arret)] }));
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
  commande: c.interrompu
    ? `npx grillhouse circuit ${c.ticket} --reprendre`
    : `npx grillhouse circuit ${c.ticket} --reprendre\`, \`--depuis <testwriter|developpeur>\`, \`--etendre <paquet>\` ou \`--arreter`,
  cle: cleDe(c),
  interrompu: c.interrompu,
  arret: c.arret,
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
 * The questions that wait for the supervisor in the repository at <racine>, the one source of the
 * opening (`circuitsALOuverture`) and of the wait (`attendreUneQuestion`), by the rule the board's
 * « ⤷ Question » reads too (scripts/tableau.mjs `attendLeSuperviseur`, beside `lireCircuits`, which
 * this module imports): each circuit whose process is gone, stopped (any stop but the
 * supervisor's own « arrete », « à repasser » included) or dead without a final state,
 * those whose stop's key <sauf> holds left out, then those whose ticket <fermes> gives closed
 * (bd is asked of the others alone), sorted by ticket. Each one says whether its circuit died
 * without a final state (`interrompu`) and its stop (`arret`).
 * @param {string} racine the root of the repository
 * @param {{ fermes?: (racine: string, ids: string[]) => Set<string>, sauf?: Set<string> }} options
 * @returns {{ ticket: string, etape: string, question: string, qui: string, commande: string, cle: string, interrompu: boolean, arret: string | null }[]}
 */
export function questionsEnAttente(racine, { fermes = ticketsFermes, sauf = new Set() } = {}) {
  return enAttente(
    lireCircuits({ racine }).filter(c => attendLeSuperviseur(c) && !sauf.has(cleDe(c))),
    racine,
    fermes
  ).map(enQuestion);
}

// No ticket closed: the questions read without asking bd.
const aucunFerme = () => new Set();

// The questions of the repository at <racine> that never went up (`questionsEnAttente`): returned,
// and now gone up; a question answered (its circuit runs again, or ended) leaves those gone up, and
// one whose ticket <fermes> gives closed goes up without a word. bd is asked of the new ones alone.
function releverLesNeuves(racine, fermes) {
  return remonter(racine, avant => ({
    cles: questionsEnAttente(racine, { fermes: aucunFerme }).map(q => q.cle),
    rendu: questionsEnAttente(racine, { fermes, sauf: avant }),
  }));
}

/**
 * The wait of the session of supervision of the repository at <racine> (`npx grillhouse
 * superviseur --attendre`, which the supervisor keeps in the background, as a review requested on
 * GitHub or Gerrit's attention set calls the one a change waits for): it ends only when a question
 * that never went up waits for the supervisor (`questionsEnAttente`), whatever launched its
 * circuit, and gives those questions, now gone up; a question already gone up (by a wait, or named
 * at the opening) never ends it again, and a question answered leaves those gone up. It watches
 * the directory of the states of the circuits (fs.watch, inotify on Linux), and reads them again
 * every <pas> ms for a circuit killed, the one end that leaves no mark (a circuit marks its exit,
 * its state touched, scripts/circuit.mjs); the session spends
 * nothing while it waits. One wait at a time per repository: a second one is refused while the
 * first runs. Its <signal> ends it with no question.
 * @param {{ racine: string, fermes?: (racine: string, ids: string[]) => Set<string>, pas?: number, signal?: AbortSignal }} options
 * @returns {Promise<{ ticket: string, etape: string, question: string, qui: string, commande: string, cle: string }[]>}
 * @throws {Error} another wait runs
 */
export async function attendreUneQuestion({
  racine,
  fermes = ticketsFermes,
  pas = 30_000,
  signal,
}) {
  const dossier = etatsDe(racine);
  mkdirSync(dossier, { recursive: true });
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
  try {
    return await new Promise(resolve => {
      if (signal?.aborted) {
        resolve([]);
        return;
      }
      let fini = false;
      let differe;
      const voir = () => {
        if (fini) {
          return;
        }
        const neuves = releverLesNeuves(racine, fermes);
        if (neuves.length) {
          finir(neuves);
        }
      };
      const surveillance = watch(dossier, () => {
        clearTimeout(differe);
        differe = setTimeout(voir, 250);
      });
      const minuteur = setInterval(voir, pas);
      const finir = q => {
        fini = true;
        surveillance.close();
        clearTimeout(differe);
        clearInterval(minuteur);
        resolve(q);
      };
      signal?.addEventListener('abort', () => finir([]), { once: true });
      voir();
    });
  } finally {
    lacherVerrou(verrou);
  }
}

/**
 * The text that wakes the session of supervision on the questions <questions>: for each one, its
 * ticket, step, who must answer it, its question and the command that answers it; then the wait to
 * launch again once they are answered.
 * @param {{ ticket: string, etape: string, question: string, qui: string, commande: string }[]} questions
 * @returns {string}
 */
export function texteDesQuestions(questions) {
  return [
    questions.length > 1 ? '## Questions neuves des circuits' : "## Question neuve d'un circuit",
    ...questions.map(q =>
      [
        `- ${q.ticket}, à ${q.etape}, au ${q.qui} : ${q.question.replace(/\n/g, '\n  ')}`,
        `  La réponse : \`${q.commande}\`.`,
      ].join('\n')
    ),
    "Une fois répondu, relance l'attente en arrière-plan (`run_in_background`) : `npx grillhouse superviseur --attendre`.",
  ].join('\n');
}

/**
 * The section a session of supervision receives at its opening in <racine>, when it takes the lock:
 * the wait of the questions to launch in the background (`npx grillhouse superviseur --attendre`),
 * the one way a question of a circuit wakes the session; then the circuits of the repository,
 * those whose ticket <fermes> gives closed left out: each one that runs, named; each one stopped on
 * a question (a stop other than the supervisor's own « arrete »), with its question and the command
 * that answers it; each one dead without a final state, with the command that resumes it. The
 * stopped and the dead ones are then gone up: the wait does not give them again.
 * @param {string} racine the root of the repository
 * The tickets `circuit` of the repository whose dependencies are all closed are launched then, by
 * Beads priority (`lancerLaFile`, scripts/file-des-tickets.mjs), and named; each waits for a place
 * of the machine. Those with an open dependency stay.
 * @param {{ fermes?: (racine: string, ids: string[]) => Set<string>,
 *   tickets?: (racine: string) => unknown[], lancer?: (ticket: string) => unknown }} options
 *   `tickets` reads the tickets of the queue and `lancer` launches one circuit (Beads and the
 *   circuit by default)
 * @returns {string}
 */
export function circuitsALOuverture(
  racine,
  { fermes = ticketsFermes, tickets: lireLesTickets, lancer } = {}
) {
  const partis = lancerLaFile(racine, {
    ...(lireLesTickets ? { tickets: lireLesTickets(racine) } : {}),
    ...(lancer ? { lancer } : {}),
  });
  const questions = remonter(racine, () => {
    const q = questionsEnAttente(racine, { fermes });
    return { cles: q.map(x => x.cle), rendu: q };
  });
  const tournent = enAttente(
    lireCircuits({ racine }).filter(c => c.vivant),
    racine,
    fermes
  ).map(c => ({ ticket: c.ticket, ligne: `- ${c.ticket} tourne, à ${ou(c)}.` }));
  const enLigne = q => ({
    ticket: q.ticket,
    ligne: q.interrompu
      ? `- ${q.ticket} est mort sans état final (son processus parti, aucun arrêt écrit), à ${q.etape} : relance-le sans attendre le mot du responsable, \`${q.commande}\`.`
      : [
          `- ${q.ticket} est arrêté sur une question (${q.arret}), à ${q.etape}, au ${q.qui} : ${q.question.replace(/\n/g, '\n  ')}`,
          `  La réponse : \`${q.commande}\`.`,
        ].join('\n'),
  });
  const nommes = [...tournent, ...questions.map(enLigne)].sort((a, b) =>
    a.ticket.localeCompare(b.ticket, 'en')
  );
  return [
    "## L'attente des questions",
    "Dès ta première réponse, sans attendre le mot du responsable, lance en arrière-plan (`run_in_background`) l'attente des questions : `npx grillhouse superviseur --attendre`. Elle se termine sur la question neuve d'un circuit, quel que soit son lanceur, et te réveille ainsi ; un lancement de circuit rend la main tout de suite, et la fin normale d'un circuit ne te réveille pas : le panneau la montre.",
    ...(nommes.length ? ['', '## Les circuits du dépôt', ...nommes.map(n => n.ligne)] : []),
    ...(partis.length
      ? [
          '',
          '## La file des tickets',
          ...partis.map(
            t => `- ${t} (validé, dépendances fermées) est lancé : son circuit attend une place.`
          ),
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
 * @returns {string}
 */
function superviseur(racine, { env = process.env } = {}) {
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
      const questions = await attendreUneQuestion({
        racine: racineDe(process.argv[3] ?? process.cwd()),
      });
      process.stdout.write(`${texteDesQuestions(questions)}\n`);
    } catch (e) {
      process.stderr.write(`${e.message}\n`);
      process.exitCode = 1;
    }
  } else {
    const texte = superviseur(process.argv[2] ?? process.cwd());
    if (texte) {
      process.stdout.write(`${texte}\n`);
    }
  }
}
