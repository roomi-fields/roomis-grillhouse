// The nights of the machine (grillhouse-4nr.13, decision D6), as a Temporal schedule replaces the
// lines of a table of tasks: one schedule (`ID_DE_LA_PLANIFICATION`) starts `nuitPlanifiee` at the
// start of the night, which asks the one workflow of the nights (`nuitsDeLaMachine`,
// `ID_DES_NUITS`) for the scheduled nights and ends; a request by hand (`npx grillhouse nuit
// <projet>`) asks the same workflow, started when none runs. So two nights never run at once.
//
// - A scheduled request chooses the projects of the register (`choisirLesNuits`): each project
//   left out or skipped keeps its reason (a skip noted in the journal of its night and in the
//   register, `noterLeSaut`), each project that moved enters the queue.
// - A request by hand puts its project in the queue, its marker unread.
// - A project already in the queue or under way is not put in twice.
// - The nights play one after the other, each starting at the end of the one before, whatever its
//   verdict: a red night, or an activity that fails, never stops those after it.
// - Once the queue is empty and no request waits, the workflow ends; the next request starts it
//   again. Past its length of history it continues as new with its queue.
// Deterministic: it imports the workflow API and the contract.
import {
  CancellationScope,
  allHandlersFinished,
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
  uuid4,
  workflowInfo,
} from '@temporalio/workflow';
import {
  DEMANDER,
  L_ETAT_DES_NUITS,
  type ActivitesDesNuits,
  type DemandeDeNuit,
  type EntreeDesNuits,
  type VueDesNuits,
} from './contrat.js';

const actes = proxyActivities<ActivitesDesNuits>({
  startToCloseTimeout: '5 minutes',
  retry: { initialInterval: '1 second', maximumAttempts: 4 },
});
// A night lasts hours; its heartbeat says it lives. Played again once after its worker died: the
// attempt ends the group the dead one left before it plays.
const { jouerLaNuit } = proxyActivities<ActivitesDesNuits>({
  startToCloseTimeout: '12 hours',
  heartbeatTimeout: '5 minutes',
  retry: { maximumAttempts: 2 },
});
// The wait of the stages under way is as long as the longest of them; its heartbeat says it lives.
const { reserverLaMachine } = proxyActivities<ActivitesDesNuits>({
  startToCloseTimeout: '12 hours',
  heartbeatTimeout: '5 minutes',
  retry: { maximumAttempts: 2 },
});

const demander = defineSignal<[DemandeDeNuit]>(DEMANDER);
const lEtat = defineQuery<VueDesNuits>(L_ETAT_DES_NUITS);

const LIMITE_D_HISTOIRE = 2000;

/** The nights of the machine, one project after the other, until the queue is empty. */
export async function nuitsDeLaMachine(entree: EntreeDesNuits = {}): Promise<VueDesNuits> {
  const vue: VueDesNuits = {
    enCours: null,
    depuis: null,
    attente: [...(entree.etat?.attente ?? [])],
    jouees: [],
    sautes: [],
    ecartes: [],
  };
  let planifiees = entree.etat?.planifiees ?? 0;
  const inscrire = (racine: string) => {
    if (vue.enCours !== racine && !vue.attente.includes(racine)) {
      vue.attente.push(racine);
    }
  };
  setHandler(demander, d => {
    if ('projet' in d) {
      inscrire(d.projet);
    } else {
      planifiees += 1;
    }
  });
  setHandler(lEtat, () => vue);

  // The reservation of the whole machine (`reserverLaMachine`): made once, before the first night
  // that plays, lifted when the nights are done, whatever ends them (a failure, a cancellation);
  // a Continue-As-New carries it.
  let jeton = entree.etat?.jeton ?? null;
  let suite = false;
  const lever = async () => {
    if (jeton === null) {
      return;
    }
    const j = jeton;
    jeton = null;
    await CancellationScope.nonCancellable(() => actes.leverLaMachine({ jeton: j }));
  };

  const limite = entree.limiteDHistoire ?? LIMITE_D_HISTOIRE;
  try {
    for (;;) {
      if (planifiees > 0) {
        planifiees = 0;
        const choix = await actes.choisirLesNuits();
        for (const saut of choix.sautes) {
          await actes.noterLeSaut(saut);
        }
        vue.sautes.push(...choix.sautes);
        vue.ecartes.push(...choix.ecartes);
        choix.jouer.forEach(inscrire);
        continue;
      }
      const racine = vue.attente.shift();
      if (racine === undefined) {
        // A request that arrives while the handlers finish is read before the end.
        await condition(allHandlersFinished);
        if (planifiees > 0 || vue.attente.length > 0) {
          continue;
        }
        return vue;
      }
      if (jeton === null) {
        // The stages under way finish; the night starts once no place is held.
        jeton = uuid4();
        await reserverLaMachine({ jeton });
      }
      vue.enCours = racine;
      vue.depuis = Date.now();
      try {
        vue.jouees.push({ racine, code: await jouerLaNuit({ racine, jeton }), echec: null });
      } catch (e) {
        vue.jouees.push({ racine, code: null, echec: e instanceof Error ? e.message : String(e) });
      }
      vue.enCours = null;
      vue.depuis = null;
      if (workflowInfo().continueAsNewSuggested || workflowInfo().historyLength >= limite) {
        await condition(allHandlersFinished);
        suite = true;
        await continueAsNew<typeof nuitsDeLaMachine>({
          ...entree,
          etat: { attente: vue.attente, planifiees, jeton },
        });
      }
    }
  } finally {
    if (!suite) {
      await lever();
    }
  }
}

/** The workflow the schedule starts: it asks for the scheduled nights, and ends. */
export async function nuitPlanifiee(): Promise<void> {
  await actes.demanderLesNuitsPlanifiees();
}
