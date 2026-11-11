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
}

/**
 * The places of the circuits once the queue of a project gives its circuits alive and the tickets
 * it would start: granted in the order of arrival of every project under the ceiling; the
 * candidates that hold a place.
 */
export function reserverDesCircuits(
  places: readonly PlaceDeCircuit[],
  demande: { racine: string; vivants: string[]; candidats: string[] },
  o: { rang: number; plafond: number; maintenant: number }
): { circuits: PlaceDeCircuit[]; rang: number; accordes: string[] };
