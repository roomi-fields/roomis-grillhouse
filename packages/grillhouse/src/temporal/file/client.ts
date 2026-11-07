// The client of the queue of a project (./deroule.ts): it reads it (the query L_ETAT_DE_LA_FILE).
// The workflow of a ticket starts it when none runs and enters it at its step 5.2
// (`entrerDansLaFile`).
import type { Client } from '@temporalio/client';
import { idDeLaFile, L_ETAT_DE_LA_FILE, type VueDeLaFile } from './contrat.js';

/** The queue of the project at <racine>: the entry under way and those that wait. */
export async function lireLaFile(client: Client, racine: string): Promise<VueDeLaFile> {
  return client.workflow.getHandle(idDeLaFile(racine)).query<VueDeLaFile>(L_ETAT_DE_LA_FILE);
}
