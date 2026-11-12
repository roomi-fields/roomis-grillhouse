// The contract of the nights of the machine (grillhouse-4nr.13, decision D6): the one schedule of
// the machine, the workflow it starts at each firing, the one workflow that plays the nights one
// after the other, their signal and query by their names, their ids, what they receive and give
// back, and the activities they call (./activites.ts). The workflows, their activities and their
// client share it without importing each other.

/** The workflow's type that plays the nights of the machine, one project after the other. */
export const NUITS = 'nuitsDeLaMachine';
/** The id of the one workflow of the nights of the machine. */
export const ID_DES_NUITS = 'grillhouse-nuits-de-la-machine';
/**
 * The workflow's type that the schedule starts at each firing: it asks the workflow of the nights
 * for the nights of the projects that moved, and ends. A schedule suffixes the id of the workflow
 * it starts with the time of its firing; the workflow of the nights keeps its fixed id so.
 */
export const NUIT_PLANIFIEE = 'nuitPlanifiee';
/** The id the schedule gives the workflow it starts (suffixed by the server with its time). */
export const ID_DE_LA_NUIT_PLANIFIEE = 'grillhouse-nuit-planifiee';
/** The id of the one schedule of the machine. */
export const ID_DE_LA_PLANIFICATION = 'grillhouse-nuits';
/** The window within which a firing missed (the machine off) is taken at the server's return. */
export const RATTRAPAGE = '24 hours';
/**
 * The signal that asks for nights: `{ projet }` the night of that project, its marker unread (a
 * request by hand); `{ planifiee: true }` the nights of the projects of the register that moved
 * since their last green night (the schedule).
 */
export const DEMANDER = 'demander';
/** The query of the nights: the project under way, those that wait, those played, skipped, left out. */
export const L_ETAT_DES_NUITS = 'etatDesNuits';

/** A request of nights. */
export type DemandeDeNuit = { projet: string } | { planifiee: true };

/** A project skipped: its top equals the commit of its last green night. */
export interface Saut {
  racine: string;
  raison: string;
  /** HEAD of its main tree. */
  sommet: string;
  /** The commit of its last green night. */
  reference: string;
}

/** A project of the register left out of the night, and why (its root gone, no night wired). */
interface Ecart {
  racine: string;
  raison: string;
}

/** The choice of a scheduled night: the projects that play, in their order, those skipped, those left out. */
export interface ChoixDesNuits {
  jouer: string[];
  sautes: Saut[];
  ecartes: Ecart[];
}

/** A night played: its project and the exit code of its pass (`grillhouse nuit`), or its failure. */
interface NuitJouee {
  racine: string;
  /** 0 green, 75 to play again, any other red; null when the activity failed. */
  code: number | null;
  /** The failure of the activity, by its message; null when the pass ran. */
  echec: string | null;
}

/** The nights as the query gives them. */
export interface VueDesNuits {
  enCours: string | null;
  /** When the night under way started (ms), null without one. */
  depuis: number | null;
  attente: string[];
  jouees: NuitJouee[];
  sautes: Saut[];
  ecartes: Ecart[];
}

/** What the workflow of the nights receives: nothing, or the state of a Continue-As-New. */
export interface EntreeDesNuits {
  /** The length of history past which the workflow continues as new; 2000 by default. */
  limiteDHistoire?: number;
  etat?: { attente: string[]; planifiees: number };
}

export interface ActivitesDesNuits {
  /**
   * The projects of the register of the machine (`~/.claude/grillhouse/registre.jsonl`), each
   * judged (./choix.ts): left out (its root gone, no night wired), skipped (its top at its last
   * green night), or played, in the order of their paths.
   */
  choisirLesNuits(): Promise<ChoixDesNuits>;
  /**
   * The reason of a skip written in the journal of the night of its project
   * (`<git common dir>/nuit/<date>.log`) and in the register of the machine, once per top and day.
   */
  noterLeSaut(saut: Saut): Promise<void>;
  /**
   * The pass of the night of the project at <racine> (`node_modules/.bin/grillhouse nuit`, which
   * runs scripts/nuit.sh), in its main tree, in a process group of its own: its exit code.
   */
  jouerLaNuit(e: { racine: string }): Promise<number>;
  /** The scheduled nights asked of the workflow of the nights, started when none runs. */
  demanderLesNuitsPlanifiees(): Promise<void>;
}
