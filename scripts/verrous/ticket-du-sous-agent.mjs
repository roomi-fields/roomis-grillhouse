#!/usr/bin/env node
// The ticket of a role agent: a PreToolUse hook on the Agent tool (`.claude/settings.json`). It
// refuses to launch one of the project's role agents (`.claude/agents/<role>.md`) whose prompt
// does not name its ticket by a « TON TICKET : <id> » line, with exit code 2 and its reason on
// stderr. The board ties each agent, its time and its tokens to that ticket.
//
// - Other agents (exploration, documentation) launch freely.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const TICKET = /TON TICKET\s*:\s*[A-Za-z0-9_.-]+/;

// The refusal for this launch, or null. `isRole(name)` says whether the project defines that agent.
export function refusal(input, isRole) {
  if (input.tool_name !== 'Agent' && input.tool_name !== 'Task') return null;
  const role = input.tool_input?.subagent_type;
  if (!role || !isRole(role)) return null;
  if (TICKET.test(input.tool_input?.prompt ?? '')) return null;
  return `L'agent ${role} part sans son ticket : sa consigne porte la ligne « TON TICKET : <id> ». Ainsi le tableau rattache l'agent, son temps et ses jetons à son ticket.`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const agents = path.join(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? '.', '.claude/agents');
  const r = refusal(input, role => existsSync(path.join(agents, `${role}.md`)));
  if (r) {
    process.stderr.write(`⛔ ${r}\n`);
    process.exit(2);
  }
}
