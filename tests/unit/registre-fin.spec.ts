import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  constants,
  openSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ligne } from '../../scripts/registre.mjs';
import { lireTranscription } from '../../scripts/tableau.mjs';
import { attendre, lignes, repos } from './registre-essai.js';

// Ticket grillhouse-3uv.72: the end of a long session writes its line to the register. The hook
// (SessionEnd, SubagentStop) hands back at once and leaves the reading of the transcript to work
// that outlives it; the line it writes is the one of today; two simultaneous ends write it once;
// a reading that fails writes nothing and `--rattraper` catches it up; one stop has one line, its
// writes overlapping or following one another, by the hook as by `--rattraper`. Criterion 2 (a transcript
// of several hundred MB, never held whole) lives in registre-fin.nuit.test.ts.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'registre-fin-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.resolve(__dirname, '../../scripts/registre.mjs');
const l = (o: object) => JSON.stringify(o);
const T0 = Date.parse('2026-10-10T06:00:00Z');
const quand = (ms: number) => new Date(T0 + ms).toISOString();

// The hook as Claude Code runs it: its input on stdin, the register named by GRILLHOUSE_REGISTRE.
const crochet = (input: object, registre: string, timeout = 10_000) =>
  spawnSync('node', [SCRIPT], {
    input: l(input),
    env: { ...process.env, GRILLHOUSE_REGISTRE: registre },
    timeout,
    encoding: 'utf8',
  });

// The same, not awaited: two of them run at once.
const crochetEnFond = (input: object, registre: string) =>
  new Promise<number | null>(resolve => {
    const p = spawn('node', [SCRIPT], {
      env: { ...process.env, GRILLHOUSE_REGISTRE: registre },
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    p.on('close', code => resolve(code));
    p.stdin.end(l(input));
  });

// The catch-up as a person runs it in the project, its home given: not awaited by its caller.
const rattrapage = (home: string, racine: string, registre: string) =>
  new Promise<number | null>(resolve => {
    const p = spawn('node', [SCRIPT, '--rattraper'], {
      cwd: racine,
      env: { ...process.env, HOME: home, GRILLHOUSE_REGISTRE: registre },
      stdio: 'ignore',
    });
    p.on('close', code => resolve(code));
  });

// The first line of the register, read.
const premiere = (registre: string): unknown => JSON.parse(lignes(registre)[0] ?? 'null');

// The line of today for a hook input `input` whose transcript is `texte`: the line the production
// computes from a reading, the reading here being lireTranscription on the whole text.
const ligneDuJour = (input: object, texte: string, projet: string): unknown =>
  ligne(input, lireTranscription(texte), projet);

// A transcript of `n` assistant events after the ticket's prompt, each a message of its own (1 + 1
// tokens) carrying `pad` characters: a few MB, long enough that two readings of it overlap.
const temoin = (n: number, pad = 'é'.repeat(2_000)) => {
  const out = [
    l({ type: 'user', timestamp: quand(0), message: { content: 'TON TICKET : demo-9.1 — x' } }),
  ];
  for (let i = 0; i < n; i++) {
    out.push(
      l({
        type: 'assistant',
        timestamp: quand(i),
        message: {
          id: `m${i}`,
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [{ type: 'text', text: pad }],
        },
      })
    );
  }
  return `${out.join('\n')}\n`;
};

const dossier = () => mkdtempSync(path.join(ESSAIS, 'cas-'));

// A home whose project `racine` holds the session `id`'s transcript, where the catch-up reads it.
const sousLaMaison = (id: string, texte: string) => {
  const home = dossier();
  const racine = path.join(home, 'depot');
  mkdirSync(racine);
  const projet = path.join(home, '.claude/projects', racine.replace(/[^A-Za-z0-9]/g, '-'));
  mkdirSync(projet, { recursive: true });
  const f = path.join(projet, `${id}.jsonl`);
  writeFileSync(f, texte);
  return { home, racine, f };
};

// Older than the two minutes of a running transcript: the catch-up takes it.
const vieillir = (f: string) => {
  const ancien = new Date(Date.now() - 10 * 60_000);
  utimesSync(f, ancien, ancien);
};
const session = (d: string, id: string, texte: string) => {
  const f = path.join(d, `${id}.jsonl`);
  writeFileSync(f, texte);
  return {
    input: { hook_event_name: 'SessionEnd', transcript_path: f, session_id: id, cwd: d },
    f,
  };
};

describe('3uv.72 critère 1 — the end hook hands back at once', () => {
  it('critère 1: the hook ends while its transcript is not readable to its end yet', () => {
    // A named pipe nobody writes yet: a hook that reads before handing back never ends.
    const d = dossier();
    const f = path.join(d, 's1.jsonl');
    expect(spawnSync('mkfifo', [f]).status).toBe(0);
    const r = crochet(
      { hook_event_name: 'SessionEnd', transcript_path: f, session_id: 's1', cwd: d },
      path.join(d, 'registre.jsonl'),
      5_000
    );
    // A reader left on the pipe gets its end of file.
    try {
      closeSync(openSync(f, constants.O_WRONLY | constants.O_NONBLOCK));
    } catch {
      // No reader is left on it.
    }
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(0);
  }, 15_000);

  it('critère 1: the line is written after the hook has ended', async () => {
    const d = dossier();
    const { input } = session(d, 's2', temoin(500));
    const registre = path.join(d, 'registre.jsonl');
    expect(crochet(input, registre).status).toBe(0);
    await attendre(registre, 1);
    expect(premiere(registre)).toMatchObject({ agent: 's2', ticket: 'demo-9.1' });
  }, 30_000);
});

describe('3uv.72 critère 1 — the end of a sub-agent', () => {
  it('critère 1: a SubagentStop input carrying a last message of 200 KB writes its line', async () => {
    // Claude Code puts the sub-agent's last message in its SubagentStop input.
    const d = dossier();
    const sous = path.join(d, 's11/subagents');
    mkdirSync(sous, { recursive: true });
    const texte = temoin(50);
    const f = path.join(sous, 'agent-a11.jsonl');
    writeFileSync(f, texte);
    const input = {
      hook_event_name: 'SubagentStop',
      session_id: 's11',
      transcript_path: path.join(d, 's11.jsonl'),
      agent_id: 'a11',
      agent_transcript_path: f,
      agent_type: 'testeur',
      cwd: d,
      last_assistant_message: 'x'.repeat(200_000),
    };
    const registre = path.join(d, 'registre.jsonl');
    expect(crochet(input, registre).status).toBe(0);
    await attendre(registre, 1);
    expect(premiere(registre)).toEqual(ligneDuJour(input, texte, d));
  }, 30_000);
});

describe('3uv.72 critère 3 — the line is the one of today', () => {
  it('critère 3: a transcript with turns, compactions, repeated messages, cost and long lines', async () => {
    // A line longer than any read chunk (over 2 MiB) followed by events that count (tokens, turns,
    // the end), a role whose multi-byte characters any chunk of 256 KiB or less cuts, a blank line,
    // a torn line, and a last line without its line feed.
    const role = 'é😀'.repeat(50_000);
    const long = (n: number) => 'ü€'.repeat(n);
    const texte = [
      l({ type: 'agent-setting', agentSetting: role }),
      l({ type: 'user', timestamp: quand(0), message: { content: 'TON TICKET : demo-4.2 — lot' } }),
      l({
        type: 'assistant',
        timestamp: quand(60_000),
        message: {
          id: 'a1',
          usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 7 },
          content: [
            { type: 'tool_use', id: 'u1', name: 'Bash' },
            { type: 'text', text: long(90_000) },
          ],
        },
      }),
      l({
        type: 'assistant',
        timestamp: quand(60_000),
        message: { id: 'a1', usage: { input_tokens: 10, output_tokens: 5 } },
      }),
      '',
      l({
        type: 'user',
        timestamp: quand(61_000),
        message: { content: [{ type: 'tool_result', tool_use_id: 'u1', content: long(40_000) }] },
      }),
      l({
        type: 'assistant',
        timestamp: quand(61_500),
        message: {
          id: 'a1b',
          usage: { input_tokens: 2, output_tokens: 2 },
          content: [{ type: 'text', text: long(450_000) }],
        },
      }),
      l({
        type: 'user',
        timestamp: quand(62_000),
        isCompactSummary: true,
        message: { content: 's' },
      }),
      '{"type":"assistant","timestamp":"2026-10-10T06:02:00Z","message":{"id":"x"',
      l({ type: 'user', timestamp: quand(3_600_000), message: { content: 'la suite' } }),
      l({
        type: 'assistant',
        timestamp: quand(3_540_000),
        message: {
          id: 'a2',
          usage: { input_tokens: 3, output_tokens: 4, cache_creation_input_tokens: 2 },
        },
      }),
      l({
        type: 'user',
        timestamp: quand(3_700_000),
        message: { content: '[Request interrupted by user]' },
      }),
      l({ type: 'cost-state', totalCostUSD: 1.25 }),
      l({
        type: 'assistant',
        timestamp: quand(3_720_000),
        message: {
          id: 'a3',
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [{ type: 'text', text: long(70_000) }],
        },
      }),
    ].join('\n');
    const d = dossier();
    const { input } = session(d, 's3', texte);
    const registre = path.join(d, 'registre.jsonl');
    expect(crochet(input, registre).status).toBe(0);
    await attendre(registre, 1);
    expect(premiere(registre)).toEqual(ligneDuJour(input, texte, d));
  }, 30_000);
});

describe('3uv.72 critère 4 — two simultaneous ends', () => {
  it('critère 4: two ends of the same agent write its line once', async () => {
    const d = dossier();
    const { input } = session(d, 's4', temoin(5_000));
    const registre = path.join(d, 'registre.jsonl');
    const codes = await Promise.all([
      crochetEnFond(input, registre),
      crochetEnFond(input, registre),
    ]);
    expect(codes).toEqual([0, 0]);
    await attendre(registre, 1);
    await repos();
    expect(lignes(registre)).toHaveLength(1);
    expect(premiere(registre)).toMatchObject({ agent: 's4', jetons: 10_000 });
  }, 30_000);

  it('critère 4: two ends of two agents write two whole lines', async () => {
    const d = dossier();
    const a = session(d, 's5', temoin(5_000));
    const b = session(d, 's6', temoin(4_000));
    const registre = path.join(d, 'registre.jsonl');
    const codes = await Promise.all([
      crochetEnFond(a.input, registre),
      crochetEnFond(b.input, registre),
    ]);
    expect(codes).toEqual([0, 0]);
    await attendre(registre, 2);
    await repos();
    const lues = lignes(registre).map(x => JSON.parse(x) as { agent: string; jetons: number });
    expect(lues.map(x => [x.agent, x.jetons]).sort()).toEqual([
      ['s5', 10_000],
      ['s6', 8_000],
    ]);
  }, 30_000);
});

describe('3uv.72 critères 4 et 6 — the register lock, <registre>.verrou', () => {
  it('critères 4 et 6: a recent lock holds the write while it stands, and the line comes once it goes', async () => {
    const d = dossier();
    const { input } = session(d, 's12', temoin(500));
    const registre = path.join(d, 'registre.jsonl');
    const verrou = `${registre}.verrou`;
    writeFileSync(verrou, String(process.pid));
    try {
      expect(crochet(input, registre).status).toBe(0);
      await repos();
      expect(lignes(registre)).toEqual([]);
    } finally {
      rmSync(verrou, { force: true });
    }
    await attendre(registre, 1);
    expect(premiere(registre)).toMatchObject({ agent: 's12', jetons: 1_000 });
  }, 30_000);

  it('critères 4 et 6: a lock older than 30 s, naming a live process, is taken over and the line is written', async () => {
    const d = dossier();
    const { input } = session(d, 's13', temoin(500));
    const registre = path.join(d, 'registre.jsonl');
    const verrou = `${registre}.verrou`;
    writeFileSync(verrou, String(process.pid));
    const ancien = new Date(Date.now() - 60_000);
    utimesSync(verrou, ancien, ancien);
    try {
      expect(crochet(input, registre).status).toBe(0);
      await attendre(registre, 1);
      expect(premiere(registre)).toMatchObject({ agent: 's13', jetons: 1_000 });
    } finally {
      rmSync(verrou, { force: true });
    }
  }, 30_000);
});

describe('3uv.72 critère 5 — a reading that fails', () => {
  it.skipIf(process.getuid?.() === 0)(
    'critère 5: an unreadable transcript writes nothing, ends the hook cleanly, and the catch-up writes it',
    async () => {
      const texte = temoin(50);
      const { home, racine, f } = sousLaMaison('s7', texte);
      const registre = path.join(home, 'registre.jsonl');
      chmodSync(f, 0o000);
      const r = crochet(
        { hook_event_name: 'SessionEnd', transcript_path: f, session_id: 's7', cwd: racine },
        registre
      );
      expect(r.status).toBe(0);
      await repos();
      expect(lignes(registre)).toEqual([]);
      chmodSync(f, 0o644);
      vieillir(f);
      const c = await rattrapage(home, racine, registre);
      expect(c).toBe(0);
      await attendre(registre, 1);
      expect(premiere(registre)).toEqual(
        ligneDuJour(
          { hook_event_name: 'SessionEnd', transcript_path: f, session_id: 's7' },
          texte,
          racine
        )
      );
    },
    30_000
  );

  it('critère 5: a transcript that does not exist writes nothing and ends the hook cleanly', async () => {
    const d = dossier();
    const registre = path.join(d, 'registre.jsonl');
    const r = crochet(
      {
        hook_event_name: 'SessionEnd',
        transcript_path: path.join(d, 'absent.jsonl'),
        session_id: 's8',
        cwd: d,
      },
      registre
    );
    expect(r.status).toBe(0);
    await repos();
    expect(lignes(registre)).toEqual([]);
  }, 30_000);
});

describe('3uv.72 critère 6 — one stop, one line', () => {
  it('critère 6: two successive ends of the same session, its transcript unchanged, write one line', async () => {
    const d = dossier();
    const { input } = session(d, 's9', temoin(500));
    const registre = path.join(d, 'registre.jsonl');
    expect(crochet(input, registre).status).toBe(0);
    await attendre(registre, 1);
    expect(crochet(input, registre).status).toBe(0);
    await repos();
    expect(lignes(registre)).toHaveLength(1);
    expect(premiere(registre)).toMatchObject({ agent: 's9', jetons: 1_000 });
  }, 30_000);

  it('critère 6: the end hook and the catch-up on the same session, run at once, write one line', async () => {
    // The catch-up starts while the hook's reading runs: it finds the session not in the register.
    const texte = temoin(5_000);
    const { home, racine, f } = sousLaMaison('s10', texte);
    vieillir(f);
    const registre = path.join(home, 'registre.jsonl');
    const codes = await Promise.all([
      crochetEnFond(
        { hook_event_name: 'SessionEnd', transcript_path: f, session_id: 's10', cwd: racine },
        registre
      ),
      rattrapage(home, racine, registre),
    ]);
    expect(codes).toEqual([0, 0]);
    await attendre(registre, 1);
    await repos();
    expect(lignes(registre)).toHaveLength(1);
    expect(premiere(registre)).toEqual(
      ligneDuJour(
        { hook_event_name: 'SessionEnd', transcript_path: f, session_id: 's10' },
        texte,
        racine
      )
    );
  }, 30_000);
});
