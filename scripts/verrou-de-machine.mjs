// The lock of the machine for the heavy measure: one heavy measure at a time on the machine,
// whatever repository it plays in, as GNU make's job server shares its slots between every make of
// one build, and as Bazel holds a test that declares it wants the whole machine. Taken by every
// `npm run verifier` (scripts/verifier.mjs: the integration's, the queue's, the night's, a
// supervisor's) and by the heavy passes of the circuit of a ticket (scripts/circuit.mjs: the proof
// of the red and the checks), so that a measure gives the result of the code, not that of another
// measure beside it.
//
// - The lock is one file of the user's cache, shared by every repository of the machine:
//   `${XDG_CACHE_HOME:-~/.cache}/grillhouse/mesure-lourde.lock`; GRILLHOUSE_VERROU_MACHINE names
//   another file (the base configuration of the tests gives each test file its own,
//   scripts/vitest-config/machine.setup.mjs). It is taken through scripts/verrou-de-fichier.mjs,
//   judged by its owner's process: a lock whose process is gone is taken over.
// - A second measure waits for the end of the first, then plays once it holds the lock. It says
//   that it waits and whom for (the process that holds the lock, its working directory, its
//   command, since when) when it begins, then every 30 s, so that a log shows a pass is not
//   frozen.
// - The wait is bounded, as `flock -w` and a database's lock timeout: ATTENTE_MACHINE_MS, 60 min,
//   longer than the longest full pass measured (the frame's, 21 min; a final pass of BPScript
//   320.3, 35.5 min, a wait for rest of the CPU included); GRILLHOUSE_ATTENTE_MACHINE_MS names
//   another bound, in ms. The bound reached, the measure stops at « à repasser » (75): another
//   measure holds the machine, which is neither green nor red, and whoever launched the measure
//   presents it again later. The stop throws an AttenteDeLaMachine, which names the holder.
// - A lock held by an ancestor of the waiting process (its parent, its parent's parent…, or the
//   process itself) is a deadlock: the ancestor waits for its descendant, which waits for the
//   lock. The wait says so at once and stops, red (1): the descendant lost the mark of the taking
//   (an environment rebuilt, a test's), a defect to correct and not a load to wait out. It does
//   not play under the ancestor's lock: make plays such a child at `-j1` because it cannot tell,
//   but here the lost mark is the defect, and playing would hide it.
// - Who holds the lock passes it to its children, as make passes its job server in MAKEFLAGS: the
//   variable GRILLHOUSE_MESURE_TENUE carries the mark of the taking, and a process whose variable
//   names the mark the lock holds plays under it without taking it again (the final pass of the
//   circuit, `npm run verifier`, under the circuit's lock).
// - In the envelope of an agent (GRILLHOUSE_ENVELOPPE set, scripts/enveloppe/composant.mjs) no lock
//   is taken: the envelope has its own process space, where an owner's number means nothing
//   outside, and its home shows no cache.
// - The lock is let go at the end of the measure, whether it succeeds or throws.
import { mkdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { composantDeLEnveloppe } from './enveloppe/composant.mjs';
import { attendreUnPeu, lacherVerrou, prendreVerrou } from './verrou-de-fichier.mjs';
import { A_REPASSER } from './vitest-config/pression.mjs';

const VARIABLE_VERROU = 'GRILLHOUSE_VERROU_MACHINE';
const VARIABLE_TENUE = 'GRILLHOUSE_MESURE_TENUE';
const VARIABLE_ATTENTE = 'GRILLHOUSE_ATTENTE_MACHINE_MS';

/** The longest wait for the lock of the machine, in ms, unless GRILLHOUSE_ATTENTE_MACHINE_MS names another. */
export const ATTENTE_MACHINE_MS = 60 * 60_000;
// The gap between two lines that say the wait goes on.
const RAPPEL_MS = 30_000;

/** The stop of a wait for the lock of the machine: `code` is 75 at the bound, 1 for a deadlock. */
export class AttenteDeLaMachine extends Error {
  /**
   * @param {string} message what stops the wait, the holder named
   * @param {number} code the exit code the measure ends on
   */
  constructor(message, code) {
    super(message);
    this.name = 'AttenteDeLaMachine';
    this.code = code;
  }
}

// The lock file of the machine under <env>.
function verrouDeMachine(env = process.env) {
  if (env[VARIABLE_VERROU]) return env[VARIABLE_VERROU];
  const cache = env.XDG_CACHE_HOME || path.join(env.HOME || homedir(), '.cache');
  return path.join(cache, 'grillhouse', 'mesure-lourde.lock');
}

const lire = f => {
  try {
    return readFileSync(f, 'utf8').trim();
  } catch {
    return null;
  }
};

// The process number in the lock <verrou>, or null.
function detenteur(verrou) {
  const pid = /^(\d+)/.exec(lire(verrou) ?? '')?.[1];
  return pid ? Number(pid) : null;
}

const heure = ms => new Date(ms).toTimeString().slice(0, 8);
const duree = ms =>
  ms < 120_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`;

// Who holds the lock <verrou>: its process, that process's working directory and command when
// they read (on one line, cut at 200 characters), and since when the lock stands (« le processus 12 (dans /d) : node x, depuis
// 10:04:31 (3 min) »).
function qui(verrou) {
  const pid = detenteur(verrou);
  if (pid === null) return 'une autre mesure';
  let ou = '';
  try {
    ou = ` (dans ${readlinkSync(`/proc/${pid}/cwd`)})`;
  } catch {
    // its directory does not read: the process alone is named
  }
  const commande = (lire(`/proc/${pid}/cmdline`) ?? '')
    .split('\0')
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
  const quoi = commande
    ? ` : ${commande.length > 200 ? `${commande.slice(0, 200)}…` : commande}`
    : '';
  let depuis = '';
  try {
    const t = statSync(verrou).mtimeMs;
    depuis = `, depuis ${heure(t)} (${duree(Date.now() - t)})`;
  } catch {
    // the lock is gone meanwhile
  }
  return `le processus ${pid}${ou}${quoi}${depuis}`;
}

// The parent of the process <pid>, read in /proc (the field after the state, which follows the
// command, itself free to hold spaces and parentheses), or null.
function parent(pid) {
  const stat = lire(`/proc/${pid}/stat`);
  const ppid = stat ? Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]) : NaN;
  return Number.isInteger(ppid) && ppid > 0 ? ppid : null;
}

// Whether <pid> is this process or one of its ancestors.
function ancetre(pid) {
  for (let p = process.pid; p !== null; p = parent(p)) if (p === pid) return true;
  return false;
}

// The bound of the wait under <env>, in ms.
function borneDe(env) {
  const n = Number(env[VARIABLE_ATTENTE]);
  return env[VARIABLE_ATTENTE] && Number.isFinite(n) && n >= 0 ? n : ATTENTE_MACHINE_MS;
}

// Waits for the lock <verrou>, saying so (`dire`) when it begins and every <rappelMs>; returns the
// time waited, in ms. Throws an AttenteDeLaMachine at once when an ancestor holds the lock, and at
// the bound <borneMs>.
function attendreLaMachine(verrou, { dire, borneMs, rappelMs }) {
  const debut = Date.now();
  let dit = null;
  for (;;) {
    const pid = detenteur(verrou);
    if (pid !== null && ancetre(pid))
      throw new AttenteDeLaMachine(
        `✗ blocage : le verrou de la mesure lourde (${verrou}) est tenu par un ancêtre de ce processus (${process.pid}), ${qui(verrou)} ; il attend la fin de ce processus, qui attendrait la sienne. L'environnement a perdu la marque de la prise (${VARIABLE_TENUE}) ; un essai nomme son propre verrou (${VARIABLE_VERROU}).`,
        1
      );
    const t = Date.now();
    if (t - debut >= borneMs)
      throw new AttenteDeLaMachine(
        `⏱ attente du verrou de la machine bornée à ${duree(borneMs)} (${VARIABLE_ATTENTE}) : le verrou (${verrou}) est encore tenu par ${qui(verrou)} ; à repasser (code ${A_REPASSER}).`,
        A_REPASSER
      );
    if (dit === null)
      dire(
        `⏳ la machine mesure déjà : le verrou de la mesure lourde (${verrou}) est tenu par ${qui(verrou)} ; attente de sa fin, ${duree(borneMs)} au plus.`
      );
    else if (t - dit >= rappelMs)
      dire(
        `⏳ attente du verrou de la machine depuis ${duree(t - debut)} : il est tenu par ${qui(verrou)}.`
      );
    if (dit === null || t - dit >= rappelMs) dit = t;
    if (prendreVerrou(verrou, { attendre: false })) return Date.now() - debut;
    attendreUnPeu(Math.max(1, Math.min(200, borneMs - (Date.now() - debut))));
  }
}

/**
 * Runs <mesure> under the lock of the machine and returns what it returns. <mesure> receives the
 * environment of its children, which carries the lock to them.
 * @param {(envEnfant: Record<string, string | undefined>) => T} mesure a synchronous measure
 * @param {{ env?: Record<string, string | undefined>, dire?: (ligne: string) => void,
 *   borneMs?: number, rappelMs?: number }} options `borneMs`, the bound of the wait
 *   (GRILLHOUSE_ATTENTE_MACHINE_MS, else ATTENTE_MACHINE_MS); `rappelMs`, the gap between two
 *   lines that say the wait goes on (30 s)
 * @returns {T}
 * @throws {AttenteDeLaMachine} at the bound of the wait (code 75), or at once when an ancestor
 *   holds the lock (code 1)
 * @template T
 */
export function avecLaMachine(
  mesure,
  {
    env = process.env,
    dire = l => process.stdout.write(`${l}\n`),
    borneMs = borneDe(env),
    rappelMs = RAPPEL_MS,
  } = {}
) {
  if (composantDeLEnveloppe(env)) return mesure(env);
  const verrou = verrouDeMachine(env);
  if (env[VARIABLE_TENUE] && lire(verrou) === env[VARIABLE_TENUE]) return mesure(env);
  mkdirSync(path.dirname(verrou), { recursive: true });
  if (!prendreVerrou(verrou, { attendre: false })) {
    const attendu = attendreLaMachine(verrou, { dire, borneMs, rappelMs });
    dire(`✓ verrou de la machine pris après ${Math.round(attendu / 1000)} s.`);
  }
  try {
    return mesure({ ...env, [VARIABLE_TENUE]: lire(verrou) ?? '' });
  } finally {
    lacherVerrou(verrou);
  }
}
