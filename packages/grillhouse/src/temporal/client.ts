// The common client library of the frame's Temporal: the one module that opens the Temporal
// client and the worker's connection, which the workers, `grillhouse temporal etat` and every
// client of the frame read. The address and the namespace come from Temporal's own variables
// (TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE), as the `temporal` program and the SDKs read them, the
// account's server on the loopback by default. The client it opens is lazy: opening it opens no
// network, its first call does. It also holds the gesture that makes a worker's version current
// (`rendreCourante`).
import { Client, Connection } from '@temporalio/client';
import { defaultPayloadConverter, type Payload } from '@temporalio/common';
import { NativeConnection } from '@temporalio/worker';
import { ATTRIBUT_ETAPE, ATTRIBUT_TICKET } from './attributs.js';
import type { SigneDeVie } from './sonde/contrat.js';

export { ATTRIBUTS_DE_RECHERCHE } from './attributs.js';

type Env = Record<string, string | undefined>;

/** The account's server: the loopback, Temporal's port. */
export const ADRESSE_PAR_DEFAUT = '127.0.0.1:7233';

/** The address of the server: TEMPORAL_ADDRESS, or the account's server. */
export const adresseDuServeur = (env: Env = process.env): string =>
  env.TEMPORAL_ADDRESS || ADRESSE_PAR_DEFAUT;

/** The namespace: TEMPORAL_NAMESPACE, or `default`. */
export const espaceDeNoms = (env: Env = process.env): string => env.TEMPORAL_NAMESPACE || 'default';

/**
 * The page of the workflow <id> on the web UI of the server at <adresse>, in the namespace
 * <espace>: the UI listens on the server's port plus 1000, as `temporal server start-dev` sets it
 * by default and the installer writes it (`--ui-port`).
 */
export function lienDuTableauWeb(adresse: string, espace: string, id: string): string {
  const deux = adresse.lastIndexOf(':');
  const hote = adresse.slice(0, deux);
  const port = Number(adresse.slice(deux + 1)) + 1000;
  return `http://${hote}:${port}/namespaces/${encodeURIComponent(espace)}/workflows/${encodeURIComponent(id)}`;
}

/** Where to reach the server; each field from the environment when absent. */
export interface OuOuvrir {
  adresse?: string;
  espace?: string;
}

/** A client opened, its address, and how to close it. */
export interface ClientOuvert {
  client: Client;
  adresse: string;
  fermer: () => Promise<void>;
}

/** Opens the Temporal client of the server <adresse>, lazily: no network until its first call. */
export function ouvrirLeClient({ adresse, espace }: OuOuvrir = {}): ClientOuvert {
  const a = adresse ?? adresseDuServeur();
  const connection = Connection.lazy({ address: a });
  const client = new Client({ connection, namespace: espace ?? espaceDeNoms() });
  return { client, adresse: a, fermer: () => connection.close() };
}

/** Opens the connection of a worker to the server <adresse>; it connects at once. */
export function ouvrirLaConnexionDuTravailleur({
  adresse,
}: Pick<OuOuvrir, 'adresse'> = {}): Promise<NativeConnection> {
  return NativeConnection.connect({ address: adresse ?? adresseDuServeur() });
}

// How long `rendreCourante` waits for the server by default.
const DELAI_VERSION_CONNUE_MS = 50_000;

// The refusals of a server that does not know the version yet, or one of its pollers: gRPC
// NOT_FOUND and FAILED_PRECONDITION.
const PAS_ENCORE = [5, 9];
const PAUSE_ENTRE_LECTURES_MS = 200;
// A routing change not yet propagated to the task queues
// (temporal.api.enums.v1.RoutingConfigUpdateState.IN_PROGRESS).
const ROUTAGE_EN_COURS = 1;

/**
 * Makes the version `version` the current one of the Worker Deployment of the task queue `file`
 * (installation.md §2.6), the one gesture of the frame that does it: it waits until the server
 * knows that version, which a worker announces by polling, and until the new routing has reached
 * the task queues, so that a workflow started next is served by it. A version already current is
 * left as it is. After `delaiMs`, it fails, naming the version and what the server last said.
 */
export async function rendreCourante(
  client: Client,
  file: string,
  version: string,
  delaiMs = DELAI_VERSION_CONNUE_MS
): Promise<void> {
  const deploiement = { namespace: client.options.namespace, deploymentName: file };
  const limite = Date.now() + delaiMs;
  let dernier = 'aucune réponse';
  for (;;) {
    try {
      const { workerDeploymentInfo: info } =
        await client.workflowService.describeWorkerDeployment(deploiement);
      if (info?.routingConfig?.currentDeploymentVersion?.buildId !== version) {
        await client.workflowService.setWorkerDeploymentCurrentVersion({
          ...deploiement,
          buildId: version,
          identity: client.options.identity,
        });
      } else if (Number(info.routingConfigUpdateState) !== ROUTAGE_EN_COURS) {
        return;
      } else {
        dernier = 'le routage n’a pas encore atteint les files de tâches';
      }
    } catch (e) {
      const { code, message } = e as { code?: number; message?: string };
      if (code === undefined || !PAS_ENCORE.includes(code)) {
        throw e;
      }
      dernier = message ?? String(code);
    }
    if (Date.now() >= limite) {
      throw new Error(
        `temporal : la version ${version} du déploiement ${file} n’est pas courante après ${delaiMs / 1000} s : ${dernier}`
      );
    }
    await new Promise(r => setTimeout(r, PAUSE_ENTRE_LECTURES_MS));
  }
}

/** How long `serveurJoignable` waits for the server by default. */
export const DELAI_JOIGNABLE_MS = 2000;

/** Whether the server <adresse> answers within <delaiMs> ms. */
export async function serveurJoignable(adresse = adresseDuServeur(), delaiMs = DELAI_JOIGNABLE_MS) {
  let connection: Connection | undefined;
  try {
    connection = await Connection.connect({ address: adresse, connectTimeout: delaiMs });
    await connection.withDeadline(Date.now() + delaiMs, () =>
      connection!.workflowService.getSystemInfo({})
    );
    return true;
  } catch {
    return false;
  } finally {
    await connection?.close();
  }
}

/** What the server alone says of a workflow, no worker living. */
export interface LectureDuDeroule {
  statut: string;
  memo: Record<string, unknown> | undefined;
  ticket: string | undefined;
  etape: string | undefined;
  /** The last sign of life of its running activity, if any. */
  signeDeVie: SigneDeVie | undefined;
}

/** Reads the workflow <id> from the server: its status, memo, search attributes, sign of life. */
export async function lireLeDeroule(client: Client, id: string): Promise<LectureDuDeroule> {
  const d = await client.workflow.getHandle(id).describe();
  const vie = d.raw.pendingActivities?.[0]?.heartbeatDetails?.payloads?.[0];
  return {
    statut: d.status.name,
    memo: d.memo,
    ticket: d.typedSearchAttributes.get(ATTRIBUT_TICKET),
    etape: d.typedSearchAttributes.get(ATTRIBUT_ETAPE),
    signeDeVie: vie ? defaultPayloadConverter.fromPayload<SigneDeVie>(vie as Payload) : undefined,
  };
}
