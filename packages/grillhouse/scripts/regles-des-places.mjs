// The rules of the places of the machine, with no input nor output: whether a start is admitted
// at a load and a free memory (the load under the cores, MEMOIRE_MIN free), and why a taking does
// not pass now. The workflow of the machine (src/temporal/places/) decides by them and bundles
// this module, which imports nothing; the load and the memory come from
// scripts/mesure-de-la-machine.mjs. Architecture: docs/architecture/machine.md (§3.1, §5.2).

/** The memory a start wants free, in bytes: 4 GB. */
export const MEMOIRE_MIN = 4 * 1024 ** 3;

export const VARIABLE_ESPACEMENT = 'GRILLHOUSE_ESPACEMENT_MS';
/** Why a place waits under the closure of the machine by the supervisor (`cordon` of kubectl). */
export const RAISON_FERMEE =
  'machine fermée par le superviseur : la place est donnée à la réouverture';
/** The gap between two starts when GRILLHOUSE_ESPACEMENT_MS names none, in ms. */
export const ESPACEMENT_MS = 10_000;

/**
 * The gap between two starts under <env>, in ms.
 * @param {Record<string, string | undefined>} [env]
 * @returns {number}
 * @throws {Error} naming GRILLHOUSE_ESPACEMENT_MS when its value is not a number of ms
 */
export function espacementDe(env = process.env) {
  const v = env[VARIABLE_ESPACEMENT];
  if (v === undefined || v === '') {
    return ESPACEMENT_MS;
  }
  if (!/^\d+$/.test(v)) {
    throw new Error(
      `${VARIABLE_ESPACEMENT} vaut « ${v} » : un nombre de millisecondes est attendu.`
    );
  }
  return Number(v);
}

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
export function refusDeLaPlace(
  etat,
  { id, rang, plafond, espacementMs, maintenant, mesurer }
) {
  // The supervisor's closure, the only reservation of the machine, gives no place to anyone.
  if (etat.reservation) {
    return RAISON_FERMEE;
  }
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

const go = octets => `${nombre(octets / 1024 ** 3)} Go`;

/**
 * Whether the part <part> (`{ coeurs, memoire }`, bytes) fits in what the parts <prises> leave of
 * the <budget> of the machine: cores, then memory. A refusal says what it waits for (`attend`:
 * « cœurs » or « mémoire ») and its figures, « cœurs : 6 demandés, 4 libres sur 8 ».
 * @param {{ part: { coeurs: number, memoire: number }, budget: { coeurs: number, memoire: number },
 *   prises: { coeurs: number, memoire: number }[] }} o
 * @returns {{ ok: true } | { ok: false, attend: 'cœurs' | 'mémoire', raison: string }}
 */
export function partDansLeBudget({ part, budget, prises }) {
  const coeursLibres = budget.coeurs - prises.reduce((n, p) => n + p.coeurs, 0);
  if (part.coeurs > coeursLibres) {
    return {
      ok: false,
      attend: 'cœurs',
      raison: `cœurs : ${part.coeurs} demandés, ${Math.max(0, coeursLibres)} libres sur ${budget.coeurs}`,
    };
  }
  const memoireLibre = budget.memoire - prises.reduce((n, p) => n + p.memoire, 0);
  if (part.memoire > memoireLibre) {
    return {
      ok: false,
      attend: 'mémoire',
      raison: `mémoire : ${go(part.memoire)} demandés, ${go(Math.max(0, memoireLibre))} libres sur ${go(budget.memoire)}`,
    };
  }
  return { ok: true };
}

/**
 * Whether a pass of the part <part> is admitted: its part fits in what the parts <prises> leave of
 * the <budget> (`partDansLeBudget`), then the thresholds of `admission` hold on the machine
 * <mesure> (load under the cores, MEMOIRE_MIN free). A refusal says what it waits for (`attend`:
 * « cœurs », « mémoire » or « charge ») and its figures.
 * @param {{ part: { coeurs: number, memoire: number }, budget: { coeurs: number, memoire: number },
 *   prises: { coeurs: number, memoire: number }[],
 *   mesure: { coeurs: number, charge: number, memoireLibre: number } }} o
 * @returns {{ ok: true } | { ok: false, attend: 'cœurs' | 'mémoire' | 'charge', raison: string }}
 */
export function admissionDePart({ part, budget, prises, mesure }) {
  const tient = partDansLeBudget({ part, budget, prises });
  if (!tient.ok) {
    return tient;
  }
  const a = admission(mesure);
  return a.ok
    ? a
    : { ...a, attend: mesure.charge >= mesure.coeurs ? 'charge' : 'mémoire' };
}

/** Why a pass waits under the supervisor's closure of the machine. */
export const RAISON_DE_LA_FERMETURE = 'machine fermée par le superviseur';

/**
 * Why the pass <id> of the rank <rang> does not take its part <part> now on the state <etat>
 * (`prises`, `attentes`), null when it does: its part does not fit in the <budget>; a wait of a
 * lower rank, alive, which keeps its turn (the measure of the frame has the lower rank of a
 * project's, then the order of arrival); the admission at the load and the memory <mesurer> gives
 * (read only when the part and the turn pass). A measure of time (<dediee>) asks for dedicated cores: when they lack, its refusal
 * says « cœurs dédiés » and names the passes that hold them; a pass that comes after it waits
 * behind it, its rank reserved, and one measure plays at a time, whatever its part would fit in the free cores; once it plays, an
 * ordinary pass whose part fits in the cores left goes on.
 * @param {{ prises: { id?: string, coeurs: number, memoire: number, ticket?: string | null }[],
 *   attentes: { id: string, rang: number, ticket?: string | null, raison?: string }[] }} etat
 * @param {{ id: string, rang: number, part: { coeurs: number, memoire: number },
 *   budget: { coeurs: number, memoire: number }, dediee?: boolean,
 *   mesurer: () => { coeurs: number, charge: number, memoireLibre: number } }} o
 * @returns {string | null}
 */
export function refusDePart(
  etat,
  { id, rang, part, budget, mesurer, dediee = false, reservation = null }
) {
  // A closed machine gives no new work (`cordon` of kubectl): the supervisor's closure refuses every pass.
  if (reservation) {
    return RAISON_DE_LA_FERMETURE;
  }
  const prises = etat.prises.filter(p => p.id !== id);
  // Two measures of time never play side by side: each would be the load the other is judged on.
  const autre = dediee ? prises.find(p => p.dediee) : undefined;
  if (autre) {
    return `cœurs dédiés : la mesure de ${autre.ticket ?? 'une passe'} les tient, une mesure à la fois`;
  }
  const tient = partDansLeBudget({ part, budget, prises });
  if (!tient.ok) {
    if (dediee && tient.attend === 'cœurs') {
      const tenues = prises.map(p => p.ticket ?? 'une passe').join(', ');
      return `cœurs dédiés${tient.raison.slice('cœurs'.length)}${tenues ? ` ; tenus par ${tenues}` : ''}`;
    }
    return tient.raison;
  }
  const avant = etat.attentes.find(a => a.id !== id && a.rang < rang);
  if (avant) {
    return `rang réservé : ${avant.ticket ?? 'une passe'} est arrivée avant et attend (${avant.raison})`;
  }
  const a = admissionDePart({ part, budget, prises, mesure: mesurer() });
  return a.ok ? null : a.raison;
}

/** A place of a circuit not given by its project's queue for this long is gone, in ms: 10 min. */
export const PERIME_MS = 10 * 60_000;

/**
 * The phase of the supervisor's closure of the machine: null without one; `'attend'` while a place
 * is held (the stages under way finish); then `'vide'` (it holds no place itself: every place held
 * waits to be given back).
 * @param {{ prises: object[], reservation?: object | null }} etat
 * @returns {'attend' | 'vide' | null}
 */
export function phaseDeLaReservation({ prises, reservation = null }) {
  if (!reservation) {
    return null;
  }
  return prises.length > 0 ? 'attend' : 'vide';
}

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
 *
 * Between the projects of one group (`grillhouse.groupe`, `groupe` its identity, absent out of a
 * group), the priority orders the circuits that wait: each candidate carries its Beads priority and
 * its creation (`priorites`), and the circuits not granted of one group share out their own ranks
 * of arrival again by priority (P0 to P4), age, then rank. A circuit already granted keeps its
 * place (a higher priority arriving later passes only the ones that wait), a project out of a
 * group and the order of the groups between them keep the order of arrival.
 *
 * The project <racine> holds at most <max> places of circuits (`grillhouse.circuits`, read by
 * scripts/circuits-cles.mjs), the circuits resumed after their question with the others: past it,
 * its circuits that wait keep waiting, whichever project's demand judges them, and the other
 * projects still pass.
 * @param {Array<{ racine: string, ticket: string, rang: number, accordee: boolean, depuis: number,
 *   vu: number, reprise?: boolean, raison?: string | null, priorite?: number, creation?: string,
 *   groupe?: string }>} places
 * @param {{ racine: string, vivants?: string[], candidats?: string[], disque?: string | null,
 *   reprise?: { ticket: string, rang: number | null }, groupe?: string,
 *   priorites?: Record<string, { priorite: number, creation: string }>, max?: number }} demande
 * @param {{ rang: number, plafond: number, maintenant: number, reservee?: boolean }} o `reservee`:
 *   the machine is reserved by the night, no place is given
 */
export function reserverDesCircuits(places, demande, o) {
  const {
    racine,
    vivants = [],
    candidats = [],
    disque = null,
    reprise,
    groupe,
    priorites = {},
    max,
  } = demande;
  const { plafond, maintenant, reservee = false } = o;
  let { rang } = o;
  const siens = new Set([...vivants, ...candidats]);
  const garde = c =>
    maintenant - c.vu < PERIME_MS &&
    (c.racine !== racine || siens.has(c.ticket) || Boolean(reprise) || (c.reprise && !c.accordee));
  const circuits = places.filter(garde).map(c => ({ ...c }));
  // What the demand says of a ticket's place: its group, its priority and its creation.
  const dit = ticket => ({
    ...(groupe === undefined ? {} : { groupe }),
    ...(max === undefined ? {} : { max }),
    ...(priorites[ticket] === undefined
      ? {}
      : { priorite: priorites[ticket].priorite, creation: priorites[ticket].creation }),
  });
  const placer = (ticket, accordee, o2 = {}) => {
    const c = circuits.find(x => x.racine === racine && x.ticket === ticket);
    if (c) {
      c.vu = maintenant;
      c.accordee = c.accordee || accordee;
      if (accordee) {
        c.reprise = false;
      }
      Object.assign(c, dit(ticket), o2.maj ?? {});
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
      ...dit(ticket),
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
  // The circuits not granted of each group share out their own ranks again, by priority, age, rank.
  const sorte = c => [c.priorite ?? 2, Date.parse(c.creation ?? '') || 0, c.rang];
  const parGroupe = Map.groupBy(
    circuits.filter(c => !c.accordee && c.groupe !== undefined),
    c => c.groupe
  );
  for (const attente of parGroupe.values()) {
    const rangs = attente.map(c => c.rang).sort((a, b) => a - b);
    attente
      .toSorted((a, b) => {
        const [x, y] = [sorte(a), sorte(b)];
        return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
      })
      .forEach((c, i) => {
        c.rang = rangs[i];
      });
  }
  let tenues = circuits.filter(c => c.accordee).length;
  // The places of circuits each project holds, under the bound its last demand carried (`max`).
  const tenuesDe = r => circuits.filter(c => c.accordee && c.racine === r).length;
  for (const c of circuits.filter(x => !x.accordee).sort((a, b) => a.rang - b.rang)) {
    // Under the reservation of the night no place is new: circuits alive keep theirs.
    if (reservee || tenues >= plafond) {
      break;
    }
    if (c.raison || (c.max !== undefined && tenuesDe(c.racine) >= c.max)) {
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
