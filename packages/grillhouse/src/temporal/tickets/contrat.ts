// The contract of the queue of the tickets of a project (grillhouse-4nr.9, decision D9): its type,
// its id and its query by their names, what it receives and gives back, and the activities
// it calls (./activites.ts). The workflow, its activities and its client share it.
import type { EntreeDuCircuit } from '../circuit/contrat.js';

/** The workflow's type. */
export const DES_TICKETS = 'ticketsDuProjet';
/** The id of the one queue of the tickets of the repository at <racine>. */
export const idDesTickets = (racine: string) => `tickets:${racine}`;
/** The query of the queue: the circuits alive, and the fault of the setting. */
export const L_ETAT_DES_TICKETS = 'etatDesTickets';
/**
 * The signal by which `npx grillhouse circuit <ticket>` gives the queue the supervisor's session
 * that put a ticket in it (a string, or null), which each circuit it starts then receives; it
 * wakes the queue.
 */
export const SEANCE_DU_SUPERVISEUR = 'seanceDuSuperviseur';

/** What the queue receives. */
export interface EntreeDesTickets {
  racine: string;
  /** How often the queue wakes by itself, in ms: 60 s. */
  reveilMs?: number;
  /** What each circuit it starts receives besides its ticket (`repasserMs`, `ci`…). */
  circuit?: Omit<EntreeDuCircuit, 'racine' | 'ticket' | 'suite'>;
}

/** The queue as its query gives it. */
export interface VueDesTickets {
  /** The tickets whose circuit runs, as the queue last counted them. */
  vivants: string[];
  /** The fault that starts nothing (the setting, the package.json, Beads), by its name; null without one. */
  faute: string | null;
}

export interface ActivitesDesTickets {
  /**
   * The tickets of the project that start now (`ticketsAPartir` of scripts/file-des-tickets.mjs,
   * those of <enCours> aside), in their order, and the setting (`reglageDesCircuits` of
   * scripts/circuits-cles.mjs): the number of circuits at once, or, with nothing to start, the
   * fault by its name (the setting, a package.json that does not parse, a Beads that fails).
   */
  ticketsAPartir(e: {
    racine: string;
    enCours: string[];
  }): Promise<{ partir: string[]; max: number | null; faute: string | null }>;
  /** The tickets of the project whose circuit runs, read from the server. */
  circuitsVivants(e: { racine: string }): Promise<string[]>;
  /**
   * The tickets of the project whose circuit the server holds, not integrated (`lireLesCircuits`
   * of ../circuit/client.ts, one call): a circuit stopped on a question, its workflow running, or
   * ended without its issue holds its ticket.
   */
  circuitsNonIntegres(e: { racine: string }): Promise<string[]>;
}
