// The types of ./depart-du-ticket.mjs, for the frame's TypeScript (src/temporal/circuit/commande.ts).

/** A component of the repository, as `composantsDe` lists it. */
export interface Composant {
  dossier: string;
  pkg: { name?: string };
}

/** A ticket as Beads shows it. */
export interface TicketDeBeads {
  id?: string;
  title?: string;
  description?: string;
  issue_type?: string;
  [champ: string]: unknown;
}

/** A ticket a circuit cannot start on, by its reason. */
export class DepartRefuse extends Error {}

/** The directory of the component <nom> of a title among <liste>; or a refusal. */
export function resoudreComposant(liste: Composant[], base: string, nom: string): string;

/** The ticket <id> as `bd show --json` gives it in <sortie>, refused without its architecture. */
export function ticketAuDepart(
  id: string,
  sortie: string,
  options?: { arreter?: boolean }
): TicketDeBeads;

/** The subject and the plan of the title <titre> of the ticket <id>; or a refusal. */
export function leTitre(
  id: string,
  titre: string | undefined,
  resoudre: (nom: string) => string
): { sujet: string; plan: string[] };

/** The ticket <id> of the repository at <racine>, read before any work; or a refusal. */
export function ticketAuLancement(
  racine: string,
  id: string,
  options?: {
    arreter?: boolean;
    bd?: ((...a: string[]) => { status: number | null; stdout: string; stderr: string }) | null;
  }
): {
  ticket: TicketDeBeads;
  base: string;
  liste: Composant[];
  resoudre: (nom: string) => string;
  sujet: string;
  plan: string[];
};
