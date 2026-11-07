// The client of the queue of the tickets of a project (./deroule.ts): it starts it (or leaves the
// one that runs), gives it the supervisor's session of a ticket put in it (the signal
// SEANCE_DU_SUPERVISEUR), and reads it (the query L_ETAT_DES_TICKETS).
import type { Client } from '@temporalio/client';
import {
  DES_TICKETS,
  idDesTickets,
  L_ETAT_DES_TICKETS,
  SEANCE_DU_SUPERVISEUR,
  type EntreeDesTickets,
  type VueDesTickets,
} from './contrat.js';

/**
 * Starts the queue of the tickets of <entree> on the task queue <file>, or leaves the one that
 * runs; with <seance> (the supervisor's session that puts a ticket in it, or null), signals it to
 * the queue, started if need be, which gives it to each circuit it starts then.
 */
export async function demarrerLesTickets(
  client: Client,
  entree: EntreeDesTickets,
  file: string,
  seance?: string | null
): Promise<string> {
  const id = idDesTickets(entree.racine);
  if (seance !== undefined) {
    await client.workflow.signalWithStart(DES_TICKETS, {
      workflowId: id,
      taskQueue: file,
      args: [entree],
      signal: SEANCE_DU_SUPERVISEUR,
      signalArgs: [seance],
    });
    return id;
  }
  await client.workflow.start(DES_TICKETS, {
    workflowId: id,
    taskQueue: file,
    args: [entree],
    workflowIdConflictPolicy: 'USE_EXISTING',
  });
  return id;
}

/** The queue of the tickets of the project at <racine>: its circuits alive, its fault. */
export async function lireLaFileDesTickets(client: Client, racine: string): Promise<VueDesTickets> {
  return client.workflow.getHandle(idDesTickets(racine)).query<VueDesTickets>(L_ETAT_DES_TICKETS);
}
