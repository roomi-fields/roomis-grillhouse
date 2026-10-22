#!/usr/bin/env node
// The ticket of a role agent: a PreToolUse hook on the Agent tool, which the frame's plugin declares
// (`grillhouse ticket-du-sous-agent`). It refuses to launch one of the frame's role agents (the
// plugin's `agents/<role>.md`, `$CLAUDE_PLUGIN_ROOT`; the agent named bare or as
// `grillhouse:<role>`) whose prompt does not name its ticket by a « TON TICKET : <id> » line, with
// exit code 2 and its reason on stderr. The board ties each agent, its time and its tokens to that
// ticket.
//
// - Other agents (exploration, documentation) launch freely.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TICKET = /TON TICKET\s*:\s*[A-Za-z0-9_.-]+/;

// The refusal for this launch, or null. `isRole(name)` says whether the frame defines that agent.
export function refusal(input, isRole) {
  if (input.tool_name !== 'Agent' && input.tool_name !== 'Task') return null;
  const role = input.tool_input?.subagent_type;
  if (!role || !isRole(role)) return null;
  if (TICKET.test(input.tool_input?.prompt ?? '')) return null;
  return `L'agent ${role} part sans son ticket : sa consigne porte la ligne « TON TICKET : <id> ». Ainsi le tableau rattache l'agent, son temps et ses jetons à son ticket.`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const greffon = process.env.CLAUDE_PLUGIN_ROOT;
  const r = refusal(
    input,
    role =>
      Boolean(greffon) &&
      /^(?:grillhouse:)?[A-Za-z0-9_-]+$/.test(role) &&
      existsSync(path.join(greffon, 'agents', `${role.replace(/^grillhouse:/, '')}.md`))
  );
  if (r) {
    process.stderr.write(`⛔ ${r}\n`);
    process.exitCode = 2;
  }
}
