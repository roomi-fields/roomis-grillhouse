// The activities of the workflow of the machine: what the machine gives now (its cores, its load,
// its free memory) and whether the process of each place still lives, both read by
// scripts/mesure-de-la-machine.mjs, and the ceiling of its places, read from the configuration of
// the poste by scripts/plafond-de-la-machine.mjs.
import { mesureDeLaMachine, processusVivant } from '../../../scripts/mesure-de-la-machine.mjs';
import { plafondDe } from '../../../scripts/plafond-de-la-machine.mjs';
import type { Mesure } from './contrat.js';

/** The machine now. */
export async function mesurerLaMachine(): Promise<Mesure> {
  return Promise.resolve(mesureDeLaMachine());
}

/** The ceiling of the places as the poste names it now, or the fault of its value, by its name. */
export async function plafondDeLaMachine(): Promise<
  { plafond: number; faute: null } | { plafond: null; faute: string }
> {
  try {
    return Promise.resolve({ plafond: plafondDe(process.env), faute: null });
  } catch (e) {
    return Promise.resolve({ plafond: null, faute: (e as Error).message });
  }
}

/** For each process, whether it lives and is the one of its start. */
export async function processusVivants(
  processus: { pid: number; depart: string | null }[]
): Promise<boolean[]> {
  return Promise.resolve(processus.map(p => processusVivant(p)));
}
