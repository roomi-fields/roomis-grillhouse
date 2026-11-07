// The types of the decisions of the circuit (./transitions.mjs), which the workflow of a ticket
// under Temporal (src/temporal/circuit/) imports.

/** The run at its step. */
export interface EtatDeLaTransition {
  etape: string;
  tentative: number;
  rapport: string | null;
  finale: boolean;
  relanceSurLeRefus?: boolean;
}

/** What a decision reads: the run, the circuit's memory, the ticket, the facts read so far. */
export interface EntreeDeLaTransition {
  etat: EtatDeLaTransition;
  memoire: Record<string, unknown>;
  ticket: { id: string; paquets: string[]; sorte: unknown; copie: string };
  reprend?: boolean;
  faits?: Record<string, unknown>;
}

/** The next fact to read, with what the step decided before it; or the decision of the step. */
export interface Transition {
  besoin?: { fait: string; [parametre: string]: unknown };
  suivant?: EtatDeLaTransition;
  memoire?: Record<string, unknown>;
  effets?: unknown[];
  arret?: Record<string, unknown> & { nom?: string };
  fin?: boolean;
  usage?: string;
}

/** The decision of the step of <entree>, or the next fact it needs. */
export function transition(entree: EntreeDeLaTransition): Transition;

/** The state of the plan of a ticket: the explorateur's sheet, the questionneur's, the questions put, the answer. */
export interface EtatDuPlan {
  plan: { questions: unknown[] } | null;
  lu: unknown;
  posees: string[];
  reponse: unknown;
  [cle: string]: unknown;
}

/** The step of the plan that follows <e>. */
export function pasDuPlan(e: EtatDuPlan): 'explorateur' | 'questionneur' | 'reponse' | 'conclure';

/** The questions the explorateur answers in the questionneur's sheet <lu>. */
export function questionsPosees(lu: {
  issue: string;
  desaccord?: string;
  questions: { question: string }[];
}): string[];

/** What stays open of the plan once the explorateur answered <reponses> to the questions <posees>. */
export function ouvertesDuPlan<Q>(
  plan: { questions: Q[] },
  posees: string[],
  reponses: { numero: number | string }[]
): (Q | { question: string; piece: string })[];

/** The effects <effets> an act gave back as the workflow plays them: consecutive states are one. */
export function effetsAJouer<E extends { genre: string }>(effets: E[]): E[];

/** The stop « inattendu » at <etat> that no act could write at the ticket, its message <message>, its piece <ou>. */
export function arretSansActe(
  etat: EtatDeLaTransition,
  message: string,
  ou: string
): {
  code: number;
  nom: string;
  question: { arret: string; fait: string; piece: string; question: string; qui: string };
  etat: EtatDeLaTransition & { raison: string };
};

/** The steps of the run by their state (scripts/etapes.mjs): 1.1 to 5.3. */
export const GESTE: string;
export const TESTS: string;
export const PREUVE: string;
export const CODE: string;
export const CONTROLES: string;
export const REFERENCES: string;
export const RELECTURE: string;
export const INTEGRATION: string;
export const EN_FILE: string;
export const TRI: string;

/** The bounded loops: the testwriter's relaunches, the developpeur's sessions, the reviews. */
export const RELANCES_TESTWRITER: number;
export const SEANCES_DEVELOPPEUR: number;
export const RELECTURES: number;

/** What changed for a developpeur relaunched on the integration's refusal of his lot unchanged. */
export const CHANGE_DU_REFUS: string;

/** A stop of a decision: its name, its report, and the options of an Arret of the circuit. */
interface ArretDeLaDecision {
  nom: string;
  rapport: string;
  piece: string | null;
  question: string;
}

/** The finding of the reviewer, as the decisions read it. */
interface Constat {
  titre: string;
  role: string;
  piece?: string;
  [champ: string]: unknown;
}

/** The developpeur's report on the integration's refusal <refus>. */
export function rapportDuRefus(refus: { rapport: string }): string;

/** The step after the plan of sort <sorte>: the gesture, the developpeur, or the testwriter. */
export function etapeApresLePlan(e: {
  sorte?: { genre?: string } | null;
  sansTests?: boolean;
}): string;

/** The step after a proof that passes: the developpeur, or the checks. */
export function apresLaPreuve(e: {
  rouges: number;
  pourLeDeveloppeur?: boolean;
  inchange?: boolean;
}): string;

/** What follows a red of the reading of the copy after the session <tentative> of <role>. */
export function suiteDuRougeDeLecture(
  role: string,
  tentative: number
): { etape: string; tentative: number } | { arret: string };

/** The findings of the reviewer open for <role> among <constats>, in their order. */
export function ouverts<C extends Constat>(constats: C[] | null | undefined, role: string): C[];

/** The stop for the findings open that go to the testwriter when the plan skips him, or null. */
export function arretDuTestwriterSaute(
  e: { constats?: Constat[] | null; sansTests?: boolean; paquets: string[] },
  texte: string
): ArretDeLaDecision | null;

/** The stop for a RENDU of a mechanical lot, or null. */
export function arretDuGesteMecanique(
  e: { constats?: Constat[] | null; mecanique?: boolean; sorte?: { raison?: string } | null },
  texte: string
): ArretDeLaDecision | null;
