// The client of the workflow of the machine (./deroule.ts): it starts the one workflow of the
// machine if it does not run, takes a place (the update PRENDRE records the request, then the
// query LA_DEMANDE tells once it is given), gives it back or withdraws the request (the signal
// RENDRE), names the process that holds it (the signal RATTACHER), and reads the places as the
// board shows them (the query LES_PLACES), and gives the machine the circuits of a project to
// learn which may start (the update RESERVER), from the server and the worker of the machine.
import { randomUUID } from 'node:crypto';
import { setTimeout as dormir } from 'node:timers/promises';
import type { Client } from '@temporalio/client';
import { FILE_DE_LA_MACHINE } from '../installation.js';
import {
  BATTRE_LA_RESERVATION,
  ID_DES_PLACES,
  LA_DEMANDE,
  LES_PLACES,
  LEVER_LA_RESERVATION,
  RESERVER_LA_MACHINE,
  PLACES,
  PRENDRE,
  RATTACHER,
  RENDRE,
  RESERVER,
  TIRER_UN_RANG,
  type CircuitsDuProjet,
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

/**
 * Reserves the whole machine for the night <jeton> (RESERVER_LA_MACHINE): no place is given but to
 * the requests that carry the jeton, no circuit starts, the places taken finish. The update
 * returns at once; the phase is read in `lireLesPlaces`.
 */
export async function reserverLaMachineEntiere(
  client: Client,
  { jeton }: { jeton: string },
  id = ID_DES_PLACES
): Promise<void> {
  await client.workflow
    .getHandle(id)
    .executeUpdate<void, [string]>(RESERVER_LA_MACHINE, { args: [jeton] });
}

/** Renews the reservation <jeton>: its beat, which keeps it from going out of date. */
export async function battreLaReservation(
  client: Client,
  jeton: string,
  id = ID_DES_PLACES
): Promise<void> {
  await client.workflow
    .getHandle(id)
    .executeUpdate<void, [string]>(BATTRE_LA_RESERVATION, { args: [jeton] });
}

/** Lifts the reservation <jeton>; another jeton lifts nothing. */
export async function leverLaReservation(
  client: Client,
  jeton: string,
  id = ID_DES_PLACES
): Promise<void> {
  await client.workflow
    .getHandle(id)
    .executeUpdate<void, [string]>(LEVER_LA_RESERVATION, { args: [jeton] });
}

/**
 * The tickets of the demand <c> that hold a place of a circuit (RESERVER: the candidates the
 * machine lets the project start, or the circuit resumed), in the order of arrival of every
 * project, under its ceiling; every one where no workflow of the machine runs (no place is taken
 * on that server, as in the CI).
 */
export async function reserverDesCircuits(
  client: Client,
  c: CircuitsDuProjet,
  id = ID_DES_PLACES
): Promise<string[]> {
  const tous = [...(c.candidats ?? []), ...(c.reprise ? [c.reprise.ticket] : [])];
  const h = client.workflow.getHandle(id);
  try {
    if ((await h.describe()).status.name !== 'RUNNING') {
      return tous;
    }
  } catch (e) {
    if ((e as Error).name === 'WorkflowNotFoundError') {
      return tous;
    }
    throw e;
  }
  return h.executeUpdate<string[], [CircuitsDuProjet]>(RESERVER, { args: [c] });
}
