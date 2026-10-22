// The reviewer's verdict at a ticket, as the circuit, the integration and the board read it: a
// module of its own, which imports nothing, so the board reads a verdict without the integration.

// The first word of a reviewer's verdict: ACCEPTÉ or RENDU.
export const VERDICT = /^\s*(ACCEPTÉ|RENDU)(?![\p{L}\d])/u;
// The author of the reviewer's verdicts at a ticket (Beads' `author`): the circuit writes the
// reviewer's final answer under it (BEADS_ACTOR), and the reviewer's session runs under it.
export const AUTEUR_DU_VERDICT = 'relecteur';

// The verdict the comment <c> (Beads' JSON: `author`, `text`) carries: ACCEPTÉ or RENDU for a
// comment of the author relecteur whose first word is one of them, else null.
export const verdictDe = c =>
  c?.author === AUTEUR_DU_VERDICT ? (VERDICT.exec(String(c.text ?? ''))?.[1] ?? null) : null;
