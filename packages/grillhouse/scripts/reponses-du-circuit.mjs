// The answers a circuit accepts from the supervisor, by the status of its workflow, with no input
// nor output: the one rule the client (src/temporal/circuit/client.ts: its refusals and the
// circuits it reads), the opening, the wait, the board and the line of a stop name; and the
// answer `--mecanique`, which turns the sort of a ticket stopped on the testwriter.
import { CODE, GESTE, TESTS } from './transitions.mjs';

/** The statuses of a workflow ended without its issue. */
export const SANS_ISSUE = new Set(['TERMINATED', 'FAILED', 'TIMED_OUT', 'CANCELLED']);

/** The stops of the testwriter that `--mecanique` answers: his question, his blocked word. */
export const ARRETS_DU_TESTWRITER = ['besoin', 'hors-portee'];

/**
 * The answers accepted for the circuit of <ticket> whose workflow has the status <statut>, a state
 * written in its memo or not (<ecrit>), each a command between backquotes after the first, which
 * has none: ended without its issue, `--reprendre` from that state or `--depuis`; running, every
 * answer; stopped on the supervisor's word, all but `--arreter`.
 * @param {string} ticket
 * @param {string} statut
 * @param {boolean} ecrit
 * @returns {string}
 */
export function lesReponses(ticket, statut, ecrit) {
  const circuit = `npx grillhouse circuit ${ticket}`;
  const depuis = '--depuis <testwriter|developpeur> --contexte <texte>';
  if (SANS_ISSUE.has(statut)) {
    return ecrit ? `${circuit} --reprendre\` ou \`${depuis}` : `${circuit} ${depuis}`;
  }
  const etendre = '--etendre <paquet>';
  const mecanique = '--mecanique [<commande>] --contexte <raison>';
  return statut === 'RUNNING'
    ? `${circuit} --reprendre\`, \`${depuis}\`, \`${mecanique}\`, \`${etendre}\`, \`--reporter <heure>\` ou \`--arreter`
    : `${circuit} --reprendre\`, \`${depuis}\`, \`${mecanique}\` ou \`${etendre}`;
}

/**
 * The hour of a deferral (`--reporter <heure>`): a lone hour (`H:MM` or `HH:MM`, 0-23 and 00-59)
 * aims at its next occurrence in the machine's local time, today when strictly after <maintenant>
 * (to the second), else tomorrow, and is handed to `bd update --defer` as `AAAA-MM-JJ HH:MM`; any
 * other form goes to bd as written. `quand` is the phrase of the texts (« reportée <quand> »).
 * @param {string} heure
 * @param {Date} maintenant
 * @returns {{ defer: string, quand: string }}
 */
export function heureDuReport(heure, maintenant) {
  const lue = /^(\d{1,2}):([0-5]\d)$/.exec(heure);
  if (!lue || Number(lue[1]) > 23) {
    return { defer: heure, quand: `au ${heure}` };
  }
  const cible = new Date(maintenant);
  cible.setHours(Number(lue[1]), Number(lue[2]), 0, 0);
  const demain = cible.getTime() <= maintenant.getTime();
  if (demain) {
    cible.setDate(cible.getDate() + 1);
  }
  const deux = (n) => String(n).padStart(2, '0');
  const hhmm = `${deux(cible.getHours())}:${deux(cible.getMinutes())}`;
  const defer = `${cible.getFullYear()}-${deux(cible.getMonth() + 1)}-${deux(cible.getDate())} ${hhmm}`;
  return { defer, quand: demain ? `à demain ${hhmm}` : `au ${heure}` };
}

/**
 * The answer `--mecanique [<commande>] --contexte <raison>` to the stop <etat> (`{ etape, raison }`)
 * of a ticket of sort <sorte>: a refusal `{ refus }` unless the ticket is stopped on the testwriter
 * (his question or his blocked word) with a reason, its sort not already mechanical; else the sort
 * it becomes and the step the circuit resumes at, the plan kept as it is. With a <commande>, the
 * gesture a command plays: sort mécanique, 1.1. Without, the gesture written by hand: sort
 * comportement « inchangé », the developpeur writes and the existing suite makes the proof.
 * @param {{ etat: { etape: string, raison?: string | null }, sorte: { genre: string },
 *   commande: string | null, contexte: string | null }} o
 * @returns {{ refus: string } | { sorte: object, suivant: { etape: string } }}
 */
export function reponseMecanique({ etat, sorte, commande, contexte }) {
  if (etat?.etape !== TESTS || !ARRETS_DU_TESTWRITER.includes(etat.raison ?? '')) {
    return {
      refus: `--mecanique répond à un arrêt du testwriter (besoin ou hors-portee) : le circuit est à ${etat?.etape ?? 'aucun état'}${etat?.raison ? `, arrêté sur ${etat.raison}` : ''}.`,
    };
  }
  const raison = String(contexte ?? '').trim();
  if (!raison) {
    return { refus: '--mecanique attend sa raison en --contexte.' };
  }
  if (sorte?.genre === 'mécanique') {
    return { refus: 'le ticket est déjà mécanique : sa commande est celle de son plan.' };
  }
  const geste = String(commande ?? '').trim();
  return geste
    ? { sorte: { genre: 'mécanique', raison, commande: geste }, suivant: { etape: GESTE } }
    : { sorte: { genre: 'comportement', raison, comportement: 'inchangé' }, suivant: { etape: CODE } };
}
