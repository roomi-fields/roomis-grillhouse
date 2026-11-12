// The answers a circuit accepts from the supervisor, by the status of its workflow, with no input
// nor output: the one rule the client (src/temporal/circuit/client.ts: its refusals and the
// circuits it reads), the opening, the wait, the board and the line of a stop name.

/** The statuses of a workflow ended without its issue. */
export const SANS_ISSUE = new Set(['TERMINATED', 'FAILED', 'TIMED_OUT', 'CANCELLED']);

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
  return statut === 'RUNNING'
    ? `${circuit} --reprendre\`, \`${depuis}\`, \`${etendre}\`, \`--reporter <heure>\` ou \`--arreter`
    : `${circuit} --reprendre\`, \`${depuis}\` ou \`${etendre}`;
}
