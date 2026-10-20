#!/usr/bin/env node
// One supervisor per project, as Zuul has one scheduler: a session of supervision holds the lock
// of its repository, and a second one reads it, says so, and launches no circuit. Played by the
// session start (scripts/session-start.sh), which writes what it says to the session.
//
//   node scripts/superviseur.mjs <racine>
//
// - Out of a git repository, in an agent's copy (a worktree whose git directory is not the common
//   one) and in a session of a role that the circuit launches (BEADS_ACTOR set: the author of its
//   comments at the ticket), nothing is taken and nothing is said.
// - The lock is `<git common dir>/grillhouse-superviseur.lock`, one for the repository and its
//   copies, taken through scripts/verrou-de-fichier.mjs for the session's own process: the first
//   process above this one that is not a shell (sh, bash, dash, zsh), the claude of the session.
//   It holds as long as that process lives: a lock whose process is gone is taken over.
// - Free, or held by a process that is gone: taken, nothing said. Held by the session itself (a
//   session reopened in the same process): kept, nothing said. Held by another live session: the
//   lock stays, and the section « ## Un autre superviseur tient ce dépôt » names its process and
//   since when it holds the lock, and asks to say so to the owner and to launch no circuit
//   (skill pitmaster, « Au lancement de la séance »).
// Exit 0, whatever it finds.
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { prendreVerrou, vivant } from './verrou-de-fichier.mjs';

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
  if (prendreVerrou(verrou, { attendre: false, pid: moi })) return '';
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
