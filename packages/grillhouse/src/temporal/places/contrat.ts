// The contract of the workflow of the machine, which holds its places (grillhouse-4nr.7,
// decision D2): its type, its update, its signals and its queries by their names, its id, its state
// and what its callers send and receive. The workflow, its activities and their clients share it
// without importing each other.
import type { PlaceDeCircuit } from '../../../scripts/regles-des-places.mjs';

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
/**
 * The update by which the queue of the tickets of a project (../tickets/deroule.ts) gives its
 * circuits alive and the tickets it would start, and learns those the machine lets start.
 */
export const RESERVER = 'reserverDesCircuits';
/**
 * The update by which the nights reserve the whole machine (grillhouse-giw): no place is given but
 * to the requests that carry the jeton of the night, and the places taken finish.
 */
export const RESERVER_LA_MACHINE = 'reserverLaMachine';
/** The update by which the nights renew their reservation: its beat. */
export const BATTRE_LA_RESERVATION = 'battreLaReservation';
/** The update by which the nights lift their reservation, by its jeton. */
export const LEVER_LA_RESERVATION = 'leverLaReservation';
/** The patch of the reservation of the machine (Temporal's patching). */
export const RESERVATION_DE_LA_NUIT = 'reservation-de-la-nuit';

/** The reservation of the whole machine by the night. */
interface Reservation {
  jeton: string;
  /** The time it was made, in ms. */
  depuis: number;
  /** The time of its last beat, in ms. */
  battement: number;
}

/** The night as the places show it: its reservation and its phase. */
interface NuitDesPlaces {
  /** `attend` while the places taken finish, `en cours` once none is. */
  phase: 'attend' | 'en cours';
  depuis: number;
  battement: number;
}

/** A place taken. */
interface Prise {
  id: string;
  /** The jeton of the night the request carried, null without. */
  jeton?: string | null;
  pid: number;
  /** The start of the process (`departDe`), null when unknown. */
  depart: string | null;
  ticket: string | null;
  /** The root of the main tree of the project that holds it; absent in a state of before. */
  racine?: string | null;
  rang: number;
  /** The time it was taken, in ms. */
  depuis: number;
}

/** A taking that waits, and why. */
interface Attente {
  id: string;
  jeton?: string | null;
  pid: number;
  depart: string | null;
  ticket: string | null;
  racine?: string | null;
  rang: number;
  raison: string;
  depuis: number;
}

/** What the queue of the tickets of a project, or a circuit resumed, gives the machine (RESERVER). */
export interface CircuitsDuProjet {
  racine: string;
  /** The tickets of the project whose circuit is active (a circuit on a question is not). */
  vivants?: string[];
  /** The tickets the project would start now, in its order, within its own setting. */
  candidats?: string[];
  /** Why the disk of the project's copies lacks room for one more, null with room. */
  disque?: string | null;
  /** A circuit resumed after its question that asks again by itself: its ticket and its rank. */
  reprise?: { ticket: string; rang: number | null };
  /** The identity of the project's group (`grillhouse.groupe`), absent out of a group. */
  groupe?: string;
  /** The Beads priority (0 to 4) and creation of each candidate, which order a group's waits. */
  priorites?: Record<string, { priorite: number; creation: string }>;
  /** The places of circuits the project holds at most (`grillhouse.circuits`), absent unbounded. */
  max?: number;
}

/** The state of the places, which the workflow carries across a Continue-As-New. */
export interface EtatDesPlaces {
  /** The last rank of arrival drawn. */
  rang: number;
  /** The time of the last start, in ms. */
  dernier: number;
  prises: Prise[];
  attentes: Attente[];
  /** The places of the circuits of the machine; absent in a state of before. */
  circuits?: PlaceDeCircuit[];
  /** The reservation of the machine by the night; absent in a state of before, null without. */
  reservation?: Reservation | null;
}

/** What the machine gives at a moment (scripts/regles-des-places.mjs). */
export interface Mesure {
  coeurs: number;
  charge: number;
  memoireLibre: number;
}

/** What the workflow receives. */
export interface EntreeDesPlaces {
  /**
   * The ceiling a run started before the ceiling was read from the poste carries, which it judges
   * by until its first reading; a new run reads the poste's (`plafondDeLaMachine`).
   */
  plafond?: number;
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
  /** The root of the main tree of the project that asks. */
  racine?: string | null;
  /** The jeton of the reservation of the night, which the passes of the night carry. */
  jeton?: string | null;
  /** The rank of arrival of the circuit; drawn by the workflow, past every rank given, when absent. */
  rang?: number;
}

/** The place given. */
export interface PlaceDonnee {
  id: string;
  rang: number;
}

/**
 * What the board reads: the ceiling last read, the places taken, the waits in their order of
 * arrival, the fault of the last reading of the ceiling (null without one), and the places of the
 * circuits in their order of arrival.
 */
export interface VueDesPlaces {
  plafond: number;
  faute?: string | null;
  prises: Prise[];
  attentes: Attente[];
  circuits?: PlaceDeCircuit[];
  /** The night when it reserves the machine; absent without. */
  nuit?: NuitDesPlaces | null;
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
