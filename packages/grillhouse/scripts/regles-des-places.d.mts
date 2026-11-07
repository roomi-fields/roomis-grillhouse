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
