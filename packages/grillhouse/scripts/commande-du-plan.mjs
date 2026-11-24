// The command of the plan of a mechanical ticket: whether it calls git, and the refusal that says so.
// No import, so the code of a workflow may bring it in (no node module there).

// Whether the command of a plan calls git: a word `git` that starts the command or follows a
// separator (space-less operators included), as in `git mv a b` or `x && git add .`. The envelope
// mounts the git directory of the copy read-only (machine.md), so git cannot write its index there;
// the commit of the circuit records the tree after 1.1.
export const appelleGit = commande => /(^|[\s;&|(`])git(\s|$)/.test(String(commande ?? ''));

// The refusal of a command that calls git, naming the equivalent; null for any other command.
export function refusDeLaCommande(commande) {
  return appelleGit(commande)
    ? `la commande du plan appelle git (« ${String(commande).trim()} ») : l'enveloppe monte le dossier git de la copie en lecture seule, git n'y écrit pas son index ; la commande joue sur l'arbre de travail (mv au lieu de git mv, rm au lieu de git rm), et le commit du circuit enregistre l'arbre, git y détecte le renommage`
    : null;
}
