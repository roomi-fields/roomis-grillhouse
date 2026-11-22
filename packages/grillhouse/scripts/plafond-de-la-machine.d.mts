// The types of the settings of the machine (./plafond-de-la-machine.mjs): the ceiling of the places,
// which the activities of the workflow of the machine (src/temporal/places/activites.ts) import, and
// the budget of the machine and the part of a pass.
import type { PartDeLaPasse } from './regles-des-places.mjs';

export const VARIABLE_PLACES: 'GRILLHOUSE_PLACES';
export const VARIABLE_RESERVE_COEURS: 'GRILLHOUSE_RESERVE_COEURS';
export const VARIABLE_RESERVE_MEMOIRE: 'GRILLHOUSE_RESERVE_MEMOIRE_GO';
/** The file of the poste that holds the ceiling, under `~/.config/grillhouse/`. */
export const FICHIER_DE_LA_MACHINE: 'machine.env';
/** The ceiling of the places of the machine when nothing names another. */
export const PLAFOND_PAR_DEFAUT: 3;
/** The cores the reserve of the user keeps when nothing names another. */
export const RESERVE_COEURS_PAR_DEFAUT: 4;
/** The memory the reserve of the user keeps when nothing names another, in GB. */
export const RESERVE_MEMOIRE_GO_PAR_DEFAUT: 4;
/** The cores the reservation of an ordinary pass holds when its project declares none. */
export const COEURS_PAR_DEFAUT: 3;
/** The cores the reservation of a direct pass holds, fixed. */
export const COEURS_DU_DIRECT: 2;

/**
 * The ceiling of the places under <env>: GRILLHOUSE_PLACES of the environment, else of the file of
 * the poste `machine.env`, else 3; throws naming GRILLHOUSE_PLACES on a value that is not a
 * positive integer.
 */
export function plafondDe(
  env?: Record<string, string | undefined>,
  o?: { lire?: (f: string) => string | null }
): number;

/** The reserve of the user under <env>: the cores and the memory (bytes) no pass takes; throws
 * naming the variable whose value is not a whole number ≥ 0. */
export function reserveDe(
  env?: Record<string, string | undefined>,
  o?: { lire?: (f: string) => string | null }
): PartDeLaPasse;

/** The budget of the machine: its hardware less the reserve; throws naming the variable of a
 * reserve that leaves no core or no memory. */
export function budgetDe(
  materiel: { coeurs: number; memoireTotale: number },
  reserve: PartDeLaPasse
): PartDeLaPasse;

/** The reservation of a pass: the declared cores, else 3, within the budget (a direct pass: 2,
 * fixed); its memory the declared one, else the default memory, within the budget. */
export function partDe(o: {
  declaree: { coeurs?: number; memoire?: number } | null;
  budget: PartDeLaPasse;
  pic: number | undefined;
  direct?: boolean;
}): PartDeLaPasse;

/** The part a project declares in `grillhouse.part` of its package.json, or the fault naming it. */
export function partDeclareeDe(pkg: { grillhouse?: unknown } | null | undefined): {
  declaree: { coeurs?: number; memoire?: number } | null;
  faute: string | null;
};

/** The hardware of this machine: its cores and its total memory (bytes). */
export function materielDeLaMachine(): { coeurs: number; memoireTotale: number };

/** The budget of this machine under <env>. */
export function budgetDeLaMachine(env?: Record<string, string | undefined>): PartDeLaPasse;
