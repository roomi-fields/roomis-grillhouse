// The queue of integration of a project (grillhouse-4nr.8, decision Q3), `file:<racine>`, and the CI
// of a commit, as a merge queue takes one entry at a time and waits for its checks: the queue of
// scripts/integration/file.mjs, its gestures its acts (./activites.ts). The circuit of a ticket
// sends its branch at its step 5.2 (the signal ENTRER) and awaits its issue (the signal
// ISSUE_DE_LA_FILE). For each entry, in its order of arrival: main moved onto the branch, or the
// branch out of the queue, or kept; entered, the ticket closed and main pushed, then the CI of the
// commit followed to its conclusion before the next entry, so that nothing is pushed on a red
// main. An act that fails (its activity, the reading of the CI) gives the entry the issue `echec`,
// its reason, on which the circuit of the ticket stops, and the queue goes on. The CI of a commit (`ciDuCommit`, a child workflow) is read by one reading at a time, a
// durable timer between two, so that the death of the worker loses none of its wait: its run
// looked for during `rechercheMs` (2 min), then read every `pasMs` (10 s) for `attenteMs` (30 min)
// at most, counted on the workflow's clock. Past its length of history, the queue continues as new
// between two entries, with those that wait. Deterministic: it imports the workflow API and the
// contract.
import {
  allHandlersFinished,
  ChildWorkflowCancellationType,
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  executeChild,
  getExternalWorkflowHandle,
  isCancellation,
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  sleep,
  startChild,
  workflowInfo,
} from '@temporalio/workflow';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/common';
import {
  idDeLaFile,
  ENTRER,
  ISSUE_DE_LA_FILE,
  L_ETAT_DE_LA_FILE,
  type ActivitesDeLaFile,
  type DelaisDeLaCI,
  type EffetDeLaFile,
  type EntreeDeLaCI,
  type EntreeDeLaFile,
  type EntreeDeLaFileDuProjet,
  type IssueDeLaFile,
  type LectureDeLaCI,
  type VerdictDeLaCI,
  type VueDeLaFile,
} from './contrat.js';

// Every act of the queue: a replay of `npm run verifier` lasts 2 h at most; the reading of the CI
// a minute. An act played again after its worker died replays its gestures without harm
// (scripts/integration/file.mjs), and gives back its comments, which the workflow writes one per
// activity, under the key of that activity (`jouerLesEffets`).
const actes = proxyActivities<ActivitesDeLaFile>({
  startToCloseTimeout: '2 hours',
  heartbeatTimeout: '90 seconds',
  retry: { initialInterval: '1 second', maximumAttempts: 4 },
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

const DELAIS: Required<DelaisDeLaCI> = {
  rechercheMs: 2 * 60_000,
  attenteMs: 30 * 60_000,
  pasMs: 10_000,
};
const LIMITE_D_HISTOIRE = 10_000;

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

/** The CI of a commit, read to its conclusion: its verdict, its run, the reason of a CI not read. */
export async function ciDuCommit(e: EntreeDeLaCI): Promise<VerdictDeLaCI> {
  const { rechercheMs, attenteMs, pasMs } = { ...DELAIS, ...e.ci };
  const debut = Date.now();
  let passage: string | null = null;
  let limite = Infinity;
  const nonLue = (raison: string): VerdictDeLaCI => ({ verdict: 'non-lue', passage, raison });
  for (;;) {
    const l: LectureDeLaCI = await actes.lireLaCI({
      racine: e.racine,
      ticket: e.ticket,
      sha: e.sha,
      branche: e.branche,
      passage,
    });
    if (l.etat === 'sans-ci') {
      return { verdict: 'sans-ci', passage: null, raison: null };
    }
    if (l.etat === 'non-lue') {
      return nonLue(l.raison);
    }
    if (l.etat === 'finie') {
      const verdict = l.conclusion === 'success' ? 'verte' : 'rouge';
      return { verdict, passage: l.passage, raison: null };
    }
    if (l.etat === 'en-cours' && passage === null) {
      passage = l.passage;
      limite = Date.now() + attenteMs;
    }
    const reste = passage === null ? debut + rechercheMs - Date.now() : limite - Date.now();
    if (reste <= 0) {
      return nonLue(
        passage === null
          ? `aucun passage de la CI pour ce commit en ${Math.round(rechercheMs / 1000)} s.`
          : `le passage ${passage} n'a pas fini en ${Math.round(attenteMs / 60_000)} min.`
      );
    }
    await sleep(Math.min(pasMs, reste));
  }
}

// The CI of <sha> pushed to <branche> for <ticket> read as a child workflow of the caller, then
// concluded at the ticket (<relue>, a reading again on `--reprendre`): the issue for the circuit. A
// reading that fails (its act, after the push) concludes the CI not read, the failure its reason.
export async function lireEtConclureLaCI(
  e: EntreeDeLaCI & { relue: boolean },
  id: string
): Promise<IssueDeLaFile> {
  let verdict: VerdictDeLaCI;
  try {
    verdict = await executeChild(ciDuCommit, {
      workflowId: id,
      args: [{ racine: e.racine, ticket: e.ticket, sha: e.sha, branche: e.branche, ci: e.ci }],
    });
  } catch (x) {
    if (isCancellation(x)) {
      throw x;
    }
    verdict = { verdict: 'non-lue', passage: null, raison: `sa lecture échoue : ${messageDe(x)}` };
  }
  const { effets, ...issue } = await actes.conclureLaCI({
    racine: e.racine,
    ticket: e.ticket,
    sha: e.sha,
    branche: e.branche,
    relue: e.relue,
    ...verdict,
  });
  await jouerLesEffets(e.racine, effets, `${id}:conclure`);
  return issue;
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

/** The queue of the project at <racine>: one entry at a time, its CI concluded before the next. */
export async function fileDuProjet(entree: EntreeDeLaFileDuProjet): Promise<void> {
  const { racine } = entree;
  const attente: EntreeDeLaFile[] = [...(entree.suite?.attente ?? [])];
  let enCours: EntreeDeLaFile | null = null;
  // An entry already in the queue, under way or waiting, is not added twice.
  setHandler(entrer, e => {
    if (enCours?.ticket !== e.ticket && !attente.some(a => a.ticket === e.ticket)) {
      attente.push(e);
    }
  });
  setHandler(lEtat, () => ({
    enCours: enCours?.ticket ?? null,
    attente: attente.map(a => a.ticket),
  }));
  const aContinuer = () =>
    workflowInfo().continueAsNewSuggested || workflowInfo().historyLength >= LIMITE_D_HISTOIRE;
  let n = 0;
  let entrees = 0;

  // The commit main moved onto for the entry under way, until it is pushed.
  let avance: string | null = null;
  // The entry <e> to its issue.
  const traiter = async (e: EntreeDeLaFile): Promise<IssueDeLaFile> => {
    avance = null;
    entrees += 1;
    const lieu = `entree:${entrees}`;
    const r = await actes.avancerMain({ racine, ticket: e.ticket, branche: e.branche });
    await jouerLesEffets(racine, r.effets, `${lieu}:avancer`);
    if ('issue' in r) {
      return r.issue;
    }
    const { commit } = r.entre;
    avance = commit;
    const f = await actes.fermerLEntree({ racine, ticket: e.ticket, branche: e.branche, commit });
    await jouerLesEffets(racine, f.effets, `${lieu}:fermer`);
    if (!f.poussee) {
      // The lot is on main: its closure first, then why it is not pushed.
      const ferme = `intégré : ${commit.slice(0, 7)}`;
      return { etat: 'ferme', raison: f.raison ? `${ferme} ; ${f.raison}` : ferme };
    }
    avance = null;
    n += 1;
    return lireEtConclureLaCI(
      { racine, ticket: e.ticket, sha: commit, branche: f.poussee, ci: entree.ci, relue: false },
      `${workflowInfo().workflowId}:ci:${workflowInfo().runId}:${n}`
    );
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

  for (;;) {
    await condition(() => attente.length > 0 || aContinuer());
    if (attente.length > 0) {
      enCours = attente.shift()!;
      const issue = await traiterSansTomber(enCours);
      // A circuit gone (stopped meanwhile) has no issue to await.
      await getExternalWorkflowHandle(enCours.deroule)
        .signal(issueDeLaFile, issue)
        .catch(() => undefined);
      enCours = null;
    }
    if (aContinuer()) {
      await condition(allHandlersFinished);
      return continueAsNew<typeof fileDuProjet>({ ...entree, suite: { attente } });
    }
  }
}
