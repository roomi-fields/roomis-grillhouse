// The trial helpers of the board: the process lines of a role agent launched in a shell and of a
// ticket's circuit.

// The line `ps -o pid,etimes,args` shows for the envelope lancer.sh starts: node runs enveloppe.mjs
// on the copy `<racine>/.claude/worktrees/<ticket>`, the component and the role, then the claude
// command; the prompt goes on the standard input, absent from the line.
export const ligneEnveloppe = (
  racine: string,
  ticket: string,
  role: string,
  { pid = 77, secondes = 600, composant = '.' } = {}
) =>
  `  ${pid}  ${secondes} node ${racine}/scripts/enveloppe/enveloppe.mjs ` +
  `${racine}/.claude/worktrees/${ticket} ${composant} ${role} -- ` +
  `claude -p --agent ${role} --permission-mode bypassPermissions\n`;

// The line `ps -o pid,etimes,args` shows for the circuit of a ticket, which the supervisor runs
// from the main tree: `grillhouse circuit <ticket>` and its options, as `npx` starts it.
export const ligneCircuit = (ticket: string, { pid = 88, secondes = 900, options = '' } = {}) =>
  `  ${pid}  ${secondes} node /depot/node_modules/.bin/grillhouse circuit ${ticket}${options ? ` ${options}` : ''}\n`;
