// The contract of the workflow of a ticket (grillhouse-4nr.6, decision Q3): its type and its id,
// its signal, its updates and its query by their names, what it receives and gives back, and
// the activities it calls (./activites.ts, each an act of scripts/faits-du-circuit.mjs), their
// inputs and their outputs.
// The workflow, its activities and their clients share it without importing each other.

import type { DelaisDeLaCI } from '../file/contrat.js';
import type { EtatDuPlan } from '../../../scripts/transitions.mjs';

/** The workflow's type. */
export const CIRCUIT = 'circuitDuTicket';
/** The id of the workflow of the ticket <ticket> of the repository at <racine>. */
export const idDuCircuit = (racine: string, ticket: string) => `circuit:${racine}:${ticket}`;

/** The update that resumes a stopped circuit at its step (`--reprendre`). */
export const REPRENDRE = 'reprendre';
/** The signal that stops the circuit, its session with it (`--arreter`), wherever it stands. */
export const ARRETER = 'arreter';
/** The update that resumes a stopped circuit from the step of an agent (`--depuis`). */
export const DEPUIS = 'depuis';
/** The update that extends the plan of a stopped circuit, then resumes it (`--etendre`). */
export const ETENDRE = 'etendre';
/** The type of the failure a validator of an answer refuses it with, which the client names. */
export const REFUS_DU_VALIDATEUR = 'RefusDuValidateur';
/** The query of the circuit as it stands. */
export const L_ETAT = 'etatDuCircuit';

/** The steps a `--depuis` names: it replays that step and the ones after it, no result read back. */
export const ETAPES_DE_REPRISE = [
  'testwriter',
  'preuve',
  'developpeur',
  'controles',
  'passe-finale',
] as const;

/** The run at its step, as scripts/transitions.mjs reads it. */
export interface EtatDeLEtape {
  etape: string;
  tentative: number;
  rapport: string | null;
  finale: boolean;
  relanceSurLeRefus?: boolean;
}

/** What the circuit keeps between steps (`MEMOIRE` of scripts/circuit.mjs, and its session to resume). */
export type Memoire = Record<string, unknown>;

/** The ticket as the decisions read it. */
interface TicketDuCircuit {
  id: string;
  paquets: string[];
  sorte: unknown;
  copie: string;
}

/** The question of a stop, as the supervisor reads it. */
export interface Question {
  arret: string;
  fait: string;
  piece: string;
  question: string;
  qui: string;
}

/**
 * What the memo of a circuit holds of the state its run wrote last (`etat`), which the board reads
 * (`lireLesCircuits`): its step, its attempt, its stop, the first line of its report, the object
 * of its questioning, its loops and the start of its step led (ISO).
 */
export interface ResumeDeLEtat {
  etape: string | null;
  tentative: number | null;
  finale: boolean;
  code: number | null;
  raison: string | null;
  rapport: string | null;
  questionnement: string | null;
  boucles: Record<string, number>;
  mene: string | null;
}

/**
 * The whole state the circuit wrote last (the effect `etat` of scripts/circuit.mjs `ecrireEtat`):
 * its step, its stop, its question and what the run keeps between steps. The workflow holds it,
 * and gives it back when it stops on the supervisor's word, so that his answer reopens from it.
 */
export type EtatEcrit = Record<string, unknown>;

/** A stop a decision returns (scripts/transitions.mjs), or an exception fallen in an activity. */
export type ArretDecide = Record<string, unknown> & { nom?: string };

/** A stop written at the ticket: its code, its name, its question (none for « a-repasser »), its state. */
export interface ArretPublie {
  code: number;
  nom: string;
  question: Question | null;
  etat: EtatDeLEtape & { raison?: string | null };
}

/** The supervisor's answer to a stop. */
export type Reponse =
  | { genre: 'reprendre'; contexte?: string | null }
  | { genre: 'depuis'; role: (typeof ETAPES_DE_REPRISE)[number]; contexte?: string | null }
  | { genre: 'etendre'; paquets: string[]; contexte?: string | null }
  | { genre: 'arreter'; contexte?: string | null };

/** Where a run starts: its step, its memory, its ticket. */
export interface Ouverture {
  debut: EtatDeLEtape;
  memoire: Memoire;
  ticket: TicketDuCircuit;
}

/** What the workflow receives; `suite` the state a Continue-As-New carries. */
export interface EntreeDuCircuit {
  racine: string;
  ticket: string;
  /** The sleep before a « a-repasser » (75) plays again, in ms: 10 min (decision D4). */
  repasserMs?: number;
  /** How many times a « a-repasser » plays again before its question goes up: 6 (decision D4). */
  repassesMax?: number;
  /** The bounds of the reading of the CI at the step 5.2 (../file/contrat.ts). */
  ci?: DelaisDeLaCI;
  /** The length of history past which the workflow continues as new; 10 000 by default. */
  limiteDHistoire?: number;
  /**
   * The session of the supervisor that put the ticket in the queue or answered its stop
   * (`CLAUDE_CODE_SESSION_ID` of `npx grillhouse circuit`), which the stop gone up keeps
   * (`montee.superviseur`, scripts/circuit.mjs `aLaFin`) and the bilan reads; null without one.
   */
  superviseur?: string | null;
  suite?: {
    ouverture: Ouverture;
    repasses: number;
    reprend: boolean;
    etat: EtatEcrit | null;
  };
  /**
   * The supervisor's answer a new workflow opens on, for a circuit stopped on his word whose
   * workflow ended (`--reprendre`, `--depuis`, `--etendre`): it reopens from the state that stop
   * left, not as a first launch.
   */
  reprise?: Exclude<Reponse, { genre: 'arreter' }>;
  /**
   * The state the stopped workflow gave back at its end (`FinDuCircuit`), which the new workflow of
   * the answer reopens from; none when the server no longer holds it (`--depuis` alone).
   */
  etatDArret?: EtatEcrit | null;
}

/** How the workflow ends: integrated (0), or stopped on the supervisor's word. */
export interface FinDuCircuit {
  code: number;
  raison: 'integre' | 'arrete';
  /**
   * The state the circuit wrote last: integrated, its end; stopped on the supervisor's word, the
   * state his answer reopens from.
   */
  etat?: EtatEcrit | null;
}

/** The circuit as the query gives it. */
export interface VueDuCircuit {
  etape: string;
  tentative: number;
  attente: boolean;
  question: Question | null;
  repasses: number;
  /** The state the circuit wrote last, whole (`EtatEcrit`); null before its first. */
  ecrit: EtatEcrit | null;
}

// ---- The activities --------------------------------------------------------------------------

/** A step the circuit leads itself, from its start: its line to the register at its end. */
export interface Menee {
  etape: string;
  debut: string;
}

/**
 * An external effect an act gives back, as data (scripts/effets.mjs): the workflow plays each in an
 * activity of its own (`jouerUnEffet`), under the key of that activity.
 */
export type Effet = { genre: string } & Record<string, unknown>;

/** What an act gives back besides its outcome: the effects it emitted, in their order. */
interface Rendus {
  effets: Effet[];
}

/** The plan of a ticket still to write, between two of its steps (scripts/circuit.mjs `unPasDuPlan`). */
interface PlanEnCours {
  /** The state of the plan, `pasDuPlan` of scripts/transitions.mjs deciding its next step. */
  etat: EtatDuPlan;
  /** The step the run starts at once the plan passes. */
  debut: EtatDeLEtape;
  /** The supervisor's context of the run, which the explorateur reads. */
  contexte: string | null;
  memoire: Memoire;
}

/** What every activity receives: the ticket, the memory the workflow holds, its supervisor. */
interface Lieu {
  /** The main tree of the repository, where the act plays. */
  racine: string;
  ticket: string;
  memoire: Memoire;
  /** The supervisor's session of the entry (`EntreeDuCircuit.superviseur`), null without one. */
  superviseur: string | null;
}

export interface Activites {
  /**
   * Opens a run of the circuit, as `npx grillhouse circuit` does: its first launch (<reponse>
   * null), or the resumption <reponse> of the stopped state <arrete>. The plan before the
   * testwriter, the checks of the launch (arbitrage, tools, generated files): an opening, or a
   * stop written at the ticket.
   */
  ouvrirLeCircuit(
    e: Lieu & {
      reponse: Exclude<Reponse, { genre: 'arreter' }> | null;
      arrete: (EtatDeLEtape & { raison?: string | null; question?: Question | null }) | null;
    }
  ): Promise<({ ouverture: Ouverture } | { arret: ArretPublie } | { plan: PlanEnCours }) & Rendus>;
  /**
   * The step <pas> of the plan <plan> (a session of the explorateur, of the questionneur, or the
   * explorateur's answer, the conclusion with the last): the plan that follows, the opening once
   * it passes, or its stop written at the ticket.
   */
  jouerUnPasDuPlan(
    e: Lieu & {
      pas: 'explorateur' | 'questionneur' | 'reponse' | 'conclure';
      plan: PlanEnCours;
      reponse: Exclude<Reponse, { genre: 'arreter' }> | null;
    }
  ): Promise<({ ouverture: Ouverture } | { arret: ArretPublie } | { plan: PlanEnCours }) & Rendus>;
  /**
   * The start of the step <etape>, its state written (`etat`, its loops counted; `menee`, a step
   * the circuit leads itself), and the copy prepared on the tip of main before its pass, or its stop.
   */
  preparerLaPasse(
    e: Lieu & { etape: EtatDeLEtape; paquets: string[] }
  ): Promise<
    { etat: EtatDeLEtape; menee: Menee | null } & Rendus &
      ({ memoire: Memoire; arret?: undefined } | { arret: ArretDecide })
  >;
  /** The fact <fait> a decision asks for (a session, a pass, a reading), and the memory it leaves. */
  lireUnFait(
    e: Lieu & {
      fait: string;
      parametres: Record<string, unknown>;
      faits: Record<string, unknown>;
      sorte: unknown;
      paquets: string[];
    }
  ): Promise<{ valeur: unknown; memoire: Memoire; leve?: ArretDecide } & Rendus>;
  /**
   * The effects <effets> of a decision, in their order (a line at the ticket, a gesture, a report),
   * then the end of its step <menee> when it ends there.
   */
  appliquerLesEffets(
    e: Lieu & { effets: unknown[]; menee: Menee | null; paquets: string[] }
  ): Promise<Rendus>;
  /**
   * The stop <arret> at the step <etat> written at the ticket, its question gone up unless it is
   * a « a-repasser » the workflow plays again (<monter> false). An exception of an activity
   * (<arret> `{ inattendu: message }`) is the stop « inattendu ».
   */
  publierLArret(
    e: Lieu & {
      arret: ArretDecide;
      etat: EtatDeLEtape;
      monter: boolean;
      paquets: string[] | null;
      menee: Menee | null;
    }
  ): Promise<ArretPublie & Rendus>;
  /** The end of the run, integrated: its state, the bilan, the finished copies. */
  finirLeTicket(e: Lieu & { etat: EtatDeLEtape; paquets: string[] }): Promise<Rendus>;
  /** The circuit stopped on the supervisor's word at <etat>, its motive <contexte>, said at the ticket. */
  arreterLeTicket(e: Lieu & { etat: EtatDeLEtape; contexte: string | null }): Promise<Rendus>;
  /**
   * One effect <effet> an act gave back, written under the key of this activity (its workflow,
   * its run, its activity id, which the workflow sets): an effect that is not written fails.
   */
  jouerUnEffet(e: { racine: string; ticket: string; effet: Effet }): Promise<void>;
}
