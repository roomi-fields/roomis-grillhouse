// What a reading of the Temporal server says when the server does not answer within its delay:
// the fact measured, « Temporal ne répond pas en <n> s », since a server slow under load and a port
// where none listens look the same from the client. One rule for every reader: the board, the
// opening of a session (scripts/circuits-du-serveur.mjs), the command of the circuit
// (src/temporal/circuit/commande.ts) and the state of the service (src/temporal/etat.ts), each
// with the delay of its own reading.

/**
 * « Temporal ne répond pas en <n> s », <n> the delay <delaiMs> in seconds.
 * @param {number} delaiMs
 * @returns {string}
 */
export const sansReponseEn = delaiMs => `Temporal ne répond pas en ${delaiMs / 1000} s`;
