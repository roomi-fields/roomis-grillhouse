// The types of the measure of the machine (./mesure-de-la-machine.mjs), which the activity of the workflow of
// the machine under Temporal (src/temporal/places/activites.ts) imports.
import type { MesureDeLaMachine } from './regles-des-places.mjs';

/** The memory available now, in bytes. */
export function memoireDisponible(): number;

/** The machine now: its cores, its load over one minute, its free memory in bytes. */
export function mesureDeLaMachine(): MesureDeLaMachine;

/** The start of the process <pid> as the system gives it, null when it is gone. */
export function departDe(pid: number): string | null;

/** Whether the process <pid> lives and is the one of its start <depart>. */
export function processusVivant(p: { pid: number; depart: string | null }): boolean;

/** <signal> to the process group <groupe>; false when the group is gone. */
export function signalerGroupe(groupe: number | null | undefined, signal: NodeJS.Signals | 0): boolean;

/** Whether the group a sign of life <vie> names still runs, its leader dead or alive. */
export function groupeVivant(vie: { pid: number; depart?: string | null } | null | undefined): boolean;
