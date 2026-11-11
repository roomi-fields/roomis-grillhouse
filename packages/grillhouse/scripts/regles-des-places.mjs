// The rules of the places of the machine, with no input nor output: whether a start is admitted
// at a load and a free memory, as `make -l` admits it, and why a taking does not pass now. The
// workflow of the machine (src/temporal/places/, grillhouse-4nr.7) holds the places of the machine
// and decides by them; a session or a pass takes its place there by
// scripts/places-de-la-machine.mjs; the places of the circuits, which the queue of each project
// reserves (`reserverDesCircuits`). The workflow bundles this module, which imports nothing. What
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

/** A place of a circuit not given by its project's queue for this long is gone, in ms: 10 min. */
export const PERIME_MS = 10 * 60_000;

/**
 * The places of the circuits of the machine once a demand comes, as Buildkite bounds its pipelines
 * in one fleet of agents. The queue of the project <racine> gives its circuits active <vivants>
 * (a circuit paused on a question gives its place back) and the tickets it would start
 * <candidats>, with the reason its disk of copies lacks room (<disque>, null with room): its
 * circuits active hold their place, its candidates wait for one, each its rank of arrival among
 * every project, drawn from <rang>; its other places, but a circuit resumed that waits, and those
 * no demand gave for PERIME_MS, are gone. A circuit resumed after its question asks again by
 * itself (<reprise>: its ticket and its rank of arrival, a new one when null), as a candidate,
 * without the disk, its copy already there. The places are granted in the order of arrival while
 * the circuits that hold one are fewer than <plafond>: the first that waits keeps the next ones
 * waiting, but a candidate short of disk, which waits with its reason and keeps no one. Gives the
 * places, the last rank drawn, and the tickets of the demand that hold a place.
 * @param {Array<{ racine: string, ticket: string, rang: number, accordee: boolean, depuis: number,
 *   vu: number, reprise?: boolean, raison?: string | null }>} places
 * @param {{ racine: string, vivants?: string[], candidats?: string[], disque?: string | null,
 *   reprise?: { ticket: string, rang: number | null } }} demande
 * @param {{ rang: number, plafond: number, maintenant: number }} o
 */
export function reserverDesCircuits(places, demande, o) {
  const { racine, vivants = [], candidats = [], disque = null, reprise } = demande;
  const { plafond, maintenant } = o;
  let { rang } = o;
  const siens = new Set([...vivants, ...candidats]);
  const garde = c =>
    maintenant - c.vu < PERIME_MS &&
    (c.racine !== racine || siens.has(c.ticket) || Boolean(reprise) || (c.reprise && !c.accordee));
  const circuits = places.filter(garde).map(c => ({ ...c }));
  const placer = (ticket, accordee, o2 = {}) => {
    const c = circuits.find(x => x.racine === racine && x.ticket === ticket);
    if (c) {
      c.vu = maintenant;
      c.accordee = c.accordee || accordee;
      if (accordee) {
        c.reprise = false;
      }
      Object.assign(c, o2.maj ?? {});
      return;
    }
    const r = o2.rang ?? (rang += 1);
    rang = Math.max(rang, r);
    circuits.push({
      racine,
      ticket,
      rang: r,
      accordee,
      depuis: maintenant,
      vu: maintenant,
      ...(o2.maj ?? {}),
    });
  };
  vivants.forEach(t => placer(t, true));
  candidats.forEach(t => placer(t, false, { maj: { raison: disque } }));
  if (reprise) {
    placer(reprise.ticket, false, {
      rang: reprise.rang ?? undefined,
      maj: { reprise: true, raison: null },
    });
  }
  let tenues = circuits.filter(c => c.accordee).length;
  for (const c of circuits.filter(x => !x.accordee).sort((a, b) => a.rang - b.rang)) {
    if (tenues >= plafond) {
      break;
    }
    if (c.raison) {
      continue;
    }
    c.accordee = true;
    tenues += 1;
  }
  const demandes = reprise ? [...candidats, reprise.ticket] : candidats;
  const accordes = demandes.filter(t =>
    circuits.some(c => c.racine === racine && c.ticket === t && c.accordee)
  );
  return { circuits, rang, accordes };
}
