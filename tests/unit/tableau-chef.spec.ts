// The site manager (role 0) on the board (grillhouse-3uv.49): its block heads the agents, a
// manager running on a ticket stands in it with its time and tokens, the agents it launches are
// tied to their ticket and role as the supervisor's are, and a ticket it leads waits for no role
// of the flow. A sub-agent, whatever its role, runs when its transcript moved in the last 2
// minutes, or while its last tool call awaits its answer, its transcript moved in the last 30
// minutes and no end in the register follows its last incoming message; a session keeps the
// 2-minute rule alone. The board reads no transcript older than 30 minutes: a shell agent shows by
// its process alone. A project whose roles leave the manager out keeps its board.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { ligne as ligneDuRegistre } from '../../scripts/registre.mjs';
import { assembler, lignes, lireVivant, tableau } from '../../scripts/tableau.mjs';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-chef-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = '/depot';
const CHEF = 'chef-de-chantier';
const MIN = 60_000;
const SEC = 1000;
const l = (o: object) => JSON.stringify(o);
const at = (hm: string) => `2026-10-11T${hm}:00Z`;
const ilYa = (ms: number) => new Date(Date.now() - ms).toISOString();
const ANCIENS = ['explorateur', 'arbitre', 'testeur', 'developpeur', 'relecteur', 'integrateur'];

// A transcript: its prompt « TON TICKET : <ticket> » at 08:00, then `n` answers of 10 tokens.
const transcription = (ticket: string, n: number) =>
  [
    l({
      type: 'user',
      timestamp: at('08:00'),
      message: { content: `TON TICKET : ${ticket}\n\nMène le ticket.` },
    }),
    ...Array.from({ length: n }, (_, i) =>
      l({
        type: 'assistant',
        timestamp: at(`08:${String(10 + i).padStart(2, '0')}`),
        message: { id: `m${i}`, usage: { input_tokens: 6, output_tokens: 4 } },
      })
    ),
  ].join('\n');

const nouveauHome = () => mkdtempSync(path.join(ESSAIS, 'home-'));
const sousAgents = (home: string, session = 'sess') => {
  const d = path.join(home, '.claude/projects/-depot', session, 'subagents');
  mkdirSync(d, { recursive: true });
  return d;
};
// A sub-agent's transcript `texte` and its meta file, the file last moved `silence` ms ago.
const ecrire = (
  home: string,
  id: string,
  meta: object,
  texte: string,
  silence = 0,
  session = 'sess'
) => {
  const d = sousAgents(home, session);
  const f = path.join(d, `agent-${id}.jsonl`);
  writeFileSync(f, texte);
  writeFileSync(path.join(d, `agent-${id}.meta.json`), l(meta));
  const quand = (Date.now() - silence) / 1000;
  utimesSync(f, quand, quand);
  return f;
};
// A sub-agent of a session: its transcript on `ticket` with `n` answers and its meta file.
const sousAgent = (
  home: string,
  id: string,
  meta: object,
  ticket: string,
  n: number,
  silence = 0,
  session = 'sess'
) => ecrire(home, id, meta, transcription(ticket, n), silence, session);
// A role agent launched in a shell (lancer.sh), working in its copy: its process line.
const agentShell = (home: string, session: string, role: string, ticket: string) => {
  const copie = path.join(home, `.claude/projects/-depot--claude-worktrees-${ticket}`);
  mkdirSync(copie, { recursive: true });
  writeFileSync(
    path.join(copie, `${session}.jsonl`),
    [l({ type: 'agent-setting', agentSetting: role }), transcription(ticket, 1)].join('\n')
  );
  return `  4242  300 claude -p TON TICKET : ${ticket} --agent ${role}\n`;
};
const vivants = (home: string, ps = '', cache: Record<string, unknown> = {}) =>
  lireVivant({ racine: RACINE, home, prefix: 'demo', maintenant: Date.now(), ps, cache });

// A fixture ticket is in the circuit (label `circuit`): the owner launched it.
const T = (id: string, o: object = {}) => ({
  id,
  title: id,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: at('07:00'),
  labels: ['circuit'],
  ...o,
});
const fin = (agent: string, ticket: string, role: string, hm: string, jetons = 10) => ({
  projet: RACINE,
  agent,
  ticket,
  role,
  debut: at('08:00'),
  fin: at(hm),
  travail: Date.parse(at(hm)) - Date.parse(at('08:00')),
  jetons,
  cache: 0,
  cout: null,
});
interface Entree {
  id: string;
  jetons: number;
  travail: number;
}
interface Bloc {
  numero: number;
  role: string;
  enCours: Entree[];
  attend: { id: string }[];
}
interface Board {
  agents: Bloc[];
}
interface Ligne {
  texte: string;
  ton?: string;
  ticket?: string;
  section?: string;
}
const MAINTENANT = Date.parse(at('12:00'));
const vivant = (agent: string, ticket: string, role: string, jetons = 40, o: object = {}) => ({
  agent,
  ticket,
  role,
  ligne: false,
  depuis: MAINTENANT - 30 * MIN,
  entre: null,
  jetons,
  travail: 20 * MIN,
  tours: [[MAINTENANT - 20 * MIN, MAINTENANT]],
  ...o,
});
const plateau = (
  tous: object[],
  registre: object[],
  enVie: object[],
  o: { roles?: string[]; verdicts?: object } = {}
): Board =>
  assembler({
    tous,
    prefix: 'demo',
    registre,
    vivants: enVie,
    verdicts: o.verdicts ?? {},
    ...(o.roles ? { roles: o.roles } : {}),
    maintenant: MAINTENANT,
    jour: MAINTENANT - 24 * 60 * MIN,
  }) as Board;
// The board of now, from the transcripts of `home`, the process list and the register.
const plateauVivant = (home: string, tous: object[], registre: object[] = [], ps = ''): Board => {
  const maintenant = Date.now();
  return assembler({
    tous,
    prefix: 'demo',
    registre,
    vivants: lireVivant({ racine: RACINE, home, prefix: 'demo', maintenant, ps }),
    maintenant,
    jour: maintenant - 24 * 60 * MIN,
  }) as Board;
};
const bloc = (t: Board, role: string) => t.agents.find(b => b.role === role);
const enCours = (t: Board, role: string) => (bloc(t, role)?.enCours ?? []).map(x => x.id);
const attentes = (t: Board) => t.agents.flatMap(b => b.attend.map(x => x.id));
// The lines of AGENTS: the lines of section agents from the blank line above its title, the head
// above it left out.
const agentsTextes = (t: Board) => {
  const out = (lignes(t, 'depot') as Ligne[]).filter(x => x.section === 'agents');
  return out.slice(out.findIndex(x => x.texte.startsWith('AGENTS')) - 1);
};
const pane = (t: Board) => agentsTextes(t).map(x => x.texte);

describe('3uv.49 critère 1 : the block of role 0, the site manager, heads the agents', () => {
  it('3uv.49 critère 1 : by default the first block is the site manager, numbered 0, the others keep 1 to 6', () => {
    const t = plateau([], [], []);
    expect(t.agents.map(b => [b.numero, b.role])).toEqual([
      [0, CHEF],
      [1, 'explorateur'],
      [2, 'arbitre'],
      [3, 'testeur'],
      [4, 'developpeur'],
      [5, 'relecteur'],
      [6, 'integrateur'],
    ]);
  });

  it('3uv.49 critère 1 : a site manager running on a ticket stands in progress in block 0, with its time and tokens', () => {
    const t = plateau(
      [T('demo-9', { title: '9 — Le panneau — tableau' })],
      [],
      [vivant('c0', 'demo-9', CHEF, 40)]
    );
    expect(bloc(t, CHEF)!.enCours).toMatchObject([{ id: 'demo-9', jetons: 40, travail: 20 * MIN }]);
    const a = agentsTextes(t);
    const i = a.findIndex(x => /^0 /.test(x.texte));
    expect(a[i].ton).toBe('titre');
    expect(a[i + 1]).toMatchObject({ ton: 'actif', ticket: 'demo-9' });
    expect(a[i + 1].texte).toMatch(/^▶ 9 {2}Le panneau +20 min · 40$/);
  });

  it('3uv.49 critère 1 : a site manager whose register end no message follows is finished, not in progress', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('c0', 'demo-9', CHEF, '09:00', 40)],
      [vivant('c0', 'demo-9', CHEF, 40, { entre: Date.parse(at('08:00')) })]
    );
    expect(enCours(t, CHEF)).toEqual([]);
  });

  it('3uv.49 critère 1 : a sub-agent of type chef-de-chantier, recent, runs as role 0 on its ticket', () => {
    const home = nouveauHome();
    sousAgent(home, 'c1', { agentType: CHEF }, 'demo-9', 3);
    expect(vivants(home).find(v => v.agent === 'c1')).toMatchObject({
      role: CHEF,
      ticket: 'demo-9',
      ligne: false,
      jetons: 30,
    });
  });

  it('3uv.49 critère 1 : a named teammate spawned as chef-de-chantier runs as role 0, never under its name', () => {
    const home = nouveauHome();
    sousAgent(
      home,
      'c2',
      { agentType: 'demo-9-agent-0', name: 'demo-9-agent-0', spawnedAgentType: CHEF },
      'demo-9',
      2
    );
    expect(vivants(home).find(v => v.agent === 'c2')).toMatchObject({
      role: CHEF,
      ticket: 'demo-9',
    });
  });

  it('3uv.49 critère 1 : a finished manager has its register line, role 0 and its ticket', () => {
    const home = nouveauHome();
    sousAgent(home, 'cf', { agentType: CHEF }, 'demo-9', 4);
    expect(ligneFinie(home, 'cf')).toMatchObject({
      agent: 'cf',
      ticket: 'demo-9',
      role: CHEF,
      jetons: 40,
    });
  });
});

describe('3uv.49 critère 2 : the agents a manager launches are tied to their ticket and role', () => {
  it('3uv.49 critère 2 : a reviewer launched by a manager, in the same session, runs under its role on its ticket', () => {
    const home = nouveauHome();
    sousAgent(home, 'c10', { agentType: CHEF }, 'demo-9', 2);
    sousAgent(home, 'r10', { agentType: 'relecteur', parentAgentId: 'c10' }, 'demo-9', 1);
    expect(vivants(home).find(x => x.agent === 'r10')).toMatchObject({
      role: 'relecteur',
      ticket: 'demo-9',
      ligne: false,
    });
  });

  it('3uv.49 critère 2 : an integrator launched by a manager, finished, has its register line under its role', () => {
    const home = nouveauHome();
    sousAgent(home, 'i11', { agentType: 'integrateur', parentAgentId: 'c11' }, 'demo-9', 2);
    expect(ligneFinie(home, 'i11')).toMatchObject({
      agent: 'i11',
      ticket: 'demo-9',
      role: 'integrateur',
    });
  });

  it('3uv.49 critère 2 : the tester a manager launches in a shell runs under its role, the manager no longer listed', () => {
    const home = nouveauHome();
    sousAgent(home, 'c13', { agentType: CHEF }, 'demo-9', 2);
    const ps = agentShell(home, 's-t13', 'testeur', 'demo-9');
    const t = plateauVivant(home, [T('demo-9')], [], ps);
    expect(enCours(t, 'testeur')).toEqual(['demo-9']);
    expect(enCours(t, CHEF)).toEqual([]);
  });
});

describe('3uv.49 critère 3 : a ticket a running manager leads waits for no role', () => {
  it('3uv.49 critère 3 : after its tester finished, the ticket is in progress under the manager, not waiting for the developer', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('t1', 'demo-9', 'testeur', '09:00')],
      [vivant('c0', 'demo-9', CHEF)]
    );
    expect(attentes(t)).not.toContain('demo-9');
    expect(enCours(t, CHEF)).toEqual(['demo-9']);
  });

  it('3uv.49 critère 3 : after an accepted review, the ticket does not wait for the integrator while its manager runs', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('t1', 'demo-9', 'testeur', '09:00'), fin('d1', 'demo-9', 'developpeur', '10:00')],
      [vivant('c0', 'demo-9', CHEF)],
      { verdicts: { 'demo-9': { verdict: 'ACCEPTÉ', date: Date.parse(at('10:30')) } } }
    );
    expect(attentes(t)).not.toContain('demo-9');
    expect(enCours(t, CHEF)).toEqual(['demo-9']);
  });

  it('3uv.49 critère 3 : an open ticket with no passage does not wait for the tester while its manager runs', () => {
    const t = plateau([T('demo-9', { status: 'open' })], [], [vivant('c0', 'demo-9', CHEF)]);
    expect(attentes(t)).not.toContain('demo-9');
    expect(enCours(t, CHEF)).toEqual(['demo-9']);
  });

  it('with its tester running too, the ticket is in progress under the tester alone, waiting nowhere', () => {
    const t = plateau(
      [T('demo-9')],
      [],
      [vivant('c0', 'demo-9', CHEF), vivant('s1', 'demo-9', 'testeur', 10, { ligne: true })]
    );
    expect(attentes(t)).not.toContain('demo-9');
    expect(enCours(t, 'testeur')).toEqual(['demo-9']);
    expect(enCours(t, CHEF)).toEqual([]);
  });

  it('3uv.49 critère 3 : a ticket without a manager still waits for the next role of the flow', () => {
    const t = plateau(
      [T('demo-9'), T('demo-10')],
      [fin('t1', 'demo-9', 'testeur', '09:00'), fin('t2', 'demo-10', 'testeur', '09:00')],
      [vivant('c0', 'demo-9', CHEF)]
    );
    expect(bloc(t, 'developpeur')!.attend.map(x => x.id)).toEqual(['demo-10']);
  });
});

describe('3uv.49 critère 4 : a project whose roles leave the manager out keeps its board', () => {
  it('3uv.49 critère 4 : its agents section draws exactly the lines of before, blocks 1 to 6', () => {
    const a = pane(plateau([], [], [], { roles: ANCIENS }));
    expect(a).toEqual([
      '',
      'AGENTS  ▶ en cours · en attente',
      '1 explorateur  —',
      '2 arbitre  —',
      '3 testeur  —',
      '4 développeur  —',
      '5 relecteur  —',
      '6 intégrateur  —',
    ]);
  });

  it('3uv.49 critère 4 : a shorter list of roles numbers its blocks from 1, in its order', () => {
    const t = plateau([], [], [], { roles: ['testeur', 'developpeur'] });
    expect(t.agents.map(b => [b.numero, b.role])).toEqual([
      [1, 'testeur'],
      [2, 'developpeur'],
    ]);
  });

  it('3uv.49 critère 4 : a ticket waits for its next role as before, a developer running stands under its block', () => {
    const t = plateau(
      [T('demo-9'), T('demo-10')],
      [fin('t1', 'demo-9', 'testeur', '09:00')],
      [vivant('d2', 'demo-10', 'developpeur')],
      { roles: ANCIENS }
    );
    expect(bloc(t, 'developpeur')!.attend.map(x => x.id)).toEqual(['demo-9']);
    expect(enCours(t, 'developpeur')).toEqual(['demo-10']);
    expect(t.agents.find(b => b.role === CHEF)).toBeUndefined();
  });
});

// A transcript whose prompt names no ticket (an Explore a manager launches), then `n` answers.
const sansTicket = (n: number) =>
  [
    l({ type: 'user', timestamp: at('08:00'), message: { content: 'Cherche les appelants.' } }),
    ...Array.from({ length: n }, (_, i) =>
      l({
        type: 'assistant',
        timestamp: at(`08:${String(10 + i).padStart(2, '0')}`),
        message: { id: `x${i}`, usage: { input_tokens: 6, output_tokens: 4 } },
      })
    ),
  ].join('\n');
// A sub-agent whose prompt names no ticket, in the folder of `session`, last moved `silence` ago.
const sousAgentMuet = (
  home: string,
  id: string,
  meta: object,
  n: number,
  silence = 0,
  session = 'sess'
) => ecrire(home, id, meta, sansTicket(n), silence, session);
// The register's line of a finished sub-agent of `session`, read through the hook's input.
function ligneFinie(home: string, id: string, session = 'sess') {
  const d = sousAgents(home, session);
  const f = path.join(d, `agent-${id}.jsonl`);
  const meta = JSON.parse(readFileSync(f.replace(/\.jsonl$/, '.meta.json'), 'utf8')) as {
    agentType: string;
  };
  return ligneDuRegistre(
    {
      hook_event_name: 'SubagentStop',
      transcript_path: path.join(path.dirname(path.dirname(d)), `${session}.jsonl`),
      agent_id: id,
      agent_transcript_path: f,
      agent_type: meta.agentType,
    },
    readFileSync(f, 'utf8'),
    RACINE
  );
}
// A manager's id as the tool writes it, and the parent id its sub-agents carry.
const ID_CHEF = 'ademo-9-agent-0-4f3ac190df511767';

describe('3uv.49 critère 5 : an open ticket a manager led, with nothing running, waits under block 0', () => {
  it('3uv.49 critère 5 : after its manager and its tester finished, the ticket waits under 0, not for the developer', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('t1', 'demo-9', 'testeur', '09:00'), fin('c0', 'demo-9', CHEF, '11:00')],
      []
    );
    expect(bloc(t, CHEF)!.attend.map(x => x.id)).toEqual(['demo-9']);
    expect(attentes(t)).toEqual(['demo-9']);
  });

  it('3uv.49 critère 5 : a tester that ended after the manager does not take the ticket to the developer', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('c0', 'demo-9', CHEF, '09:00'), fin('t1', 'demo-9', 'testeur', '10:00')],
      []
    );
    expect(bloc(t, CHEF)!.attend.map(x => x.id)).toEqual(['demo-9']);
    expect(bloc(t, 'developpeur')!.attend).toEqual([]);
  });

  it('3uv.49 critère 5 : after an accepted review, the led ticket waits under 0, not for the integrator', () => {
    const t = plateau(
      [T('demo-9')],
      [
        fin('t1', 'demo-9', 'testeur', '09:00'),
        fin('d1', 'demo-9', 'developpeur', '10:00'),
        fin('c0', 'demo-9', CHEF, '11:00'),
      ],
      [],
      { verdicts: { 'demo-9': { verdict: 'ACCEPTÉ', date: Date.parse(at('10:30')) } } }
    );
    expect(attentes(t)).toEqual(['demo-9']);
    expect(bloc(t, CHEF)!.attend.map(x => x.id)).toEqual(['demo-9']);
  });

  it('3uv.49 critère 5 : a ready open ticket whose only passage is its manager waits under 0, not for the tester', () => {
    const t = plateau([T('demo-9', { status: 'open' })], [fin('c0', 'demo-9', CHEF, '09:00')], []);
    expect(attentes(t)).toEqual(['demo-9']);
    expect(bloc(t, CHEF)!.attend.map(x => x.id)).toEqual(['demo-9']);
  });

  it('3uv.49 critère 5 : the pane draws the led ticket once, as a waiting line under block 0', () => {
    const t = plateau(
      [T('demo-9', { title: '9 — Le panneau — tableau' })],
      [fin('t1', 'demo-9', 'testeur', '09:00'), fin('c0', 'demo-9', CHEF, '11:00')],
      []
    );
    const a = agentsTextes(t);
    const titre = a.findIndex(x => /^0 /.test(x.texte));
    expect(a[titre].ton).toBe('titre');
    expect(a[titre + 1]).toMatchObject({ ton: 'discret', ticket: 'demo-9' });
    expect(a[titre + 1].texte).toMatch(/^· 9 {2}Le panneau /);
    expect(a.filter(x => x.ticket === 'demo-9')).toHaveLength(1);
  });

  it('3uv.49 critère 5 : another ticket without a manager still waits for the next role of the flow', () => {
    const t = plateau(
      [T('demo-9'), T('demo-10')],
      [
        fin('t1', 'demo-9', 'testeur', '09:00'),
        fin('c0', 'demo-9', CHEF, '11:00'),
        fin('t2', 'demo-10', 'testeur', '09:00'),
      ],
      []
    );
    expect(bloc(t, 'developpeur')!.attend.map(x => x.id)).toEqual(['demo-10']);
    expect(bloc(t, CHEF)!.attend.map(x => x.id)).toEqual(['demo-9']);
  });

  it('3uv.49 critère 5 : a tester running on the led ticket holds it in progress, waiting nowhere', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('c0', 'demo-9', CHEF, '09:00')],
      [vivant('s1', 'demo-9', 'testeur', 10, { ligne: true })]
    );
    expect(enCours(t, 'testeur')).toEqual(['demo-9']);
    expect(attentes(t)).toEqual([]);
  });

  it('3uv.49 critère 5 : a manager resumed by a message after its end stands in progress, not waiting', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('c0', 'demo-9', CHEF, '09:00')],
      [vivant('c0', 'demo-9', CHEF, 40, { entre: Date.parse(at('11:00')) })]
    );
    expect(enCours(t, CHEF)).toEqual(['demo-9']);
    expect(attentes(t)).toEqual([]);
  });

  it('3uv.49 critère 5 : a closed, deferred or to-validate ticket a manager led waits nowhere', () => {
    const t = plateau(
      [
        T('demo-9', { status: 'closed', closed_at: at('11:30') }),
        T('demo-10', { status: 'deferred' }),
        T('demo-11', { labels: ['a-valider'] }),
      ],
      [
        fin('c0', 'demo-9', CHEF, '11:00'),
        fin('c1', 'demo-10', CHEF, '11:00'),
        fin('c2', 'demo-11', CHEF, '11:00'),
      ],
      []
    );
    expect(attentes(t)).toEqual([]);
  });
});

describe("3uv.49 critère 6 : a sub-agent of a manager's session naming no ticket takes its manager's", () => {
  it('3uv.49 critère 6 : running, an Explore launched by a manager stands on the ticket of its manager', () => {
    const home = nouveauHome();
    sousAgent(home, ID_CHEF, { agentType: CHEF }, 'demo-9', 2);
    sousAgentMuet(home, 'e1', { agentType: 'Explore', parentAgentId: ID_CHEF }, 3);
    expect(vivants(home).find(x => x.agent === 'e1')).toMatchObject({
      role: 'Explore',
      ticket: 'demo-9',
      jetons: 30,
    });
  });

  it('3uv.49 critère 6 : running, a sub-agent of a named manager spawned as chef-de-chantier takes its ticket', () => {
    const home = nouveauHome();
    sousAgent(
      home,
      'ademo-12-agent-0-0011',
      { agentType: 'demo-12-agent-0', name: 'demo-12-agent-0', spawnedAgentType: CHEF },
      'demo-12',
      2
    );
    sousAgentMuet(
      home,
      'e2',
      { agentType: 'general-purpose', parentAgentId: 'ademo-12-agent-0-0011' },
      1
    );
    expect(vivants(home).find(x => x.agent === 'e2')).toMatchObject({ ticket: 'demo-12' });
  });

  it('3uv.49 critère 6 : running, the sub-agent takes the ticket of its manager silent for 10 minutes', () => {
    const home = nouveauHome();
    sousAgent(home, ID_CHEF, { agentType: CHEF }, 'demo-9', 2, 10 * MIN);
    sousAgentMuet(home, 'e3', { agentType: 'Explore', parentAgentId: ID_CHEF }, 1);
    expect(vivants(home).find(x => x.agent === 'e3')).toMatchObject({ ticket: 'demo-9' });
  });

  it('3uv.49 critère 6 : on the board, the tokens of a running sub-agent count on the ticket of its manager', () => {
    const home = nouveauHome();
    sousAgent(home, ID_CHEF, { agentType: CHEF }, 'demo-9', 2);
    sousAgentMuet(home, 'e4', { agentType: 'Explore', parentAgentId: ID_CHEF }, 3);
    const t = plateauVivant(home, [T('demo-9')]);
    expect(bloc(t, CHEF)!.enCours).toMatchObject([{ id: 'demo-9', jetons: 50 }]);
  });

  it('3uv.49 critère 6 : finished, its register line holds the ticket of its manager and its own role', () => {
    const home = nouveauHome();
    sousAgent(home, ID_CHEF, { agentType: CHEF }, 'demo-9', 2, 10 * MIN);
    sousAgentMuet(home, 'e5', { agentType: 'Explore', parentAgentId: ID_CHEF }, 2, 5 * MIN);
    expect(ligneFinie(home, 'e5')).toMatchObject({
      agent: 'e5',
      ticket: 'demo-9',
      role: 'Explore',
      jetons: 20,
    });
  });

  it('3uv.49 critère 6 : a sub-agent of a manager whose prompt names its own ticket keeps it, running and finished', () => {
    const home = nouveauHome();
    sousAgent(home, ID_CHEF, { agentType: CHEF }, 'demo-9', 2);
    sousAgent(home, 'r7', { agentType: 'relecteur', parentAgentId: ID_CHEF }, 'demo-10', 1);
    expect(vivants(home).find(x => x.agent === 'r7')).toMatchObject({ ticket: 'demo-10' });
    expect(ligneFinie(home, 'r7')).toMatchObject({ ticket: 'demo-10' });
  });

  it("3uv.49 critère 6 : a sub-agent of the same session without a parent (the supervisor's own) takes no ticket", () => {
    const home = nouveauHome();
    sousAgent(home, ID_CHEF, { agentType: CHEF }, 'demo-9', 2);
    sousAgentMuet(home, 'e8', { agentType: 'Explore' }, 1);
    expect(vivants(home).find(x => x.agent === 'e8')).toMatchObject({ ticket: null });
    expect(ligneFinie(home, 'e8')).toMatchObject({ ticket: null });
  });

  it('3uv.49 critère 6 : a parent written by hand (a generic teammate named -agent-0) is no manager: no ticket taken', () => {
    const home = nouveauHome();
    sousAgent(
      home,
      'ademo-9-agent-0-0013',
      { agentType: 'demo-9-agent-0', name: 'demo-9-agent-0', spawnedAgentType: 'general-purpose' },
      'demo-9',
      2
    );
    sousAgentMuet(home, 'e9', { agentType: 'Explore', parentAgentId: 'ademo-9-agent-0-0013' }, 1);
    expect(vivants(home).find(x => x.agent === 'e9')).toMatchObject({ ticket: null });
    expect(ligneFinie(home, 'e9')).toMatchObject({ ticket: null });
  });

  it('3uv.49 critère 6 : a manager whose transcript is not in the same folder gives no ticket', () => {
    const home = nouveauHome();
    sousAgent(home, ID_CHEF, { agentType: CHEF }, 'demo-9', 2, 0, 'autre');
    sousAgentMuet(home, 'e10', { agentType: 'Explore', parentAgentId: ID_CHEF }, 1);
    expect(vivants(home).find(x => x.agent === 'e10')).toMatchObject({ ticket: null });
    expect(ligneFinie(home, 'e10')).toMatchObject({ ticket: null });
  });
});

describe('3uv.49 critère 7 : the manager heads the blocks as 0 wherever the list declares it', () => {
  it('3uv.49 critère 7 : declared last, the manager comes first as 0, the others from 1 in their order', () => {
    const t = plateau([], [], [], { roles: ['testeur', 'developpeur', CHEF] });
    expect(t.agents.map(b => [b.numero, b.role])).toEqual([
      [0, CHEF],
      [1, 'testeur'],
      [2, 'developpeur'],
    ]);
  });

  it('3uv.49 critère 7 : the other roles keep the declared order, not the order of the flow', () => {
    const t = plateau([], [], [], { roles: [CHEF, 'integrateur', 'testeur'] });
    expect(t.agents.map(b => [b.numero, b.role])).toEqual([
      [0, CHEF],
      [1, 'integrateur'],
      [2, 'testeur'],
    ]);
  });

  it('3uv.49 critère 7 : a list that declares the manager alone gives block 0 alone', () => {
    const t = plateau([], [], [], { roles: [CHEF] });
    expect(t.agents.map(b => [b.numero, b.role])).toEqual([[0, CHEF]]);
  });

  it('3uv.49 critère 7 : declared in the middle, the pane draws block 0 under the AGENTS title, then the declared roles from 1', () => {
    expect(pane(plateau([], [], [], { roles: ['testeur', CHEF, 'developpeur'] }))).toEqual([
      '',
      'AGENTS  ▶ en cours · en attente',
      '0 chef de chantier  —',
      '1 testeur  —',
      '2 développeur  —',
    ]);
  });
});

describe('3uv.49 critère 8 : block 0 is shown as « chef de chantier »', () => {
  it('3uv.49 critère 8 : the block of the manager is named chef de chantier, and the pane draws it so', () => {
    const t = plateau([], [], []);
    expect(bloc(t, CHEF)).toMatchObject({ numero: 0, nom: 'chef de chantier' });
    const a = agentsTextes(t);
    const titre = a.findIndex(x => x.texte.startsWith('AGENTS'));
    expect(a[titre + 1]).toMatchObject({ texte: '0 chef de chantier  —', ton: 'discret' });
  });
});

// A repository whose Beads answers from files: a fake `bd` on the PATH (its tickets, and the
// comments of `demo-9`), its package.json, the register in a file.
const depotFactice = (
  tickets: object[],
  commentaires: object[],
  registre: object[],
  roles: string[]
) => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  writeFileSync(path.join(bin, 'tous.json'), JSON.stringify(tickets));
  writeFileSync(path.join(bin, 'commentaires.json'), JSON.stringify(commentaires));
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\ncase "$1" in\n  config) echo demo ;;\n  list) cat '${bin}/tous.json' ;;\n  comments) cat '${bin}/commentaires.json' ;;\n  *) echo '[]' ;;\nesac\n`,
    { mode: 0o755 }
  );
  writeFileSync(path.join(racine, 'package.json'), l({ name: 'demo', grillhouse: { roles } }));
  const fichier = path.join(bin, 'registre.jsonl');
  writeFileSync(fichier, registre.map(r => l({ ...r, projet: racine })).join('\n') + '\n');
  vi.stubEnv('PATH', `${bin}:${process.env.PATH}`);
  vi.stubEnv('GRILLHOUSE_REGISTRE', fichier);
  return racine;
};

describe('3uv.49 critère 9 : without the manager in the list, a running manager changes nothing', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('3uv.49 critère 9 : the blocks hold the same tickets with the manager running as without it', () => {
    const tous = [T('demo-9'), T('demo-10', { status: 'open' }), T('demo-11')];
    const registre = [
      fin('t1', 'demo-9', 'testeur', '09:00'),
      fin('d1', 'demo-11', 'developpeur', '09:30'),
    ];
    const places = (t: Board) =>
      t.agents.map(b => [b.numero, b.role, b.enCours.map(x => x.id), b.attend.map(x => x.id)]);
    const sans = plateau(tous, registre, [], { roles: ANCIENS });
    const avec = plateau(
      tous,
      registre,
      [
        vivant('c0', 'demo-9', CHEF, 0, { travail: 0, tours: [] }),
        vivant('c1', 'demo-10', CHEF, 0, { travail: 0, tours: [] }),
        vivant('c2', 'demo-11', CHEF, 0, { travail: 0, tours: [] }),
      ],
      { roles: ANCIENS }
    );
    expect(places(avec)).toEqual(places(sans));
    expect(pane(avec)).toEqual(pane(sans));
  });

  it("3uv.49 critère 9 : a manager's finished passage leaves the ticket to the next role of the flow", () => {
    const t = plateau(
      [T('demo-9')],
      [fin('t1', 'demo-9', 'testeur', '09:00'), fin('c0', 'demo-9', CHEF, '11:00')],
      [],
      { roles: ANCIENS }
    );
    expect(bloc(t, 'developpeur')!.attend.map(x => x.id)).toEqual(['demo-9']);
  });

  it('3uv.49 critère 9 : a review accepted then a manager finished last, the board reads the verdict: the ticket waits for the integrator', () => {
    const racine = depotFactice(
      [T('demo-9')],
      [{ id: 1, issue_id: 'demo-9', text: 'ACCEPTÉ — le lot', created_at: at('10:45') }],
      [
        fin('t1', 'demo-9', 'testeur', '09:00'),
        fin('d1', 'demo-9', 'developpeur', '10:00'),
        fin('r1', 'demo-9', 'relecteur', '10:40'),
        fin('c0', 'demo-9', CHEF, '11:00'),
      ],
      ANCIENS
    );
    const t = tableau(racine, { home: nouveauHome() }) as unknown as Board;
    expect(bloc(t, 'integrateur')!.attend.map(x => x.id)).toEqual(['demo-9']);
    expect(bloc(t, 'developpeur')!.attend).toEqual([]);
  });
});

// A ticket open and blocked by another open ticket (Beads' « blocks » dependency).
const bloque = (id: string, par: string, o: object = {}) =>
  T(id, { status: 'open', dependencies: [{ type: 'blocks', depends_on_id: par }], ...o });

describe('3uv.49 critère 10 : a blocked ticket a manager led waits under block 0 as a ready one', () => {
  it('3uv.49 critère 10 : blocked, its only passage the manager, the ticket waits under 0', () => {
    const t = plateau(
      [bloque('demo-9', 'demo-8'), T('demo-8')],
      [fin('c0', 'demo-9', CHEF, '09:00')],
      []
    );
    expect(bloc(t, CHEF)!.attend.map(x => x.id)).toEqual(['demo-9']);
    expect(bloc(t, 'testeur')!.attend.map(x => x.id)).not.toContain('demo-9');
  });

  it('a blocked ticket in the circuit without any passage waits under 0, for the manager who takes it first', () => {
    const t = plateau([bloque('demo-9', 'demo-8'), T('demo-8')], [], []);
    expect(bloc(t, CHEF)!.attend.map(x => x.id)).toContain('demo-9');
    expect(bloc(t, 'testeur')!.attend.map(x => x.id)).not.toContain('demo-9');
  });

  it('3uv.49 critère 10 : a blocked ticket no manager led still waits for the next role of the flow', () => {
    const t = plateau(
      [bloque('demo-9', 'demo-8'), T('demo-8')],
      [fin('t1', 'demo-9', 'testeur', '09:00')],
      []
    );
    expect(bloc(t, 'developpeur')!.attend.map(x => x.id)).toEqual(['demo-9']);
    expect(bloc(t, CHEF)!.attend).toEqual([]);
  });
});

describe('3uv.49 critère 11 : only an agent of a block puts a ticket in progress', () => {
  it('3uv.49 critère 11 : an Explore running on a led ticket leaves it waiting under 0', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('c0', 'demo-9', CHEF, '09:00')],
      [vivant('e1', 'demo-9', 'Explore', 30)]
    );
    expect(bloc(t, CHEF)!.attend.map(x => x.id)).toEqual(['demo-9']);
    expect(t.agents.flatMap(b => b.enCours)).toEqual([]);
  });

  it('3uv.49 critère 11 : a reviewer running on the led ticket, an agent of a block, holds it in progress', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('c0', 'demo-9', CHEF, '09:00')],
      [vivant('r1', 'demo-9', 'relecteur', 30)]
    );
    expect(enCours(t, 'relecteur')).toEqual(['demo-9']);
    expect(attentes(t)).toEqual([]);
  });
});

describe('3uv.49 critère 12 : only a manager gives its ticket to a sub-agent naming none', () => {
  it('3uv.49 critère 12 : a sub-agent launched by a reviewer takes no ticket, running and finished', () => {
    const home = nouveauHome();
    sousAgent(home, 'arel-1', { agentType: 'relecteur' }, 'demo-9', 2);
    sousAgentMuet(home, 'e1', { agentType: 'Explore', parentAgentId: 'arel-1' }, 1);
    expect(vivants(home).find(x => x.agent === 'e1')).toMatchObject({ ticket: null });
    expect(ligneFinie(home, 'e1')).toMatchObject({ ticket: null });
  });

  it("3uv.49 critère 12 : a sub-agent of a manager's reviewer takes no ticket: only the direct parent counts", () => {
    const home = nouveauHome();
    sousAgent(home, ID_CHEF, { agentType: CHEF }, 'demo-9', 2);
    sousAgent(home, 'arel-2', { agentType: 'relecteur', parentAgentId: ID_CHEF }, 'demo-9', 1);
    sousAgentMuet(home, 'e2', { agentType: 'Explore', parentAgentId: 'arel-2' }, 1);
    expect(vivants(home).find(x => x.agent === 'e2')).toMatchObject({ ticket: null });
    expect(ligneFinie(home, 'e2')).toMatchObject({ ticket: null });
  });

  it('3uv.49 critère 12 : a sub-agent of a manager whose prompt names no ticket takes none, running and finished', () => {
    const home = nouveauHome();
    sousAgentMuet(home, ID_CHEF, { agentType: CHEF }, 2);
    sousAgentMuet(home, 'e3', { agentType: 'Explore', parentAgentId: ID_CHEF }, 1);
    expect(vivants(home).find(x => x.agent === 'e3')).toMatchObject({ ticket: null });
    expect(ligneFinie(home, 'e3')).toMatchObject({ ticket: null });
  });
});

// A sub-agent's transcript around now, its times in ms before now: its prompt on `ticket`, an
// incoming message of the person when `relance` is given, then each tool call of `appels` (its
// id, when it was sent and, when answered, when its answer came), then its last words when
// `ensuite` is given.
interface Appel {
  id: string;
  envoi: number;
  reponse?: number;
}
const enAppel = (o: {
  ticket: string;
  prompt: number;
  relance?: number;
  appels: Appel[];
  ensuite?: number;
}) =>
  [
    l({
      type: 'user',
      timestamp: ilYa(o.prompt),
      message: { content: `TON TICKET : ${o.ticket}\n\nLe lot.` },
    }),
    ...(o.relance === undefined
      ? []
      : [
          l({
            type: 'user',
            timestamp: ilYa(o.relance),
            origin: { kind: 'human' },
            message: { content: 'Reprends le lot.' },
          }),
        ]),
    ...o.appels.flatMap(a => [
      l({
        type: 'assistant',
        timestamp: ilYa(a.envoi),
        message: {
          id: `m-${a.id}`,
          content: [{ type: 'tool_use', id: a.id, name: 'Bash', input: { command: 'npm test' } }],
          usage: { input_tokens: 6, output_tokens: 4 },
        },
      }),
      ...(a.reponse === undefined
        ? []
        : [
            l({
              type: 'user',
              timestamp: ilYa(a.reponse),
              message: { content: [{ type: 'tool_result', tool_use_id: a.id, content: 'ok' }] },
            }),
          ]),
    ]),
    ...(o.ensuite === undefined
      ? []
      : [
          l({
            type: 'assistant',
            timestamp: ilYa(o.ensuite),
            message: {
              id: 'm-fin',
              content: [{ type: 'text', text: 'Fait.' }],
              usage: { input_tokens: 6, output_tokens: 4 },
            },
          }),
        ]),
  ].join('\n');
// A sub-agent of `role` on `ticket`, its last tool call sent `silence` ms ago and still awaiting
// its answer, its file last moved then.
const enAttente = (home: string, id: string, meta: object, ticket: string, silence: number) =>
  ecrire(
    home,
    id,
    meta,
    enAppel({
      ticket,
      prompt: silence + 2 * MIN,
      appels: [{ id: `toolu_${id}`, envoi: silence }],
    }),
    silence
  );
// The register's line of a stop of `agent`, `ilYaFin` ms ago.
const finIlYa = (agent: string, ticket: string, role: string, ilYaFin: number) => ({
  projet: RACINE,
  agent,
  ticket,
  role,
  debut: ilYa(ilYaFin + 10 * MIN),
  fin: ilYa(ilYaFin),
  travail: 10 * MIN,
  jetons: 10,
  cache: 0,
  cout: null,
});

describe('3uv.49 critère 13 : a sub-agent, whatever its role, runs while its last tool call awaits its answer', () => {
  it('3uv.49 critère 13 : no rule holds a manager in progress by the agents it launched: silent 5 minutes, its call answered, it is not running', () => {
    const home = nouveauHome();
    ecrire(
      home,
      'c20',
      { agentType: CHEF },
      enAppel({
        ticket: 'demo-9',
        prompt: 20 * MIN,
        appels: [{ id: 'toolu_c20', envoi: 6 * MIN, reponse: 5 * MIN + 30 * SEC }],
        ensuite: 5 * MIN,
      }),
      5 * MIN
    );
    sousAgent(home, 'r20', { agentType: 'relecteur', parentAgentId: 'c20' }, 'demo-9', 1);
    const ps = agentShell(home, 's-t20', 'testeur', 'demo-9');
    const v = vivants(home, ps);
    expect(v.find(x => x.agent === 'r20')).toMatchObject({ role: 'relecteur' });
    expect(v.find(x => x.agent === 'c20')).toBeUndefined();
  });

  it('3uv.49 critère 13 : the real case, a manager silent 5 minutes in the middle of a call and its integrator silent 3 minutes in the middle of a call, both run, the ticket shown under the integrator', () => {
    const home = nouveauHome();
    enAttente(home, ID_CHEF, { agentType: CHEF }, 'demo-9', 5 * MIN);
    enAttente(home, 'i21', { agentType: 'integrateur', parentAgentId: ID_CHEF }, 'demo-9', 3 * MIN);
    const v = vivants(home);
    expect(v.find(x => x.agent === ID_CHEF)).toMatchObject({ role: CHEF, ticket: 'demo-9' });
    expect(v.find(x => x.agent === 'i21')).toMatchObject({
      role: 'integrateur',
      ticket: 'demo-9',
    });
    const t = plateauVivant(home, [T('demo-9')]);
    expect(enCours(t, CHEF)).toEqual([]);
    expect(enCours(t, 'integrateur')).toEqual(['demo-9']);
  });

  it('3uv.49 critère 13 : a reviewer silent 5 minutes in the middle of a call, launched by no manager, runs', () => {
    const home = nouveauHome();
    enAttente(home, 'r22', { agentType: 'relecteur' }, 'demo-9', 5 * MIN);
    expect(vivants(home).find(x => x.agent === 'r22')).toMatchObject({
      role: 'relecteur',
      ticket: 'demo-9',
    });
  });

  it('3uv.49 critère 13 : an agent out of the roles (Explore) silent 5 minutes in the middle of a call runs', () => {
    const home = nouveauHome();
    enAttente(home, 'e23', { agentType: 'Explore' }, 'demo-9', 5 * MIN);
    expect(vivants(home).find(x => x.agent === 'e23')).toMatchObject({ role: 'Explore' });
  });

  it('3uv.49 critère 13 : a sub-agent silent 5 minutes whose last call was answered is not running', () => {
    const home = nouveauHome();
    ecrire(
      home,
      'r24',
      { agentType: 'relecteur' },
      enAppel({
        ticket: 'demo-9',
        prompt: 20 * MIN,
        appels: [{ id: 'toolu_r24', envoi: 6 * MIN, reponse: 5 * MIN }],
      }),
      5 * MIN
    );
    expect(vivants(home).find(x => x.agent === 'r24')).toBeUndefined();
  });

  it('3uv.49 critère 13 : the answer of an earlier call does not answer the last one: the sub-agent runs', () => {
    const home = nouveauHome();
    ecrire(
      home,
      'r25',
      { agentType: 'relecteur' },
      enAppel({
        ticket: 'demo-9',
        prompt: 20 * MIN,
        appels: [
          { id: 'toolu_r25a', envoi: 8 * MIN, reponse: 7 * MIN },
          { id: 'toolu_r25b', envoi: 5 * MIN },
        ],
      }),
      5 * MIN
    );
    expect(vivants(home).find(x => x.agent === 'r25')).toMatchObject({ role: 'relecteur' });
  });

  it('3uv.49 critère 13 : in the middle of a call, its transcript moved 29 minutes ago, it runs', () => {
    const home = nouveauHome();
    enAttente(home, 'r26', { agentType: 'relecteur' }, 'demo-9', 29 * MIN);
    expect(vivants(home).find(x => x.agent === 'r26')).toMatchObject({ role: 'relecteur' });
  });

  it('3uv.49 critère 13 : in the middle of a call, its transcript moved 31 minutes ago, it is not running', () => {
    const home = nouveauHome();
    enAttente(home, 'r27', { agentType: 'relecteur' }, 'demo-9', 31 * MIN);
    expect(vivants(home).find(x => x.agent === 'r27')).toBeUndefined();
  });

  it('3uv.49 critère 13 : in the middle of a call, with an end in the register after its last incoming message, it is finished', () => {
    const home = nouveauHome();
    enAttente(home, 'r28', { agentType: 'relecteur' }, 'demo-9', 5 * MIN);
    const t = plateauVivant(home, [T('demo-9')], [finIlYa('r28', 'demo-9', 'relecteur', 4 * MIN)]);
    expect(enCours(t, 'relecteur')).toEqual([]);
  });

  it('3uv.49 critère 13 : resumed by a message after its end in the register, then in the middle of a call, it runs', () => {
    const home = nouveauHome();
    ecrire(
      home,
      'r29',
      { agentType: 'relecteur' },
      enAppel({
        ticket: 'demo-9',
        prompt: 30 * MIN,
        relance: 10 * MIN,
        appels: [{ id: 'toolu_r29', envoi: 5 * MIN }],
      }),
      5 * MIN
    );
    const t = plateauVivant(home, [T('demo-9')], [finIlYa('r29', 'demo-9', 'relecteur', 15 * MIN)]);
    expect(enCours(t, 'relecteur')).toEqual(['demo-9']);
  });
});

describe('3uv.49 critère 14 : the board reads only the transcripts modified in the last 30 minutes', () => {
  it('3uv.49 critère 14 : a transcript modified 40 minutes ago is not read, even in the middle of a call', () => {
    const home = nouveauHome();
    const vieux = enAttente(home, 'r30', { agentType: 'relecteur' }, 'demo-9', 40 * MIN);
    const cache: Record<string, unknown> = {};
    expect(vivants(home, '', cache).find(x => x.agent === 'r30')).toBeUndefined();
    expect(Object.keys(cache)).not.toContain(vieux);
  });

  it('3uv.49 critère 14 : a finished sub-agent of two hours ago is not read, a recent one is', () => {
    const home = nouveauHome();
    const vieux = sousAgent(home, 'r31', { agentType: 'relecteur' }, 'demo-9', 2, 120 * MIN);
    const recent = sousAgent(home, 'r32', { agentType: 'relecteur' }, 'demo-10', 2);
    const cache: Record<string, unknown> = {};
    vivants(home, '', cache);
    expect(Object.keys(cache)).not.toContain(vieux);
    expect(Object.keys(cache)).toContain(recent);
  });
});

describe('3uv.49 critère 15 : the 2-minute rule holds beside the waiting call', () => {
  it('3uv.49 critère 15 : a sub-agent whose transcript moved 1 minute ago runs, its last call answered', () => {
    const home = nouveauHome();
    ecrire(
      home,
      'r40',
      { agentType: 'relecteur' },
      enAppel({
        ticket: 'demo-9',
        prompt: 20 * MIN,
        appels: [{ id: 'toolu_r40', envoi: 2 * MIN, reponse: MIN }],
      }),
      MIN
    );
    expect(vivants(home).find(x => x.agent === 'r40')).toMatchObject({
      role: 'relecteur',
      ticket: 'demo-9',
    });
  });
});

describe('3uv.49 critère 16 : the 30-minute reading bound holds for every transcript', () => {
  it('3uv.49 critère 16 : a manager silent for 35 minutes is not read: its running sub-agent naming no ticket stays without one', () => {
    const home = nouveauHome();
    const chef = sousAgent(home, ID_CHEF, { agentType: CHEF }, 'demo-9', 2, 35 * MIN);
    sousAgentMuet(home, 'e40', { agentType: 'Explore', parentAgentId: ID_CHEF }, 1);
    const cache: Record<string, unknown> = {};
    const v = vivants(home, '', cache);
    expect(v.find(x => x.agent === 'e40')).toMatchObject({ role: 'Explore', ticket: null });
    expect(v.find(x => x.agent === ID_CHEF)).toBeUndefined();
    expect(Object.keys(cache)).not.toContain(chef);
  });

  it('3uv.49 critère 16 : a shell agent whose transcript is 40 minutes old shows by its process, without the measures of its transcript', () => {
    const home = nouveauHome();
    const ps = agentShell(home, 's-t41', 'testeur', 'demo-9');
    const f = path.join(home, '.claude/projects/-depot--claude-worktrees-demo-9/s-t41.jsonl');
    const quand = (Date.now() - 40 * MIN) / 1000;
    utimesSync(f, quand, quand);
    const cache: Record<string, unknown> = {};
    const v = vivants(home, ps, cache).find(x => x.ticket === 'demo-9');
    expect(v).toMatchObject({
      role: 'testeur',
      ticket: 'demo-9',
      ligne: true,
      jetons: 0,
      travail: 0,
      tours: [],
      entre: null,
    });
    expect(v!.silence).toBeGreaterThanOrEqual(40 * MIN - 5 * SEC);
    expect(Object.keys(cache)).not.toContain(f);
    const t = plateauVivant(home, [T('demo-9')], [], ps);
    expect(enCours(t, 'testeur')).toEqual(['demo-9']);
  });
});

describe('3uv.49 critère 17 : the transcript of a session keeps the 2-minute rule alone', () => {
  it('3uv.49 critère 17 : a session silent 5 minutes in the middle of a call is not running', () => {
    const home = nouveauHome();
    sousAgents(home);
    const f = path.join(home, '.claude/projects/-depot', 'sess42.jsonl');
    writeFileSync(
      f,
      enAppel({ ticket: 'demo-9', prompt: 20 * MIN, appels: [{ id: 'toolu_s42', envoi: 5 * MIN }] })
    );
    const quand = (Date.now() - 5 * MIN) / 1000;
    utimesSync(f, quand, quand);
    expect(vivants(home).find(x => x.agent === 'sess42')).toBeUndefined();
  });
});
