// The trial helpers of the board: the process line of a role agent launched in a shell, and a
// ticket's circuit as the server gives it.

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

// The circuit of <ticket> as the Temporal server gives it (scripts/circuits-du-serveur.mjs): at the
// developer's step, its workflow ended (`vivant` false), its run `run-<ticket>`, no question; <c>
// sets the rest.
export const circuitLu = (ticket: string, c: Record<string, unknown> = {}) => ({
  ticket,
  etape: 'developpeur',
  tentative: 1,
  finale: false,
  code: null,
  arret: null,
  raison: null,
  question: null,
  qui: null,
  questionnement: null,
  boucles: {},
  mene: null,
  vivant: false,
  interrompu: false,
  sansIssue: false,
  reponse: `npx grillhouse circuit ${ticket} --reprendre\`, \`--depuis <testwriter|developpeur> --contexte <texte>\`, \`--etendre <paquet>\` ou \`--arreter`,
  run: `run-${ticket}`,
  numero: 0,
  avancement: null,
  ...c,
});

// A reading of the server that gives no circuit.
export const aucunCircuit = () => Promise.resolve([]);
