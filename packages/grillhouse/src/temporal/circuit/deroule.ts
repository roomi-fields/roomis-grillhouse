// The workflow of a ticket (grillhouse-4nr.6, decision Q3), `circuit:<racine>:<ticket>`: the
// circuit of scripts/circuit.mjs, its decisions the pure ones of scripts/transitions.mjs, each
// act an activity (./activites.ts: the opening and the plan, the preparation of a pass, each fact
// a decision asks for, the effects, the stops, the end). A stop does not end the workflow: it
// writes its question, then the workflow waits for the supervisor's answer, durably, as a pipeline
// of GitLab waits on a manual job: the updates REPRENDRE, DEPUIS and ETENDRE, whose validators
// refuse an answer out of a wait, or a second answer to the same question, without writing it in
// the history, and the signal ARRETER. ARRETER while a step plays cancels its activity, its session
// killed; while a stop is written, it stops the circuit once the stop is written. An act that
// fails is the stop « inattendu » at the step it fell, its question awaited; when the act of the
// stop fails too, the stop stands in the memo alone (scripts/transitions.mjs `arretSansActe`). A « a-repasser » (75)
// plays again by itself after `repasserMs` (10 min), `repassesMax` times (6) in a row, then its
// question goes up (decision D4). The effects a step decided before a fact that fails are written
// before its stop (scripts/transitions.mjs gives them with each fact it asks for). The step and the
// question are a search attribute and the memo, which the board reads from the server alone; past
// its length of history, the workflow continues as new at a step's start. At its step 5.2, the
// fact `file` is the queue of the project's (../file/deroule.ts, grillhouse-4nr.8): a lot to enter
// goes into the queue (the signal ENTRER, the queue started when none runs), whose issue the workflow awaits; a lot on main whose
// ticket a red CI reopened has its CI read again (the child workflow of the CI of its commit);
// a ticket closed is the queue's end. Deterministic: it imports the workflow API, the search
// attributes, the contracts, the workflows of the queue and the pure decisions.
import {
  ActivityCancellationType,
  ApplicationFailure,
  allHandlersFinished,
  CancellationScope,
  condition,
  defineQuery,
  defineSignal,
  defineUpdate,
  isCancellation,
  makeContinueAsNewFunc,
  proxyActivities,
  setHandler,
  upsertMemo,
  upsertSearchAttributes,
  workflowInfo,
} from '@temporalio/workflow';
import {
  arretSansActe,
  effetsAJouer,
  pasDuPlan,
  transition,
  type Transition,
} from '../../../scripts/transitions.mjs';
import { ATTRIBUT_ETAPE, ATTRIBUT_TICKET } from '../attributs.js';
import type { ActivitesDeLaFile, IssueDeLaFile } from '../file/contrat.js';
import { entrerDansLaFile, issueDeLaFile, lireEtConclureLaCI } from '../file/deroule.js';
import {
  ARRETER,
  DEPUIS,
  ETAPES_DE_REPRISE,
  ETENDRE,
  L_ETAT,
  REFUS_DU_VALIDATEUR,
  REPRENDRE,
  type Activites,
  type ArretDecide,
  type ArretPublie,
  type Effet,
  type EntreeDuCircuit,
  type EtatDeLEtape,
  type EtatEcrit,
  type FinDuCircuit,
  type Memoire,
  type Menee,
  type Ouverture,
  type Question,
  type Reponse,
  type ResumeDeLEtat,
  type VueDuCircuit,
} from './contrat.js';

// Every act: a session lasts 4 h at most; its heartbeat every 5 s, awaited 90 s, so that a dead
// worker's attempt is played again by the next worker; an act that fails is not tried again.
const actes = proxyActivities<Activites>({
  startToCloseTimeout: '6 hours',
  heartbeatTimeout: '90 seconds',
  retry: { initialInterval: '5 seconds', maximumAttempts: 4 },
  cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
});

// An effect an act gave back, one per activity (docs/ARCHITECTURE.md, « une activité, un effet,
// une clé »): a writing lasts a minute at most, tried again as an activity is.
const OPTIONS_D_UN_EFFET = {
  startToCloseTimeout: '5 minutes',
  heartbeatTimeout: '90 seconds',
  retry: { initialInterval: '5 seconds', maximumAttempts: 4 },
} as const;

// The activity of the effect of id <activityId>, which the workflow sets.
const unEffet = (activityId: string) =>
  proxyActivities<Activites>({ ...OPTIONS_D_UN_EFFET, activityId }).jouerUnEffet;

// The acts of the queue the circuit plays itself at its step 5.2.
const actesDeLaFile = proxyActivities<ActivitesDeLaFile>({
  startToCloseTimeout: '1 minute',
  retry: { initialInterval: '1 second', maximumAttempts: 4 },
});

// Each answer carries the supervisor's session that gives it (`superviseur`, undefined: the
// session of before stays), which the acts of the run receive from then on.
const reprendre = defineUpdate<string, [string | null, (string | null)?]>(REPRENDRE);
const arreter = defineSignal<[string | null]>(ARRETER);
const depuis = defineUpdate<
  string,
  [
    {
      role: (typeof ETAPES_DE_REPRISE)[number];
      contexte?: string | null;
      superviseur?: string | null;
    },
  ]
>(DEPUIS);
const etendre = defineUpdate<
  string,
  [{ paquets: string[]; contexte?: string | null; superviseur?: string | null }]
>(ETENDRE);
const lEtat = defineQuery<VueDuCircuit>(L_ETAT);

const REPASSER_MS = 10 * 60_000;
const REPASSES_MAX = 6;
const LIMITE_D_HISTOIRE = 10_000;

// How a run of steps ends.
type Issue =
  | { fin: true }
  | { arret: ArretPublie }
  | { arreter: ArretDecide; etat: EtatDeLEtape; menee: Menee | null }
  | { continuer: Ouverture };

// The message and the stack of the failure <e> of an activity.
function inattendu(e: unknown): ArretDecide {
  const cause = (e as { cause?: { message?: string; details?: unknown[] } }).cause;
  const d = (cause?.details?.[0] ?? {}) as { message?: string | null; pile?: string | null };
  const message = d.message ?? cause?.message ?? String((e as Error)?.message ?? e);
  return { inattendu: { message, pile: d.pile ?? null } };
}

// What the board shows of the state <e> a run wrote (the effect `etat`), published in the memo
// (./client.ts `lireLesCircuits` reads it): its step, its attempt, its stop and the first line of
// its report, the object of its questioning, its loops, the start of its step led.
function resumeDeLEtat(e: unknown): ResumeDeLEtat {
  const x = (e ?? {}) as Record<string, unknown>;
  const rapport = typeof x.rapport === 'string' ? x.rapport : '';
  const objet = (x.questionnement as { objet?: unknown } | null | undefined)?.objet;
  return {
    etape: typeof x.etape === 'string' ? x.etape : null,
    tentative: typeof x.tentative === 'number' ? x.tentative : null,
    finale: x.finale === true,
    code: typeof x.code === 'number' ? x.code : null,
    raison: typeof x.raison === 'string' ? x.raison : null,
    rapport:
      rapport
        .split('\n')
        .map(l => l.trim())
        .find(Boolean) ?? null,
    questionnement: typeof objet === 'string' ? objet : null,
    boucles:
      x.boucles && typeof x.boucles === 'object' ? (x.boucles as Record<string, number>) : {},
    mene: typeof x.mene === 'string' ? x.mene : null,
  };
}

// The name of the stop <a>.
const nomDe = (a: ArretDecide) =>
  (a.leve as { nom?: string } | undefined)?.nom ?? (a.inattendu ? 'inattendu' : (a.nom ?? null));

/** The circuit of a ticket, from its plan to its integration or to the supervisor's stop. */
export async function circuitDuTicket(entree: EntreeDuCircuit): Promise<FinDuCircuit> {
  const repasserMs = entree.repasserMs ?? REPASSER_MS;
  const repassesMax = entree.repassesMax ?? REPASSES_MAX;
  let ouverture: Ouverture | null = entree.suite?.ouverture ?? null;
  let repasses = entree.suite?.repasses ?? 0;
  // The session of the supervisor who put the ticket in the queue, then of the last who answered.
  let superviseur = entree.superviseur ?? null;
  // A circuit stopped on the supervisor's word, its workflow ended, reopens on his answer.
  let reprend =
    entree.suite?.reprend ??
    (entree.reprise?.genre === 'reprendre' || entree.reprise?.genre === 'etendre');
  // The supervisor's answer awaited (`attente`), and the answer once given.
  let attente = false;
  let reponse: Reponse | null = null;
  let question: Question | null = null;
  // The stop the run resumes from, and the answer it opens on.
  let arrete: (EtatDeLEtape & { raison?: string | null; question?: Question | null }) | null =
    (entree.etatDArret as typeof arrete | undefined) ?? null;
  // The state the circuit wrote last, which the workflow holds and gives back at a stop on the
  // supervisor's word: the state a stopped circuit reopens from.
  let etatEcrit: EtatEcrit | null = entree.suite?.etat ?? entree.etatDArret ?? null;
  let ouvrirSur: Exclude<Reponse, { genre: 'arreter' }> | null = entree.reprise ?? null;
  let memoire: Memoire = ouverture?.memoire ?? {};
  let etat: EtatDeLEtape = ouverture?.debut ?? {
    etape: 'plan',
    tentative: 1,
    rapport: null,
    finale: false,
  };
  // ARRETER while a step plays: its motive, and the scope it cancels.
  let arretDemande: { contexte: string | null } | null = null;
  let enCours: CancellationScope | null = null;

  const repondre = (r: Reponse) => {
    reponse = r;
  };
  // The refusal of an answer by a validator, under its type (REFUS_DU_VALIDATEUR), which the
  // client names apart from any other failure of an update.
  const refuser = (message: string): never => {
    throw ApplicationFailure.nonRetryable(message, REFUS_DU_VALIDATEUR);
  };
  // An answer is taken only while a question waits for one, and once: a second answer of the
  // same wait, in the same activation, is refused.
  const uneQuestionAttend = () => {
    if (!attente) {
      refuser('aucune question n’attend de réponse : le circuit tourne.');
    }
    if (reponse !== null) {
      refuser('la question a déjà sa réponse : le circuit reprend.');
    }
  };
  // What became of the answer of the wait: the circuit resumes on it, or a --arreter of the same
  // turn stops it. An answer says it once the turn has decided, so that it says the true one.
  let issueDeLaReponse: 'reprise' | 'arret' | null = null;
  const laReponse = () => issueDeLaReponse;
  const repondreEtDire = async (r: Reponse, dit: string) => {
    issueDeLaReponse = null;
    repondre(r);
    await condition(() => issueDeLaReponse !== null);
    return laReponse() === 'arret' ? 'arrêté : un --arreter du même tour arrête le circuit' : dit;
  };
  // The session of the supervisor who answers, from then on the acts'.
  const parLaSeance = (s: string | null | undefined) => {
    if (s !== undefined) {
      superviseur = s;
    }
  };
  setHandler(
    reprendre,
    (contexte, seance) => {
      parLaSeance(seance);
      return repondreEtDire({ genre: 'reprendre', contexte }, 'repris');
    },
    {
      validator: (_contexte: string | null, _seance?: string | null) => uneQuestionAttend(),
    }
  );
  // ARRETER answers a question that waits; anywhere else (a step that plays, a stop being written,
  // an answer already given) it is kept, the step cancelled, and the circuit stops at the first
  // point it reaches.
  setHandler(arreter, contexte => {
    if (attente && reponse === null) {
      repondre({ genre: 'arreter', contexte });
    } else if (!arretDemande) {
      arretDemande = { contexte };
      enCours?.cancel();
    }
  });
  setHandler(
    depuis,
    ({ superviseur: seance, ...r }) => {
      parLaSeance(seance);
      return repondreEtDire({ genre: 'depuis', ...r }, `depuis ${r.role}`);
    },
    {
      validator: (r: { role: (typeof ETAPES_DE_REPRISE)[number] }) => {
        uneQuestionAttend();
        if (!ETAPES_DE_REPRISE.includes(r?.role)) {
          refuser(`--depuis attend une étape du ticket : ${ETAPES_DE_REPRISE.join(', ')}.`);
        }
      },
    }
  );
  setHandler(
    etendre,
    ({ superviseur: seance, ...r }) => {
      parLaSeance(seance);
      return repondreEtDire({ genre: 'etendre', ...r }, `étendu à ${r.paquets.join(', ')}`);
    },
    {
      validator: (r: { paquets: string[] }) => {
        uneQuestionAttend();
        if (!Array.isArray(r?.paquets) || !r.paquets.length || r.paquets.some((p: string) => !p)) {
          refuser('--etendre attend les paquets que le plan gagne.');
        }
      },
    }
  );
  // The issue of the entry the queue gives back.
  let issue: IssueDeLaFile | null = null;
  setHandler(issueDeLaFile, i => {
    issue = i;
  });
  let relectures = 0;
  // The fact `file` of the step 5.2: where the lot stands, then the queue, or its CI read again.
  const laFile = async (): Promise<IssueDeLaFile> => {
    const { racine, ticket } = entree;
    const lot = await actesDeLaFile.situerLeLot({ racine, ticket });
    if (lot.statut === 'closed') {
      return { etat: 'ferme', raison: lot.raison ?? 'ticket fermé' };
    }
    // A lot on main whose place on origin is unknown (origin does not answer) does not go back to
    // the queue: the reason goes up, the stop « inattendu ».
    if (!lot.aEntrer && lot.commit && lot.branche && lot.surOrigin === 'inconnu') {
      throw new Error(
        `la place du lot ${lot.commit.slice(0, 7)} sur origin ne se lit pas (${lot.raisonOrigin ?? 'sans raison'}) : il ne retourne pas en file.`
      );
    }
    // A lot on main and on origin: its CI read again. A lot on the local main alone (its closure
    // failed before its push) goes through the queue again, which closes and pushes it.
    if (!lot.aEntrer && lot.commit && (lot.surOrigin === 'oui' || !lot.branche)) {
      if (!lot.branche) {
        return {
          etat: 'rouvert',
          raison: 'grillhouse.poussee.commit ne nomme pas une branche : la CI ne se relit pas.',
        };
      }
      relectures += 1;
      return lireEtConclureLaCI(
        { racine, ticket, sha: lot.commit, branche: lot.branche, ci: entree.ci, relue: true },
        `${workflowInfo().workflowId}:ci:${workflowInfo().runId}:${relectures}`
      );
    }
    issue = null;
    await entrerDansLaFile(
      { racine, ci: entree.ci },
      { ticket, branche: `agent/${ticket}`, deroule: workflowInfo().workflowId }
    );
    await condition(() => issue !== null);
    const i = issue as unknown as IssueDeLaFile;
    // An act of the queue that failed: the stop « inattendu » of the step, its reason its message.
    if (i.etat === 'echec') {
      throw new Error(i.raison);
    }
    return i;
  };
  setHandler(lEtat, () => ({
    etape: etat.etape,
    tentative: etat.tentative,
    attente,
    question,
    repasses,
    ecrit: etatEcrit,
  }));

  // The step <etape> and the question <q> published, for the board and `workflow list`; each
  // question its rank in the run (`numero`), which tells a new question from one already gone up.
  let numero = 0;
  const publier = (etape: string, q: Question | null) => {
    const attributs = [{ key: ATTRIBUT_ETAPE, value: etape }];
    if (workflowInfo().typedSearchAttributes.get(ATTRIBUT_TICKET) !== entree.ticket) {
      attributs.push({ key: ATTRIBUT_TICKET, value: entree.ticket });
    }
    upsertSearchAttributes(attributs);
    if (q) {
      numero += 1;
    }
    upsertMemo({ ticket: entree.ticket, etape, question: q, numero });
  };
  const lieu = () => ({
    racine: entree.racine,
    ticket: entree.ticket,
    memoire,
    superviseur,
  });
  // The effects an act gave back, played one by one, each in an activity whose id the workflow
  // sets (its rank in the run, then its sort), the key of its writing (../acte.ts
  // `cleDeLActivite`); consecutive states are one (`effetsAJouer`). The state is no writing out of
  // the workflow: it holds it (`etatEcrit`), and the memo holds it whole (`ecrit`), which
  // `--reprendre` reopens from when the workflow ends without its issue (./client.ts), and its
  // summary, which the board reads (`resumeDeLEtat`). ARRETER does not cut them: they are written to their end, out of the scope
  // it cancels, and the run stops at its next act.
  let effetsJoues = 0;
  const jouerLesEffets = (effets: Effet[] | undefined) =>
    CancellationScope.nonCancellable(async () => {
      for (const effet of effetsAJouer(effets ?? [])) {
        if (effet.genre === 'etat') {
          etatEcrit = effet.etat as EtatEcrit;
          upsertMemo({ etat: resumeDeLEtat(effet.etat), ecrit: effet.etat });
          continue;
        }
        effetsJoues += 1;
        await unEffet(`effet:${effetsJoues}:${effet.genre}`)({
          racine: entree.racine,
          ticket: entree.ticket,
          effet,
        });
      }
    });
  const limite = entree.limiteDHistoire ?? LIMITE_D_HISTOIRE;
  const aContinuer = () =>
    workflowInfo().continueAsNewSuggested || workflowInfo().historyLength >= limite;

  // The steps of the run, from its opening to its end or its stop. An act that fails anywhere (the
  // opening, the preparation of a pass, a fact, the effects, the end) is the stop « inattendu » at
  // the step the run had reached, its answer awaited.
  const courir = async (): Promise<Issue> => {
    // The state the step wrote (its loops counted) and the step the circuit leads, which a stop keeps.
    let ici: { etat: EtatDeLEtape; menee: Menee | null } = { etat, menee: null };
    try {
      return await lesEtapes(e => (ici = e));
    } catch (e) {
      if (isCancellation(e)) {
        throw e;
      }
      return { arreter: inattendu(e), ...ici };
    }
  };
  const lesEtapes = async (
    marquer: (e: { etat: EtatDeLEtape; menee: Menee | null }) => void
  ): Promise<Issue> => {
    if (!ouverture) {
      publier('ouverture', null);
      let o = await actes.ouvrirLeCircuit({ ...lieu(), reponse: ouvrirSur, arrete });
      await jouerLesEffets(o.effets);
      // The plan still to write: each of its steps an activity, the next decided by `pasDuPlan`.
      while ('plan' in o) {
        publier('plan', null);
        const plan = o.plan;
        memoire = plan.memoire;
        o = await actes.jouerUnPasDuPlan({
          ...lieu(),
          pas: pasDuPlan(plan.etat),
          plan,
          reponse: ouvrirSur,
        });
        await jouerLesEffets(o.effets);
      }
      if ('arret' in o) {
        return { arret: o.arret };
      }
      ouverture = o.ouverture;
      memoire = ouverture.memoire;
      etat = ouverture.debut;
    }
    const { ticket } = ouverture;
    for (;;) {
      if (aContinuer()) {
        return { continuer: { debut: etat, memoire, ticket } };
      }
      publier(etat.etape, null);
      marquer({ etat, menee: null });
      const pointe = await actes.preparerLaPasse({
        ...lieu(),
        etape: etat,
        paquets: ticket.paquets,
      });
      await jouerLesEffets(pointe.effets);
      // The state the step writes (its loops counted), which its stop keeps.
      const ecrit = pointe.etat;
      const { menee } = pointe;
      marquer({ etat: ecrit, menee });
      const finir = async (effets: unknown[] | undefined, fin: Menee | null) => {
        if (effets?.length || fin) {
          const r = await actes.appliquerLesEffets({
            ...lieu(),
            effets: effets ?? [],
            menee: fin,
            paquets: ticket.paquets,
          });
          await jouerLesEffets(r.effets);
        }
      };
      if (pointe.arret) {
        return { arreter: pointe.arret, etat: ecrit, menee };
      }
      memoire = { ...memoire, ...pointe.memoire };
      const faits: Record<string, unknown> = {};
      let d: Transition;
      for (;;) {
        d = transition({ etat, memoire, ticket, reprend, faits });
        if (!d.besoin) {
          break;
        }
        const { fait, ...parametres } = d.besoin;
        // What the step decided before this fact is written before a stop the fact raises.
        const avantLArret = async (arret: ArretDecide): Promise<Issue> => {
          await finir(d.effets, null);
          memoire = { ...memoire, ...d.memoire };
          return { arreter: arret, etat: ecrit, menee };
        };
        let r: Awaited<ReturnType<Activites['lireUnFait']>>;
        try {
          r =
            fait === 'file'
              ? { valeur: await laFile(), memoire: {}, effets: [] }
              : await actes.lireUnFait({
                  ...lieu(),
                  fait,
                  parametres,
                  faits,
                  sorte: ticket.sorte,
                  paquets: ticket.paquets,
                });
          await jouerLesEffets(r.effets);
        } catch (e) {
          if (isCancellation(e)) {
            throw e;
          }
          return avantLArret(inattendu(e));
        }
        memoire = { ...memoire, ...r.memoire };
        if (r.leve) {
          return avantLArret({ leve: r.leve });
        }
        faits[fait] = r.valeur;
      }
      reprend = false;
      memoire = { ...memoire, ...d.memoire };
      const arret: ArretDecide | null = d.usage
        ? { inattendu: { message: d.usage, pile: null } }
        : (d.arret ?? null);
      // A stop ends its step once written; any other decision ends it with its effects.
      await finir(d.effets, arret ? null : menee);
      if (arret) {
        return { arreter: arret, etat: ecrit, menee };
      }
      if (d.fin) {
        const f = await actes.finirLeTicket({ ...lieu(), etat, paquets: ticket.paquets });
        await jouerLesEffets(f.effets);
        return { fin: true };
      }
      etat = d.suivant!;
      repasses = 0;
      ouverture = { debut: etat, memoire, ticket };
    }
  };

  // The stop <issue> written: its act, or, when the act itself fails, the stop « inattendu » in
  // the memo alone (scripts/transitions.mjs `arretSansActe`); `rejoue`, a « a-repasser » played again.
  const ecrire = async (
    issue: Exclude<Issue, { fin: true } | { continuer: Ouverture }>
  ): Promise<{ publie: ArretPublie; rejoue: boolean }> => {
    if ('arret' in issue) {
      return { publie: issue.arret, rejoue: false };
    }
    const rejoue = nomDe(issue.arreter) === 'a-repasser' && repasses < repassesMax;
    try {
      const publie = await actes.publierLArret({
        ...lieu(),
        arret: issue.arreter,
        etat: issue.etat,
        monter: !rejoue,
        paquets: ouverture?.ticket.paquets ?? null,
        menee: issue.menee,
      });
      await jouerLesEffets(publie.effets);
      return { publie, rejoue };
    } catch (e) {
      const { message } = inattendu(e).inattendu as { message: string };
      return {
        publie: arretSansActe(issue.etat, message, `le déroulé ${workflowInfo().workflowId}`),
        rejoue: false,
      };
    }
  };

  for (;;) {
    let issue: Issue;
    try {
      enCours = new CancellationScope();
      issue = await enCours.run(courir);
    } catch (e) {
      if (!arretDemande || !isCancellation(e)) {
        throw e;
      }
      issue = { arreter: { arrete: true }, etat, menee: null };
    } finally {
      enCours = null;
    }
    if ('continuer' in issue) {
      await condition(allHandlersFinished);
      // The memo goes to the next run, which Continue-As-New does not carry by itself: the board
      // keeps the step it shows until the next state written.
      return makeContinueAsNewFunc<typeof circuitDuTicket>({ memo: workflowInfo().memo })({
        ...entree,
        superviseur,
        suite: { ouverture: issue.continuer, repasses, reprend, etat: etatEcrit },
      });
    }
    if ('fin' in issue) {
      publier('integre', null);
      return { code: 0, raison: 'integre', ...(etatEcrit ? { etat: etatEcrit } : {}) };
    }
    // The stop, until the supervisor's answer resumes the run: the supervisor's word ends the
    // circuit; any other stop is written, then played again (75) or its question awaited.
    let suite: Exclude<Issue, { fin: true } | { continuer: Ouverture }> = issue;
    for (;;) {
      // Set by the signal's handler, which the compiler does not follow.
      const demande = arretDemande as { contexte: string | null } | null;
      const a = 'arret' in suite ? suite.arret.etat : suite.etat;
      if (demande) {
        arretDemande = null;
        try {
          const r = await actes.arreterLeTicket({
            ...lieu(),
            etat: a,
            contexte: demande.contexte,
          });
          await jouerLesEffets(r.effets);
          publier('arrete', null);
          return { code: 0, raison: 'arrete', ...(etatEcrit ? { etat: etatEcrit } : {}) };
        } catch (e) {
          suite = { arreter: inattendu(e), etat: a, menee: null };
        }
      }
      const { publie, rejoue } = await ecrire(suite);
      suite = { arret: publie };
      // ARRETER while the stop was written.
      if (arretDemande) {
        continue;
      }
      question = publie.question;
      reponse = null;
      attente = true;
      publier(rejoue ? 'a-repasser' : 'question', question);
      if (rejoue) {
        // A « a-repasser » plays again after its sleep, unless the supervisor answers before.
        if (!(await condition(() => reponse !== null, repasserMs))) {
          repondre({ genre: 'reprendre', contexte: null });
        }
        repasses += 1;
      } else {
        await condition(() => reponse !== null);
        repasses = 0;
      }
      attente = false;
      const r = reponse as Reponse | null;
      question = null;
      if (r?.genre === 'arreter') {
        arretDemande = { contexte: r.contexte ?? null };
      }
      issueDeLaReponse = arretDemande ? 'arret' : 'reprise';
      if (arretDemande) {
        continue;
      }
      arrete = { ...publie.etat, question: publie.question };
      ouvrirSur = r as Exclude<Reponse, { genre: 'arreter' }>;
      reprend = r?.genre === 'reprendre' || r?.genre === 'etendre';
      ouverture = null;
      break;
    }
  }
}
