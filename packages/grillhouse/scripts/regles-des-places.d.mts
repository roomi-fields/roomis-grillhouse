// The types of the rules of the places of the machine (./regles-des-places.mjs), which the
// workflow of the machine under Temporal (src/temporal/places/) imports.

/** The memory a start wants free, in bytes: 4 GB. */
export const MEMOIRE_MIN: number;

/** A duration as a line says it: seconds under 2 min, else minutes. */
export function duree(ms: number): string;

/** What the machine gives at a moment: its cores, its load over one minute, its free memory. */
export interface MesureDeLaMachine {
  coeurs: number;
  charge: number;
  /** In bytes. */
  memoireLibre: number;
}

/** Whether a start is admitted at this load and this free memory; a refusal says why. */
export function admission(m: MesureDeLaMachine): { ok: true } | { ok: false; raison: string };

/** Why a taking does not pass now on a state of the places, null when it passes. */
export function refusDeLaPlace(
  etat: {
    prises: readonly unknown[];
    attentes: readonly { id: string; rang: number; ticket?: string | null; raison?: string }[];
    dernier: number;
  },
  o: {
    id: string;
    rang: number;
    plafond: number;
    espacementMs: number;
    maintenant: number;
    mesurer: () => MesureDeLaMachine;
  }
): string | null;

/** A place of a circuit not given by its project's queue for this long is gone, in ms: 10 min. */
export const PERIME_MS: number;

/** The place of a circuit of the machine: held (`accordee`) or waited for, its rank of arrival. */
export interface PlaceDeCircuit {
  racine: string;
  ticket: string;
  rang: number;
  accordee: boolean;
  depuis: number;
  vu: number;
  /** A circuit resumed after its question, which asks again by itself. */
  reprise?: boolean;
  /** Why it waits apart from the order of arrival (its disk of copies), null without. */
  raison?: string | null;
}

/**
 * The places of the circuits once a demand comes: the queue of a project gives its circuits active,
 * the tickets it would start and the reason its disk lacks room; or a circuit resumed asks again by
 * itself (`reprise`). Granted in the order of arrival of every project under the ceiling, a
 * candidate short of disk aside; the tickets of the demand that hold a place.
 */
export function reserverDesCircuits(
  places: readonly PlaceDeCircuit[],
  demande: {
    racine: string;
    vivants?: string[];
    candidats?: string[];
    disque?: string | null;
    reprise?: { ticket: string; rang: number | null };
  },
  o: { rang: number; plafond: number; maintenant: number }
): { circuits: PlaceDeCircuit[]; rang: number; accordes: string[] };
