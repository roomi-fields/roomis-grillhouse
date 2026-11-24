// What the machine gives at a moment, which the admission of a start reads
// (scripts/regles-des-places.mjs): its cores, its load over one minute, its free memory, and its
// total memory, which the board shows beside it. The
// activity of the workflow of the machine (src/temporal/places/activites.ts) measures it here, and
// whether the process of a place still lives; a signal to a process group, and whether the group
// a sign of life names still runs, which the sessions (scripts/seances.mjs), the circuit and the
// acts under Temporal (src/temporal/acte.ts) share. Architecture: docs/architecture/machine.md
// (§3.1, §5.2).
import { readFileSync } from 'node:fs';
import { availableParallelism, freemem, loadavg, totalmem } from 'node:os';
import { departDe, leMemeVivant, vivant } from './mesure/base-de-passe.mjs';

export { departDe };

/**
 * What <texte> (/proc/meminfo) says the machine still gives, in bytes: the memory available
 * (MemAvailable, null when it does not say it) and the free swap (SwapFree, 0 without swap).
 * @param {string} texte
 * @returns {{ disponible: number | null, echange: number }}
 */
export function lireLaMemoire(texte) {
  const kio = cle => new RegExp(`^${cle}:\\s+(\\d+) kB`, 'm').exec(texte)?.[1];
  const disponible = kio('MemAvailable');
  return {
    disponible: disponible === undefined ? null : Number(disponible) * 1024,
    echange: Number(kio('SwapFree') ?? 0) * 1024,
  };
}

/**
 * What the machine still gives now, as `lireLaMemoire`; nothing known where /proc/meminfo does
 * not read.
 * @returns {{ disponible: number | null, echange: number }}
 */
export function memoireRestante() {
  try {
    return lireLaMemoire(readFileSync('/proc/meminfo', 'utf8'));
  } catch {
    return { disponible: null, echange: 0 };
  }
}

/**
 * The memory available now, in bytes (MemAvailable of the kernel, else the free memory of node).
 * @returns {number}
 */
export function memoireDisponible() {
  return memoireRestante().disponible ?? freemem();
}

/**
 * The machine now: `{ coeurs, charge, memoireLibre, memoireTotale }`, the load over one minute,
 * the memories in bytes.
 * @returns {{ coeurs: number, charge: number, memoireLibre: number, memoireTotale: number }}
 */
export const mesureDeLaMachine = () => ({
  coeurs: availableParallelism(),
  charge: loadavg()[0],
  memoireLibre: memoireDisponible(),
  memoireTotale: totalmem(),
});

/**
 * Whether the process <pid> lives and is the one of its start <depart> (`departDe`; any process
 * of that number without a start): a place whose process is gone is free.
 * @param {{ pid: number, depart: string | null }} p
 * @returns {boolean}
 */
export const processusVivant = ({ pid, depart }) =>
  depart ? leMemeVivant(pid, depart) : vivant(pid);

/**
 * <signal> to the process group <groupe>; false when the group is gone (or not the caller's).
 * @param {number | null | undefined} groupe
 * @param {NodeJS.Signals | 0} signal
 * @returns {boolean}
 */
export function signalerGroupe(groupe, signal) {
  if (!groupe) {
    return false;
  }
  try {
    process.kill(-groupe, signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the group a sign of life <vie> names still runs: its group answers, and its leader, when
 * it lives, is the process of its start (a number reused names another); a group whose leader died
 * runs as long as one of its processes does.
 * @param {{ pid: number, depart?: string | null } | null | undefined} vie
 * @returns {boolean}
 */
export const groupeVivant = vie =>
  Boolean(vie?.pid) &&
  signalerGroupe(vie.pid, 0) &&
  (!vie.depart || !vivant(vie.pid) || leMemeVivant(vie.pid, vie.depart));
