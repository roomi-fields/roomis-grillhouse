import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assembler,
  lireJetons,
  lireTranscription,
  lireVivant,
  SANS_AGENT,
  SILENCE,
} from '../../scripts/tableau.mjs';

// The shapes the tests read; the script itself is plain JavaScript.
interface Jetons {
  parTicket: Record<string, { jetons: number }>;
  supervision: { jetons: number };
}
interface Board {
  projet: Record<string, number>;
  epopees: {
    id: string;
    compteurs: Record<string, number>;
    tickets: Record<string, { id: string }[]>;
  }[];
  epopeesSuivantes: { id: string }[];
  suivants: { id: string }[];
  tickets: Record<string, { duree: number }>;
  alertes: { texte: string }[];
}
const plateau = (a: Parameters<typeof assembler>[0]) => assembler(a) as Board;

const ligne = (o: object) => JSON.stringify(o);
const reponse = (id: string, t: string, u: object) =>
  ligne({ type: 'assistant', timestamp: t, message: { id, usage: u } });

describe('lireTranscription', () => {
  const texte = [
    ligne({
      type: 'user',
      timestamp: '2026-10-09T10:00:00Z',
      message: { content: 'TON TICKET : demo-a1.2 — x' },
    }),
    reponse('m1', '2026-10-09T10:01:00Z', {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 1000,
    }),
    reponse('m1', '2026-10-09T10:01:00Z', {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 1000,
    }),
    reponse('m2', '2026-10-09T10:10:00Z', { input_tokens: 1, output_tokens: 2 }),
    'pas du json',
  ].join('\n');
  const lu = lireTranscription(texte);
  it('counts input, output and cache creation once per answer, cache reads apart', () => {
    expect(lu.jetons).toBe(118);
    expect(lu.cache).toBe(1000);
  });
  it('measures the working span from the first to the last message', () => {
    expect(lu.travail).toBe(10 * 60_000);
  });
  it('reads the ticket of the first message', () => {
    expect(lu.ticket).toBe('demo-a1.2');
    expect(
      lireTranscription(ligne({ type: 'user', message: { content: 'bonjour' } })).ticket
    ).toBeNull();
  });
});

describe('lireJetons', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'home-'));
  const racine = '/r/projet';
  const projets = path.join(home, '.claude', 'projects');
  const ecrire = (rel: string, texte: string) => {
    mkdirSync(path.dirname(path.join(projets, rel)), { recursive: true });
    writeFileSync(path.join(projets, rel), texte);
  };
  const u = (n: number) => ({ input_tokens: n });
  ecrire('-r-projet/s1.jsonl', reponse('a', '2026-10-09T10:00:00Z', u(7)));
  ecrire(
    '-r-projet/s1/subagents/agent-1.jsonl',
    [
      ligne({ type: 'user', message: { content: 'TON TICKET : demo-3 — y' } }),
      reponse('b', '2026-10-09T10:00:00Z', u(20)),
    ].join('\n')
  );
  ecrire(
    '-r-projet--claude-worktrees-demo-4/s2.jsonl',
    reponse('c', '2026-10-09T10:00:00Z', u(30))
  );
  ecrire('-r-autre/s3.jsonl', reponse('d', '2026-10-09T10:00:00Z', u(99)));
  const cache = path.join(home, 'cache.json');
  const j = lireJetons(racine, home, cache) as Jetons;
  it("gives a copy's transcripts to its ticket and a subagent's to the ticket it was given", () => {
    expect(j.parTicket['demo-4'].jetons).toBe(30);
    expect(j.parTicket['demo-3'].jetons).toBe(20);
  });
  it("keeps the supervisor's own work apart, and ignores other projects", () => {
    expect(j.supervision.jetons).toBe(7);
    expect(Object.values(j.parTicket).some(t => t.jetons === 99)).toBe(false);
  });
  it('reads an unchanged transcript from its cache', () => {
    const lu = JSON.parse(readFileSync(cache, 'utf8')) as Record<
      string,
      { lu: { jetons: number } }
    >;
    const f = path.join(projets, '-r-projet/s1.jsonl');
    lu[f].lu.jetons = 1234;
    writeFileSync(cache, JSON.stringify(lu));
    expect((lireJetons(racine, home, cache) as Jetons).supervision.jetons).toBe(1234);
  });
});

describe('lireVivant', () => {
  it('sees the integration whose lock holds a living process, and recent subagents', () => {
    const commun = mkdtempSync(path.join(tmpdir(), 'git-'));
    writeFileSync(path.join(commun, 'integration.lock'), String(process.pid));
    const maintenant = Date.now();
    const v = lireVivant(
      '/r',
      commun,
      'demo',
      [
        { ticket: 'demo-1', mtime: maintenant - 30_000 },
        { ticket: 'demo-2', mtime: maintenant - 10 * 60_000 },
      ],
      maintenant
    );
    expect(v.map(x => x.type)).toEqual(['intégration', 'sous-agent']);
    expect(v[1].ticket).toBe('demo-1');
  });
  it('sees no integration behind a dead lock', () => {
    const commun = mkdtempSync(path.join(tmpdir(), 'git-'));
    writeFileSync(path.join(commun, 'integration.lock'), '999999999');
    expect(lireVivant('/r', commun, 'demo', [], Date.now())).toEqual([]);
  });
});

describe('assembler', () => {
  const maintenant = Date.parse('2026-10-09T12:00:00Z');
  const t = (id: string, status: string, extra: object = {}) => ({
    id,
    title: id,
    status,
    priority: 2,
    parent: 'demo-e',
    issue_type: 'task',
    ...extra,
  });
  const tous = [
    { id: 'demo-e', title: 'E', status: 'open', priority: 1, issue_type: 'epic' },
    { id: 'demo-f', title: 'F', status: 'open', priority: 0, issue_type: 'epic' },
    t('demo-1', 'in_progress', { started_at: '2026-10-09T11:00:00Z' }),
    t('demo-2', 'open'),
    t('demo-3', 'open'),
    t('demo-4', 'open'),
    t('demo-5', 'closed', {
      started_at: '2026-10-09T10:00:00Z',
      closed_at: '2026-10-09T10:30:00Z',
    }),
    t('demo-6', 'open', { parent: 'demo-f' }),
  ];
  const base = {
    tous,
    prets: [tous[1], tous[3], tous[7]],
    bloques: [tous[4]],
    aValider: [tous[5]],
    nuit: [],
    jetons: {
      parTicket: { 'demo-5': { jetons: 500, cache: 9, travail: 20 * 60_000 } },
      supervision: { jetons: 1, cache: 0, travail: 0 },
    },
    vivant: [],
    maintenant,
  };
  const b = plateau(base);
  it('sorts each ticket of each epic into in progress, ready, blocked, awaiting and closed', () => {
    const e = b.epopees.find(x => x.id === 'demo-e')!;
    expect(e.compteurs).toEqual({ enCours: 1, prets: 1, bloques: 1, aValider: 1, fermes: 1 });
    expect(e.tickets.aValider.map(x => x.id)).toEqual(['demo-4']);
    expect(b.projet).toEqual({ enCours: 1, prets: 2, bloques: 1, aValider: 1, fermes: 1 });
  });
  it('puts the epic in progress first, then the others by priority', () => {
    expect(b.epopees.map(x => x.id)).toEqual(['demo-e', 'demo-f']);
    expect(b.epopeesSuivantes.map(x => x.id)).toEqual(['demo-f']);
  });
  it("keeps Beads' order for the next tickets, without epics", () => {
    expect(b.suivants.map(x => x.id)).toEqual(['demo-2', 'demo-6']);
  });
  it('gives a ticket its duration, its working time and its tokens', () => {
    expect(b.tickets['demo-5']).toEqual({
      duree: 30 * 60_000,
      travail: 20 * 60_000,
      jetons: 500,
      cache: 9,
    });
    expect(b.tickets['demo-1'].duree).toBe(60 * 60_000);
  });
  it('alerts on a decision awaited, a red night, a silent agent, a ticket without anything running', () => {
    const a = plateau({
      ...base,
      nuit: [{ id: 'demo-9' }],
      vivant: [{ type: 'agent', ticket: 'demo-7', silence: SILENCE + 1 }],
    }).alertes.map(x => x.texte);
    expect(a).toContain('La nuit est rouge : demo-9');
    expect(a).toContain('1 ticket(s) attendent ta décision');
    expect(a.some(x => /demo-7 : agent vivant, silencieux/.test(x))).toBe(true);
    expect(a).toContain('demo-1 : en cours sans rien qui tourne');
  });
  it('does not alert on a ticket in progress whose agent runs, or that just started', () => {
    const avecAgent = plateau({ ...base, vivant: [{ type: 'sous-agent', ticket: 'demo-1' }] });
    expect(avecAgent.alertes.some(x => /demo-1/.test(x.texte))).toBe(false);
    const recent = plateau({
      ...base,
      maintenant: Date.parse('2026-10-09T11:00:00Z') + SANS_AGENT - 1,
    });
    expect(recent.alertes.some(x => /demo-1/.test(x.texte))).toBe(false);
  });
});
