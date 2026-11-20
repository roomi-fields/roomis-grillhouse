#!/usr/bin/env node
// The stop of the session of supervision: the hook Stop of the frame's plugin runs it
// (`grillhouse attente-a-l-arret`) when the session ends its turn, to wait for the owner. As an
// alert not acknowledged pages again (PagerDuty), the supervisor does not go to sleep while a
// circuit waits for it (grillhouse-d4n.9: bf5 stopped on a question at 17:06, read 40 min later,
// on the owner's word). It asks for no wait: the greffon pushes the questions of the circuits.
//
// - Stop runs for the session itself, never for a sub-agent (SubagentStop). The session is the
//   supervisor's as for the signal of the turn (`racineDeLaSupervision` of
//   scripts/attente-au-tour.mjs): out of a git repository, in an agent's copy and in the session
//   of a role the circuit launches, the stop passes.
// - A question of a circuit waits for the supervisor (`questionsEnAttente` of
//   scripts/superviseur.mjs, a circuit ended without its issue included): the stop is blocked
//   with each question, its ticket, its step and the command that answers it.
// - Each question blocks once, by its key: it is noted in `.claude/worktrees/signale-a-l-arret.json`,
//   which keeps the questions that still wait alone (an older note that holds a `etat` reads
//   without error, the state dropped), so that a stop the supervisor decides (a question
//   carried to the owner) is never held in a loop (`stop_hook_active` is not read; Claude Code
//   caps the blocks in a row at eight in any case, hooks.md « Stop »).
// - The block: the reason on the error stream, exit code 2, which Claude Code gives the session as
//   its next instruction (hooks.md, « Exit code 2 behavior per event »).
// - A server that does not answer, a note that cannot be written, an input that is no JSON: the
//   stop passes, exit 0.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { racineDeLaSupervision } from './attente-au-tour.mjs';
import { circuitsDuServeur } from './circuits-du-serveur.mjs';
import { questionsEnAttente, ticketsHorsAttente } from './superviseur.mjs';

// The note of what blocked the stop in the repository at <racine>.
const noteDe = racine => path.join(racine, '.claude', 'worktrees', 'signale-a-l-arret.json');

// The keys of the questions the note holds; an older note's other keys are ignored.
function lireLaNote(racine) {
  try {
    const lu = JSON.parse(readFileSync(noteDe(racine), 'utf8'));
    return {
      questions: new Set(Array.isArray(lu?.questions) ? lu.questions.map(String) : []),
      // Only `questions`: a note that holds another key (an older `etat`) is written again.
      nette: Object.keys(lu ?? {}).join() === 'questions',
    };
  } catch {
    return { questions: new Set(), nette: true };
  }
}

/**
 * What the stop of the session of supervision in <dossier> gets: the reason that blocks it, or
 * null when the stop passes (see the header). The questions it gives are noted, so that each
 * blocks once.
 * @param {string} dossier the directory the session works in
 * @param {{ env?: Record<string, string | undefined>,
 *   fermes?: (racine: string, ids: string[]) => Set<string> | null,
 *   circuitsDe?: (racine: string) => Promise<import('./circuits-du-serveur.mjs').CircuitDuServeur[]> }} [options]
 * @returns {Promise<string | null>}
 */
export async function attenteALArret(
  dossier,
  { env = process.env, fermes = ticketsHorsAttente, circuitsDe = circuitsDuServeur } = {}
) {
  const racine = racineDeLaSupervision(dossier, env);
  if (!racine) {
    return null;
  }
  let circuits;
  try {
    circuits = await circuitsDe(racine);
  } catch {
    return null;
  }
  const questions = questionsEnAttente(racine, circuits, { fermes });
  const note = lireLaNote(racine);
  const neuves = questions.filter(q => !note.questions.has(q.cle));
  if (!note.nette || questions.length !== note.questions.size || neuves.length) {
    const f = noteDe(racine);
    try {
      mkdirSync(path.dirname(f), { recursive: true });
      writeFileSync(
        `${f}.${process.pid}`,
        `${JSON.stringify({ questions: questions.map(q => q.cle).sort() })}\n`
      );
      renameSync(`${f}.${process.pid}`, f);
    } catch {
      // A note that cannot be written would block at each stop: the stop passes.
      return null;
    }
  }
  if (!neuves.length) {
    return null;
  }
  return [
    neuves.length > 1
      ? `Ne te mets pas en attente : ${neuves.length} circuits attendent ta réponse. Réponds à chacun, ou porte sa question au responsable en le lui disant, puis termine ton tour.`
      : 'Ne te mets pas en attente : un circuit attend ta réponse. Réponds-lui, ou porte sa question au responsable en le lui disant, puis termine ton tour.',
    ...neuves.map(q =>
      q.interrompu
        ? `- ${q.ticket} a fini sans son issue, à ${q.etape} : \`${q.commande}\`.`
        : [
            `- ${q.ticket}, à ${q.etape}, au ${q.qui} : ${q.question.replace(/\n/g, '\n  ')}`,
            `  La réponse : \`${q.commande}\`.`,
          ].join('\n')
    ),
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let raison = null;
  try {
    raison = await attenteALArret(process.cwd());
  } catch {
    // A fault lets the stop pass.
  }
  if (raison) {
    process.stderr.write(`${raison}\n`);
    process.exitCode = 2;
  }
}
