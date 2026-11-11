#!/usr/bin/env node
// The stop of the session of supervision: the hook Stop of the frame's plugin runs it
// (`grillhouse attente-a-l-arret`) when the session ends its turn, to wait for the owner. As an
// alert not acknowledged pages again (PagerDuty), the supervisor does not go to sleep while a
// circuit waits for it, or while a circuit runs with no wait to wake it (grillhouse-d4n.9: bf5
// stopped on a question at 17:06, read 40 min later, on the owner's word).
//
// - Stop runs for the session itself, never for a sub-agent (SubagentStop). The session is the
//   supervisor's as for the signal of the turn (`racineDeLaSupervision` of
//   scripts/attente-au-tour.mjs): out of a git repository, in an agent's copy and in the session
//   of a role the circuit launches, the stop passes.
// - A question of a circuit waits for the supervisor (`questionsEnAttente` of
//   scripts/superviseur.mjs, a circuit ended without its issue included): the stop is blocked
//   with each question, its ticket, its step and the command that answers it.
// - A circuit of the repository runs and no wait of the questions lives (`attenteVivante` of
//   scripts/tableau.mjs: the lock of the wait names a live process): the stop is blocked with the
//   circuits that run and the wait to launch.
// - Each question blocks once, by its key, and each state of the circuits running without a wait
//   once, by their tickets: both are noted in `.claude/worktrees/signale-a-l-arret.json`, which
//   keeps the questions that still wait alone, so that a stop the supervisor decides (a question
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
import { questionsEnAttente, ticketsFermes } from './superviseur.mjs';
import { attenteVivante } from './tableau.mjs';

// The note of what blocked the stop in the repository at <racine>.
const noteDe = racine => path.join(racine, '.claude', 'worktrees', 'signale-a-l-arret.json');

function lireLaNote(racine) {
  try {
    const lu = JSON.parse(readFileSync(noteDe(racine), 'utf8'));
    return {
      questions: new Set(Array.isArray(lu?.questions) ? lu.questions.map(String) : []),
      etat: typeof lu?.etat === 'string' ? lu.etat : null,
    };
  } catch {
    return { questions: new Set(), etat: null };
  }
}

/**
 * What the stop of the session of supervision in <dossier> gets: the reason that blocks it, or
 * null when the stop passes (see the header). The questions and the state it gives are noted, so
 * that each blocks once.
 * @param {string} dossier the directory the session works in
 * @param {{ env?: Record<string, string | undefined>,
 *   fermes?: (racine: string, ids: string[]) => Set<string>,
 *   circuitsDe?: (racine: string) => Promise<import('./circuits-du-serveur.mjs').CircuitDuServeur[]>,
 *   attenteVit?: (racine: string) => boolean }} [options]
 * @returns {Promise<string | null>}
 */
export async function attenteALArret(
  dossier,
  {
    env = process.env,
    fermes = ticketsFermes,
    circuitsDe = circuitsDuServeur,
    attenteVit = attenteVivante,
  } = {}
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
  const tournent = circuits
    .filter(c => c.vivant)
    .map(c => c.ticket)
    .sort((a, b) => a.localeCompare(b, 'en'));
  const note = lireLaNote(racine);
  const neuves = questions.filter(q => !note.questions.has(q.cle));
  const etat = tournent.length && !attenteVit(racine) ? `sans-attente:${tournent.join(',')}` : null;
  const etatNeuf = etat !== null && etat !== note.etat;
  if (etat !== note.etat || questions.length !== note.questions.size || neuves.length) {
    const f = noteDe(racine);
    try {
      mkdirSync(path.dirname(f), { recursive: true });
      writeFileSync(
        `${f}.${process.pid}`,
        `${JSON.stringify({ questions: questions.map(q => q.cle).sort(), etat })}\n`
      );
      renameSync(`${f}.${process.pid}`, f);
    } catch {
      // A note that cannot be written would block at each stop: the stop passes.
      return null;
    }
  }
  if (!neuves.length && !etatNeuf) {
    return null;
  }
  const blocs = [];
  if (neuves.length) {
    blocs.push(
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
      )
    );
  }
  if (etatNeuf) {
    blocs.push(
      `${blocs.length ? '\n' : ''}Ne te mets pas en attente : ${tournent.length > 1 ? `les circuits ${tournent.join(', ')} tournent` : `le circuit ${tournent[0]} tourne`} et aucune attente des questions ne vit pour ce dépôt, rien ne te réveillera à sa question ni à sa fin. Lance l'attente des questions en arrière-plan (\`run_in_background\`), sans tube ni veille à durée : \`npx grillhouse superviseur --attendre\`, et relance-la après chaque lot traité.`
    );
  }
  return blocs.join('\n');
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
