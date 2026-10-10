import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ligne, source } from '../../scripts/registre.mjs';

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
      SESSION,
      '/repo'
    );
    expect(r).toEqual({
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
      agent_type: 'arbitre',
    });
    expect(s).toEqual({
      transcription: '/p/s/subagents/agent-a1.jsonl',
      role: 'arbitre',
      agent: 'a1',
    });
  });
  it('writes nothing for a transcript without time', () => {
    expect(ligne({ hook_event_name: 'SessionEnd' }, '', '/repo')).toBeNull();
  });
});

describe('the register on disk', () => {
  it('appends one line per finished sub-agent, its role read from its meta file', () => {
    const d = mkdtempSync(path.join(tmpdir(), 'registre-'));
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
    expect(run().status).toBe(0);
    const lignes = readFileSync(registre, 'utf8')
      .trim()
      .split('\n')
      .map(x => JSON.parse(x) as Record<string, unknown>);
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toMatchObject({
      ticket: 'demo-3.2.1',
      role: 'relecteur',
      jetons: 18,
      agent: 'a1',
    });
  });
  it('never stops the session on a bad input', () => {
    const r = spawnSync('node', [SCRIPT], { input: 'pas du json' });
    expect(r.status).toBe(0);
  });
});
