// The queue of integration of a project (grillhouse-4nr.8, decision Q3), `file:<racine>`, as bors
// gates a merge on the tree that enters and Google's TAP plays the touched tests before the submit
// and the whole suite after it: the queue of scripts/integration/file.mjs, its gestures its acts
// (./activites.ts). The circuit of a ticket sends its branch at its step 5.2 (the signal ENTRER) and
// awaits its issue (the signal ISSUE_DE_LA_FILE). For each entry, in its order of arrival: the
// branch made the candidate (on top of main, replaced when main moved, kept local), the final pass
// played on it, then, green, main moved onto the candidate by fast-forward, the ticket closed and
// main pushed; main moved meanwhile, the branch is replaced and judged again, `ESSAIS` times at
// most; red or to play again, main does not move. Nothing enters main that a final pass did not
// judge, and the next entry waits. An act that fails gives the entry the issue `echec`, its reason,
// on which the circuit of the ticket stops, and the queue goes on. The queue reads the CI of main
// (`surveillerLaCiDeMain`) at its start, after each entry and at each quarter of an hour it waits
// for none: it starts the CI of main when the tip and the hour ask for it (one pass an hour at most,
// after a lot entered), then reads it, which opens the defect ticket of a red passage; it never
// waits for it. Past its length
// of history, or when the signal RELANCER asks it (the installation of a new version), the queue
// continues as new between two entries, with those that wait: busy, it finishes its entry under
// way first and treats none of those that wait before restarting. The histories recorded with the
// marker of the final pass (`deprecatePatch`) replay on it. Deterministic: it imports the workflow API and the contract.
import {
  allHandlersFinished,
  ChildWorkflowCancellationType,
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  deprecatePatch,
  getExternalWorkflowHandle,
  isCancellation,
  ParentClosePolicy,
  patched,
  proxyActivities,
  setHandler,
  startChild,
  workflowInfo,
} from '@temporalio/workflow';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/common';
import {
  idDeLaFile,
  ENTRER,
  issueDeLEntree,
  ISSUE_DE_LA_FILE,
  L_ETAT_DE_LA_FILE,
  RELANCER,
  type ActivitesDeLaFile,
  type EffetDeLaFile,
  type EntreeDeLaFile,
  type EntreeDeLaFileDuProjet,
  type IssueDeLaFile,
  type VueDeLaFile,
} from './contrat.js';

// Every act of the queue: a replacement of a branch and its install last 2 h at most; the rest
// are short. An act played again after its worker died replays its gestures without harm
// (scripts/integration/file.mjs), and gives back its comments, which the workflow writes one per
// activity, under the key of that activity (`jouerLesEffets`).
const actes = proxyActivities<ActivitesDeLaFile>({
  startToCloseTimeout: '2 hours',
  heartbeatTimeout: '90 seconds',
  retry: { initialInterval: '1 second', maximumAttempts: 4 },
});

// The final pass: `npm run verifier` on the lot laid on the tip of main, which lasts as long as the
// verification of the project; its process heartbeats as every act does.
const passeFinale = proxyActivities<ActivitesDeLaFile>({
  startToCloseTimeout: '6 hours',
  heartbeatTimeout: '90 seconds',
  retry: { initialInterval: '1 second', maximumAttempts: 2 },
});

// An effect an act of the queue gave back, one per activity, whose id the workflow sets.
const unEffet = (activityId: string) =>
  proxyActivities<ActivitesDeLaFile>({
    startToCloseTimeout: '5 minutes',
    heartbeatTimeout: '90 seconds',
    retry: { initialInterval: '5 seconds', maximumAttempts: 4 },
    activityId,
  }).jouerUnEffetDeLaFile;

// The effects <effets> an act of the queue gave back, in the main tree <racine>, played one by one,
// each in an activity of id `<lieu>:effet:<rang>:<sorte>`, <lieu> unique in the workflow, the key
// of its writing (../acte.ts `cleDeLActivite`).
async function jouerLesEffets(racine: string, effets: EffetDeLaFile[], lieu: string) {
  for (const [i, effet] of effets.entries()) {
    await unEffet(`${lieu}:effet:${i + 1}:${effet.genre}`)({ racine, effet });
  }
}

const entrer = defineSignal<[EntreeDeLaFile]>(ENTRER);
export const issueDeLaFile = defineSignal<[IssueDeLaFile]>(ISSUE_DE_LA_FILE);
const lEtat = defineQuery<VueDeLaFile>(L_ETAT_DE_LA_FILE);
const relancer = defineSignal<[]>(RELANCER);

const LIMITE_D_HISTOIRE = 10_000;
// How long the queue waits idle before it reads the CI of main again.
const INTERVALLE_DE_LA_CI = 15 * 60_000;
// The judgements of one entry at most, main moving between its CI and its entry.
const ESSAIS = 5;

// The message of the failure <e> of an activity or of a child workflow, as its act gave it.
function messageDe(e: unknown): string {
  let c: unknown = e;
  for (let i = 0; i < 4 && c && typeof c === 'object'; i++) {
    const d = (c as { details?: unknown[] }).details?.[0] as { message?: string } | undefined;
    if (d?.message) {
      return d.message;
    }
    const suite = (c as { cause?: unknown }).cause;
    if (!suite) {
      break;
    }
    c = suite;
  }
  return String((c as Error)?.message ?? c);
}

/**
 * The entry <e> sent to the queue of the project <projet> from the workflow of its circuit; the
 * queue started first when none runs, as a child that outlives its parent and that its
 * cancellation does not reach, so that the queue of a project is one whoever starts it.
 */
export async function entrerDansLaFile(
  projet: EntreeDeLaFileDuProjet,
  e: EntreeDeLaFile
): Promise<void> {
  const id = idDeLaFile(projet.racine);
  try {
    await startChild(fileDuProjet, {
      workflowId: id,
      args: [{ racine: projet.racine, ci: projet.ci }],
      parentClosePolicy: ParentClosePolicy.ABANDON,
      cancellationType: ChildWorkflowCancellationType.ABANDON,
    });
  } catch (x) {
    if (!(x instanceof WorkflowExecutionAlreadyStartedError)) {
      throw x;
    }
  }
  await getExternalWorkflowHandle(id).signal(entrer, e);
}

/** The queue of the project at <racine>: one entry at a time, judged by a final pass before main moves. */
export async function fileDuProjet(entree: EntreeDeLaFileDuProjet): Promise<void> {
  const { racine } = entree;
  const attente: EntreeDeLaFile[] = [...(entree.suite?.attente ?? [])];
  let enCours: EntreeDeLaFile | null = null;
  // The restart asked: no entry waiting starts any more in this run. The handlers are set first,
  // outside the commands of the history, so that they answer on either path.
  let relance = false;
  // The marker of the final pass, which the histories recorded under the former path carry.
  deprecatePatch('passe-finale-de-main');
  setHandler(relancer, () => {
    relance = true;
  });
  // An entry already in the queue, under way or waiting, is not added twice.
  setHandler(entrer, e => {
    if (enCours?.ticket !== e.ticket && !attente.some(a => a.ticket === e.ticket)) {
      attente.push(e);
    }
  });
  // The version of the tool the queue runs under, read by an activity when the run starts; absent
  // until read, and for a history recorded before the marker.
  let version: string | undefined;
  setHandler(lEtat, () => ({
    enCours: enCours?.ticket ?? null,
    attente: attente.map(a => a.ticket),
    ...(version === undefined ? {} : { version }),
  }));
  // The marker keeps the histories recorded before this activity replaying; a later ticket retires it.
  if (patched('version-de-la-file')) {
    version = await actes.lireLaVersionDeLOutil();
  }
  const aContinuer = () =>
    workflowInfo().continueAsNewSuggested || workflowInfo().historyLength >= LIMITE_D_HISTOIRE;
  let entrees = 0;

  // The commit main moved onto for the entry under way, until it is pushed.
  let avance: string | null = null;
  // The branch of <e> brought onto main once the final pass judged it, the entry's <lieu> keying its
  // effects: the commit main is at, or the issue for the circuit when main does not move.
  const surMain = async (
    e: EntreeDeLaFile,
    lieu: string
  ): Promise<{ commit: string } | IssueDeLaFile> => {
    for (let essai = 1; essai <= ESSAIS; essai++) {
      const ici = `${lieu}:${essai}`;
      const p = await actes.preparerLaBranche({ racine, ticket: e.ticket, branche: e.branche });
      await jouerLesEffets(racine, p.effets, `${ici}:brancher`);
      if ('issue' in p) {
        return p.issue;
      }
      if ('entre' in p) {
        return p.entre;
      }
      const sha = p.candidat.commit;
      const j = await passeFinale.jugerLeCandidat({
        racine,
        ticket: e.ticket,
        branche: e.branche,
        commit: sha,
      });
      await jouerLesEffets(racine, j.effets, `${ici}:juger`);
      if ('issue' in j) {
        return j.issue;
      }
      const a = await actes.avancerMain({
        racine,
        ticket: e.ticket,
        branche: e.branche,
        commit: sha,
      });
      await jouerLesEffets(racine, a.effets, `${ici}:avancer`);
      if ('issue' in a) {
        return a.issue;
      }
      if ('entre' in a) {
        return a.entre;
      }
    }
    return {
      etat: 'en-file',
      raison: `${e.branche} reste en file : main bouge sans cesse, ${ESSAIS} jugements n'ont pas suffi.`,
    };
  };
  // The entry <e> to its issue.
  const traiter = async (e: EntreeDeLaFile): Promise<IssueDeLaFile> => {
    avance = null;
    entrees += 1;
    const lieu = `entree:${entrees}`;
    const m = await surMain(e, lieu);
    if ('etat' in m) {
      return m;
    }
    const { commit } = m;
    avance = commit;
    const f = await actes.fermerLEntree({ racine, ticket: e.ticket, branche: e.branche, commit });
    await jouerLesEffets(racine, f.effets, `${lieu}:fermer`);
    avance = null;
    // The lot is on main: its closure first, then why it is not pushed; a closure that failed
    // stops the circuit (`issueDeLEntree`).
    return issueDeLEntree(e.ticket, commit, f);
  };

  // The entry <e> to its issue, an act that fails included: the queue goes on with the next
  // entries, and the circuit of the ticket stops on it (`echec`, its reason), its question up. A
  // closure that fails once main moved says that the local main holds the lot, not pushed.
  const traiterSansTomber = async (e: EntreeDeLaFile): Promise<IssueDeLaFile> => {
    try {
      return await traiter(e);
    } catch (x) {
      if (isCancellation(x)) {
        throw x;
      }
      const raison = `un acte de la file échoue : ${messageDe(x)}`;
      return {
        etat: 'echec',
        raison: avance
          ? `${raison}. Le main local porte le lot en ${avance.slice(0, 7)}, non poussé et le ticket non fermé ; --reprendre le repasse par la file, qui le ferme et le pousse.`
          : raison,
      };
    }
  };

  // The CI of main read once, never waited for: its failure does not stop the queue.
  // It starts the CI of main when the tip and the hour ask for it, then reads it: <apresEntree>
  // after an entry, so that a project with no pass known on main starts at its first lot.
  const surveiller = async (apresEntree: boolean) => {
    try {
      await actes.surveillerLaCiDeMain({ racine, apresEntree });
    } catch (x) {
      if (isCancellation(x)) {
        throw x;
      }
    }
  };
  let aSurveiller = true;
  let apresEntree = false;
  for (;;) {
    const pret = () => attente.length > 0 || relance || aContinuer();
    if (aSurveiller) {
      await surveiller(apresEntree);
      aSurveiller = false;
      apresEntree = false;
    }
    // Woken by an entry, or by the quarter of an hour that asks for another reading.
    aSurveiller = !(await condition(pret, INTERVALLE_DE_LA_CI));
    if (attente.length > 0 && !relance) {
      enCours = attente.shift()!;
      const issue = await traiterSansTomber(enCours);
      // A circuit gone (stopped meanwhile) has no issue to await.
      await getExternalWorkflowHandle(enCours.deroule)
        .signal(issueDeLaFile, issue)
        .catch(() => undefined);
      enCours = null;
      aSurveiller = true;
      apresEntree = true;
    }
    if (relance || aContinuer()) {
      await condition(allHandlersFinished);
      return continueAsNew<typeof fileDuProjet>({ ...entree, suite: { attente } });
    }
  }
}
