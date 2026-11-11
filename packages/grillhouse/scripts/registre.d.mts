// The types of the register of finished agents (./registre.mjs), which the activities of the
// nights under Temporal (src/temporal/nuits/activites.ts) import.

/** The fields of a hook's input that the register reads. */
export interface EntreeDuCrochet {
  hook_event_name?: string;
  transcript_path?: string;
  session_id?: string;
  agent_id?: string;
  agent_type?: string;
  agent_transcript_path?: string;
  cwd?: string;
  projet_dir?: string;
}

/** A tariff in dollars per million tokens. */
export interface Tarif {
  entree: number;
  sortie: number;
  lecture: number;
  ecriture5m: number;
  ecriture1h: number;
}

/** A line of the register. */
export interface LigneDuRegistre {
  projet: string;
  agent: string | null;
  ticket: string | null;
  role: string | null;
  etape?: string;
  debut: string;
  fin: string;
  travail: number;
  tours: [number, number][];
  jetons: number;
  cache: number;
  cout: number | null;
  cle?: string;
  nuit?: { verdict: 'sautee'; raison: string; sommet: string; reference: string };
}

/** The register's file: GRILLHOUSE_REGISTRE, else ~/.claude/grillhouse/registre.jsonl. */
export const REGISTRE: string;
export const TARIFS: Record<string, Tarif>;
export function source(input: EntreeDuCrochet): {
  transcription: string | null;
  role: string | null;
  agent: string | null;
};
export function coutDe(modeles: Record<string, Partial<Tarif>> | null | undefined): number | null;
export function ligne(
  input: EntreeDuCrochet,
  t: {
    premier: number | null;
    dernier: number;
    ticket?: string | null;
    role?: string | null;
    travail: number;
    tours: [number, number][];
    jetons: number;
    cache: number;
    cout?: number | null;
    modeles?: Record<string, Partial<Tarif>>;
  },
  projet: string
): LigneDuRegistre | null;
export function ligneDEtape(e: {
  projet: string;
  ticket: string;
  etape: string;
  debut: string;
  fin: string;
}): LigneDuRegistre;
export function ligneDeNuit(e: {
  projet: string;
  quand: string;
  raison: string;
  sommet: string;
  reference: string;
}): LigneDuRegistre;
export function aRattraper(
  racine: string,
  home: string,
  connus: Set<string>,
  maintenant?: number
): EntreeDuCrochet[];
export function ecrire(l: LigneDuRegistre): boolean;
export function transcriptionsDeLaCopie(copie: string, home: string): string;
export function deLaCopie(copie: string, home: string, connus: Set<string>): EntreeDuCrochet[];
