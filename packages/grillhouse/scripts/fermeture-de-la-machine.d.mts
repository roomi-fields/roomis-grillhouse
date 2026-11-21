// The types of the closure of the machine (./fermeture-de-la-machine.mjs), which the workflow of
// the places (src/temporal/places/) imports.

/** What the command of closure does on the reservation in place. */
export function decisionDeFermeture(
  reservation: { auteur?: 'nuit' | 'superviseur' } | null | undefined
): 'fermer' | 'deja-fermee' | 'nuit-tient';

/** What the command of reopening does on the reservation in place. */
export function decisionDeReouverture(
  reservation: { auteur?: 'nuit' | 'superviseur' } | null | undefined
): 'rouvrir' | 'deja-ouverte' | 'nuit-tient';

/** What still runs by project and by ticket, or « la machine est vide ». */
export function direCeQuiTourne(o: {
  prises: readonly { ticket?: string | null; racine?: string | null }[];
  parts: readonly { ticket?: string | null; projet?: string | null; etat?: string }[];
}): string[];

/** The lines a command says once it has played. */
export function direLaFermeture(o: {
  issue: string;
  reservation: { depuis: number } | null;
  prises: readonly { ticket?: string | null; racine?: string | null }[];
  parts: readonly { ticket?: string | null; projet?: string | null; etat?: string }[];
  maintenant: number;
}): string[];
