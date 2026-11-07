// The contract of the sonde, which the workflow, its activity and their clients share without
// importing each other: the workflow's type and its signal by their names, what it receives, what
// it and its activity give back, and the sign of life the activity sends. The sonde proves the
// service: a workflow whose activity starts a process and sends its signs of life, which waits for
// a signal when asked, and upserts its step at each move.

/** The workflow's type. */
export const SONDE = 'sonde';

/** The signal that ends the wait of the workflow. */
export const FINIR = 'finir';

/** What the workflow receives. */
export interface EntreeDeLaSonde {
  /** The ticket the workflow carries, its search attribute GrillhouseTicket. */
  ticket: string;
  /** The steps the activity's process does. */
  etapes: number;
  /** The pause of the process between two steps, in milliseconds. */
  pauseMs: number;
  /** Whether the workflow waits for the signal FINIR once its activity is done. */
  attendreLeSignal: boolean;
}

/** The sign of life of the activity: the steps its process has done. */
export interface SigneDeVie {
  fait: number;
}

/** What the activity gives back. */
export interface ResultatDeLActivite {
  /** The steps done, all of them. */
  fait: number;
  /** The step the attempt started from: its last sign of life, 0 for a first attempt. */
  depuis: number;
  /** The attempt, from 1. */
  tentative: number;
  /** The process the attempt started. */
  pid: number;
}

/** What the workflow gives back. */
export interface ResultatDeLaSonde {
  ticket: string;
  activite: ResultatDeLActivite;
}
