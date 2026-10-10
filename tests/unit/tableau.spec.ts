import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assembler,
  etape,
  lecture,
  lignes,
  lireRegistre,
  lireTranscription,
  lireVivant,
  LARGEUR,
  SANS_AGENT,
  SILENCE,
  verdict,
} from '../../scripts/tableau.mjs';

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

// The shapes the tests read; the script itself is plain JavaScript.
interface Noeud {
  numero: string;
  faits: number;
  total: number;
  jetons: number;
  enfants: Noeud[];
}
interface Board {
  global: { compteurs: Record<string, number>; jour: object; cumul: object };
  chantiers: Noeud[];
  autres: object[];
  agents: { enCours: object[]; attend: string[] }[];
  faitsDuJour: string[];
  alertes: { texte: string }[];
}
const plateau = (a: Parameters<typeof assembler>[0]) => assembler(a) as Board;
const dessin = (t: Board) => lignes(t, 'demo') as { texte: string }[];

describe('lecture', () => {
  it('reads « number — subject — component » when the number ends the id', () => {
    expect(
      lecture(
        { id: 'bp-mono-vbwf.320.2.1', title: '320.2.1 — Publie la scène — 030-binder' },
        'bp-mono'
      )
    ).toEqual({
      numero: '320.2.1',
      sujet: 'Publie la scène',
      composant: '030-binder',
    });
  });
  it('falls back on the id without its prefix and the whole title', () => {
    expect(lecture({ id: 'demo-a1.2', title: 'Un titre libre' }, 'demo')).toEqual({
      numero: 'a1.2',
      sujet: 'Un titre libre',
      composant: '',
    });
  });
});

describe('verdict and etape', () => {
  const c = (text: string, at: string) => ({ text, created_at: at });
  it("keeps the reviewer's last verdict", () => {
    expect(
      verdict([
        c('RENDU — x', '2026-10-10T10:00:00Z'),
        c('Passation', '2026-10-10T11:00:00Z'),
        c('ACCEPTÉ', '2026-10-10T12:00:00Z'),
      ])
    ).toEqual({
      verdict: 'ACCEPTÉ',
      date: Date.parse('2026-10-10T12:00:00Z'),
    });
    expect(verdict([c('Passation', '2026-10-10T11:00:00Z')])).toBeNull();
  });
  const p = (role: string, fin: string) => ({ role, fin });
  it('passes a ticket from role to role, the verdict choosing after the review', () => {
    expect(etape([], null)).toBe('testeur');
    expect(etape([p('testeur', '2026-10-10T10:00:00Z')], null)).toBe('developpeur');
    expect(
      etape([p('testeur', '2026-10-10T10:00:00Z'), p('developpeur', '2026-10-10T11:00:00Z')], null)
    ).toBe('relecteur');
    const relu = [p('developpeur', '2026-10-10T11:00:00Z'), p('relecteur', '2026-10-10T12:00:00Z')];
    expect(etape(relu, { verdict: 'ACCEPTÉ', date: Date.parse('2026-10-10T12:00:00Z') })).toBe(
      'integrateur'
    );
    expect(etape(relu, { verdict: 'RENDU', date: Date.parse('2026-10-10T12:00:00Z') })).toBe(
      'developpeur'
    );
  });
  it('resumes the role an arbiter interrupted', () => {
    expect(
      etape([p('developpeur', '2026-10-10T11:00:00Z'), p('arbitre', '2026-10-10T11:30:00Z')], null)
    ).toBe('relecteur');
  });
});

describe('lireRegistre', () => {
  it("keeps this project's lines, and skips a torn one", () => {
    const texte = [
      ligne({ projet: '/a', agent: '1' }),
      '{"projet":',
      ligne({ projet: '/b', agent: '2' }),
    ].join('\n');
    expect(lireRegistre(texte, '/a')).toEqual([{ projet: '/a', agent: '1' }]);
  });
});

describe('lireVivant', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'home-'));
  const racine = '/depot';
  const projets = path.join(home, '.claude/projects');
  const copie = path.join(projets, '-depot--claude-worktrees-demo-3-1');
  mkdirSync(copie, { recursive: true });
  writeFileSync(
    path.join(copie, 's1.jsonl'),
    [
      ligne({ type: 'agent-setting', agentSetting: 'developpeur' }),
      reponse('m', '2026-10-10T10:00:00Z', { input_tokens: 5, output_tokens: 5 }),
    ].join('\n')
  );
  const sous = path.join(projets, '-depot/sess/subagents');
  mkdirSync(sous, { recursive: true });
  writeFileSync(
    path.join(sous, 'agent-a9.jsonl'),
    [
      ligne({
        type: 'user',
        timestamp: '2026-10-10T10:00:00Z',
        message: { content: 'TON TICKET : demo-4' },
      }),
      reponse('m', '2026-10-10T10:02:00Z', { input_tokens: 1, output_tokens: 1 }),
    ].join('\n')
  );
  writeFileSync(path.join(sous, 'agent-a9.meta.json'), ligne({ agentType: 'relecteur' }));
  const ps = '  77  600 claude -p TON TICKET : demo-3.1 --agent developpeur\n  78 5 vim notes\n';
  const v = lireVivant({ racine, home, prefix: 'demo', maintenant: Date.now(), ps });
  it('sees a shell agent by its process, measured on its copy transcript and marked', () => {
    expect(v.find(x => x.ticket === 'demo-3.1')).toMatchObject({
      role: 'developpeur',
      ligne: true,
      agent: 's1',
      jetons: 10,
    });
  });
  it('sees a recent sub-agent, its role from its meta file and its ticket from its prompt', () => {
    expect(v.find(x => x.agent === 'a9')).toMatchObject({
      ticket: 'demo-4',
      role: 'relecteur',
      ligne: false,
      jetons: 2,
    });
  });
});

describe('assembler', () => {
  const T = (id: string, o: object = {}) => ({
    id,
    title: id,
    status: 'open',
    priority: 2,
    issue_type: 'task',
    ...o,
  });
  const maintenant = Date.parse('2026-10-10T12:00:00Z');
  const jour = Date.parse('2026-10-10T00:00:00Z');
  const tous = [
    T('demo-c', { issue_type: 'epic', title: 'c — Le chantier — parent' }),
    T('demo-c.1', { parent: 'demo-c', title: 'c.1 — Une mère — parent' }),
    T('demo-c.1.1', { parent: 'demo-c.1', status: 'in_progress', title: 'c.1.1 — Écrit — moteur' }),
    T('demo-c.1.2', { parent: 'demo-c.1', status: 'closed', closed_at: '2026-10-10T09:00:00Z' }),
    T('demo-c.2', {
      parent: 'demo-c',
      dependencies: [{ type: 'blocks', depends_on_id: 'demo-c.1.1' }],
    }),
    T('demo-c.3', { parent: 'demo-c' }),
    T('demo-c.4', { parent: 'demo-c', labels: ['a-valider'] }),
    T('demo-z', { issue_type: 'epic', title: 'z — Un autre — parent' }),
    T('demo-z.1', { parent: 'demo-z', status: 'closed', closed_at: '2026-10-01T09:00:00Z' }),
  ];
  const registre = [
    {
      agent: 'r1',
      ticket: 'demo-c.1.1',
      role: 'testeur',
      fin: '2026-10-10T10:00:00Z',
      travail: 600_000,
      jetons: 1000,
    },
    {
      agent: 'r0',
      ticket: 'demo-c.3',
      role: 'testeur',
      fin: '2026-10-09T10:00:00Z',
      travail: 60_000,
      jetons: 50,
    },
  ];
  const vivants = [
    {
      agent: 'v1',
      ticket: 'demo-c.1.1',
      role: 'developpeur',
      ligne: true,
      depuis: maintenant - 20 * 60_000,
      silence: SILENCE + 60_000,
      jetons: 300,
      travail: 1_200_000,
    },
    {
      agent: 'r1',
      ticket: 'demo-c.1.1',
      role: 'testeur',
      ligne: false,
      depuis: 0,
      jetons: 1000,
      travail: 600_000,
    },
  ];
  const t = plateau({ tous, prefix: 'demo', registre, vivants, maintenant, jour });
  it('counts the work tickets only, never a mother nor an epic', () => {
    expect(t.global.compteurs).toEqual({
      enCours: 1,
      prets: 1,
      bloques: 1,
      aValider: 1,
      reportes: 0,
      fermes: 2,
    });
  });
  it('measures the day and the whole, a finished agent once even while its transcript still moves', () => {
    expect(t.global.cumul).toEqual({ travail: 1_860_000, jetons: 1350 });
    expect(t.global.jour).toEqual({ travail: 1_800_000, jetons: 1300 });
  });
  it('keeps the chantier with work in progress, its tree done over all, the others in one line', () => {
    expect(t.chantiers.map((c: { numero: string }) => c.numero)).toEqual(['c']);
    const [ch] = t.chantiers;
    expect([ch.faits, ch.total, ch.jetons]).toEqual([1, 5, 1350]);
    expect(ch.enfants[0]).toMatchObject({
      numero: 'c.1',
      mere: true,
      etat: 'enCours',
      faits: 1,
      total: 2,
    });
    expect(ch.enfants[1]).toMatchObject({ etat: 'bloques', bloquePar: ['c.1.1'] });
    expect(t.autres).toEqual([{ id: 'demo-z', numero: 'z', faits: 1, total: 1 }]);
  });
  it('puts each ticket in one place: running under its role, else waiting for the next one', () => {
    const b = (n: number) => t.agents[n - 1];
    expect(b(4).enCours).toEqual([
      expect.objectContaining({ numero: 'c.1.1', composant: 'moteur', ligne: true }),
    ]);
    expect(b(3).enCours).toEqual([]);
    expect(b(4).attend).toEqual(['c.3']);
    expect(b(3).attend).toEqual([]);
    expect(t.agents.flatMap((x: { attend: string[] }) => x.attend)).not.toContain('c.4');
  });
  it('lists the tickets closed today', () => {
    expect(t.faitsDuJour).toEqual(['c.1.2']);
  });
  it('alerts on a decision awaited, a silent shell agent, a ticket in progress without anything running', () => {
    const textes = t.alertes.map((a: { texte: string }) => a.texte);
    expect(textes).toContain('1 ticket(s) attendent ta décision');
    expect(textes.some((x: string) => /c\.1\.1, agent 4 silencieux/.test(x))).toBe(true);
    const seul = plateau({
      tous: [
        T('demo-x', {
          status: 'in_progress',
          started_at: new Date(maintenant - SANS_AGENT - 1).toISOString(),
        }),
      ],
      prefix: 'demo',
      registre: [],
      vivants: [],
      maintenant,
      jour,
    });
    expect(seul.alertes.map((a: { texte: string }) => a.texte)).toEqual([
      'x en cours sans rien qui tourne',
    ]);
  });
  it('draws lines no wider than the pane, the tree folded per level', () => {
    const l = dessin(t);
    for (const x of l) {
      expect([...x.texte].length).toBeLessThanOrEqual(LARGEUR);
    }
    const texte = l.map((x: { texte: string }) => x.texte).join('\n');
    expect(texte).toMatch(/CHANTIER c — Le chantier/);
    expect(texte).toMatch(/c\.1 {2}Une mère +1\/2 ▶/);
    expect(texte).toMatch(/\+ 1 prêts · 1 bloqués/);
    expect(texte).toMatch(/4 développeur +▶ c\.1\.1 moteur ⌁/);
    expect(texte).toMatch(/autres : z 1\/1/);
  });
});
