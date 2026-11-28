// The answers a circuit accepts from the supervisor (circuit.md §5.4, « Un arrêt et sa réponse »),
// by the status of its workflow, with no input
// nor output: the one rule the client (src/temporal/circuit/client.ts: its refusals and the
// circuits it reads), the opening, the wait, the board and the line of a stop name; and the
// answer `--mecanique`, which turns the sort of a ticket stopped on the testwriter or on the proof
// of the red.
import { refusDeLaCommande } from './commande-du-plan.mjs';
import { CODE, GESTE, PREUVE, TESTS } from './transitions.mjs';

/** The statuses of a workflow ended without its issue. */
export const SANS_ISSUE = new Set(['TERMINATED', 'FAILED', 'TIMED_OUT', 'CANCELLED']);

/**
 * The stops `--mecanique` answers, by the step they stand at: the testwriter's question and his
 * blocked word, and the proof of the red that refuses the lot of tests, both the sign that no
 * honest test can turn red before the lot.
 */
export const ARRETS_DE_LA_BASCULE = { [TESTS]: ['besoin', 'hors-portee'], [PREUVE]: ['preuve'] };

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
  // The question carried to the owner: it stays quiet until the circuit answers.
  const chez = '--chez-le-responsable';
  return statut === 'RUNNING'
    ? `${circuit} --reprendre\`, \`${depuis}\`, \`${mecanique}\`, \`${etendre}\`, \`--reporter <heure>\`, \`${chez}\` ou \`--arreter`
    : `${circuit} --reprendre\`, \`${depuis}\`, \`${mecanique}\`, \`${etendre}\` ou \`${chez}`;
}

/** The refusal of an hour of deferral, which cites the forms accepted. */
export const REFUS_DE_L_HEURE =
  '--reporter attend son heure, à venir : H:MM, AAAA-MM-JJ, AAAA-MM-JJ HH:MM, AAAA-MM-JJTHH:MM, +6h (en heures) ou +2d (en jours).';

const deux = n => String(n).padStart(2, '0');
// The local wall time of <d> as bd reads it, `AAAA-MM-JJTHH:MM:00`.
const pourBd = d =>
  `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}:00`;

// The next occurrence of the lone hour <heures>:<minutes> after <maintenant>.
function prochaine(heure, heures, minutes, maintenant) {
  if (heures > 23) {
    return null;
  }
  const cible = new Date(maintenant);
  cible.setHours(heures, minutes, 0, 0);
  const demain = cible.getTime() <= maintenant.getTime();
  if (demain) {
    cible.setDate(cible.getDate() + 1);
  }
  const hhmm = `${deux(cible.getHours())}:${deux(cible.getMinutes())}`;
  return { defer: pourBd(cible), quand: demain ? `à demain ${hhmm}` : `au ${heure}` };
}

/**
 * The hour of a deferral (`--reporter <heure>`), read here alone: what `bd update --defer`
 * receives and the phrase of the texts (« reportée <quand> »), or null for a form refused, an
 * impossible date or hour, or a time not strictly after <maintenant>. A lone hour (`H:MM` or
 * `HH:MM`) aims at its next occurrence in the machine's local time, today when strictly after
 * <maintenant> (to the second), else tomorrow. A date (`AAAA-MM-JJ`, at midnight) and a date and
 * hour (`AAAA-MM-JJ HH:MM` or `AAAA-MM-JJTHH:MM`) go to bd as `AAAA-MM-JJTHH:MM:00`, the form it
 * reads as that wall time (bd reads a space-separated one with the month and the day taken for the
 * hour). The durations `+<n>h` and `+<n>d` go as written.
 * @param {string} heure
 * @param {Date} maintenant
 * @returns {{ defer: string, quand: string } | null}
 */
export function heureDuReport(heure, maintenant) {
  const seule = /^(\d{1,2}):([0-5]\d)$/.exec(heure);
  if (seule) {
    return prochaine(heure, Number(seule[1]), Number(seule[2]), maintenant);
  }
  const quand = `au ${heure}`;
  const duree = /^\+(\d+)[hd]$/.exec(heure);
  if (duree) {
    return Number(duree[1]) > 0 ? { defer: heure, quand } : null;
  }
  const date = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(heure);
  if (!date) {
    return null;
  }
  const [, annee, mois, jour, heures = '00', minutes = '00'] = date;
  const cible = new Date(maintenant);
  cible.setFullYear(Number(annee), Number(mois) - 1, Number(jour));
  cible.setHours(Number(heures), Number(minutes), 0, 0);
  // A date or an hour that does not exist rolls over to another one.
  const defer = `${annee}-${mois}-${jour}T${heures}:${minutes}:00`;
  return pourBd(cible) === defer && cible > maintenant ? { defer, quand } : null;
}

/**
 * The answer `--mecanique [<commande>] --contexte <raison>` to the stop <etat> (`{ etape, raison }`)
 * of a ticket of sort <sorte>: a refusal `{ refus }` unless the ticket is stopped on the testwriter
 * (his question or his blocked word) or on the proof of the red (`ARRETS_DE_LA_BASCULE`) with a
 * reason, its sort not already mechanical; else the sort
 * it becomes and the step the circuit resumes at, the plan kept as it is. With a <commande>, the
 * gesture a command plays: sort mécanique, 1.1. Without, the gesture written by hand: sort
 * comportement « inchangé », the developpeur writes and the existing suite makes the proof.
 * @param {{ etat: { etape: string, raison?: string | null }, sorte: { genre: string },
 *   commande: string | null, contexte: string | null }} o
 * @returns {{ refus: string } | { sorte: object, suivant: { etape: string } }}
 */
export function reponseMecanique({ etat, sorte, commande, contexte }) {
  if (!ARRETS_DE_LA_BASCULE[etat?.etape]?.includes(etat.raison ?? '')) {
    return {
      refus: `--mecanique répond à un arrêt du testwriter (besoin ou hors-portee) ou de la preuve du rouge (preuve) : le circuit est à ${etat?.etape ?? 'aucun état'}${etat?.raison ? `, arrêté sur ${etat.raison}` : ''}.`,
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
  const refusGit = refusDeLaCommande(geste);
  if (refusGit) {
    return { refus: refusGit };
  }
  return geste
    ? { sorte: { genre: 'mécanique', raison, commande: geste }, suivant: { etape: GESTE } }
    : { sorte: { genre: 'comportement', raison, comportement: 'inchangé' }, suivant: { etape: CODE } };
}
