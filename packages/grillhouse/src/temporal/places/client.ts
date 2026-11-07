// The client of the workflow of the machine (./deroule.ts): it starts the one workflow of the
// machine if it does not run, takes a place (the update PRENDRE records the request, then the
// query LA_DEMANDE tells once it is given), gives it back or withdraws the request (the signal
// RENDRE), names the process that holds it (the signal RATTACHER), and reads the places as the
// board shows them (the query LES_PLACES), from the server and the worker of the machine.
import { randomUUID } from 'node:crypto';
import { setTimeout as dormir } from 'node:timers/promises';
import type { Client } from '@temporalio/client';
import { FILE_DE_LA_MACHINE } from '../installation.js';
import {
  ID_DES_PLACES,
  LA_DEMANDE,
  LES_PLACES,
  PLACES,
  PRENDRE,
  RATTACHER,
  RENDRE,
  TIRER_UN_RANG,
  type DemandeDePlace,
  type EntreeDesPlaces,
  type EtatDeLaDemande,
  type PlaceDonnee,
  type Rattachement,
  type VueDesPlaces,
} from './contrat.js';

/** Starts the workflow of the machine on <file>, or leaves the one that runs. */
export async function demarrerLesPlaces(
  client: Client,
  entree: EntreeDesPlaces,
  { file = FILE_DE_LA_MACHINE, id = ID_DES_PLACES }: { file?: string; id?: string } = {}
): Promise<void> {
  await client.workflow.start(PLACES, {
    workflowId: id,
    taskQueue: file,
    args: [entree],
    workflowIdConflictPolicy: 'USE_EXISTING',
  });
}

/**
 * Takes a place of the machine for <demande>: records the request under an id of its own, then
 * reads it every <veilleMs> ms until the place is given. A request withdrawn, or whose process is
 * gone, fails; <signal> aborted withdraws it.
 */
export async function prendreUnePlaceParTemporal(
  client: Client,
  demande: Omit<DemandeDePlace, 'id'>,
  {
    id = ID_DES_PLACES,
    veilleMs = 250,
    signal,
  }: { id?: string; veilleMs?: number; signal?: AbortSignal } = {}
): Promise<PlaceDonnee> {
  const h = client.workflow.getHandle(id);
  const place = randomUUID();
  const { rang } = await h.executeUpdate<PlaceDonnee, [DemandeDePlace]>(PRENDRE, {
    args: [{ ...demande, id: place }],
    updateId: place,
  });
  for (;;) {
    if (signal?.aborted) {
      await rendreLaPlace(client, place, id);
      throw signal.reason ?? new Error(`la demande de place ${place} est retirée`);
    }
    const e = await h.query<EtatDeLaDemande, [string]>(LA_DEMANDE, place);
    if (e.etat === 'donnee') {
      return { id: place, rang };
    }
    if (e.etat === 'inconnue') {
      throw new Error(
        `la demande de place ${place} n’est plus : retirée, ou son processus a disparu`
      );
    }
    await dormir(veilleMs);
  }
}

/** The next rank of arrival of the machine, drawn at the launch of a circuit, which keeps it. */
export async function tirerUnRangParTemporal(client: Client, id = ID_DES_PLACES): Promise<number> {
  return client.workflow.getHandle(id).executeUpdate<number, []>(TIRER_UN_RANG);
}

/** Gives the place <place> back, or withdraws the request <place> that waits. */
export async function rendreLaPlace(client: Client, place: string, id = ID_DES_PLACES) {
  await client.workflow.getHandle(id).signal<[string]>(RENDRE, place);
}

/** Names <processus>, the process that now holds the place <place>. */
export async function rattacherLaPlace(
  client: Client,
  place: string,
  processus: { pid: number; depart: string | null },
  id = ID_DES_PLACES
) {
  await client.workflow
    .getHandle(id)
    .signal<[Rattachement]>(RATTACHER, { id: place, ...processus });
}

/** The places of the machine as the board shows them: the ceiling, the places, the waits. */
export async function lireLesPlaces(client: Client, id = ID_DES_PLACES): Promise<VueDesPlaces> {
  return client.workflow.getHandle(id).query<VueDesPlaces>(LES_PLACES);
}
