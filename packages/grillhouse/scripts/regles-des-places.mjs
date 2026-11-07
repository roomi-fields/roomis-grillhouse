// The rules of the places of the machine, with no input nor output: whether a start is admitted
// at a load and a free memory, as `make -l` admits it, and why a taking does not pass now. The
// workflow of the machine (src/temporal/places/, grillhouse-4nr.7) holds the places of the machine
// and decides by them; a session or a pass takes its place there by
// scripts/places-de-la-machine.mjs. The workflow bundles this module, which imports nothing. What
// the machine gives, its load and its memory, is measured by scripts/mesure-de-la-machine.mjs.

/** The memory a start wants free, in bytes: 4 GB. */
export const MEMOIRE_MIN = 4 * 1024 ** 3;

// 11.2 → « 11,2 », 4 → « 4 ».
const nombre = n => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

/**
 * A duration as a line says it: seconds under 2 min, else minutes.
 * @param {number} ms
 * @returns {string}
 */
export const duree = ms =>
  ms < 120_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`;

/**
 * Whether a start is admitted at this load and this free memory, as `make -l` admits it: the load
 * under the number of cores, and at least MEMOIRE_MIN free. A refusal says why.
 * @param {{ coeurs: number, charge: number, memoireLibre: number }} o `memoireLibre` in bytes
 * @returns {{ ok: true } | { ok: false, raison: string }}
 */
export function admission({ coeurs, charge, memoireLibre }) {
  if (charge >= coeurs) {
    return { ok: false, raison: `charge de la machine ${nombre(charge)} sur ${coeurs} cœurs` };
  }
  if (memoireLibre < MEMOIRE_MIN) {
    return {
      ok: false,
      raison: `mémoire libre ${nombre(memoireLibre / 1024 ** 3)} Go, sous les ${MEMOIRE_MIN / 1024 ** 3} Go demandés`,
    };
  }
  return { ok: true };
}

/**
 * Why the taking <id> of the rank <rang> does not pass now on the state <etat> (`prises`,
 * `attentes`, `dernier`, the time of the last start), null when it passes: no free place under
 * <plafond>; a wait of a lower rank alive, which keeps its turn between projects; the admission at
 * the load and the memory <mesurer> gives (read only when the place and the turn pass); two starts
 * closer than <espacementMs> at the time <maintenant>.
 * @param {{ prises: object[], attentes: { id: string, rang: number, ticket?: string | null,
 *   raison?: string }[], dernier: number }} etat
 * @param {{ id: string, rang: number, plafond: number, espacementMs: number, maintenant: number,
 *   mesurer: () => { coeurs: number, charge: number, memoireLibre: number } }} o
 * @returns {string | null}
 */
export function refusDeLaPlace(etat, { id, rang, plafond, espacementMs, maintenant, mesurer }) {
  if (etat.prises.length >= plafond) {
    return `aucune place libre : ${etat.prises.length} prises sur ${plafond}`;
  }
  const avant = etat.attentes.find(a => a.id !== id && a.rang < rang);
  if (avant) {
    return `place réservée : ${avant.ticket ?? 'un départ'} est arrivé avant et attend (${avant.raison})`;
  }
  const a = admission(mesurer());
  if (!a.ok) {
    return a.raison;
  }
  const ecoule = maintenant - etat.dernier;
  if (ecoule < espacementMs) {
    return `espacement des départs : le dernier date de ${duree(ecoule)}, ${duree(espacementMs)} au moins`;
  }
  return null;
}
