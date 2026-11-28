// The types of ./reponses-du-circuit.mjs, for the frame's TypeScript (src/temporal/circuit/client.ts).

/** The statuses of a workflow ended without its issue. */
export const SANS_ISSUE: Set<string>;
/** The answers accepted for the circuit of <ticket> whose workflow has the status <statut>. */
export function lesReponses(ticket: string, statut: string, ecrit: boolean): string;
/** The refusal of an hour of deferral, which cites the forms accepted. */
export const REFUS_DE_L_HEURE: string;
/** The hour `bd update --defer` receives for `--reporter <heure>`, and the phrase of its texts; null refused. */
export function heureDuReport(
  heure: string,
  maintenant: Date
): { defer: string; quand: string } | null;
/** The stops `--mecanique` answers, by the step they stand at: the testwriter's, the proof's. */
export const ARRETS_DE_LA_BASCULE: Record<string, string[]>;
/** The sort of a ticket, as the plan says it (scripts/resultats.mjs `sorteDuPlan`). */
export interface SorteDuTicket {
  genre: string;
  raison: string | null;
  comportement?: 'changé' | 'tests-adaptés' | 'inchangé';
  commande?: string;
}
/** The answer `--mecanique` to the stop <etat> of a ticket of sort <sorte>: a refusal, or its new sort and step. */
export function reponseMecanique(o: {
  etat: { etape: string; raison?: string | null } | null;
  sorte: { genre: string } | null;
  commande: string | null;
  contexte: string | null;
}): { refus: string } | { sorte: SorteDuTicket; suivant: { etape: string } };
