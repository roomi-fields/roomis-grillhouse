// The sonde's workflow, which the worker bundles (Worker.create, workflowsPath): it upserts its
// ticket and its step as search attributes, runs its activity (a process with its signs of life,
// started again from its last sign of life when its worker dies), waits for the signal FINIR when
// asked, and gives back what its activity did. Deterministic: it imports nothing but the workflow
// API, the search attributes and the contract.
import {
  condition,
  defineSignal,
  proxyActivities,
  setHandler,
  upsertSearchAttributes,
  workflowInfo,
} from '@temporalio/workflow';
import { ATTRIBUT_ETAPE, ATTRIBUT_TICKET } from '../attributs.js';
import type * as activites from './activites.js';
import { FINIR, type EntreeDeLaSonde, type ResultatDeLaSonde } from './contrat.js';

// The activity: its sign of life awaited every 3 s, an attempt given again after 1 s.
const { lancerLaSonde } = proxyActivities<typeof activites>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '3 seconds',
  retry: { initialInterval: '1 second', maximumAttempts: 5 },
});

const finir = defineSignal(FINIR);

// Upserts the step <etape>, and the ticket <ticket> when the workflow does not carry it yet.
function etape(etape: string, ticket: string) {
  const attributs = [{ key: ATTRIBUT_ETAPE, value: etape }];
  if (workflowInfo().typedSearchAttributes.get(ATTRIBUT_TICKET) !== ticket) {
    attributs.push({ key: ATTRIBUT_TICKET, value: ticket });
  }
  upsertSearchAttributes(attributs);
}

/** The sonde: its activity, then the wait for FINIR when asked. */
export async function sonde(entree: EntreeDeLaSonde): Promise<ResultatDeLaSonde> {
  let fini = false;
  setHandler(finir, () => {
    fini = true;
  });
  etape('activite', entree.ticket);
  const activite = await lancerLaSonde({ etapes: entree.etapes, pauseMs: entree.pauseMs });
  if (entree.attendreLeSignal) {
    etape('attente', entree.ticket);
    await condition(() => fini);
  }
  etape('fini', entree.ticket);
  return { ticket: entree.ticket, activite };
}
