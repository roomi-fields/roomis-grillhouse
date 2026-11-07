// The activities of the workflow of the machine: what the machine gives now (its cores, its load,
// its free memory) and whether the process of each place still lives, both read by
// scripts/mesure-de-la-machine.mjs.
import { mesureDeLaMachine, processusVivant } from '../../../scripts/mesure-de-la-machine.mjs';
import type { Mesure } from './contrat.js';

/** The machine now. */
export async function mesurerLaMachine(): Promise<Mesure> {
  return Promise.resolve(mesureDeLaMachine());
}

/** For each process, whether it lives and is the one of its start. */
export async function processusVivants(
  processus: { pid: number; depart: string | null }[]
): Promise<boolean[]> {
  return Promise.resolve(processus.map(p => processusVivant(p)));
}
