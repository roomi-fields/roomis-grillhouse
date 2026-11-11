// The types of the disk of the copies of a project (./disque-des-copies.mjs), which the
// activities of the queue of the tickets and of the circuit (src/temporal/) import.

/** The expected size of a copy of a project that declares no language, before any measure. */
export const TAILLE_PAR_DEFAUT: number;

/** The directory of the copies of the project at <racine>. */
export function dossierDesCopies(racine: string): string;

/** Measures the copy of <ticket> once and keeps its size beside it; null without a copy. */
export function mesurerLaCopie(racine: string, ticket: string): number | null;

/** The sizes kept of the copies of the project, and whether each copy is still there. */
export function taillesGardees(
  racine: string
): Array<{ ticket: string; octets: number; presente: boolean }>;

/** The disk of the copies: its room, the room a start wants, what holds it, why a start waits. */
export function disqueDesCopies(
  racine: string,
  o?: { libre?: (chemin: string) => number; tailles?: (racine: string) => number[] }
): {
  chemin: string;
  libre: number;
  requis: number;
  occupe: Array<{ ticket: string; octets: number }>;
  raison: string | null;
};
