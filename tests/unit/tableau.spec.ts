import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  assembler,
  dernierBouge,
  etape,
  fiches,
  lecture,
  lignes as lignesRepliees,
  lignesEtats,
  lireRegistre,
  lireTranscription,
  lireVivant,
  LARGEUR,
  SANS_AGENT,
  SILENCE,
  verdict,
} from '../../scripts/tableau.mjs';

// The board's lines with each folded group unfolded in place: the lines the tests of the tree read.
const lignes = (t: unknown, nom: string, largeur?: number) => {
  const groupes: Record<string, { groupe?: string }[]> = {};
  return (lignesRepliees(t, nom, largeur, groupes) as { groupe?: string }[]).flatMap(l =>
    l.groupe ? groupes[l.groupe] : [l]
  );
};

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

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
  agents: { enCours: object[]; attend: { numero: string; sujet: string }[] }[];
  faitsDuJour: object[];
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
  it('reads the components « a, b » of a ticket that touches several, in their order', () => {
    expect(
      lecture(
        {
          id: 'bp-mono-vbwf.320.5.2',
          title: '320.5.2 — Publie la scène — 020-loader, 050-emitter',
        },
        'bp-mono'
      )
    ).toEqual({
      numero: '320.5.2',
      sujet: 'Publie la scène',
      composant: '020-loader, 050-emitter',
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
  it('reads only the roles of the flow, a passage under a name or no role skipped', () => {
    expect(
      etape(
        [p('relecteur', '2026-10-10T12:00:00Z'), p('demo-agent-2-liste', '2026-10-10T12:30:00Z')],
        { verdict: 'RENDU', date: Date.parse('2026-10-10T12:00:00Z') }
      )
    ).toBe('developpeur');
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
  const home = mkdtempSync(path.join(ESSAIS, 'home-'));
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
  // The envelope's line, as lancer.sh starts it, its bwrap and the claude inside it, which name no ticket.
  const ps = [
    '  77  600 node /depot/scripts/enveloppe/enveloppe.mjs /depot/.claude/worktrees/demo-3.1 . developpeur -- claude -p --agent developpeur --permission-mode bypassPermissions',
    '  79  600 bwrap --die-with-parent --chdir /depot/.claude/worktrees/demo-3.1 -- claude -p --agent developpeur --permission-mode bypassPermissions',
    '  80  600 claude -p --agent developpeur --permission-mode bypassPermissions',
    '  81  600 node /ailleurs/scripts/enveloppe/enveloppe.mjs /ailleurs/.claude/worktrees/demo-5 . testeur -- claude -p --agent testeur',
    '  78 5 vim notes',
    '',
  ].join('\n');
  const v = lireVivant({ racine, home, prefix: 'demo', maintenant: Date.now(), ps });
  it('sees a shell agent by its process, measured on its copy transcript and marked', () => {
    expect(v.find(x => x.ticket === 'demo-3.1')).toMatchObject({
      role: 'developpeur',
      ligne: true,
      agent: 's1',
      jetons: 10,
    });
  });
  it('sees one line per shell agent, and none of another repository', () => {
    expect(v.filter(x => x.ligne)).toEqual([expect.objectContaining({ ticket: 'demo-3.1' })]);
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
  // A fixture ticket is in the circuit (label `circuit`): the owner launched it.
  const T = (id: string, o: object = {}) => ({
    id,
    title: id,
    status: 'open',
    priority: 2,
    issue_type: 'task',
    labels: ['circuit'],
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
      labels: [],
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
      enAttente: 1,
      bloques: 0,
      fermes: 2,
      sansGo: 1,
      aValider: 1,
      reportes: 0,
    });
  });
  it('counts a ticket in progress as work, a discovery under it notwithstanding', () => {
    const u = plateau({
      tous: [
        T('demo-d', { status: 'in_progress', title: 'd — Tenu' }),
        T('demo-d.1', { parent: 'demo-d', labels: ['a-valider'] }),
      ],
      prefix: 'demo',
      registre: [],
      vivants: [],
      maintenant,
      jour,
    });
    expect(u.global.compteurs).toMatchObject({ enCours: 1, aValider: 1 });
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
    expect(ch.enfants[1]).toMatchObject({ etat: 'sansGo', bloquePar: ['c.1.1'] });
    expect(t.autres).toEqual([
      { id: 'demo-z', numero: 'z', sujet: 'Un autre', faits: 1, total: 1 },
    ]);
  });
  it('puts each ticket in one place: running under its role, else waiting for the next one', () => {
    const b = (n: number) => t.agents.find((x: { numero: number }) => x.numero === n)!;
    expect(b(4).enCours).toEqual([
      expect.objectContaining({ numero: 'c.1.1', composant: 'moteur', ligne: true }),
    ]);
    expect(b(3).enCours).toEqual([]);
    expect(b(4).attend).toEqual([
      {
        id: 'demo-c.3',
        numero: 'c.3',
        sujet: 'demo-c.3',
        bloquePar: [],
        travail: 60_000,
        jetons: 50,
      },
    ]);
    expect(b(3).attend).toEqual([]);
    expect(t.agents.flatMap(x => x.attend.map(y => y.numero))).not.toContain('c.4');
  });
  it('lists the tickets closed today', () => {
    expect(t.faitsDuJour).toEqual([
      { id: 'demo-c.1.2', numero: 'c.1.2', sujet: 'demo-c.1.2', travail: 0, jetons: 0 },
    ]);
  });
  it('alerts on a silent shell agent and a ticket in progress without anything running, never on a decision awaited', () => {
    const textes = t.alertes.map((a: { texte: string }) => a.texte);
    expect(textes.some((x: string) => /décision/.test(x))).toBe(false);
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
  it('draws lines no wider than the pane, every open ticket of the chantier under its state', () => {
    const l = dessin(t);
    for (const x of l) {
      expect([...x.texte].length).toBeLessThanOrEqual(LARGEUR);
    }
    const marquees = l.filter((x: { ticket?: string }) => x.ticket);
    expect(marquees.find(x => x.texte.includes('c.1.1'))?.ticket).toBe('demo-c.1.1');
    expect(l.find((x: { texte: string }) => x.texte.startsWith('AGENTS'))).not.toHaveProperty(
      'ticket'
    );
    const texte = l.map((x: { texte: string }) => x.texte).join('\n');
    expect(texte).toMatch(/CHANTIER c — Le chantier/);
    expect(texte).toMatch(/\n {2}en cours +1\n {3}c\.1 {2}Une mère +1\/2 · 1 k\n/);
    // A ticket the agents' blocks show is not drawn again in the chantier's tree, nor counted.
    expect(texte.match(/c\.1\.1 {2}Écrit/g)).toHaveLength(1);
    expect(texte.match(/c\.3 {2}demo-c\.3/g)).toHaveLength(1);
    expect(texte).toMatch(/\n {2}sans go +1\n {3}c\.2 {2}demo-c\.2\n/);
    expect(texte).toMatch(/\n4 développeur\n▶ c\.1\.1 {2}Écrit/);
    expect(texte).toMatch(/\n4 développeur[\s\S]*\n· c\.3 {2}demo-c\.3 +1 min · 50\n/);
    expect(texte).toMatch(/\n1 explorateur {2}—\n/);
    expect(texte).toMatch(/✓ c\.1\.2 {2}demo-c\.1\.2/);
    expect(texte).toMatch(/\nAUTRES CHANTIERS +1\nz {2}Un autre +1\/1\n/);
  });
  it('heads the board with two lines of states, the circuit then what waits for the owner', () => {
    const l = dessin(t).map(x => x.texte);
    expect(l[1]).toBe('▶ 1 en cours · 1 en attente · 0 bloqués · 2 faits');
    expect(l[2]).toBe('1 sans go · 1 à valider · 0 reportés');
    expect((dessin(t)[2] as { ton?: string }).ton).toBe('attention');
  });
  it('lists each state, its meaning and the tickets of the chantier in progress one per line in the states view', () => {
    const v = lignesEtats(t) as { texte: string; ticket?: string; section: string }[];
    const titres = v.filter(x => !x.ticket && x.texte.trim() && x.texte.trim() !== '—');
    expect(titres.map(x => x.texte.split(' — ')[0])).toEqual([
      'EN COURS',
      'EN ATTENTE',
      'BLOQUÉ',
      'SANS GO',
      'À VALIDER',
      'REPORTÉ',
      'FAIT',
    ]);
    expect(v.find(x => x.texte.startsWith('EN ATTENTE'))?.texte).toMatch(
      /^EN ATTENTE — ton go, prêt à partir +1$/
    );
    const sous = (titre: string) => {
      const i = v.findIndex(x => x.texte.startsWith(titre));
      const j = v.findIndex((x, n) => n > i && !x.texte.trim());
      return v.slice(i + 1, j < 0 ? undefined : j).map(x => x.ticket ?? x.texte.trim());
    };
    expect(sous('EN ATTENTE')).toEqual(['demo-c.3']);
    expect(sous('SANS GO')).toEqual(['demo-c.2']);
    expect(sous('BLOQUÉ')).toEqual(['—']);
    // The done tickets, the last closed first; demo-z.1, outside the chantier in progress, is
    // counted but not listed.
    expect(sous('FAIT')).toEqual(['demo-c.1.2']);
    expect(t.global.compteurs.fermes).toBe(2);
    expect(new Set(v.map(x => x.section))).toEqual(new Set(['etats']));
    for (const x of v) {
      expect([...x.texte].length).toBeLessThanOrEqual(LARGEUR);
    }
  });
  it("shows each ticket's time and tokens in the states view, as the board does", () => {
    const v = (lignesEtats(t) as { texte: string }[]).map(x => x.texte);
    expect(v).toContainEqual(expect.stringMatching(/^ {2}c\.3 {2}demo-c\.3 +1 min · 50$/));
    expect(v).toContainEqual(expect.stringMatching(/^ {2}c\.1\.1 {2}Écrit +\d+ min · [\d,]+ k$/));
    expect(v).toContain('  c.1.2  demo-c.1.2');
  });
  it('keeps a done ticket its agents worked, with its time and tokens, its discoveries notwithstanding', () => {
    const u = plateau({
      tous: [
        T('demo-d', {
          issue_type: 'epic',
          title: 'd — Le chantier — parent',
          status: 'in_progress',
        }),
        T('demo-d.1', {
          parent: 'demo-d',
          status: 'closed',
          closed_at: '2026-10-10T09:00:00Z',
          title: 'd.1 — Livré — scripts',
        }),
        T('demo-d.1.1', {
          parent: 'demo-d.1',
          status: 'closed',
          closed_at: '2026-10-10T08:00:00Z',
          labels: ['decouverte'],
        }),
        T('demo-d.2', { parent: 'demo-d' }),
      ],
      prefix: 'demo',
      registre: [
        {
          agent: 'a',
          ticket: 'demo-d.1',
          role: 'developpeur',
          fin: '2026-10-10T08:30:00Z',
          travail: 60_000,
          jetons: 50,
        },
      ],
      vivants: [],
      maintenant,
      jour,
    });
    expect(u.global.compteurs.fermes).toBe(2);
    expect((lignesEtats(u) as { texte: string }[]).map(x => x.texte)).toContainEqual(
      expect.stringMatching(/^ {2}d\.1 {2}Livré +1 min · 50$/)
    );
    expect(u.faitsDuJour.map(x => (x as { id: string }).id)).toContain('demo-d.1');
  });
  it('shows no time nor tokens on a ticket line at 0 min and 0 tokens', () => {
    const l = dessin(t).map(x => x.texte);
    expect(l).toContain('✓ c.1.2  demo-c.1.2');
  });
  it('waits a blocked ticket in the circuit under the manager, naming the ticket it waits for', () => {
    const b = plateau({
      tous: [
        T('demo-e', { issue_type: 'epic', status: 'in_progress', title: 'e — Bloqué' }),
        T('demo-e.1', { parent: 'demo-e' }),
        T('demo-e.2', {
          parent: 'demo-e',
          dependencies: [{ type: 'blocks', depends_on_id: 'demo-e.1' }],
        }),
      ],
      prefix: 'demo',
      registre: [],
      vivants: [],
      maintenant,
      jour,
    });
    expect(b.global.compteurs).toMatchObject({ enAttente: 1, bloques: 1 });
    const l = dessin(b).map(x => x.texte);
    const i = l.indexOf('0 chef de chantier');
    expect(l[i + 2]).toMatch(/^· e\.2 {2}demo-e\.2 +attend e\.1$/);
  });
});

describe('chantiers', () => {
  const T = (id: string, o: object = {}) => ({
    id,
    title: id,
    status: 'open',
    priority: 2,
    issue_type: 'task',
    ...o,
  });
  const avec = (...tous: object[]) =>
    dessin(
      plateau({
        tous,
        prefix: 'demo',
        registre: [],
        vivants: [],
        maintenant: Date.parse('2026-10-10T12:00:00Z'),
        jour: Date.parse('2026-10-10T00:00:00Z'),
      })
    ) as {
      texte: string;
      ticket?: string;
      chantier?: boolean;
      ton?: string;
    }[];
  const a = T('demo-a', { issue_type: 'epic', title: 'a — Premier' });
  const b = T('demo-b', { issue_type: 'epic', title: 'b — Second' });
  const b1 = T('demo-b.1', { parent: 'demo-b', status: 'closed' });
  it('3uv.24 critère 1 : an epic in progress is a chantier in progress without a ticket in progress', () => {
    const l = avec({ ...a, status: 'in_progress' });
    expect(l.find(x => x.texte.startsWith('CHANTIER a'))).toMatchObject({
      ticket: 'demo-a',
      chantier: true,
    });
  });
  it('with none in progress, « CHANTIERS » titles the epics, one per line', () => {
    const l = avec(a, b, b1);
    const i = l.findIndex(x => x.texte.startsWith('CHANTIERS'));
    expect(l[i].texte).toMatch(/ 2$/);
    expect(l.slice(i + 1, i + 3).map(x => x.ticket)).toEqual(['demo-a', 'demo-b']);
    expect(l[i + 2].texte).toMatch(/^b {2}Second +1\/1$/);
    expect(l.slice(i + 1, i + 3).every(x => x.chantier)).toBe(true);
  });
  it('with one in progress, « AUTRES CHANTIERS » titles the others, one per line', () => {
    const c = T('demo-c', { issue_type: 'epic', title: 'c — Troisième' });
    const l = avec({ ...a, status: 'in_progress' }, b, c);
    const i = l.findIndex(x => x.texte.startsWith('AUTRES CHANTIERS'));
    expect(l[i].texte).toMatch(/ 2$/);
    expect(l.slice(i + 1, i + 3).map(x => x.ticket)).toEqual(['demo-b', 'demo-c']);
  });
  it('3uv.24 critère 4 : every epic line has its card', () => {
    const l = avec(a, b, b1);
    expect(Object.keys(fiches([a, b, b1], l, 'demo')).sort()).toEqual(['demo-a', 'demo-b']);
  });
  it('3uv.24 critère 7 : an epic set back to open stays in progress while a ticket of it is', () => {
    const l = avec(a, T('demo-a.1', { parent: 'demo-a', status: 'in_progress' }));
    expect(l.some(x => x.texte.startsWith('CHANTIER a'))).toBe(true);
  });
});

describe('a ticket in progress with children', () => {
  it('unfolds its children in the tree, even while an agent block shows it', () => {
    // A fixture ticket is in the circuit (label `circuit`): the owner launched it.
    const T = (id: string, o: object = {}) => ({
      id,
      title: id,
      status: 'open',
      priority: 2,
      issue_type: 'task',
      labels: ['circuit'],
      ...o,
    });
    const t = plateau({
      tous: [
        T('demo-e', { issue_type: 'epic', title: 'e — Le chantier' }),
        T('demo-m', { parent: 'demo-e', status: 'in_progress', title: 'm — La mère en cours' }),
        T('demo-m.1', {
          parent: 'demo-m',
          status: 'in_progress',
          title: 'm.1 — L’enfant en cours',
        }),
      ],
      prefix: 'demo',
      registre: [
        {
          agent: 'a',
          ticket: 'demo-m',
          role: 'testeur',
          fin: '2026-10-10T10:00:00Z',
          travail: 1,
          jetons: 1,
        },
      ],
      vivants: [],
      maintenant: Date.parse('2026-10-10T12:00:00Z'),
      jour: Date.parse('2026-10-10T00:00:00Z'),
    });
    const texte = dessin(t)
      .map(x => x.texte)
      .join('\n');
    expect(texte).toMatch(/\n4 développeur\n· m {2}La mère en cours/);
    expect(texte).toMatch(/\n {2}en cours +1\n {3}m\.1 {2}L’enfant en cours/);
  });
});

describe('dernierBouge', () => {
  const T = (id: string, updated_at: string) => ({ id, title: id, status: 'open', updated_at });
  const lignesDe = (...ids: string[]) => ids.map(ticket => ({ texte: ticket, ticket }));
  const maintenant = Date.parse('2026-10-10T12:00:00Z');
  it('names the ticket of the lines updated last', () => {
    const tous = [
      T('d-1', '2026-10-10T09:00:00Z'),
      T('d-2', '2026-10-10T11:00:00Z'),
      T('d-3', '2026-10-10T11:30:00Z'),
    ];
    expect(dernierBouge(tous, lignesDe('d-1', 'd-2'), [], maintenant)).toBe('d-2');
  });
  it("counts a running agent's ticket at its last activity", () => {
    const tous = [T('d-1', '2026-10-10T08:00:00Z'), T('d-2', '2026-10-10T11:00:00Z')];
    const vivants = [{ ticket: 'd-1', silence: 60_000 }];
    expect(dernierBouge(tous, lignesDe('d-1', 'd-2'), vivants, maintenant)).toBe('d-1');
  });
  it('names none without a ticket line', () => {
    expect(
      dernierBouge([T('d-1', '2026-10-10T09:00:00Z')], [{ texte: 'X' }], [], maintenant)
    ).toBeNull();
  });
});

describe('fiches', () => {
  it("gives a ticket its agents' working time and tokens, never the time since it was claimed", () => {
    const tous = [
      {
        id: 'demo-a',
        title: 'a — Un ticket qui a dormi la nuit',
        status: 'in_progress',
        started_at: new Date(Date.now() - 7 * 3_600_000).toISOString(),
      },
    ];
    const f = fiches(tous, [{ texte: 'x', ticket: 'demo-a' }], 'demo', {
      'demo-a': { travail: 17 * 60_000, jetons: 900 },
    });
    expect(f['demo-a']).toMatchObject({ travail: 17 * 60_000, jetons: 900 });
  });
  it('gives each ticket a line names its whole title, its state and the start of its description, never its whole text', () => {
    const tous = [
      {
        id: 'demo-a',
        title: 'a — Un titre entier — moteur',
        status: 'open',
        description: '## Architecture\nLe modèle mûr.\n\nSuite.',
      },
      { id: 'demo-b', title: 'b — Hors du tableau', status: 'open' },
    ];
    expect(fiches(tous, [{ texte: 'x', ticket: 'demo-a' }, { texte: 'y' }], 'demo')).toEqual({
      'demo-a': {
        numero: 'a',
        titre: 'Un titre entier',
        composant: 'moteur',
        statut: 'open',
        travail: 0,
        jetons: 0,
        resume: 'Le modèle mûr. Suite.',
      },
    });
  });
});
