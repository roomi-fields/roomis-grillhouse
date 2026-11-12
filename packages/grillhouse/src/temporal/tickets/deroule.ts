// The queue of the tickets of a project (grillhouse-4nr.9, decision D9), `tickets:<racine>`, as Zuul
// and the merge queues start a change once what it depends on has merged: woken every `reveilMs`
// (60 s) and at the end of each circuit it started, it counts the
// circuits of the project alive (those the server runs, and those it has just started, which the
// server's visibility may not show yet), then starts the circuit of each ticket that starts
// (`ticketsAPartir`: open, labelled `circuit`, its section « ## Architecture » written, its
// dependencies closed, by priority),
// no more alive at once than the setting of the project (`grillhouse.circuits`, 1 when absent),
// and each once it holds a place of the machine (`placesDeLaMachine`: the circuits of every
// project under the machine's ceiling, in their order of arrival); the others stay in the queue. A
// circuit waiting for the supervisor's answer is alive: its workflow runs, waiting for the answer,
// and is never purged. A workflow closes only integrated (its ticket closed in Beads) or stopped
// on the supervisor's word (`--arreter`, the label `circuit` taken off): Beads, the durable
// register, keeps it from starting again. A circuit alive whose ticket was closed outside it
// (delivered directly) before its integration counts no more: the queue stops it (ARRETER) at its
// next wake, as Zuul drops from its pipeline a change abandoned or merged. The circuits the server holds not integrated
// (`circuitsNonIntegres`, one call) hold their ticket too, one ended without its issue among them.
// Each circuit is a child that outlives the queue and that its cancellation does not reach; a
// ticket whose circuit runs already, visible or not yet, does not start again. A fault (the
// setting, the package.json, Beads) starts nothing, named in the query. Past its length of
// history, it continues as new; the end of a circuit started before is then read at the next
// wake. Deterministic: it imports the workflow API, the contracts and the workflow of a ticket.
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/common';
import {
  allHandlersFinished,
  ChildWorkflowCancellationType,
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  getExternalWorkflowHandle,
  ParentClosePolicy,
  patched,
  proxyActivities,
  setHandler,
  startChild,
  workflowInfo,
} from '@temporalio/workflow';
import { ARRETER, idDuCircuit } from '../circuit/contrat.js';
import { circuitDuTicket } from '../circuit/deroule.js';
import {
  L_ETAT_DES_TICKETS,
  SEANCE_DU_SUPERVISEUR,
  type ActivitesDesTickets,
  type EntreeDesTickets,
  type VueDesTickets,
} from './contrat.js';

const actes = proxyActivities<ActivitesDesTickets>({
  startToCloseTimeout: '5 minutes',
  retry: { initialInterval: '1 second', maximumAttempts: 4 },
});

const lEtat = defineQuery<VueDesTickets>(L_ETAT_DES_TICKETS);
const laSeance = defineSignal<[string | null]>(SEANCE_DU_SUPERVISEUR);

const arreterLeCircuit = defineSignal<[string | null]>(ARRETER);

// The patch of the circuits closed outside them (Temporal's patching): a run that recorded its
// wakes before the change replays them without the reading.
const FERMES_HORS_CIRCUIT = 'fermes-hors-circuit';
// The patch of the places of the machine: a run that recorded its starts on its own setting alone
// replays them so.
const PLACES_DE_LA_MACHINE = 'places-de-la-machine';
// The patch of the journal of states (grillhouse-4nr.20): a run that recorded its starts and ends
// before the change replays them without their line.
const TRACE_DE_LA_FILE = 'trace-de-la-file';

const REVEIL_MS = 60_000;
const LIMITE_D_HISTOIRE = 10_000;

/** The queue of the tickets of the project at <racine>. */
export async function ticketsDuProjet(entree: EntreeDesTickets): Promise<void> {
  const { racine } = entree;
  const reveilMs = entree.reveilMs ?? REVEIL_MS;
  let reveil = false;
  let vivants: string[] = [];
  let faute: string | null = null;
  // The circuits this run started, until their end: the server's visibility may lag behind.
  const lances = new Set<string>();
  // The circuits whose ticket was closed outside them, stopped, until their end.
  let arretes = new Set<string>();
  setHandler(lEtat, () => ({ vivants, faute }));
  // The supervisor's session the last ticket put in the queue came with, which each circuit
  // started receives; its signal wakes the queue.
  let superviseur = entree.circuit?.superviseur ?? null;
  setHandler(laSeance, s => {
    superviseur = s;
    reveil = true;
  });

  const finis: string[] = [];
  for (;;) {
    for (const ticket of finis.splice(0)) {
      if (patched(TRACE_DE_LA_FILE)) {
        await actes.tracerLaFile({ racine, ticket, evenement: 'termine' });
      }
    }
    const surLeServeur = await actes.circuitsVivants({ racine });
    // A circuit whose ticket was closed outside it (delivered directly) holds no place: the queue
    // stops it (ARRETER), once, and says it ended; a child of this run says it at its end.
    const fermes = patched(FERMES_HORS_CIRCUIT)
      ? await actes.fermesHorsCircuit({ racine, vivants: surLeServeur })
      : [];
    for (const ticket of fermes.filter(t => !arretes.has(t))) {
      try {
        await getExternalWorkflowHandle(idDuCircuit(racine, ticket)).signal(
          arreterLeCircuit,
          'le ticket est fermé hors de son circuit'
        );
      } catch {
        // Ended meanwhile: nothing to stop.
      }
      if (!lances.has(ticket) && patched(TRACE_DE_LA_FILE)) {
        await actes.tracerLaFile({ racine, ticket, evenement: 'termine' });
      }
    }
    arretes = new Set(fermes);
    vivants = [...new Set([...surLeServeur, ...lances])].filter(t => !arretes.has(t)).sort();
    // A ticket whose circuit is not integrated, alive or stopped, does not start.
    const tenus = await actes.circuitsNonIntegres({ racine });
    const r = await actes.ticketsAPartir({
      racine,
      enCours: [...new Set([...vivants, ...tenus])].sort(),
    });
    faute = r.faute;
    // The machine bounds every project: a ticket starts once it holds a place of the machine, in
    // the order of arrival of every project, its disk of copies with room; the others stay in the
    // queue, not started. A circuit paused on a question, or resumed and waiting for its place,
    // is not active and holds none: the places are the setting less the circuits active.
    const machine = patched(PLACES_DE_LA_MACHINE);
    const enPause = new Set(machine ? await actes.circuitsEnPause({ racine }) : []);
    const actifs = vivants.filter(t => !enPause.has(t));
    const places = r.max === null ? 0 : r.max - actifs.length;
    let partir = r.partir.slice(0, Math.max(0, places));
    if (machine) {
      const m = await actes.placesDeLaMachine({ racine, vivants: actifs, candidats: partir });
      partir = m.accordes;
      faute = faute ?? m.faute;
    }
    for (const ticket of partir) {
      try {
        const enfant = await startChild(circuitDuTicket, {
          workflowId: idDuCircuit(racine, ticket),
          args: [{ ...entree.circuit, superviseur, racine, ticket }],
          parentClosePolicy: ParentClosePolicy.ABANDON,
          cancellationType: ChildWorkflowCancellationType.ABANDON,
        });
        lances.add(ticket);
        if (patched(TRACE_DE_LA_FILE)) {
          await actes.tracerLaFile({ racine, ticket, evenement: 'lance' });
        }
        // The end of the circuit wakes the queue, and its line to the journal is written at the
        // next wake (a workflow awaits no activity in a callback).
        const fini = () => {
          lances.delete(ticket);
          finis.push(ticket);
          reveil = true;
        };
        void enfant.result().then(fini, fini);
      } catch (e) {
        if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
          throw e;
        }
      }
      vivants = [...new Set([...vivants, ticket])].sort();
    }
    reveil = false;
    await condition(() => reveil, reveilMs);
    if (
      workflowInfo().continueAsNewSuggested ||
      workflowInfo().historyLength >= LIMITE_D_HISTOIRE
    ) {
      await condition(allHandlersFinished);
      return continueAsNew<typeof ticketsDuProjet>({
        ...entree,
        circuit: { ...entree.circuit, superviseur },
      });
    }
  }
}
