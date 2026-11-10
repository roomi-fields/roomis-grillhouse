// The types of the journal of states (./journal-des-etats.mjs).

/** A line of the journal of states. */
export interface LigneDuJournal {
  ts: string;
  genre: 'circuit' | 'file' | 'places';
  ticket: string | null;
  etape: string | null;
  boucle: number | null;
  place: string | null;
  raison: string;
}

/** A trace to write: a line, `ts` set when it already has its date. */
export type Trace = Partial<LigneDuJournal> & { genre: LigneDuJournal['genre'] };

export const AGE_MAX_JOURS: number;
export const TAILLE_MAX: number;
export function heureLocale(date?: Date): string;
export function dossierDuJournal(racine: string): string;
export function ecrireLaTrace(
  racine: string,
  trace: Trace,
  options?: { maintenant?: Date; dire?: (message: string) => void }
): { ecrit: boolean };
export function traceDeLaFile(e: { ticket: string; evenement: 'lance' | 'termine' }): Trace;
export function traceDesPlaces(e: {
  evenement: 'prise' | 'rendue' | 'attente';
  ticket?: string | null;
  place?: string | null;
  raison?: string;
}): Trace;
export function lireLeJournal(
  racine: string,
  plage?: { depuis?: string; jusquA?: string; ticket?: string }
): { lignes: LigneDuJournal[] };
export function nettoyerLeJournal(
  racine: string,
  options?: { maintenant?: Date; ageMaxJours?: number; tailleMax?: number }
): { retires: string[] };
export function ensemblesEnTravail(lignes: LigneDuJournal[]): { ts: string; enTravail: string[] }[];
