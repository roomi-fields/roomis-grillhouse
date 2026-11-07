// The types of ./reponses-du-circuit.mjs, for the frame's TypeScript (src/temporal/circuit/client.ts).

/** The statuses of a workflow ended without its issue. */
export const SANS_ISSUE: Set<string>;
/** The answers accepted for the circuit of <ticket> whose workflow has the status <statut>. */
export function lesReponses(ticket: string, statut: string, ecrit: boolean): string;
