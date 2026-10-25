// The trial helpers of the board: the process line of a role agent launched in a shell, and the
// state of a ticket's circuit that runs.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { departDe } from '../../scripts/vitest-config/base-de-passe.mjs';

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

// The circuit of <ticket> in the repository <racine> made to run: its state names a living process,
// this one, by its number and its start, as scripts/circuit.mjs writes its own (`processus`,
// `depart`).
export function rendreVivant(racine: string, ticket: string) {
  const f = path.join(racine, '.claude', 'worktrees', `${ticket}.circuit.json`);
  const etat = JSON.parse(readFileSync(f, 'utf8')) as object;
  const vivant = { processus: process.pid, depart: departDe(process.pid) };
  writeFileSync(f, `${JSON.stringify({ ...etat, ...vivant }, null, 2)}\n`);
}
