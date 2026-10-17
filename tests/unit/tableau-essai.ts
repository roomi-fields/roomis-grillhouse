// The trial helpers of the board: the process line of a role agent launched in a shell.

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
