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
// - `node scripts/registre.mjs --rattraper` writes the lines of the project's finished agents the
//   register does not hold yet: those that ended before the hook existed, read from their
//   transcripts (the project's sessions and their sub-agents, the agents' copies). A transcript
//   that moved in the last 2 minutes still runs, and waits for its hook.
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lireTranscription } from './tableau.mjs';

const REGISTRE =
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
      } catch {
        // A sub-agent without its meta file keeps a null role.
      }
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
  if (t.premier === null) {
    return null;
  }
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

const RECENT = 2 * 60_000;
const enTirets = p => p.replace(/[^A-Za-z0-9]/g, '-');

// The hook inputs of the project's finished agents that `connus` (agent ids) does not hold.
export function aRattraper(racine, home, connus, maintenant = Date.now()) {
  const projets = path.join(home, '.claude', 'projects');
  if (!existsSync(projets)) {
    return [];
  }
  const out = [];
  const fini = f => maintenant - statSync(f).mtimeMs >= RECENT;
  const jsonl = d => (existsSync(d) ? readdirSync(d).filter(n => n.endsWith('.jsonl')) : []);
  const propre = path.join(projets, enTirets(racine));
  const copies = `${enTirets(path.join(racine, '.claude', 'worktrees'))}-`;
  for (const d of readdirSync(projets)) {
    const dir = path.join(projets, d);
    if (d !== enTirets(racine) && !d.startsWith(copies)) {
      continue;
    }
    for (const n of jsonl(dir)) {
      const f = path.join(dir, n);
      const session = n.replace(/\.jsonl$/, '');
      if (!connus.has(session) && fini(f)) {
        out.push({
          hook_event_name: 'SessionEnd',
          transcript_path: f,
          session_id: session,
          cwd: racine,
        });
      }
      if (dir !== propre) {
        continue;
      }
      const sous = path.join(dir, session, 'subagents');
      for (const m of jsonl(sous)) {
        const agent = m.replace(/^agent-/, '').replace(/\.jsonl$/, '');
        const g = path.join(sous, m);
        if (!connus.has(agent) && fini(g)) {
          out.push({
            hook_event_name: 'SubagentStop',
            transcript_path: f,
            agent_id: agent,
            agent_transcript_path: g,
            cwd: racine,
          });
        }
      }
    }
  }
  return out;
}

if (
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href &&
  process.argv.includes('--rattraper')
) {
  const racine = arbrePrincipal(process.cwd());
  const deja = existsSync(REGISTRE) ? readFileSync(REGISTRE, 'utf8') : '';
  const connus = new Set(
    deja
      .split('\n')
      .map(l => {
        try {
          return JSON.parse(l).agent;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
  );
  let n = 0;
  mkdirSync(path.dirname(REGISTRE), { recursive: true });
  for (const input of aRattraper(racine, os.homedir(), connus)) {
    const { transcription } = source(input);
    const l = ligne(input, readFileSync(transcription, 'utf8'), racine);
    if (l) {
      appendFileSync(REGISTRE, `${JSON.stringify(l)}\n`);
      n++;
    }
  }
  process.stdout.write(`${n} agent(s) fini(s) ajouté(s) au registre.\n`);
} else if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
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
  } catch {
    // A hook never stops the session.
  }
}
