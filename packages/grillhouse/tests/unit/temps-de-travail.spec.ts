// The working time of a transcript is the sum of its turns (grillhouse-3uv.41). A turn starts at
// an incoming message (from the person, from another agent, a notification) and ends at the last
// event before the next incoming message; the wait between the end of a turn and the next incoming
// message does not count. A tool's result is not an incoming message: a long tool counts as work.
// The register writes that time, and every time the board shows (agent, ticket, chantier, day,
// all) follows from it.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ligne } from '../../scripts/registre.mjs';
import { assembler, lireTranscription, lireVivant } from '../../scripts/tableau.mjs';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'temps-de-travail-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.resolve(__dirname, '../../scripts/registre.mjs');
const RACINE = '/depot';
const MIN = 60_000;
const l = (o: object) => JSON.stringify(o);
const iso = (t: number | string) => (typeof t === 'number' ? new Date(t).toISOString() : t);
const at = (hm: string, jour = '2026-10-11') => `${jour}T${hm}:00Z`;

// The lines of a transcript.
let n = 0;
const humain = (t: number | string, texte = 'ok') =>
  l({
    type: 'user',
    timestamp: iso(t),
    origin: { kind: 'human' },
    message: { role: 'user', content: texte },
  });
const pair = (t: number | string) =>
  l({
    type: 'user',
    timestamp: iso(t),
    isMeta: true,
    origin: { kind: 'peer', from: 'uds:/run/user/1000/claude.sock' },
    message: {
      role: 'user',
      content: 'Another Claude session sent a message: <message>relis le lot</message>',
    },
  });
const avis = (t: number | string) =>
  l({
    type: 'user',
    timestamp: iso(t),
    origin: { kind: 'task-notification' },
    message: {
      role: 'user',
      content: '<task-notification> <task-id>b1</task-id> <status>completed</status>',
    },
  });
const texteEnListe = (t: number | string) =>
  l({
    type: 'user',
    timestamp: iso(t),
    message: { role: 'user', content: [{ type: 'text', text: 'reprends le ticket' }] },
  });
const outil = (t: number | string) =>
  l({
    type: 'user',
    timestamp: iso(t),
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: `u${n}`, content: 'Tests 120 passed' }],
    },
    toolUseResult: { stdout: 'Tests 120 passed', stderr: '' },
  });
const reponse = (t: number | string, jetons = 10) =>
  l({
    type: 'assistant',
    timestamp: iso(t),
    message: { id: `m${++n}`, usage: { input_tokens: jetons, output_tokens: 0 } },
  });
const appel = (t: number | string) =>
  l({
    type: 'assistant',
    timestamp: iso(t),
    message: {
      id: `m${++n}`,
      content: [{ type: 'tool_use', id: `u${n}`, name: 'Bash', input: { command: 'npm test' } }],
      usage: { input_tokens: 10, output_tokens: 0 },
    },
  });
// A system reminder: a meta message of no origin, written as a string.
const rappel = (t: number | string) =>
  l({
    type: 'user',
    timestamp: iso(t),
    isMeta: true,
    message: { role: 'user', content: '<system-reminder> Other agents active </system-reminder>' },
  });
// The content of a loaded skill: a meta message of no origin, a list of texts, tied to its tool.
const competence = (t: number | string) =>
  l({
    type: 'user',
    timestamp: iso(t),
    isMeta: true,
    sourceToolUseID: `u${n}`,
    message: {
      role: 'user',
      content: [{ type: 'text', text: '# Testwriter\n\nTu écris les tests.' }],
    },
  });
// A message from the team lead: another agent, without origin.
const equipier = (t: number | string) =>
  l({
    type: 'user',
    timestamp: iso(t),
    message: {
      role: 'user',
      content:
        '<teammate-message teammate_id="team-lead" summary="relance">reprends</teammate-message>',
    },
  });
// The summary written after a compaction: produced by the system, without origin nor meta mark.
const resume = (t: number | string) =>
  l({
    type: 'user',
    timestamp: iso(t),
    isVisibleInTranscriptOnly: true,
    isCompactSummary: true,
    message: {
      role: 'user',
      content:
        'This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.\n\nSummary:\n1. Primary Request',
    },
  });
// The interruption mark: written by the tool when the person stops a turn, as a list of texts.
const interruption = (t: number | string, texte = '[Request interrupted by user]') =>
  l({
    type: 'user',
    timestamp: iso(t),
    interruptedMessageId: `msg_${n}`,
    message: { role: 'user', content: [{ type: 'text', text: texte }] },
  });
const systeme = (t: number | string) => l({ type: 'system', timestamp: iso(t), content: 'fin' });
const invite = (t: number | string, ticket = 'demo-5') =>
  humain(t, `TON TICKET : ${ticket} — le lot`);
const transcription = (...lignes: string[]) => lignes.join('\n');

const SESSION_8 = { hook_event_name: 'SessionEnd', transcript_path: '/h.jsonl', session_id: 's8' };
const TICKETS_8 = [
  {
    id: 'demo-c',
    title: 'c — Le chantier — parent',
    status: 'in_progress',
    priority: 2,
    issue_type: 'epic',
  },
  {
    id: 'demo-c.1',
    parent: 'demo-c',
    title: 'c.1 — Le lot — moteur',
    status: 'in_progress',
    priority: 2,
    issue_type: 'task',
    labels: ['circuit'],
  },
];
const travailDe = (...lignes: string[]) => lireTranscription(transcription(...lignes)).travail;

describe('3uv.41 critère 1 : the working time of a transcript is the sum of its turns', () => {
  it('3uv.41 critère 1 : two turns count their own spans, the wait between them nothing', () => {
    // 10:00 → 10:05, then 12:00 → 12:10: 15 min, not the 130 min of the wall clock.
    expect(
      travailDe(
        invite(at('10:00')),
        reponse(at('10:05')),
        humain(at('12:00')),
        reponse(at('12:10'))
      )
    ).toBe(15 * MIN);
  });

  it('3uv.41 critère 1 : three turns over a day, each wait left out', () => {
    expect(
      travailDe(
        invite(at('08:00')),
        reponse(at('08:02')),
        reponse(at('08:20')),
        humain(at('11:00')),
        reponse(at('11:07')),
        humain(at('17:30')),
        reponse(at('17:31')),
        systeme(at('17:33'))
      )
    ).toBe((20 + 7 + 3) * MIN);
  });

  it('3uv.41 critère 1 : a turn ends at its last event of any kind, not at its last answer', () => {
    // The system line at 10:08 belongs to the first turn.
    expect(
      travailDe(
        invite(at('10:00')),
        reponse(at('10:05')),
        systeme(at('10:08')),
        humain(at('13:00')),
        reponse(at('13:04'))
      )
    ).toBe((8 + 4) * MIN);
  });

  it('3uv.41 critère 1 : a last message still unanswered opens a turn of no length yet', () => {
    expect(travailDe(invite(at('10:00')), reponse(at('10:05')), humain(at('15:00')))).toBe(5 * MIN);
  });

  it('3uv.41 critère 1 : two incoming messages in a row count nothing between them', () => {
    expect(
      travailDe(
        invite(at('10:00')),
        reponse(at('10:05')),
        humain(at('11:00')),
        humain(at('14:00')),
        reponse(at('14:06'))
      )
    ).toBe((5 + 6) * MIN);
  });
});

describe('3uv.41 critère 2 : an incoming message comes from the person, another agent or a notification; a tool result is none', () => {
  it('3uv.41 critère 2 : a long tool counts as work: its result does not start a turn', () => {
    // The tests run 40 min: the turn goes on from 10:00 to 10:42.
    expect(
      travailDe(invite(at('10:00')), appel(at('10:01')), outil(at('10:41')), reponse(at('10:42')))
    ).toBe(42 * MIN);
  });

  it('3uv.41 critère 2 : tool results across a turn keep it whole, an incoming message after them still cuts', () => {
    expect(
      travailDe(
        invite(at('10:00')),
        appel(at('10:01')),
        outil(at('10:20')),
        appel(at('10:21')),
        outil(at('10:50')),
        reponse(at('10:51')),
        humain(at('16:00')),
        appel(at('16:01')),
        outil(at('16:09')),
        reponse(at('16:10'))
      )
    ).toBe((51 + 10) * MIN);
  });

  it("3uv.41 critère 2 : another agent's message starts a turn", () => {
    expect(
      travailDe(invite(at('10:00')), reponse(at('10:05')), pair(at('12:00')), reponse(at('12:03')))
    ).toBe((5 + 3) * MIN);
  });

  it('3uv.41 critère 2 : a notification starts a turn', () => {
    expect(
      travailDe(invite(at('10:00')), reponse(at('10:05')), avis(at('12:00')), reponse(at('12:02')))
    ).toBe((5 + 2) * MIN);
  });

  it("3uv.41 critère 2 : a team lead's message, without origin, starts a turn", () => {
    expect(
      travailDe(
        invite(at('10:00')),
        reponse(at('10:05')),
        equipier(at('12:00')),
        reponse(at('12:07'))
      )
    ).toBe((5 + 7) * MIN);
  });

  it("3uv.41 critère 2 : a person's message written as a list of texts starts a turn", () => {
    expect(
      travailDe(
        invite(at('10:00')),
        reponse(at('10:05')),
        texteEnListe(at('12:00')),
        reponse(at('12:04'))
      )
    ).toBe((5 + 4) * MIN);
  });
});

describe('3uv.41 critère 7 : a message from neither the person, another agent nor a notification belongs to the turn under way', () => {
  it('3uv.41 critère 7 : a system reminder inside a turn does not cut it', () => {
    // Second turn 11:00 → 11:40 whole: the reminder at 11:30 does not start a turn.
    expect(
      travailDe(
        invite(at('10:00')),
        reponse(at('10:05')),
        humain(at('11:00')),
        rappel(at('11:30')),
        reponse(at('11:40'))
      )
    ).toBe((5 + 40) * MIN);
  });

  it("3uv.41 critère 7 : a loaded skill's content after a slow call stays in the turn", () => {
    expect(
      travailDe(
        invite(at('10:00')),
        reponse(at('10:05')),
        humain(at('12:00')),
        appel(at('12:01')),
        competence(at('12:10')),
        reponse(at('12:20'))
      )
    ).toBe((5 + 20) * MIN);
  });

  it("3uv.41 critère 7 : a reminder inserted during a long tool does not cut the tool's time", () => {
    expect(
      travailDe(
        invite(at('10:00')),
        appel(at('10:01')),
        rappel(at('10:02')),
        outil(at('10:41')),
        reponse(at('10:42')),
        humain(at('15:00')),
        reponse(at('15:01'))
      )
    ).toBe((42 + 1) * MIN);
  });

  it('3uv.41 critère 7 : a reminder after the end of a turn opens no turn, the wait stays out', () => {
    // The reminder at 10:30 belongs to the first turn (it ends there); 10:30 → 13:00 is a wait.
    expect(
      travailDe(
        invite(at('10:00')),
        reponse(at('10:05')),
        rappel(at('10:30')),
        humain(at('13:00')),
        reponse(at('13:02'))
      )
    ).toBe((30 + 2) * MIN);
  });
});

describe('3uv.41 critère 10 : the compaction summary and the interruption mark are not incoming messages', () => {
  it('3uv.41 critère 10 : a compaction summary inside a turn does not cut it', () => {
    // Second turn 12:00 → 12:40 whole: the summary at 12:30 does not start a turn.
    expect(
      travailDe(
        invite(at('10:00')),
        reponse(at('10:05')),
        humain(at('12:00')),
        appel(at('12:10')),
        resume(at('12:30')),
        reponse(at('12:40'))
      )
    ).toBe((5 + 40) * MIN);
  });

  it('3uv.41 critère 10 : the register line of a transcript compacted mid-turn holds the sum of its turns', () => {
    const lu = ligne(
      SESSION,
      lireTranscription(
        transcription(
          invite(at('08:00'), 'demo-c.1'),
          reponse(at('08:30')),
          resume(at('08:45')),
          reponse(at('09:00')),
          humain(at('14:00')),
          reponse(at('14:10'))
        )
      ),
      RACINE
    );
    expect(lu.travail).toBe((60 + 10) * MIN);
  });

  it('3uv.41 critère 10 : an interruption mark ends the turn under way; the next message of the person opens the next', () => {
    // The person stops a call at 12:20: the turn runs 12:00 → 12:20; 12:20 → 14:00 is a wait.
    expect(
      travailDe(
        invite(at('10:00')),
        reponse(at('10:05')),
        humain(at('12:00')),
        appel(at('12:01')),
        interruption(at('12:20')),
        humain(at('14:00')),
        reponse(at('14:03'))
      )
    ).toBe((5 + 20 + 3) * MIN);
  });

  it('3uv.41 critère 10 : an interruption mark for tool use during a long tool keeps the time spent', () => {
    expect(
      travailDe(
        invite(at('10:00')),
        appel(at('10:01')),
        interruption(at('10:30'), '[Request interrupted by user for tool use]'),
        humain(at('11:00')),
        reponse(at('11:04'))
      )
    ).toBe((30 + 4) * MIN);
  });

  it('3uv.41 critère 10 : a message of the person quoting the interruption mark is still an incoming message', () => {
    expect(
      travailDe(
        invite(at('10:00')),
        reponse(at('10:05')),
        humain(at('12:00'), 'Tu vois « [Request interrupted by user] » : reprends.'),
        reponse(at('12:06'))
      )
    ).toBe((5 + 6) * MIN);
  });
});

describe('3uv.41 critère 8 : the events dated before the first incoming message count in the first turn', () => {
  it('3uv.41 critère 8 : a system line before the first message starts the first turn', () => {
    expect(
      travailDe(
        systeme(at('09:50')),
        invite(at('10:00')),
        reponse(at('10:05')),
        humain(at('12:00')),
        reponse(at('12:02'))
      )
    ).toBe((15 + 2) * MIN);
  });

  it('3uv.41 critère 8 : a reminder before the first message counts in the first turn', () => {
    expect(
      travailDe(
        rappel(at('09:40')),
        invite(at('10:00')),
        reponse(at('10:05')),
        avis(at('11:00')),
        reponse(at('11:01'))
      )
    ).toBe((25 + 1) * MIN);
  });

  it('3uv.41 critère 8 : a transcript without any incoming message is one turn, first to last event', () => {
    expect(travailDe(systeme(at('10:00')), reponse(at('10:05')), systeme(at('10:07')))).toBe(
      7 * MIN
    );
  });

  it("3uv.41 critère 8 : the register's day takes the part after midnight of a first turn begun by an earlier event", () => {
    const r = ligne(
      SESSION_8,
      lireTranscription(
        transcription(
          systeme(at('23:55', '2026-10-10')),
          invite(at('00:05'), 'demo-c.1'),
          reponse(at('00:10')),
          humain(at('09:00')),
          reponse(at('09:05'))
        )
      ),
      RACINE
    );
    expect(r).toMatchObject({ debut: '2026-10-10T23:55:00.000Z', travail: 20 * MIN });
    const b = assembler({
      tous: TICKETS_8,
      prefix: 'demo',
      vivants: [],
      registre: [r],
      maintenant: Date.parse(at('12:00')),
      jour: Date.parse(at('00:00')),
    }) as { global: { jour: { travail: number }; cumul: { travail: number } } };
    expect(b.global.jour.travail).toBe((10 + 5) * MIN);
    expect(b.global.cumul.travail).toBe(20 * MIN);
  });
});

// grillhouse-5m1.1, criterion 1. Witness: BPScript 320.3.2.1 (N1). A session resumed by the
// circuit (`claude --resume`) writes, before the incoming message, the operations of its queue at
// the time of the resumption and a message of no model (« No response requested. »): they bounded
// the turn before, whose testwriter then seemed to work through the proof that followed it. As
// ccusage cuts a transcript, a turn starts at its incoming message.
describe('5m1.1 critère 1 : a turn of a resumed session starts at its incoming message', () => {
  const file = (t: string, operation: 'enqueue' | 'dequeue') =>
    l({ type: 'queue-operation', operation, timestamp: t });
  const synthetique = (t: string) =>
    l({
      type: 'assistant',
      timestamp: t,
      message: {
        id: `m${++n}`,
        model: '<synthetic>',
        role: 'assistant',
        content: [{ type: 'text', text: 'No response requested.' }],
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    });

  it('5m1.1 critère 1 : the operations of the queue and the message of no model of a resumption leave the turn before where its work ended', () => {
    const t = lireTranscription(
      transcription(
        file('2026-10-11T10:00:00Z', 'enqueue'),
        file('2026-10-11T10:00:00.020Z', 'dequeue'),
        invite(at('10:00')),
        reponse(at('10:03')),
        outil(at('10:04')),
        file('2026-10-11T10:10:00Z', 'enqueue'),
        file('2026-10-11T10:10:00.020Z', 'dequeue'),
        synthetique('2026-10-11T10:09:52Z'),
        humain('2026-10-11T10:10:00.100Z', 'TON TICKET : demo-5 — reprends'),
        reponse(at('10:12'))
      )
    );
    expect(t.tours).toEqual([
      [Date.parse(at('10:00')), Date.parse(at('10:04'))],
      [Date.parse('2026-10-11T10:10:00.100Z'), Date.parse(at('10:12'))],
    ]);
    expect(t.travail).toBe(4 * MIN + 2 * MIN - 100);
  });
});

describe('3uv.41 critère 3 : a transcript of one turn keeps its time, first to last event', () => {
  it('3uv.41 critère 3 : one turn of answers measures from its first to its last event', () => {
    expect(travailDe(invite(at('10:00')), reponse(at('10:03')), reponse(at('10:10')))).toBe(
      10 * MIN
    );
  });

  it('3uv.41 critère 3 : one turn with tools and a closing event keeps its whole span', () => {
    expect(
      travailDe(
        invite(at('09:00')),
        appel(at('09:05')),
        outil(at('09:35')),
        reponse(at('09:36')),
        systeme(at('09:40'))
      )
    ).toBe(40 * MIN);
  });

  it('3uv.41 critère 3 : a transcript without any dated event works no time', () => {
    expect(travailDe(l({ type: 'agent-setting', agentSetting: 'testwriter' }))).toBe(0);
  });
});

// The board of one ticket in progress, with the register's lines and the running agents given.
// Each ticket is in the circuit (label `circuit`), as the owner launched it.
const T = (id: string, o: object = {}) => ({
  id,
  title: id,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  labels: ['circuit'],
  ...o,
});
interface Mesure {
  travail: number;
  jetons: number;
}
interface Noeud extends Mesure {
  id: string;
  enfants: Noeud[];
}
interface Board {
  global: { jour: Mesure; cumul: Mesure };
  chantiers: Noeud[];
  agents: {
    roles: string[];
    enCours: (Mesure & { id: string })[];
    attend: (Mesure & { id: string })[];
  }[];
}
const TICKETS = [
  T('demo-c', { issue_type: 'epic', title: 'c — Le chantier — parent' }),
  T('demo-c.1', { parent: 'demo-c', title: 'c.1 — Le lot — moteur' }),
];
const plateau = (o: {
  registre: object[];
  vivants?: object[];
  circuits?: object[];
  maintenant: number;
  jour: number;
}): Board => assembler({ tous: TICKETS, prefix: 'demo', vivants: [], ...o }) as Board;
const ligneTicket = (b: Board, id = 'demo-c.1') =>
  b.agents.flatMap(x => [...x.enCours, ...x.attend]).find(x => x.id === id);

// A sub-agent's transcript, written now (so it counts as running), in a home of its own.
const avecSousAgent = (id: string, role: string, texte: string) => {
  const home = mkdtempSync(path.join(ESSAIS, 'home-'));
  const sous = path.join(home, '.claude/projects/-depot/sess/subagents');
  mkdirSync(sous, { recursive: true });
  writeFileSync(path.join(sous, `agent-${id}.jsonl`), texte);
  writeFileSync(path.join(sous, `agent-${id}.meta.json`), l({ agentType: role }));
  return home;
};

const SESSION = { hook_event_name: 'SessionEnd', transcript_path: '/t.jsonl', session_id: 's1' };
const DEUX_TOURS = transcription(
  l({ type: 'agent-setting', agentSetting: 'testwriter' }),
  invite(at('08:00'), 'demo-c.1'),
  reponse(at('08:10'), 30),
  humain(at('11:00')),
  reponse(at('11:05'), 20)
);

describe('3uv.41 critère 4 : the register writes the working time, and every time the board shows follows from it', () => {
  it('3uv.41 critère 4 : the register line of a transcript of two turns holds the sum of its turns', () => {
    const r = ligne(SESSION, lireTranscription(DEUX_TOURS), RACINE);
    expect(r).toMatchObject({
      agent: 's1',
      ticket: 'demo-c.1',
      debut: '2026-10-11T08:00:00.000Z',
      fin: '2026-10-11T11:05:00.000Z',
      travail: 15 * MIN,
      jetons: 50,
    });
  });

  it('3uv.41 critère 4 : the ticket, the chantier and the whole carry the register time, without another reckoning', () => {
    const r = ligne(SESSION, lireTranscription(DEUX_TOURS), RACINE);
    const b = plateau({
      registre: [r],
      maintenant: Date.parse(at('12:00')),
      jour: Date.parse(at('00:00')),
    });
    expect(b.global.cumul).toEqual({ travail: 15 * MIN, jetons: 50 });
    expect(b.global.jour).toEqual({ travail: 15 * MIN, jetons: 50 });
    expect(b.chantiers[0]).toMatchObject({ id: 'demo-c', travail: 15 * MIN });
    expect(ligneTicket(b)).toMatchObject({ travail: 15 * MIN });
  });

  it('3uv.41 critère 4 : two agents on a ticket add their sums of turns', () => {
    const autre = ligne(
      { hook_event_name: 'SessionEnd', transcript_path: '/u.jsonl', session_id: 's2' },
      lireTranscription(
        transcription(
          invite(at('09:00'), 'demo-c.1'),
          reponse(at('09:04'), 5),
          avis(at('10:00')),
          reponse(at('10:02'), 5)
        )
      ),
      RACINE
    );
    const b = plateau({
      registre: [ligne(SESSION, lireTranscription(DEUX_TOURS), RACINE), autre],
      maintenant: Date.parse(at('12:00')),
      jour: Date.parse(at('00:00')),
    });
    expect(b.global.cumul.travail).toBe((15 + 6) * MIN);
    expect(b.chantiers[0].travail).toBe((15 + 6) * MIN);
  });

  it('3uv.41 critère 4 : a running agent counts its sum of turns, in all and on its ticket', () => {
    const maintenant = Date.now();
    const home = avecSousAgent(
      'a7',
      'developpeur',
      transcription(
        invite(maintenant - 300 * MIN, 'demo-c.1'),
        reponse(maintenant - 290 * MIN),
        humain(maintenant - 30 * MIN),
        reponse(maintenant - 25 * MIN)
      )
    );
    const vivants = lireVivant({ racine: RACINE, home, prefix: 'demo', maintenant, ps: '' });
    const b = plateau({
      registre: [],
      vivants,
      maintenant,
      jour: maintenant - 24 * 60 * MIN,
    });
    expect(b.global.cumul.travail).toBe(15 * MIN);
    expect(ligneTicket(b)).toMatchObject({ travail: 15 * MIN });
  });
});

describe('3uv.41 critère 5 : the lines already in the register are not rewritten', () => {
  it('3uv.41 critère 5 : catching up leaves the lines already written byte for byte, their agents not written again', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
    const home = mkdtempSync(path.join(ESSAIS, 'home-'));
    const dir = path.join(home, '.claude/projects', racine.replace(/[^A-Za-z0-9]/g, '-'));
    mkdirSync(dir, { recursive: true });
    const autre = transcription(
      invite(at('13:00'), 'demo-c.1'),
      reponse(at('13:04')),
      humain(at('15:00')),
      reponse(at('15:03'))
    );
    writeFileSync(path.join(dir, 's1.jsonl'), DEUX_TOURS);
    writeFileSync(path.join(dir, 's2.jsonl'), autre);
    const passe = new Date(Date.now() - 60 * MIN);
    utimesSync(path.join(dir, 's1.jsonl'), passe, passe);
    utimesSync(path.join(dir, 's2.jsonl'), passe, passe);
    const fichier = path.join(ESSAIS, `registre-${path.basename(racine)}.jsonl`);
    // The line written before the turns: the wall clock of the same transcript.
    const ancienne = `${l({
      projet: racine,
      agent: 's1',
      ticket: 'demo-c.1',
      role: 'testwriter',
      debut: '2026-10-11T08:00:00.000Z',
      fin: '2026-10-11T11:05:00.000Z',
      travail: 185 * MIN,
      jetons: 50,
      cache: 0,
      cout: null,
    })}\n`;
    writeFileSync(fichier, ancienne);
    const r = spawnSync('node', [SCRIPT, '--rattraper'], {
      cwd: racine,
      env: { ...process.env, HOME: home, GRILLHOUSE_REGISTRE: fichier },
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    const apres = readFileSync(fichier, 'utf8');
    expect(apres.startsWith(ancienne)).toBe(true);
    const ajoutees = apres
      .slice(ancienne.length)
      .trim()
      .split('\n')
      .map(x => JSON.parse(x) as { agent: string; travail: number });
    expect(ajoutees).toEqual([expect.objectContaining({ agent: 's2', travail: 7 * MIN })]);
  });

  it('3uv.41 critère 5 : a line written before the turns counts as written, in all and in its day', () => {
    const ancienne = {
      projet: RACINE,
      agent: 's9',
      ticket: 'demo-c.1',
      role: 'testwriter',
      debut: '2026-10-11T08:00:00.000Z',
      fin: '2026-10-11T11:05:00.000Z',
      travail: 185 * MIN,
      jetons: 50,
      cache: 0,
      cout: null,
    };
    const b = plateau({
      registre: [ancienne],
      maintenant: Date.parse(at('12:00')),
      jour: Date.parse(at('00:00')),
    });
    expect(b.global.cumul.travail).toBe(185 * MIN);
    expect(b.global.jour.travail).toBe(185 * MIN);
    expect(ligneTicket(b)).toMatchObject({ travail: 185 * MIN });
  });
});

describe("3uv.41 critère 6 : the day time of an agent resumed over two days counts only today's turns", () => {
  const minuit = Date.parse(at('00:00'));
  const midi = Date.parse(at('12:00'));

  it("3uv.41 critère 6 : a finished agent with a turn yesterday and one today counts today's turn in the day, both in all", () => {
    const r = ligne(
      SESSION,
      lireTranscription(
        transcription(
          invite(at('22:00', '2026-10-10'), 'demo-c.1'),
          reponse(at('22:30', '2026-10-10')),
          humain(at('09:00')),
          reponse(at('09:20'))
        )
      ),
      RACINE
    );
    const b = plateau({ registre: [r], maintenant: midi, jour: minuit });
    expect(b.global.jour.travail).toBe(20 * MIN);
    expect(b.global.cumul.travail).toBe(50 * MIN);
  });

  it('3uv.41 critère 6 : a turn across midnight counts in the day its part after midnight', () => {
    const r = ligne(
      SESSION,
      lireTranscription(
        transcription(
          invite(at('23:50', '2026-10-10'), 'demo-c.1'),
          reponse(at('00:10')),
          humain(at('09:00')),
          reponse(at('09:20'))
        )
      ),
      RACINE
    );
    const b = plateau({ registre: [r], maintenant: midi, jour: minuit });
    expect(b.global.jour.travail).toBe((10 + 20) * MIN);
    expect(b.global.cumul.travail).toBe((20 + 20) * MIN);
  });

  it('3uv.41 critère 6 : several turns before today count nothing in the day', () => {
    const r = ligne(
      SESSION,
      lireTranscription(
        transcription(
          invite(at('08:00', '2026-10-09'), 'demo-c.1'),
          reponse(at('08:30', '2026-10-09')),
          humain(at('14:00', '2026-10-10')),
          reponse(at('14:40', '2026-10-10')),
          humain(at('07:00')),
          reponse(at('07:05'))
        )
      ),
      RACINE
    );
    const b = plateau({ registre: [r], maintenant: midi, jour: minuit });
    expect(b.global.jour.travail).toBe(5 * MIN);
    expect(b.global.cumul.travail).toBe((30 + 40 + 5) * MIN);
  });

  it("3uv.41 critère 6 : a running agent counts in the day only its turns since the day's start", () => {
    const maintenant = Date.now();
    const home = avecSousAgent(
      'a8',
      'relecteur',
      transcription(
        invite(maintenant - 300 * MIN, 'demo-c.1'),
        reponse(maintenant - 270 * MIN),
        humain(maintenant - 60 * MIN),
        reponse(maintenant - 40 * MIN)
      )
    );
    const vivants = lireVivant({ racine: RACINE, home, prefix: 'demo', maintenant, ps: '' });
    const b = plateau({ registre: [], vivants, maintenant, jour: maintenant - 120 * MIN });
    expect(b.global.jour.travail).toBe(20 * MIN);
    expect(b.global.cumul.travail).toBe(50 * MIN);
  });

  it("3uv.41 critère 6 : a running agent's turn across the day's start counts its part after it", () => {
    const maintenant = Date.now();
    const home = avecSousAgent(
      'a6',
      'relecteur',
      transcription(
        invite(maintenant - 300 * MIN, 'demo-c.1'),
        reponse(maintenant - 270 * MIN),
        humain(maintenant - 60 * MIN),
        reponse(maintenant - 40 * MIN)
      )
    );
    const vivants = lireVivant({ racine: RACINE, home, prefix: 'demo', maintenant, ps: '' });
    const b = plateau({ registre: [], vivants, maintenant, jour: maintenant - 50 * MIN });
    expect(b.global.jour.travail).toBe(10 * MIN);
  });
});

describe('3uv.41 critère 9 : a register line written without its turns keeps the present day reckoning', () => {
  const minuit = Date.parse(at('00:00'));
  const midi = Date.parse(at('12:00'));
  const ancienne = (debut: string, fin: string, minutes: number, agent = 's9') => ({
    projet: RACINE,
    agent,
    ticket: 'demo-c.1',
    role: 'testwriter',
    debut,
    fin,
    travail: minutes * MIN,
    jetons: 10,
    cache: 0,
    cout: null,
  });

  it('3uv.41 critère 9 : an old line across midnight, finished today, counts whole in the day', () => {
    const b = plateau({
      registre: [ancienne('2026-10-10T22:00:00.000Z', '2026-10-11T09:00:00.000Z', 60)],
      maintenant: midi,
      jour: minuit,
    });
    expect(b.global.jour.travail).toBe(60 * MIN);
    expect(b.global.cumul.travail).toBe(60 * MIN);
  });

  it('3uv.41 critère 9 : an old line finished yesterday counts nothing in the day', () => {
    const b = plateau({
      registre: [ancienne('2026-10-10T08:00:00.000Z', '2026-10-10T20:00:00.000Z', 90)],
      maintenant: midi,
      jour: minuit,
    });
    expect(b.global.jour.travail).toBe(0);
    expect(b.global.cumul.travail).toBe(90 * MIN);
  });

  it('3uv.41 critère 9 : beside a line with its turns, an old line still counts whole and the new one only today', () => {
    const nouvelle = ligne(
      SESSION,
      lireTranscription(
        transcription(
          invite(at('22:00', '2026-10-10'), 'demo-c.1'),
          reponse(at('22:30', '2026-10-10')),
          humain(at('09:00')),
          reponse(at('09:20'))
        )
      ),
      RACINE
    );
    const b = plateau({
      registre: [ancienne('2026-10-10T22:00:00.000Z', '2026-10-11T09:00:00.000Z', 60), nouvelle],
      maintenant: midi,
      jour: minuit,
    });
    expect(b.global.jour.travail).toBe((60 + 20) * MIN);
    expect(b.global.cumul.travail).toBe((60 + 50) * MIN);
  });
});

// The steps the circuit leads itself (BPScript si61.8: 47 min from the go to the close, 8 min on
// the board): the proof, the checks, the final pass, the integration and the queue. Each one ends
// with a register line of the role `circuit` (scripts/circuit.mjs), its tokens 0; the step under
// way is read from the circuit's state (`mene`, the start of the step). A ticket's working time is
// the union of its agents' turns and its circuit's steps: an instant counts once.
describe("the circuit's own steps count in the ticket's working time", () => {
  const minuit = Date.parse(at('00:00'));
  const midi = Date.parse(at('12:00'));
  const etapeDuCircuit = (debut: string, fin: string, etape = 'controles') => ({
    projet: RACINE,
    agent: `circuit:demo-c.1:${debut}`,
    ticket: 'demo-c.1',
    role: 'circuit',
    etape,
    composant: 'packages/moteur',
    debut,
    fin,
    travail: Date.parse(fin) - Date.parse(debut),
    tours: [[Date.parse(debut), Date.parse(fin)]],
    jetons: 0,
    cache: 0,
    cout: null,
  });
  const seance = (debut: string, fin: string, agent = 's1') =>
    ligne(
      { hook_event_name: 'SessionEnd', transcript_path: `/${agent}.jsonl`, session_id: agent },
      lireTranscription(
        transcription(
          l({ type: 'agent-setting', agentSetting: 'testwriter' }),
          invite(debut, 'demo-c.1'),
          reponse(fin, 30)
        )
      ),
      RACINE
    );
  const parTicket = (b: Board) =>
    (b as unknown as { parTicket: Record<string, Mesure> }).parTicket['demo-c.1'];

  it('a session of 5 min and a step of checks of 10 min, apart, make 15 min on the ticket, its chantier, the day and in all', () => {
    const b = plateau({
      registre: [seance(at('09:00'), at('09:05')), etapeDuCircuit(at('09:10'), at('09:20'))],
      maintenant: midi,
      jour: minuit,
    });
    expect(ligneTicket(b)).toMatchObject({ travail: 15 * MIN, jetons: 30 });
    expect(parTicket(b)).toEqual({ travail: 15 * MIN, jetons: 30 });
    expect(b.chantiers[0]).toMatchObject({ id: 'demo-c', travail: 15 * MIN, jetons: 30 });
    expect(b.global.jour).toEqual({ travail: 15 * MIN, jetons: 30 });
    expect(b.global.cumul).toEqual({ travail: 15 * MIN, jetons: 30 });
  });

  it('a session during a step of the circuit adds nothing: the union, each instant once', () => {
    const b = plateau({
      registre: [seance(at('09:00'), at('09:10')), etapeDuCircuit(at('09:05'), at('09:20'))],
      maintenant: midi,
      jour: minuit,
    });
    expect(parTicket(b).travail).toBe(20 * MIN);
    expect(b.global.cumul.travail).toBe(20 * MIN);
    const dedans = plateau({
      registre: [seance(at('09:05'), at('09:10')), etapeDuCircuit(at('09:00'), at('09:20'))],
      maintenant: midi,
      jour: minuit,
    });
    expect(parTicket(dedans).travail).toBe(20 * MIN);
    expect(dedans.global.jour.travail).toBe(20 * MIN);
  });

  it('a step across midnight counts in the day its part after midnight, in all its whole', () => {
    const b = plateau({
      registre: [etapeDuCircuit(at('23:50', '2026-10-10'), at('00:10'))],
      maintenant: midi,
      jour: minuit,
    });
    expect(b.global.jour.travail).toBe(10 * MIN);
    expect(b.global.cumul.travail).toBe(20 * MIN);
  });

  it('the step under way of a running circuit counts from its start to now; a dead one adds nothing', () => {
    const avec = (vivant: boolean) =>
      plateau({
        registre: [seance(at('11:40'), at('11:45')), etapeDuCircuit(at('11:45'), at('11:50'))],
        circuits: [
          {
            ticket: 'demo-c.1',
            etape: 'controles',
            composant: 'packages/moteur',
            tentative: 1,
            finale: true,
            code: null,
            arret: null,
            raison: null,
            question: null,
            qui: null,
            vivant,
            mene: Date.parse(at('11:50')),
          },
        ],
        maintenant: midi,
        jour: minuit,
      });
    expect(parTicket(avec(true)).travail).toBe(20 * MIN);
    expect(avec(true).global.jour.travail).toBe(20 * MIN);
    expect(avec(true).chantiers[0].travail).toBe(20 * MIN);
    expect(parTicket(avec(false)).travail).toBe(10 * MIN);
  });

  it("a circuit's line is no passage of a role: the ticket waits for the role after its last agent, and no block holds the circuit", () => {
    const b = plateau({
      registre: [
        seance(at('09:00'), at('09:05')),
        etapeDuCircuit(at('09:10'), at('09:20'), 'preuve'),
      ],
      maintenant: midi,
      jour: minuit,
    });
    expect(b.agents.flatMap(x => x.roles)).not.toContain('circuit');
    const ou = b.agents.filter(x => [...x.enCours, ...x.attend].some(y => y.id === 'demo-c.1'));
    expect(ou.map(x => x.roles)).toEqual([['developpeur']]);
    expect(ou[0].enCours).toEqual([]);
  });

  it("a circuit's line alone is no passage: the claimed ticket keeps its line in its chantier, waiting in no block", () => {
    const b = plateau({
      registre: [etapeDuCircuit(at('09:10'), at('09:20'), 'integration')],
      maintenant: midi,
      jour: minuit,
    });
    expect(b.agents.flatMap(x => [...x.enCours, ...x.attend]).map(x => x.id)).toEqual([]);
    expect(parTicket(b).travail).toBe(10 * MIN);
  });
});
