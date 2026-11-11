// The types of the rule of the queue of the tickets of a project (./file-des-tickets.mjs), which
// the queue of the tickets under Temporal (src/temporal/tickets/) imports.

/** A ticket as Beads gives it. */
export interface TicketDeBeads {
  id: string;
  status: string;
  priority?: number;
  labels?: string[];
  created_at?: string;
  description?: string;
  dependencies?: Array<{ type: string; depends_on_id: string }>;
}

/** The tickets of <tous> that start now, in the order they start. */
export function ticketsAPartir<T extends TicketDeBeads>(
  tous: T[],
  o?: { enCours?: Set<string> }
): T[];

/** The tickets of <tous> in the queue that never start for want of their section « ## Architecture ». */
export function enFileSansArchitecture<T extends TicketDeBeads>(
  tous: T[],
  o?: { enCours?: Set<string> }
): T[];

/** Every ticket of the project at <racine>, the closed ones too, as Beads gives them; throws on a Beads that fails. */
export function lireLesTickets(racine: string): TicketDeBeads[];
