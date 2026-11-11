// The stop of an agent of a team with an unread message: the hooks SubagentStop and TeammateIdle
// of the frame's plugin run it (`grillhouse messages-non-lus`), as a consumer of a queue (SQS,
// Kafka) does not stop with messages it has not acknowledged. A message SendMessage leaves in the
// box of an agent while the agent writes its last answer is otherwise read by no one: the agent
// ends its turn and waits, and the instruction waits with it.
//
// - The box of an agent is `~/.claude/teams/<équipe>/inboxes/<nom>.json`, an array of entries
//   `{ from, text, summary, timestamp, msg_id, read }`, which Claude Code writes and marks read
//   (https://code.claude.com/docs/en/agent-teams.md, « Mailbox »). An unread message has
//   `read: false`.
// - The agent's name: `teammate_name` (TeammateIdle); else the meta file of its transcript
//   (`agent-<agent_id>.meta.json` beside `agent_transcript_path`, under the session's
//   `subagents/`), whose `name` and `teamName` Claude Code writes for a named agent; else an
//   `agent_id` of the form `<nom>@<équipe>`; else `agent_type`, which is a named agent's name. A
//   sub-agent launched without a name has none of them, and no box.
// - The team: the meta file's `teamName`, else the one of the `agent_id`, else the team whose
//   `config.json` names the hook's session as its lead's (`leadSessionId`): an agent of a team
//   runs in its lead's session. The box is the file of that name in that team, when it exists: the
//   list of the members (`members` of `config.json`) is not read, since Claude Code removes an
//   agent from it when the agent leaves, while a message may still wait in its box.
// - Each unread message blocks the stop once: its `msg_id` is noted in
//   `~/.claude/grillhouse/messages-signales/<équipe>/<nom>.json`, and a message already noted
//   lets the stop pass, so that a message Claude Code leaves unread never holds the agent in a
//   loop (`stop_hook_active` is not read: a message that comes during the continuation blocks in
//   its turn). The file keeps the noted ids still in the box alone.
// - The block: the reason on the error stream, exit code 2, which both events read as the next
//   instruction of the agent (hooks.md, « Exit code 2 behavior per event »; TeammateIdle has no
//   `decision` in JSON). The reason gives each unread message, its sender and its text.
// - The box is never written: Claude Code keeps it. A box absent or unreadable, a team not found,
//   a note that cannot be written, an input that is no JSON: the stop passes, exit 0.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// The meta file of the sub-agent the input names, or null.
function metaDe(entree) {
  const transcription =
    entree.agent_transcript_path ??
    (entree.agent_id && entree.transcript_path
      ? path.join(
          entree.transcript_path.replace(/\.jsonl$/, ''),
          'subagents',
          `agent-${entree.agent_id}.jsonl`
        )
      : null);
  return transcription ? lireJson(transcription.replace(/\.jsonl$/, '.meta.json')) : null;
}

// The team whose lead runs the session <session>, under <equipes>; null when none does.
function equipeDeLaSeance(equipes, session) {
  if (!session) {
    return null;
  }
  let noms;
  try {
    noms = readdirSync(equipes);
  } catch {
    return null;
  }
  return (
    noms.find(n => lireJson(path.join(equipes, n, 'config.json'))?.leadSessionId === session) ??
    null
  );
}

/**
 * The box of the agent the hook's input <entree> names: `{ equipe, nom, fichier }`, or null for an
 * agent of no team (see the header).
 * @param {Record<string, any>} entree the hook's input
 * @param {{ maison?: string }} [options] the home whose `.claude/teams` holds the teams
 * @returns {{ equipe: string, nom: string, fichier: string } | null}
 */
export function boiteDe(entree, { maison = os.homedir() } = {}) {
  const equipes = path.join(maison, '.claude', 'teams');
  const meta = entree.teammate_name ? null : metaDe(entree);
  const id = /^([^@]+)@([^@]+)$/.exec(entree.agent_id ?? '');
  const nom = entree.teammate_name ?? meta?.name ?? id?.[1] ?? entree.agent_type ?? null;
  const equipe = meta?.teamName ?? id?.[2] ?? equipeDeLaSeance(equipes, entree.session_id);
  if (!nom || !equipe || /[/\\]/.test(`${nom}${equipe}`)) {
    return null;
  }
  const fichier = path.join(equipes, equipe, 'inboxes', `${nom}.json`);
  return existsSync(fichier) ? { equipe, nom, fichier } : null;
}

/**
 * What the stop of the agent the hook's input <entree> gets: the reason that blocks it, which
 * gives each unread message not yet signalled, or null when the stop passes. The ids it gives are
 * noted, so that each blocks once; the box is only read.
 * @param {Record<string, any>} entree the hook's input
 * @param {{ maison?: string }} [options] the home of `.claude/teams` and `.claude/grillhouse`
 * @returns {string | null}
 */
export function messagesNonLus(entree, { maison = os.homedir() } = {}) {
  const boite = boiteDe(entree, { maison });
  if (!boite) {
    return null;
  }
  const messages = lireJson(boite.fichier);
  if (!Array.isArray(messages)) {
    return null;
  }
  const note = path.join(
    maison,
    '.claude',
    'grillhouse',
    'messages-signales',
    boite.equipe,
    `${boite.nom}.json`
  );
  const lus = lireJson(note);
  const signales = new Set(Array.isArray(lus) ? lus : []);
  const nonLus = messages.filter(m => m && m.read === false && typeof m.msg_id === 'string');
  const neufs = nonLus.filter(m => !signales.has(m.msg_id));
  if (!neufs.length) {
    return null;
  }
  const presents = new Set(messages.map(m => m?.msg_id));
  const garde = [...signales].filter(i => presents.has(i)).concat(neufs.map(m => m.msg_id));
  try {
    mkdirSync(path.dirname(note), { recursive: true });
    writeFileSync(`${note}.${process.pid}`, `${JSON.stringify(garde)}\n`);
    renameSync(`${note}.${process.pid}`, note);
  } catch {
    // A note that cannot be written would block at each stop: the stop passes.
    return null;
  }
  return [
    neufs.length > 1
      ? `Ne t'arrête pas : ${neufs.length} messages non lus attendent dans ta boîte. Traite-les, puis termine ton tour.`
      : "Ne t'arrête pas : un message non lu attend dans ta boîte. Traite-le, puis termine ton tour.",
    ...neufs.map(
      m =>
        `\n## De ${m.from ?? 'inconnu'}${m.summary ? ` — ${m.summary}` : ''}\n${String(m.text ?? '')}`
    ),
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let raison = null;
  try {
    raison = messagesNonLus(JSON.parse(readFileSync(0, 'utf8')));
  } catch {
    // An input that is no JSON lets the stop pass.
  }
  if (raison) {
    process.stderr.write(`${raison}\n`);
    process.exitCode = 2;
  }
}
