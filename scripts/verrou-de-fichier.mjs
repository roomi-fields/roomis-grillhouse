// The lock of a file shared between processes: the file `<verrou>` stands while someone holds it.
// Taken by the integration (`.git/integration.lock`, `.git/file-integration.lock`) and by the
// register (`registre.jsonl.verrou`).
//
// - A lock is created whole and exclusively: its mark (the owner's process number, then a token
//   unique to the taking) is written to a private file that is linked to `<verrou>`; the link
//   fails while the lock stands. A lock is never seen empty.
// - Two judgements of an abandoned lock. By default the owner's process number: a lock whose
//   process is gone is taken over. With `perime` (ms), the lock's age: a lock last written more
//   than `perime` ms ago is taken over whatever process it names, for owners that do not share
//   process numbers (a role agent runs under bwrap --unshare-pid; outside its envelope its
//   number means nothing).
// - A takeover moves the lock aside by renaming it (one taker wins), judges what it moved, and
//   deletes it only if it is the abandoned one; a fresh lock moved by mistake is put back.
// - A release removes the lock only when it still holds the mark of the taking being released.
// - The owner is the taking process by default; `pid` names another, for a lock that outlives its
//   taker (the supervisor's, taken by the session start for the session's own process,
//   scripts/superviseur.mjs).
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  linkSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { vivant } from './vitest-config/base-de-passe.mjs';

/** Blocks the process for `ms` milliseconds. */
export const attendreUnPeu = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// The marks of the locks this process holds, by lock path.
const marques = new Map();

function lire(f) {
  try {
    return readFileSync(f, 'utf8').trim();
  } catch {
    return null;
  }
}

// Whether the lock file `f` is abandoned: by its age with `perime`, else by its owner's process.
function abandonne(f, perime) {
  if (perime !== null) {
    try {
      return Date.now() - statSync(f).mtimeMs > perime;
    } catch {
      return false;
    }
  }
  const contenu = lire(f);
  const pid = contenu === null ? null : /^(\d+)(?::|$)/.exec(contenu)?.[1];
  return pid !== null && pid !== undefined && !vivant(Number(pid));
}

// Creates `verrou` holding `marque` in one step; false while it stands.
function creer(verrou, marque) {
  const prive = `${verrou}.${marque.replace(':', '-')}`;
  writeFileSync(prive, marque, { flag: 'wx' });
  try {
    linkSync(prive, verrou);
    return true;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    return false;
  } finally {
    rmSync(prive, { force: true });
  }
}

// Removes the abandoned lock `verrou`. It is moved aside first, so only one taker moves it; what
// was moved is judged again, and a lock that turns out fresh is put back.
function reprendre(verrou, perime) {
  const ecarte = `${verrou}.${process.pid}-${randomUUID()}.reprise`;
  try {
    renameSync(verrou, ecarte);
  } catch {
    return;
  }
  if (abandonne(ecarte, perime)) {
    rmSync(ecarte, { force: true });
    return;
  }
  try {
    linkSync(ecarte, verrou);
  } catch {
    // another taker already holds a new lock: the one moved aside is lost with its owner's release
  }
  rmSync(ecarte, { force: true });
}

/**
 * Takes the lock file `verrou`. Returns true once taken; with `attendre` false, returns false
 * while another holds it.
 * @param {string} verrou the lock file
 * @param {{ attendre: boolean, perime?: number | null, pid?: number }} options `perime` (ms)
 *   judges an abandoned lock by its age instead of its owner's process; `pid` names the owner,
 *   the taking process by default
 * @returns {boolean} whether the lock is taken
 */
export function prendreVerrou(verrou, { attendre, perime = null, pid = process.pid }) {
  const marque = `${pid}:${randomUUID()}`;
  for (;;) {
    if (creer(verrou, marque)) {
      marques.set(verrou, marque);
      return true;
    }
    if (abandonne(verrou, perime)) {
      reprendre(verrou, perime);
      continue;
    }
    if (!attendre) return false;
    attendreUnPeu(perime === null ? 200 : 20);
  }
}

/**
 * Releases the lock this process took on `verrou`; a lock another holds now stays.
 * @param {string} verrou the lock file
 */
export function lacherVerrou(verrou) {
  const marque = marques.get(verrou);
  marques.delete(verrou);
  if (marque !== undefined && existsSync(verrou) && lire(verrou) === marque) {
    rmSync(verrou, { force: true });
  }
}
