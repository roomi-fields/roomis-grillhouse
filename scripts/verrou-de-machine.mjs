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
// - A second measure waits for the end of the first; it says once that it waits, and whom for (the
//   process that holds the lock and its working directory), then plays once it holds the lock.
// - Who holds the lock passes it to its children, as make passes its job server in MAKEFLAGS: the
//   variable GRILLHOUSE_MESURE_TENUE carries the mark of the taking, and a process whose variable
//   names the mark the lock holds plays under it without taking it again (the final pass of the
//   circuit, `npm run verifier`, under the circuit's lock).
// - In the envelope of an agent (GRILLHOUSE_ENVELOPPE set, scripts/enveloppe/composant.mjs) no lock
//   is taken: the envelope has its own process space, where an owner's number means nothing
//   outside, and its home shows no cache.
// - The lock is let go at the end of the measure, whether it succeeds or throws.
import { mkdirSync, readFileSync, readlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { composantDeLEnveloppe } from './enveloppe/composant.mjs';
import { lacherVerrou, prendreVerrou } from './verrou-de-fichier.mjs';

const VARIABLE_VERROU = 'GRILLHOUSE_VERROU_MACHINE';
const VARIABLE_TENUE = 'GRILLHOUSE_MESURE_TENUE';

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

// Who holds the lock <verrou>: its process and that process's working directory, when they read.
function qui(verrou) {
  const pid = /^(\d+)/.exec(lire(verrou) ?? '')?.[1];
  if (!pid) return 'une autre mesure';
  let ou = '';
  try {
    ou = ` (dans ${readlinkSync(`/proc/${pid}/cwd`)})`;
  } catch {
    // its directory does not read: the process alone is named
  }
  return `le processus ${pid}${ou}`;
}

/**
 * Runs <mesure> under the lock of the machine and returns what it returns. <mesure> receives the
 * environment of its children, which carries the lock to them.
 * @param {(envEnfant: Record<string, string | undefined>) => T} mesure a synchronous measure
 * @param {{ env?: Record<string, string | undefined>, dire?: (ligne: string) => void }} options
 * @returns {T}
 * @template T
 */
export function avecLaMachine(
  mesure,
  { env = process.env, dire = l => process.stdout.write(`${l}\n`) } = {}
) {
  if (composantDeLEnveloppe(env)) return mesure(env);
  const verrou = verrouDeMachine(env);
  if (env[VARIABLE_TENUE] && lire(verrou) === env[VARIABLE_TENUE]) return mesure(env);
  mkdirSync(path.dirname(verrou), { recursive: true });
  if (!prendreVerrou(verrou, { attendre: false })) {
    dire(
      `⏳ la machine mesure déjà : ${qui(verrou)} tient le verrou de la mesure lourde (${verrou}) ; attente de sa fin.`
    );
    const debut = Date.now();
    prendreVerrou(verrou, { attendre: true });
    dire(`✓ verrou de la machine pris après ${Math.round((Date.now() - debut) / 1000)} s.`);
  }
  try {
    return mesure({ ...env, [VARIABLE_TENUE]: lire(verrou) ?? '' });
  } finally {
    lacherVerrou(verrou);
  }
}
