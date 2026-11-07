// The contract of the workflow of the machine, which holds its places (grillhouse-4nr.7,
// decision D2): its type, its update, its signals and its queries by their names, its id, its state
// and what its callers send and receive. The workflow, its activities and their clients share it
// without importing each other.

/** The workflow's type. */
export const PLACES = 'placesDeLaMachine';
/** The id of the one workflow of the machine. */
export const ID_DES_PLACES = 'grillhouse-places-de-la-machine';
/** The update that asks for a place: it records the request and returns at once. */
export const PRENDRE = 'prendre';
/** The update that draws the next rank of arrival of the machine, which a circuit keeps. */
export const TIRER_UN_RANG = 'tirerUnRang';
/** The signal that gives a place back, or withdraws a request that waits. */
export const RENDRE = 'rendre';
/** The signal that names the process that holds a place or a request. */
export const RATTACHER = 'rattacher';
/** The query of the places, which the board reads. */
export const LES_PLACES = 'lesPlaces';
/** The query of one request: given, waiting, or unknown (withdrawn, or its process gone). */
export const LA_DEMANDE = 'laDemande';

/** A place taken. */
interface Prise {
  id: string;
  pid: number;
  /** The start of the process (`departDe`), null when unknown. */
  depart: string | null;
  ticket: string | null;
  rang: number;
  /** The time it was taken, in ms. */
  depuis: number;
}

/** A taking that waits, and why. */
interface Attente {
  id: string;
  pid: number;
  depart: string | null;
  ticket: string | null;
  rang: number;
  raison: string;
  depuis: number;
}

/** The state of the places, which the workflow carries across a Continue-As-New. */
export interface EtatDesPlaces {
  /** The last rank of arrival drawn. */
  rang: number;
  /** The time of the last start, in ms. */
  dernier: number;
  prises: Prise[];
  attentes: Attente[];
}

/** What the machine gives at a moment (scripts/regles-des-places.mjs). */
export interface Mesure {
  coeurs: number;
  charge: number;
  memoireLibre: number;
}

/** What the workflow receives. */
export interface EntreeDesPlaces {
  /** The ceiling of the places (GRILLHOUSE_PLACES of the machine, 3 by default). */
  plafond: number;
  /** The gap between two starts, in ms (GRILLHOUSE_ESPACEMENT_MS). */
  espacementMs: number;
  /** How often a wait and the places taken are judged again, in ms. */
  veilleMs: number;
  /** The length of history past which the workflow continues as new; 2000 by default. */
  limiteDHistoire?: number;
  /** A machine of trial: the measure it always gives, in place of the activity's. */
  mesureFixe?: Mesure;
  /** The state a Continue-As-New carries. */
  etat?: EtatDesPlaces;
}

/** A request: its id, the process that holds the place, its ticket, the rank of its circuit. */
export interface DemandeDePlace {
  /** The id the caller draws; a request sent again under it is the same request. */
  id: string;
  pid: number;
  depart: string | null;
  ticket?: string | null;
  /** The rank of arrival of the circuit; drawn by the workflow, past every rank given, when absent. */
  rang?: number;
}

/** The place given. */
export interface PlaceDonnee {
  id: string;
  rang: number;
}

/** What the board reads: the ceiling, the places taken, the waits in their order of arrival. */
export interface VueDesPlaces {
  plafond: number;
  prises: Prise[];
  attentes: Attente[];
}

/** Where a request stands. */
export type EtatDeLaDemande =
  | { etat: 'donnee'; rang: number }
  | { etat: 'attend'; rang: number; raison: string }
  | { etat: 'inconnue' };

/** The process that now holds the place or the request <id>. */
export interface Rattachement {
  id: string;
  pid: number;
  depart: string | null;
}
