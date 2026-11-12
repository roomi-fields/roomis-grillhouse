// The client of the workflow of a ticket (./deroule.ts), as `npx grillhouse circuit` speaks to it
// (./commande.ts): it starts the circuit of a ticket (or leaves the one that runs), answers its
// stop (the updates REPRENDRE, DEPUIS and ETENDRE, which a validator refuses out of a wait or on a
// question already answered, and the signal ARRETER, taken anywhere), and reads it (the query
// L_ETAT). A circuit stopped on the supervisor's word has ended its workflow, which gave back the
// state it wrote last (`FinDuCircuit`): his answer starts a new one on the same id, which reopens
// from that state (`reprise`, `etatDArret`), not as a first launch, the bounds of the entry it
// follows kept. The server holds a workflow for the retention of its namespace (30 days, the
// installation's); past it, the state is gone with it, and only `--depuis` reopens the circuit,
// from the step of its agent, on the task queue of the project's worker (decision Q2 of
// grillhouse-4nr.12).
import { lesReponses, SANS_ISSUE } from '../../../scripts/reponses-du-circuit.mjs';
import { WorkflowNotFoundError, WorkflowUpdateFailedError, type Client } from '@temporalio/client';
import {
  ApplicationFailure,
  defaultPayloadConverter,
  WorkflowExecutionAlreadyStartedError,
} from '@temporalio/common';
import { fileDuProjet } from '../installation.js';
import {
  ARRETER,
  CIRCUIT,
  DEPUIS,
  ETENDRE,
  idDuCircuit,
  L_ETAT,
  REFUS_DU_VALIDATEUR,
  REPRENDRE,
  type EntreeDuCircuit,
  type ETAPES_DE_REPRISE,
  type FinDuCircuit,
  type Question,
  type Reponse,
  type ResumeDeLEtat,
  type VueDuCircuit,
} from './contrat.js';

/** Starts the circuit of <entree> on the task queue <file>, or leaves the one that runs: its id. */
export async function demarrerLeCircuit(
  client: Client,
  entree: EntreeDuCircuit,
  file: string
): Promise<string> {
  const id = idDuCircuit(entree.racine, entree.ticket);
  await client.workflow.start(CIRCUIT, {
    workflowId: id,
    taskQueue: file,
    args: [entree],
    workflowIdConflictPolicy: 'USE_EXISTING',
  });
  return id;
}

const handle = (client: Client, racine: string, ticket: string) =>
  client.workflow.getHandle(idDuCircuit(racine, ticket));

/** Where a new workflow of an answer goes: the task queue of a workflow the server no longer holds. */
export interface OuReprendre {
  /** The task queue of the project's worker, `grillhouse-projet-<nom>` by default. */
  file?: string;
  /** The supervisor's session that answers, which the new workflow's entry carries. */
  superviseur?: string | null;
}

// The bounds of the entry of the workflow <h> started with (`repasserMs`, `repassesMax`, `ci`),
// read in the first event of its history.
async function bornesDe(h: ReturnType<Client['workflow']['getHandle']>) {
  const historique = await h.fetchHistory();
  const debut =
    historique.events?.[0]?.workflowExecutionStartedEventAttributes?.input?.payloads?.[0];
  const e = debut ? defaultPayloadConverter.fromPayload<EntreeDuCircuit>(debut) : null;
  return {
    ...(e?.repasserMs === undefined ? {} : { repasserMs: e.repasserMs }),
    ...(e?.repassesMax === undefined ? {} : { repassesMax: e.repassesMax }),
    ...(e?.ci === undefined ? {} : { ci: e.ci }),
  };
}

/**
 * The refusal of an answer by its name, as `npx grillhouse circuit` refuses it (its `Usage`, exit
 * code 2): nothing is written, no workflow starts.
 */
export class ReponseRefusee extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReponseRefusee';
  }
}

// Refuses the answer <genre> to the circuit of <ticket> whose workflow ended <raison>: --reprendre
// and --etendre an integrated lot; --depuis never.
function refuserApresLaFin(
  genre: Exclude<Reponse, { genre: 'arreter' }>['genre'],
  raison: FinDuCircuit['raison'],
  ticket: string
): void {
  if (genre === 'reprendre' && raison === 'integre') {
    throw new ReponseRefusee(`rien à reprendre : le lot de ${ticket} est intégré.`);
  }
  if (genre === 'etendre' && raison === 'integre') {
    throw new ReponseRefusee(`--etendre : le lot de ${ticket} est intégré.`);
  }
}

// The update <envoyer> to a workflow that runs: a refusal of its validator (out of a wait, a
// question already answered, an answer out of its values: REFUS_DU_VALIDATEUR) is a refusal by
// its name; any other failure of the update (no handler, the workflow ended before it) stays as
// Temporal gives it.
async function envoyerA(envoyer: () => Promise<string>): Promise<string> {
  try {
    return await envoyer();
  } catch (x) {
    if (
      x instanceof WorkflowUpdateFailedError &&
      x.cause instanceof ApplicationFailure &&
      x.cause.type === REFUS_DU_VALIDATEUR
    ) {
      throw new ReponseRefusee(x.cause.message);
    }
    throw x;
  }
}

// The supervisor's answer <reponse> to the circuit of <ticket>, said <dit>: the update <envoyer>
// when its workflow runs; when it ended stopped on his word, a new workflow on the same id, which
// opens on the answer from the state the ended one gave back, on its task queue. A workflow the
// server no longer holds reopens on --depuis alone, with no state, on the project's task queue
// (<ou>). A workflow ended without its issue (terminated by force, failed) reopens on --reprendre
// from the state its last memo holds whole (`ecrit`), or on --depuis. An integrated lot (`refuserApresLaFin`),
// --reprendre or --etendre past the retention, --etendre on a workflow ended without its issue, a
// refusal of the validators of a workflow that runs, and an answer another one beat are refused by
// their name (`ReponseRefusee`).
async function repondre(
  client: Client,
  racine: string,
  ticket: string,
  reponse: Exclude<Reponse, { genre: 'arreter' }>,
  dit: string,
  envoyer: () => Promise<string>,
  ou: OuReprendre
): Promise<string> {
  const h = handle(client, racine, ticket);
  let file: string;
  let bornes = {};
  let etatDArret: FinDuCircuit['etat'] = null;
  try {
    const d = await h.describe();
    if (d.status.name === 'RUNNING') {
      return await envoyerA(envoyer);
    }
    file = d.taskQueue;
    bornes = await bornesDe(h);
    if (d.status.name === 'COMPLETED') {
      const fin = (await h.result()) as FinDuCircuit;
      refuserApresLaFin(reponse.genre, fin.raison, ticket);
      etatDArret = fin.raison === 'arrete' ? (fin.etat ?? null) : null;
    } else {
      // Ended without its issue: the state its last memo holds whole, which --reprendre reopens from.
      etatDArret = (d.memo?.ecrit as FinDuCircuit['etat'] | undefined) ?? null;
      if (reponse.genre === 'etendre' || (reponse.genre === 'reprendre' && !etatDArret)) {
        throw new ReponseRefusee(
          `le déroulé de ${ticket} a fini sans son issue (${d.status.name})${etatDArret ? '' : ', aucun état écrit'} : \`${lesReponses(ticket, d.status.name, Boolean(etatDArret))}\` le rouvre.`
        );
      }
    }
  } catch (x) {
    if (!(x instanceof WorkflowNotFoundError)) {
      throw x;
    }
    // Its retention passed: its state is gone with it, and only the step of an agent reopens it.
    if (reponse.genre !== 'depuis') {
      throw new ReponseRefusee(
        `le serveur ne tient plus le circuit de ${ticket} (sa conservation est passée) : seul \`npx grillhouse circuit ${ticket} --depuis <testwriter|developpeur> --contexte <texte>\` le rouvre.`
      );
    }
    file = ou.file ?? fileDuProjet(racine);
  }
  try {
    await client.workflow.start(CIRCUIT, {
      workflowId: h.workflowId,
      taskQueue: file,
      args: [
        {
          racine,
          ticket,
          ...bornes,
          reprise: reponse,
          etatDArret,
          ...(ou.superviseur === undefined ? {} : { superviseur: ou.superviseur }),
        },
      ],
    });
  } catch (x) {
    if (x instanceof WorkflowExecutionAlreadyStartedError) {
      throw new ReponseRefusee(
        `une autre réponse a déjà repris le circuit de ${ticket} : il tourne.`
      );
    }
    throw x;
  }
  return dit;
}

// The supervisor's session of <ou> as an answer carries it, nothing when it names none.
const seanceDe = (ou: OuReprendre) =>
  ou.superviseur === undefined ? {} : { superviseur: ou.superviseur };

/** Resumes the stopped circuit at its step (`--reprendre`), with the supervisor's <contexte>; refused out of a wait. */
export async function reprendreLeCircuit(
  client: Client,
  racine: string,
  ticket: string,
  contexte: string | null = null,
  ou: OuReprendre = {}
): Promise<string> {
  return repondre(
    client,
    racine,
    ticket,
    { genre: 'reprendre', contexte },
    'repris',
    () =>
      handle(client, racine, ticket).executeUpdate<string, [string | null, (string | null)?]>(
        REPRENDRE,
        { args: ou.superviseur === undefined ? [contexte] : [contexte, ou.superviseur] }
      ),
    ou
  );
}

/**
 * Starts the circuit of <ticket> over (`--recommencer`): <retirer> removes its copy, sheets and
 * journal, and its line names the copy removed. A circuit that runs is refused by its name
 * (`ReponseRefusee`) and nothing is removed; a ticket the server no longer holds is removed all the
 * same.
 */
export async function recommencerLeCircuit(
  client: Client,
  racine: string,
  ticket: string,
  retirer: (racine: string, ticket: string) => string
): Promise<string> {
  const d = await handle(client, racine, ticket)
    .describe()
    .catch((x: unknown) => {
      if (x instanceof WorkflowNotFoundError) {
        return null;
      }
      throw x;
    });
  if (d?.status.name === 'RUNNING') {
    throw new ReponseRefusee(
      `--recommencer : un circuit tourne sur ${ticket} ; \`--arreter\` l'arrête d'abord.`
    );
  }
  return `copie retirée : ${retirer(racine, ticket)}`;
}

/**
 * Stops the circuit, its session with it (`--arreter`), its motive <contexte>. A circuit that does
 * not run is refused by its name (`ReponseRefusee`): its lot integrated, or no circuit running.
 */
export async function arreterLeCircuit(
  client: Client,
  racine: string,
  ticket: string,
  contexte: string | null = null
) {
  const h = handle(client, racine, ticket);
  const d = await h.describe().catch((x: unknown) => {
    if (x instanceof WorkflowNotFoundError) {
      return null;
    }
    throw x;
  });
  if (d?.status.name !== 'RUNNING') {
    const fin = d?.status.name === 'COMPLETED' ? ((await h.result()) as FinDuCircuit) : null;
    throw new ReponseRefusee(
      fin?.raison === 'integre'
        ? `--arreter : le lot de ${ticket} est intégré.`
        : `--arreter : aucun circuit ne tourne sur ${ticket}.`
    );
  }
  await h.signal<[string | null]>(ARRETER, contexte);
}

/** Resumes the stopped circuit from the step of <role> (`--depuis`); refused out of a wait. */
export async function reprendreDepuis(
  client: Client,
  racine: string,
  ticket: string,
  role: (typeof ETAPES_DE_REPRISE)[number],
  contexte: string | null = null,
  ou: OuReprendre = {}
): Promise<string> {
  return repondre(
    client,
    racine,
    ticket,
    { genre: 'depuis', role, contexte },
    `depuis ${role}`,
    () =>
      handle(client, racine, ticket).executeUpdate<
        string,
        [
          {
            role: (typeof ETAPES_DE_REPRISE)[number];
            contexte: string | null;
            superviseur?: string | null;
          },
        ]
      >(DEPUIS, { args: [{ role, contexte, ...seanceDe(ou) }] }),
    ou
  );
}

/** Extends the plan of the stopped circuit to <paquets>, then resumes it (`--etendre`). */
export async function etendreLeCircuit(
  client: Client,
  racine: string,
  ticket: string,
  paquets: string[],
  contexte: string | null = null,
  ou: OuReprendre = {}
): Promise<string> {
  return repondre(
    client,
    racine,
    ticket,
    { genre: 'etendre', paquets, contexte },
    `étendu à ${paquets.join(', ')}`,
    () =>
      handle(client, racine, ticket).executeUpdate<
        string,
        [{ paquets: string[]; contexte: string | null; superviseur?: string | null }]
      >(ETENDRE, { args: [{ paquets, contexte, ...seanceDe(ou) }] }),
    ou
  );
}

/** The circuit as it stands: its step, whether it waits, its question. */
export async function lireLeCircuit(
  client: Client,
  racine: string,
  ticket: string
): Promise<VueDuCircuit> {
  return handle(client, racine, ticket).query<VueDuCircuit>(L_ETAT);
}

/** The end of the circuit: integrated, or stopped on the supervisor's word. */
export async function finDuCircuit(
  client: Client,
  racine: string,
  ticket: string
): Promise<FinDuCircuit> {
  return (await handle(client, racine, ticket).result()) as FinDuCircuit;
}

/**
 * A circuit of the repository as the board and the supervisor read it
 * (scripts/circuits-du-serveur.mjs): its step and attempt, its stop (`arret`) and the first line of its report
 * (`raison`), its question and who must answer it, the object of its questioning, its loops, the
 * start of its step led (ms), whether its workflow runs on its own (`vivant`: running, no question
 * awaited) or ended without its issue (`interrompu`: terminated, failed, timed out), its run and
 * the rank of its question in it (`numero`), which tell a new question from one gone up.
 */
export interface CircuitLu {
  ticket: string;
  etape: string | null;
  tentative: number | null;
  finale: boolean;
  code: number | null;
  arret: string | null;
  raison: string | null;
  question: string | null;
  qui: string | null;
  questionnement: string | null;
  boucles: Record<string, number>;
  mene: number | null;
  vivant: boolean;
  interrompu: boolean;
  /** Whether its workflow ended without its issue (terminated, failed, timed out, cancelled). */
  sansIssue: boolean;
  /**
   * The answers the client accepts for the circuit (`lesReponses`), each a command between
   * backquotes after the first, which has none: what the opening and the wait propose.
   */
  reponse: string;
  run: string;
  numero: number;
  /** Whether it is integrated: read only when the reading asks for them (`integres`). */
  integre: boolean;
  /** The time its workflow ended (ms), null while it runs. */
  fin: number | null;
}

/**
 * The circuits of the repository at <racine>, read in one call to the server (a `workflow.list`,
 * its memo and its status, no worker living): the last run of each ticket, in the form the board
 * reads (`CircuitLu`); a circuit integrated is left out, unless <integres> asks for them (the wait
 * of the supervisor, which their end wakes, scripts/superviseur.mjs).
 */
export async function lireLesCircuits(
  client: Client,
  racine: string,
  { integres = false }: { integres?: boolean } = {}
): Promise<CircuitLu[]> {
  const prefixe = idDuCircuit(racine, '');
  const lus: {
    workflowId: string;
    runId: string;
    startTime: Date;
    closeTime?: Date;
    status: { name: string };
    memo?: Record<string, unknown>;
  }[] = [];
  for await (const w of client.workflow.list({ query: `WorkflowType = '${CIRCUIT}'` })) {
    if (w.workflowId.startsWith(prefixe)) {
      lus.push(w);
    }
  }
  const parTicket = new Map<string, (typeof lus)[number]>();
  for (const w of lus) {
    const avant = parTicket.get(w.workflowId);
    if (!avant || w.startTime.getTime() > avant.startTime.getTime()) {
      parTicket.set(w.workflowId, w);
    }
  }
  const out: CircuitLu[] = [];
  for (const w of parTicket.values()) {
    const memo = (w.memo ?? {}) as {
      etape?: string;
      question?: Question | null;
      numero?: number;
      etat?: ResumeDeLEtat;
      ecrit?: unknown;
    };
    const etat = memo.etat ?? null;
    const integre = memo.etape === 'integre' || etat?.etape === 'integre';
    if (integre && !integres) {
      continue;
    }
    const q = memo.question ?? null;
    const statut = w.status.name;
    const interrompu = SANS_ISSUE.has(statut) && !q;
    const ticket = w.workflowId.slice(prefixe.length);
    const reponse = lesReponses(ticket, statut, Boolean(memo.ecrit));
    out.push({
      ticket,
      etape: etat?.etape ?? null,
      tentative: etat?.tentative ?? null,
      finale: etat?.finale === true,
      code: etat?.code ?? null,
      arret: q?.arret ?? etat?.raison ?? (statut === 'COMPLETED' ? 'arrete' : null),
      raison: etat?.rapport ?? null,
      // Ended without its issue, its question names no command: the answers the client accepts
      // (`reponse`, `lesReponses`) are named once, beside it, by the board, the opening and the wait.
      question: SANS_ISSUE.has(statut)
        ? `Le déroulé du circuit a fini sans son issue (${statut}), ${q ? `pendant sa question (${q.arret})` : 'aucun arrêt écrit'}.`
        : String(q?.question ?? '').trim() || null,
      qui: interrompu ? 'superviseur' : q ? String(q.qui ?? 'superviseur') : null,
      questionnement: etat?.questionnement ?? null,
      boucles: etat?.boucles ?? {},
      mene: etat?.mene && !Number.isNaN(Date.parse(etat.mene)) ? Date.parse(etat.mene) : null,
      vivant: statut === 'RUNNING' && !q,
      interrompu,
      sansIssue: SANS_ISSUE.has(statut),
      reponse,
      run: w.runId,
      numero: memo.numero ?? 0,
      integre,
      fin: w.closeTime ? w.closeTime.getTime() : null,
    });
  }
  return out.sort((a, b) => a.ticket.localeCompare(b.ticket, 'en'));
}
