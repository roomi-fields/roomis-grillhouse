#!/usr/bin/env node
// The register of finished agents: one JSON line per agent that ends, written by a hook
// (`.claude/settings.json`: SubagentStop for a sub-agent, SessionEnd for a session, a role agent
// launched in a shell included). The board reads finished agents here, and the transcripts of
// running ones only.
//
// - The line: the project (its main tree), the agent, its ticket (« TON TICKET : »), its role,
//   its start and end, its working time, its tokens, its cache reads and its cost when the session
//   wrote one. All of it is read from the agent's transcript; the agent declares nothing.
// - The register is `~/.claude/grillhouse/registre.jsonl` (GRILLHOUSE_REGISTRE replaces it): the
//   envelope of a role agent leaves it writable.
// - A hook never stops the session: a transcript it cannot read writes nothing.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lireTranscription } from './tableau.mjs';

export const REGISTRE =
  process.env.GRILLHOUSE_REGISTRE ??
  path.join(os.homedir(), '.claude', 'grillhouse', 'registre.jsonl');

// The transcript and the role the hook's input names: a sub-agent's sits next to the session's.
export function source(input) {
  if (input.hook_event_name === 'SubagentStop') {
    const transcription =
      input.agent_transcript_path ??
      (input.agent_id && input.transcript_path
        ? path.join(
            input.transcript_path.replace(/\.jsonl$/, ''),
            'subagents',
            `agent-${input.agent_id}.jsonl`
          )
        : null);
    let role = input.agent_type ?? null;
    if (!role && transcription) {
      try {
        role =
          JSON.parse(readFileSync(transcription.replace(/\.jsonl$/, '.meta.json'), 'utf8'))
            .agentType ?? null;
      } catch {}
    }
    return { transcription, role, agent: input.agent_id ?? null };
  }
  return {
    transcription: input.transcript_path ?? null,
    role: null,
    agent: input.session_id ?? null,
  };
}

// The register's line for this hook input, or null. `projet` is the main tree of the session.
export function ligne(input, texte, projet) {
  const { role, agent } = source(input);
  const t = lireTranscription(texte);
  if (t.premier === null) return null;
  return {
    projet,
    agent,
    ticket: t.ticket,
    role: role ?? t.role,
    debut: new Date(t.premier).toISOString(),
    fin: new Date(t.dernier).toISOString(),
    travail: t.travail,
    jetons: t.jetons,
    cache: t.cache,
    cout: t.cout,
  };
}

// The main tree of a directory: an agent's copy belongs to the repository it was made from.
function arbrePrincipal(dir) {
  try {
    const commun = execFileSync(
      'git',
      ['-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    ).trim();
    return path.dirname(commun);
  } catch {
    return dir;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const { transcription } = source(input);
    if (transcription && existsSync(transcription)) {
      const l = ligne(
        input,
        readFileSync(transcription, 'utf8'),
        arbrePrincipal(input.cwd ?? process.cwd())
      );
      if (l) {
        mkdirSync(path.dirname(REGISTRE), { recursive: true });
        appendFileSync(REGISTRE, `${JSON.stringify(l)}\n`);
      }
    }
  } catch {}
}
