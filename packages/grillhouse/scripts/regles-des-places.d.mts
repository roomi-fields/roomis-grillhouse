// The types of the rules of the places of the machine (./regles-des-places.mjs), which the
// workflow of the machine under Temporal (src/temporal/places/) imports.

/** The memory a start wants free, in bytes: 4 GB. */
export const MEMOIRE_MIN: number;

export const VARIABLE_ESPACEMENT: string;
/** The jeton of the reservation of the machine by the night, which the passes of the night carry. */
export const VARIABLE_JETON: string;
/** The gap between two starts when GRILLHOUSE_ESPACEMENT_MS names none, in ms. */
export const ESPACEMENT_MS: number;
/** The gap between two starts under <env>, in ms. */
export function espacementDe(env?: Record<string, string | undefined>): number;

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
    attentes: readonly {
      id: string;
      rang: number;
      ticket?: string | null;
      raison?: string;
      jeton?: string | null;
    }[];
    dernier: number;
    reservation?: { jeton: string } | null;
  },
  o: {
    id: string;
    rang: number;
    plafond: number;
    espacementMs: number;
    maintenant: number;
    mesurer: () => MesureDeLaMachine;
    jeton?: string | null;
  }
): string | null;

/** The part of a pass: its cores and its memory (bytes). */
export interface PartDeLaPasse {
  coeurs: number;
  memoire: number;
}

/** What a pass waits for: the cores or the memory of the budget, or the load of the machine. */
export type CeQueAttendUnePart = 'cœurs' | 'mémoire' | 'charge';

/** Whether a part fits in what the parts held leave of the budget; a refusal says what it waits for. */
export function partDansLeBudget(o: {
  part: PartDeLaPasse;
  budget: PartDeLaPasse;
  prises: readonly PartDeLaPasse[];
}): { ok: boolean; attend?: CeQueAttendUnePart; raison?: string };

/** Whether a pass of the part <part> is admitted: its part fits in the budget left, then the load and
 * the memory of the machine admit it; a refusal says what it waits for, with its figures. */
export function admissionDePart(o: {
  part: PartDeLaPasse;
  budget: PartDeLaPasse;
  prises: readonly PartDeLaPasse[];
  mesure: MesureDeLaMachine;
}): { ok: boolean; attend?: CeQueAttendUnePart; raison?: string };

/** Why a pass does not take its part now on a state of the parts, null when it does. */
export function refusDePart(
  etat: {
    prises: readonly { id?: string; coeurs: number; memoire: number }[];
    attentes: readonly { id: string; rang: number; ticket?: string | null; raison?: string }[];
  },
  o: {
    id: string;
    rang: number;
    part: PartDeLaPasse;
    budget: PartDeLaPasse;
    mesurer: () => MesureDeLaMachine;
  }
): string | null;

/** A place of a circuit not given by its project's queue for this long is gone, in ms: 10 min. */
export const PERIME_MS: number;

/** The phase of the night on the places: none without a reservation, waiting, or under way. */
export function phaseDeLaNuit(etat: {
  prises: readonly { id?: string; jeton?: string | null }[];
  reservation?: { jeton: string } | null;
}): 'attend' | 'en cours' | null;

/** Whether a reservation's last beat is PERIME_MS old at <maintenant>. */
export function reservationPerimee(reservation: { battement: number }, maintenant: number): boolean;

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
  /** Its Beads priority (0 to 4) and creation, which order the circuits that wait of one group. */
  priorite?: number;
  creation?: string;
  /** The identity of its project's group, absent out of a group. */
  groupe?: string;
  /** The places of circuits its project holds at most, as its last demand said; absent unbounded. */
  max?: number;
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
    groupe?: string;
    priorites?: Record<string, { priorite: number; creation: string }>;
    /** The places of circuits the project holds at most (`grillhouse.circuits`). */
    max?: number;
  },
  o: { rang: number; plafond: number; maintenant: number; reservee?: boolean }
): { circuits: PlaceDeCircuit[]; rang: number; accordes: string[] };
