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
  o?: { enCours?: Set<string>; externes?: Record<string, TicketDeBeads[]> }
): T[];

/**
 * What each ticket of the queue waits for from another project (`external:<project>:<capability>`
 * not delivered by a closed ticket `provides:<capability>`); `faute` names a project that
 * `external_projects` does not resolve, null otherwise.
 */
export function attentesExternes(
  tous: TicketDeBeads[],
  o?: { enCours?: Set<string>; externes?: Record<string, TicketDeBeads[]> }
): Array<{ ticket: string; attend: string; faute: string | null }>;

/** The tickets of <tous> in the queue that never start for want of their section « ## Architecture ». */
export function enFileSansArchitecture<T extends TicketDeBeads>(
  tous: T[],
  o?: { enCours?: Set<string> }
): T[];

/**
 * The tickets of <circuits> (alive, each with the step of its state, null before its first) closed
 * in <tous> outside their circuit: closed, the circuit before its integration.
 */
export function fermesHorsCircuit(
  tous: Array<{ id: string; status: string }>,
  circuits: Array<{ ticket: string; etape: string | null }>
): string[];

/** What a ticket waits for from another project in <externes>, one entry per capability not delivered. */
export function attendDeLAutreProjet(
  t: { dependencies?: Array<{ type: string; depends_on_id: string }> },
  externes?: Record<string, Array<{ status: string; labels?: string[] }>>
): Array<{ attend: string; faute: string | null }>;

/** The tickets of each provider project that <tous> depend on, by its name; unresolved ones left out. */
export function lireLesExternes(
  racine: string,
  tous: TicketDeBeads[]
): Record<string, TicketDeBeads[]>;

/** Every ticket of the project at <racine>, the closed ones too, as Beads gives them; throws on a Beads that fails. */
export function lireLesTickets(racine: string): TicketDeBeads[];
