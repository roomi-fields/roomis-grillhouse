#!/usr/bin/env node
// The signal of the supervisor's turn: the hook UserPromptSubmit of the mod runs it at each turn
// of a session of supervision (`npx grillhouse attente-au-tour`), and what it writes reaches the
// session. A question of a circuit must never stay mute because the wait in the background died
// unseen, as a review requested on GitHub is named again until it is answered.
//
// - It names each circuit that waits for the supervisor (`questionsEnAttente`, the one source of
//   the opening and of the wait), a circuit ended without its issue included: its ticket, its
//   question, the command that answers it, then the wait to launch again.
// - A question already gone up to the wait is named again: the file of the stops gone up is not
//   read.
// - A wait that lives says it all: its lock (`attente-des-questions.lock`) names a live process,
//   and nothing is said. A lock whose process is dead counts as no wait.
// - Out of a git repository, in an agent's copy (a worktree) and in the session of a role that
//   the circuit launches (BEADS_ACTOR set), nothing is said.
// Exit 0, whatever it finds.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { circuitsDuServeur } from './circuits-du-serveur.mjs';
import { vivant } from './mesure/base-de-passe.mjs';
import { questionsEnAttente, ticketsHorsAttente, verrouDeLAttente } from './superviseur.mjs';

// The process that the lock of the wait of the repository at <racine> names; null without a lock.
function tenant(racine) {
  try {
    return Number(/^(\d+)/.exec(readFileSync(verrouDeLAttente(racine), 'utf8'))?.[1]) || null;
  } catch {
    return null;
  }
}

/**
 * The root of the repository whose session of supervision works in <dossier>: null out of a git
 * repository, in an agent's copy (a worktree) and in the session of a role that the circuit
 * launches (BEADS_ACTOR set). The hooks of the supervisor's session read it (this one, and
 * scripts/attente-a-l-arret.mjs).
 * @param {string} dossier
 * @param {Record<string, string | undefined>} env
 * @returns {string | null}
 */
export function racineDeLaSupervision(dossier, env = process.env) {
  if (env.BEADS_ACTOR) {
    return null;
  }
  const r = spawnSync(
    'git',
    ['-C', dossier, 'rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    return null;
  }
  const [dossierGit, commun] = r.stdout.trim().split('\n');
  if (path.resolve(dossierGit) !== path.resolve(commun)) {
    return null;
  }
  return path.dirname(commun);
}

/**
 * What the session of supervision in <dossier> reads at its turn: the circuits that wait for the
 * supervisor, each with its ticket, its question and the command that answers it, then the wait to
 * launch again; empty when a wait lives, when no circuit waits, or out of a session of supervision.
 * @param {string} dossier the directory the session works in
 * @param {{ env?: Record<string, string | undefined>,
 *   fermes?: (racine: string, ids: string[]) => Set<string>,
 *   circuitsDe?: (racine: string) => Promise<import('./circuits-du-serveur.mjs').CircuitDuServeur[]> }} options
 * @returns {Promise<string>}
 */
export async function attenteAuTour(
  dossier,
  { env = process.env, fermes = ticketsHorsAttente, circuitsDe = circuitsDuServeur } = {}
) {
  const racine = racineDeLaSupervision(dossier, env);
  if (!racine) {
    return '';
  }
  const vit = tenant(racine);
  if (vit && vivant(vit)) {
    return '';
  }
  let circuits;
  try {
    circuits = await circuitsDe(racine);
  } catch {
    return '';
  }
  const questions = questionsEnAttente(racine, circuits, { fermes });
  if (!questions.length) {
    return '';
  }
  return [
    questions.length > 1
      ? '## Circuits en attente du superviseur'
      : '## Circuit en attente du superviseur',
    ...questions.map(q =>
      q.interrompu
        ? `- ${q.ticket} a fini sans son issue, à ${q.etape} : \`${q.commande}\`.`
        : [
            `- ${q.ticket}, à ${q.etape} : ${q.question.replace(/\n/g, '\n  ')}`,
            `  La réponse : \`${q.commande}\`.`,
          ].join('\n')
    ),
    'Aucune attente de fond ne vit : lance-la en arrière-plan (`run_in_background`), sans tube ni veille à durée, et relance-la après chaque lot traité : `npx grillhouse superviseur --attendre`.',
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const texte = await attenteAuTour(process.cwd());
  if (texte) {
    process.stdout.write(`${texte}\n`);
  }
}
