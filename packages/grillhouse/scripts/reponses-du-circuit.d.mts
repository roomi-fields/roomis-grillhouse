// The types of ./reponses-du-circuit.mjs, for the frame's TypeScript (src/temporal/circuit/client.ts).

/** The statuses of a workflow ended without its issue. */
export const SANS_ISSUE: Set<string>;
/** The answers accepted for the circuit of <ticket> whose workflow has the status <statut>. */
export function lesReponses(ticket: string, statut: string, ecrit: boolean): string;
/** The stops of the testwriter that `--mecanique` answers. */
export const ARRETS_DU_TESTWRITER: string[];
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
