#!/usr/bin/env node
// The signal of the supervisor's turn: the hook UserPromptSubmit of the mod runs it at each turn
// of a session of supervision (`npx grillhouse attente-au-tour`), and what it writes reaches the
// session. A question of a circuit is named again until it is answered, as a review requested on
// GitHub is. Mechanism: greffon.md, §5.1.
//
// - It names each circuit that waits for the supervisor (`questionsEnAttente`, the one source of
//   the opening and of the greffon's reading), a circuit ended without its issue included: its
//   ticket, its question, the command that answers it. It asks for no wait and reads no lock.
// - A question already pushed by the greffon is named again: the file of the stops gone up is not
//   read.
// - Out of a git repository, in an agent's copy (a worktree) and in the session of a role that
//   the circuit launches (BEADS_ACTOR set), nothing is said.
// Exit 0, whatever it finds.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { circuitsDuServeur } from './circuits-du-serveur.mjs';
import { ligneDeQuestion, questionsEnAttente, ticketsHorsAttente } from './superviseur.mjs';

/**
 * The root of the repository whose session of supervision works in <dossier>: null out of a git
 * repository, in an agent's copy (a worktree) and in the session of a role that the circuit
 * launches (BEADS_ACTOR set).
 * @param {string} dossier
 * @param {Record<string, string | undefined>} env
 * @returns {string | null}
 */
function racineDeLaSupervision(dossier, env = process.env) {
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
 * supervisor, each with its ticket, its question and the command that answers it; empty when no
 * circuit waits, or out of a session of supervision.
 * @param {string} dossier the directory the session works in
 * @param {{ env?: Record<string, string | undefined>,
 *   fermes?: (racine: string, ids: string[]) => Set<string> | null,
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
        : `- ${ligneDeQuestion(q, { courte: true })}`
    ),
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const texte = await attenteAuTour(process.cwd());
  if (texte) {
    process.stdout.write(`${texte}\n`);
  }
}
