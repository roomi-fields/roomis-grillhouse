import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { aRattraper, deLaCopie, ligne, source } from '../../scripts/registre.mjs';
import { lireTranscription } from '../../scripts/tableau.mjs';
import { attendre, lignes, repos } from './registre-essai.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'registre-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.resolve(__dirname, '../../scripts/registre.mjs');
const l = (o: object) => JSON.stringify(o);
const usage = (id: string, input: number, output: number) =>
  l({
    type: 'assistant',
    timestamp: '2026-10-10T06:05:00Z',
    message: { id, usage: { input_tokens: input, output_tokens: output } },
  });
const SESSION = [
  l({ type: 'agent-setting', agentSetting: 'developpeur' }),
  l({
    type: 'user',
    timestamp: '2026-10-10T06:00:00Z',
    message: { content: 'TON TICKET : demo-3.2.1 — le lot' },
  }),
  usage('m1', 10, 5),
  usage('m1', 10, 5),
  usage('m2', 1, 2),
  l({ type: 'cost-state', totalCostUSD: 3.5 }),
].join('\n');

describe('the register line', () => {
  it('reads a shell session: its role, ticket, span, tokens and cost', () => {
    const r = ligne(
      { hook_event_name: 'SessionEnd', transcript_path: '/t.jsonl', session_id: 's1' },
      lireTranscription(SESSION),
      '/repo'
    );
    // The line may carry the turns its day time is read from (grillhouse-3uv.41).
    expect(r).toMatchObject({
      projet: '/repo',
      agent: 's1',
      ticket: 'demo-3.2.1',
      role: 'developpeur',
      debut: '2026-10-10T06:00:00.000Z',
      fin: '2026-10-10T06:05:00.000Z',
      travail: 300_000,
      jetons: 18,
      cache: 0,
      cout: 3.5,
    });
  });
  it('takes a sub-agent role from the hook, its transcript next to the session', () => {
    const s = source({
      hook_event_name: 'SubagentStop',
      transcript_path: '/p/s.jsonl',
      agent_id: 'a1',
      agent_type: 'referent-technique',
    });
    expect(s).toEqual({
      transcription: '/p/s/subagents/agent-a1.jsonl',
      role: 'referent-technique',
      agent: 'a1',
    });
  });
  it('takes a named sub-agent role from the type it was spawned as, never its name', () => {
    const d = mkdtempSync(path.join(ESSAIS, 'registre-'));
    mkdirSync(path.join(d, 's/subagents'), { recursive: true });
    writeFileSync(
      path.join(d, 's/subagents/agent-a2.meta.json'),
      l({
        agentType: 't-agent-2-liste',
        name: 't-agent-2-liste',
        spawnedAgentType: 'referent-technique',
      })
    );
    const s = source({
      hook_event_name: 'SubagentStop',
      transcript_path: path.join(d, 's.jsonl'),
      agent_id: 'a2',
      agent_type: 't-agent-2-liste',
    });
    expect(s.role).toBe('referent-technique');
  });
  it('writes nothing for a transcript without time', () => {
    expect(ligne({ hook_event_name: 'SessionEnd' }, lireTranscription(''), '/repo')).toBeNull();
  });
});

describe('the register on disk', () => {
  it('writes one line per stop of a sub-agent, its end reported twice (3uv.72 critère 6), its role read from its meta file', async () => {
    const d = mkdtempSync(path.join(ESSAIS, 'registre-'));
    mkdirSync(path.join(d, 's/subagents'), { recursive: true });
    writeFileSync(
      path.join(d, 's/subagents/agent-a1.jsonl'),
      SESSION.split('\n').slice(1).join('\n')
    );
    writeFileSync(path.join(d, 's/subagents/agent-a1.meta.json'), l({ agentType: 'relecteur' }));
    const registre = path.join(d, 'r/registre.jsonl');
    const run = () =>
      spawnSync('node', [SCRIPT], {
        input: l({
          hook_event_name: 'SubagentStop',
          transcript_path: path.join(d, 's.jsonl'),
          agent_id: 'a1',
          cwd: d,
        }),
        env: { ...process.env, GRILLHOUSE_REGISTRE: registre },
      });
    expect(run().status).toBe(0);
    await attendre(registre, 1);
    expect(run().status).toBe(0);
    await repos();
    const lues = lignes(registre).map(x => JSON.parse(x) as Record<string, unknown>);
    expect(lues).toHaveLength(1);
    expect(lues[0]).toMatchObject({
      ticket: 'demo-3.2.1',
      role: 'relecteur',
      jetons: 18,
      agent: 'a1',
    });
  }, 30_000);
  it('never stops the session on a bad input', () => {
    const r = spawnSync('node', [SCRIPT], { input: 'pas du json' });
    expect(r.status).toBe(0);
  });
});

describe('the catch-up of finished agents', () => {
  it("finds the project's sessions, their sub-agents and the agents' copies, not the known nor the running", () => {
    const home = mkdtempSync(path.join(ESSAIS, 'home-'));
    const p = path.join(home, '.claude/projects');
    const propre = path.join(p, '-depot');
    mkdirSync(path.join(propre, 's1/subagents'), { recursive: true });
    writeFileSync(path.join(propre, 's1.jsonl'), '');
    writeFileSync(path.join(propre, 's1/subagents/agent-a1.jsonl'), '');
    writeFileSync(path.join(propre, 's1/subagents/agent-a2.jsonl'), '');
    mkdirSync(path.join(p, '-depot--claude-worktrees-demo-3'), { recursive: true });
    writeFileSync(path.join(p, '-depot--claude-worktrees-demo-3/c1.jsonl'), '');
    mkdirSync(path.join(p, '-autre'), { recursive: true });
    writeFileSync(path.join(p, '-autre/x.jsonl'), '');
    const plusTard = Date.now() + 10 * 60_000;
    const r = aRattraper('/depot', home, new Set(['a2']), plusTard) as {
      session_id?: string;
      agent_id?: string;
    }[];
    expect(r.map(x => x.agent_id ?? x.session_id).sort()).toEqual(['a1', 'c1', 's1']);
    expect(aRattraper('/depot', home, new Set(), Date.now())).toEqual([]);
  });
});

describe("the lines of an agent's copy, once its envelope has ended", () => {
  it('finds the sessions of that copy the register lacks, finished even when they just moved', () => {
    const home = mkdtempSync(path.join(ESSAIS, 'home-'));
    const p = path.join(home, '.claude/projects');
    const copie = path.join(p, '-depot--claude-worktrees-demo-3');
    mkdirSync(copie, { recursive: true });
    writeFileSync(path.join(copie, 'c1.jsonl'), '');
    writeFileSync(path.join(copie, 'c2.jsonl'), '');
    mkdirSync(path.join(p, '-depot--claude-worktrees-demo-4'), { recursive: true });
    writeFileSync(path.join(p, '-depot--claude-worktrees-demo-4/d1.jsonl'), '');
    const r = deLaCopie('/depot/.claude/worktrees/demo-3', home, new Set(['c2'])) as {
      hook_event_name: string;
      session_id: string;
      transcript_path: string;
      cwd: string;
    }[];
    expect(r).toEqual([
      {
        hook_event_name: 'SessionEnd',
        session_id: 'c1',
        transcript_path: path.join(copie, 'c1.jsonl'),
        cwd: '/depot/.claude/worktrees/demo-3',
      },
    ]);
    expect(deLaCopie('/depot/.claude/worktrees/demo-9', home, new Set())).toEqual([]);
  });
});
