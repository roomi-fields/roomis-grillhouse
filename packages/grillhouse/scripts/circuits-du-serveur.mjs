// The circuits of a repository as the board (scripts/tableau.mjs) and the supervisor
// (scripts/superviseur.mjs) read them: one call to the Temporal server (src/temporal/circuit/
// client.ts `lireLesCircuits`, the memo and the status of each workflow, no worker living), as the
// UI of Temporal lists its workflows, and the progress of the pass under way of each one that runs,
// read in its working directory (scripts/avancement.mjs `avancementDuTravail`).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { avancementDuTravail } from './avancement.mjs';
import { sansReponseEn } from './sans-reponse.mjs';

/**
 * A circuit as the server gives it (`CircuitLu` of src/temporal/circuit/client.ts) with its
 * progress and the page of its workflow on the web UI of the server (`lien`).
 * @typedef {import('../dist/temporal/circuit/client.js').CircuitLu & { avancement: ReturnType<typeof avancementDuTravail>, lien?: string }} CircuitDuServeur
 */

/**
 * The circuits <circuits> of the repository at <racine>, each with the progress of its pass under
 * way while it runs (`avancement`, in `.claude/worktrees/<ticket>.travail`, null without one).
 * @template {{ ticket: string, vivant: boolean }} C
 * @param {string} racine
 * @param {C[]} circuits
 * @returns {(C & { avancement: ReturnType<typeof avancementDuTravail> })[]}
 */
export const avecLeurAvancement = (racine, circuits) =>
  circuits.map(c => ({
    ...c,
    avancement: c.vivant
      ? avancementDuTravail(path.join(racine, '.claude', 'worktrees', `${c.ticket}.travail`))
      : null,
  }));

// The built client of the package (`dist/`), which a fresh clone has unbuilt.
const CONSTRUIT = path.join(import.meta.dirname, '..', 'dist', 'temporal', 'circuit', 'client.js');

/** The client of the circuits is not built: the reading names the command that builds it. */
export class ClientNonConstruit extends Error {
  constructor() {
    super(
      `le client Temporal n'est pas construit (${CONSTRUIT} n'existe pas) : la construction du paquet le pose, \`npm run build --workspace @roomi-fields/grillhouse\``
    );
    this.name = 'ClientNonConstruit';
  }
}

// How long the reading waits for the server: a guard, far above a reading's few milliseconds, so
// that a server down keeps neither the board nor the opening of a session waiting (the client's
// own retries last some twenty seconds).
export const DELAI_MS = 5_000;

/** What a reading that waited DELAI_MS in vain says: « Temporal ne répond pas en 5 s ». */
export const SANS_REPONSE_EN = sansReponseEn(DELAI_MS);

// The gRPC statuses of a server that does not answer in time: none listens (UNAVAILABLE, 14), or
// none answers within the delay (DEADLINE_EXCEEDED, 4), a server slow under load as a port closed.
const SANS_REPONSE = new Set([4, 14]);

/** The server at <adresse> did not answer the reading of the circuits within DELAI_MS. */
export class ServeurMuet extends Error {
  /**
   * @param {string} adresse
   * @param {unknown} cause
   */
  constructor(adresse, cause) {
    super(`${SANS_REPONSE_EN} sur ${adresse}`, { cause });
    this.name = 'ServeurMuet';
    this.adresse = adresse;
  }
}

// Whether <e>, an error of the client, says that the server did not answer: its gRPC status, on
// itself or its cause (a `ServiceError` of the client carries the gRPC error as its cause).
const sansReponse = e =>
  [e, e?.cause].some(x => typeof x?.code === 'number' && SANS_REPONSE.has(x.code));

/**
 * The circuits of the repository at <racine>, read from the Temporal server of the environment in
 * one call, with their progress (`avecLeurAvancement`) and the page of each one's workflow on the
 * web UI of the server (`lienDuTableauWeb`). A server that does not answer within
 * DELAI_MS throws `ServeurMuet`, which its caller tells from a repository without circuits and
 * from any other fault, thrown as it is; a client not built throws `ClientNonConstruit`.
 * @param {string} racine
 */
export async function circuitsDuServeur(racine) {
  if (!existsSync(CONSTRUIT)) {
    throw new ClientNonConstruit();
  }
  const { lienDuTableauWeb, ouvrirLeClient } = await import('../dist/temporal/client.js');
  const { lireLesCircuits } = await import('../dist/temporal/circuit/client.js');
  const { idDuCircuit } = await import('../dist/temporal/circuit/contrat.js');
  const c = ouvrirLeClient();
  try {
    const lus = await c.client.connection.withDeadline(Date.now() + DELAI_MS, () =>
      lireLesCircuits(c.client, racine)
    );
    return avecLeurAvancement(racine, lus).map(x => ({
      ...x,
      lien: lienDuTableauWeb(c.adresse, c.client.options.namespace, idDuCircuit(racine, x.ticket)),
    }));
  } catch (e) {
    throw sansReponse(e) ? new ServeurMuet(c.adresse, e) : e;
  } finally {
    await c.fermer();
  }
}
