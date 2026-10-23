import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { refusal } from '../../scripts/verrous/ticket-du-sous-agent.mjs';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ticket-du-sous-agent-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.resolve(__dirname, '../../scripts/verrous/ticket-du-sous-agent.mjs');
const roles = (r: string) => ['questionneur', 'explorateur', 'relecteur'].includes(r);
const lancer = (subagent_type: string, prompt: string, tool_name = 'Agent') =>
  refusal({ tool_name, tool_input: { subagent_type, prompt } }, roles);

describe('the ticket of a role agent', () => {
  it('refuses a role agent whose prompt does not name its ticket', () => {
    expect(lancer('questionneur', 'Tranche la question du préfixe.')).toMatch(/TON TICKET/);
    expect(lancer('explorateur', 'TICKET : demo-3')).toMatch(/sans son ticket/);
  });
  it('lets a role agent with its ticket through', () => {
    expect(lancer('relecteur', 'Relis.\nTON TICKET : demo-3.2.1 — le lot')).toBeNull();
  });
  it('lets the other agents and tools through', () => {
    expect(lancer('Explore', 'Cherche les appelants.')).toBeNull();
    expect(refusal({ tool_name: 'Bash', tool_input: { command: 'ls' } }, roles)).toBeNull();
  });
  it('reads the Task tool as the Agent tool', () => {
    expect(lancer('questionneur', 'sans ticket', 'Task')).toMatch(/TON TICKET/);
  });
  // grillhouse-3uv.84.2: the role agents are the frame's plugin's, which the hook's environment
  // names (CLAUDE_PLUGIN_ROOT); Claude Code names one bare or scoped by its plugin.
  it('refuses on disk with exit code 2, from the agents of the frame’s plugin', () => {
    const greffon = mkdtempSync(path.join(ESSAIS, 'greffon-'));
    mkdirSync(path.join(greffon, 'agents'), { recursive: true });
    writeFileSync(path.join(greffon, 'agents/questionneur.md'), '');
    const run = (subagent_type: string, prompt: string) =>
      spawnSync('node', [SCRIPT], {
        input: JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type, prompt } }),
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_PLUGIN_ROOT: greffon },
      });
    for (const role of ['questionneur', 'grillhouse:questionneur']) {
      const r = run(role, 'sans ticket');
      expect(r.status, role).toBe(2);
      expect(r.stderr).toMatch(/TON TICKET/);
      expect(run(role, 'TON TICKET : demo-1').status, role).toBe(0);
    }
    expect(run('Explore', 'sans ticket').status).toBe(0);
    expect(run('autre:questionneur', 'sans ticket').status).toBe(0);
  });
});
