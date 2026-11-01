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
// - The session whose opening takes the lock (not one that keeps it) receives the circuits of the
//   repository it finds (`circuitsALOuverture`, read by scripts/tableau.mjs `lireCircuits`): the
//   section « ## Circuits à rattacher ou à reprendre » names each circuit that runs, with the
//   command that attaches to it (`npx grillhouse circuit <ticket> --rattacher`, which waits for its
//   end and ends on its code), each circuit stopped on a question (its stop written, `--rattacher`
//   ends on its code), and each circuit dead without a final state whose ticket is not closed, with the
//   command that resumes it (`--reprendre`); the supervisor launches each one in the background
//   without waiting for the owner's word. A circuit runs detached from the sessions
//   (scripts/demon.mjs): the end of the session that launched it kills the command that waited for
//   it, never the circuit, whose stop would otherwise reach no session (grillhouse-mwz: SyntHub's
//   SH-br0.1 stopped 27 s after a relaunch of its session, read only on a word of the owner).
// Exit 0, whatever it finds.
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { prendreVerrou } from './verrou-de-fichier.mjs';
import { vivant } from './mesure/base-de-passe.mjs';
import { lireCircuits } from './tableau.mjs';
import { etapeDuCircuit, libelle } from './etapes.mjs';

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
    if (!p) return depart;
    if (!COQUILLES.has(p.nom)) return pid;
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

/**
 * The section of the circuits a session of supervision finds at its opening in <racine>: each one
 * that runs, with the command that attaches to it, and each one dead without a final state, with
 * the command that resumes it, and each one stopped on a question (a stop other than the
 * supervisor's own « arrete »), with the command that attaches to it and gives its stop again,
 * those whose ticket <fermes> gives closed left out; empty when none.
 * @param {string} racine the root of the repository
 * @param {{ fermes?: (racine: string, ids: string[]) => Set<string> }} options
 * @returns {string}
 */
export function circuitsALOuverture(racine, { fermes = ticketsFermes } = {}) {
  const lus = lireCircuits({ racine }).filter(
    c => c.vivant || c.interrompu || (c.arret && c.arret !== 'arrete')
  );
  const ferme = lus.length
    ? fermes(
        racine,
        lus.map(c => c.ticket)
      )
    : new Set();
  const nommes = lus
    .filter(c => !ferme.has(c.ticket))
    .sort((a, b) => a.ticket.localeCompare(b.ticket, 'en'));
  if (!nommes.length) return '';
  const ou = c => {
    const e = etapeDuCircuit({ ...c, raison: c.arret });
    return e ? libelle(e) : c.etape;
  };
  return [
    '## Circuits à rattacher ou à reprendre',
    "Un circuit tourne détaché des séances : la fin de la séance qui l'a lancé a tué la commande qui attendait sa fin, pas lui. Dès ta première réponse, sans attendre le mot du responsable, lance en arrière-plan (`run_in_background`) la commande de chacun : `--rattacher` attend la fin du circuit qui tourne, ou rend l'arrêt d'un circuit arrêté sur une question, avec son code, comme son lancement ; `--reprendre` reprend un circuit mort sans état final à son étape.",
    ...nommes.map(c =>
      c.vivant
        ? `- ${c.ticket} tourne, à ${ou(c)} : \`npx grillhouse circuit ${c.ticket} --rattacher\``
        : c.arret
          ? `- ${c.ticket} est arrêté sur une question (${c.arret}), à ${ou(c)} : \`npx grillhouse circuit ${c.ticket} --rattacher\``
          : `- ${c.ticket} est mort sans état final (son processus parti, aucun arrêt écrit), à ${ou(c)} : \`npx grillhouse circuit ${c.ticket} --reprendre\``
    ),
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
  if (env.BEADS_ACTOR) return '';
  const r = git(racine, '--git-dir', '--git-common-dir');
  if (r.status !== 0) return '';
  const [dossierGit, commun] = r.stdout.trim().split('\n');
  if (path.resolve(dossierGit) !== path.resolve(commun)) return '';
  const verrou = path.join(commun, VERROU_SUPERVISEUR);
  const moi = seance();
  const tenant = () => {
    try {
      return Number(/^(\d+)/.exec(readFileSync(verrou, 'utf8'))?.[1]);
    } catch {
      return null;
    }
  };
  if (tenant() === moi) return '';
  if (prendreVerrou(verrou, { attendre: false, pid: moi })) {
    return circuitsALOuverture(path.dirname(commun));
  }
  const autre = tenant();
  if (!autre || autre === moi || !vivant(autre)) return '';
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const texte = superviseur(process.argv[2] ?? process.cwd());
  if (texte) process.stdout.write(`${texte}\n`);
}
