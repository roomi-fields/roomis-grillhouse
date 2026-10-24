// The sub-agents on the board (grillhouse-3uv.49; the lead role is the questionneur since
// grillhouse-3uv.95.4 removed the regulator): a role running on a ticket stands in its block with its
// time and tokens, the agents it launches are tied to their ticket and role as the supervisor's are,
// and a ticket it leads waits for no role of the flow. A sub-agent, whatever its role, runs when its
// transcript moved in the last 2 minutes, or while its last tool call awaits its answer, its
// transcript moved in the last 30 minutes and no end in the register follows its last incoming
// message; a session keeps the 2-minute rule alone. The board reads no transcript older than 30
// minutes: a shell agent shows by its process alone.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { ligne as ligneDuRegistre } from '../../scripts/registre.mjs';
import {
  assembler,
  lignes,
  lireTranscription,
  lireVivant,
  tableau,
} from '../../scripts/tableau.mjs';
import { ligneEnveloppe } from './tableau-essai.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-sous-agents-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = '/depot';
const MENEUR = 'questionneur';
const MIN = 60_000;
const SEC = 1000;
const l = (o: object) => JSON.stringify(o);
const at = (hm: string) => `2026-10-11T${hm}:00Z`;
const ilYa = (ms: number) => new Date(Date.now() - ms).toISOString();

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
  return ligneEnveloppe(RACINE, ticket, role, {
    pid: 4242,
    secondes: 300,
    composant: 'packages/demo',
  });
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
  numero: string | null;
  titre: string;
  qui: string;
  roles: string[];
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
  o: { verdicts?: object } = {}
): Board =>
  assembler({
    tous,
    prefix: 'demo',
    registre,
    vivants: enVie,
    verdicts: o.verdicts ?? {},
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
const bloc = (t: Board, role: string) => t.agents.find(b => b.roles.includes(role));
const enCours = (t: Board, role: string) => (bloc(t, role)?.enCours ?? []).map(x => x.id);
const attentes = (t: Board) => t.agents.flatMap(b => b.attend.map(x => x.id));
// The lines of AGENTS: the lines of section agents from the blank line above its title, the head
// above it left out.
const agentsTextes = (t: Board) => {
  const out = (lignes(t, 'depot') as Ligne[]).filter(x => x.section === 'agents');
  return out.slice(out.findIndex(x => x.texte.startsWith('AGENTS')) - 1);
};

describe('3uv.49 critère 1 : a lead role on its ticket', () => {
  it('3uv.49 critère 1 : a site manager whose register end no message follows is finished, not in progress', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('c0', 'demo-9', MENEUR, '09:00', 40)],
      [vivant('c0', 'demo-9', MENEUR, 40, { entre: Date.parse(at('08:00')) })]
    );
    expect(enCours(t, MENEUR)).toEqual([]);
  });

  it('3uv.49 critère 1 : a sub-agent of type questionneur, recent, runs as its role on its ticket', () => {
    const home = nouveauHome();
    sousAgent(home, 'c1', { agentType: MENEUR }, 'demo-9', 3);
    expect(vivants(home).find(v => v.agent === 'c1')).toMatchObject({
      role: MENEUR,
      ticket: 'demo-9',
      ligne: false,
      jetons: 30,
    });
  });

  it('3uv.49 critère 1 : a named teammate spawned as questionneur runs as its role, never under its name', () => {
    const home = nouveauHome();
    sousAgent(
      home,
      'c2',
      { agentType: 'demo-9-agent-0', name: 'demo-9-agent-0', spawnedAgentType: MENEUR },
      'demo-9',
      2
    );
    expect(vivants(home).find(v => v.agent === 'c2')).toMatchObject({
      role: MENEUR,
      ticket: 'demo-9',
    });
  });

  it('3uv.49 critère 1 : a finished manager has its register line, its role and its ticket', () => {
    const home = nouveauHome();
    sousAgent(home, 'cf', { agentType: MENEUR }, 'demo-9', 4);
    expect(ligneFinie(home, 'cf')).toMatchObject({
      agent: 'cf',
      ticket: 'demo-9',
      role: MENEUR,
      jetons: 40,
    });
  });
});

describe('3uv.49 critère 2 : the agents a manager launches are tied to their ticket and role', () => {
  it('3uv.49 critère 2 : a reviewer launched by a manager, in the same session, runs under its role on its ticket', () => {
    const home = nouveauHome();
    sousAgent(home, 'c10', { agentType: MENEUR }, 'demo-9', 2);
    sousAgent(home, 'r10', { agentType: 'relecteur', parentAgentId: 'c10' }, 'demo-9', 1);
    expect(vivants(home).find(x => x.agent === 'r10')).toMatchObject({
      role: 'relecteur',
      ticket: 'demo-9',
      ligne: false,
    });
  });

  it('3uv.49 critère 2 : a reviewer launched by a manager, finished, has its register line under its role', () => {
    const home = nouveauHome();
    sousAgent(home, 'r11', { agentType: 'relecteur', parentAgentId: 'c11' }, 'demo-9', 2);
    expect(ligneFinie(home, 'r11')).toMatchObject({
      agent: 'r11',
      ticket: 'demo-9',
      role: 'relecteur',
    });
  });

  it('3uv.49 critère 2 : the testwriter a manager launches in a shell runs under its role', () => {
    const home = nouveauHome();
    sousAgent(home, 'c13', { agentType: MENEUR }, 'demo-9', 2);
    const ps = agentShell(home, 's-t13', 'testwriter', 'demo-9');
    const t = plateauVivant(home, [T('demo-9')], [], ps);
    expect(enCours(t, 'testwriter')).toEqual(['demo-9']);
  });
});

describe('3uv.49 critère 3 : a ticket a running manager leads waits for no role', () => {
  it('3uv.49 critère 3 : after its testwriter finished, the ticket is in progress under the manager, not waiting for the developer', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('t1', 'demo-9', 'testwriter', '09:00')],
      [vivant('c0', 'demo-9', MENEUR)]
    );
    expect(attentes(t)).not.toContain('demo-9');
    expect(enCours(t, MENEUR)).toEqual(['demo-9']);
  });

  it('3uv.49 critère 3 : after an accepted review, the ticket waits for no role while its manager runs', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('t1', 'demo-9', 'testwriter', '09:00'), fin('d1', 'demo-9', 'developpeur', '10:00')],
      [vivant('c0', 'demo-9', MENEUR)],
      { verdicts: { 'demo-9': { verdict: 'ACCEPTÉ', date: Date.parse(at('10:30')) } } }
    );
    expect(attentes(t)).not.toContain('demo-9');
    expect(enCours(t, MENEUR)).toEqual(['demo-9']);
  });

  it('3uv.49 critère 3 : an open ticket with no passage does not wait for the testwriter while its manager runs', () => {
    const t = plateau([T('demo-9', { status: 'open' })], [], [vivant('c0', 'demo-9', MENEUR)]);
    expect(attentes(t)).not.toContain('demo-9');
    expect(enCours(t, MENEUR)).toEqual(['demo-9']);
  });

  it('with its testwriter running too, the ticket is in progress under both, waiting nowhere', () => {
    const t = plateau(
      [T('demo-9')],
      [],
      [vivant('c0', 'demo-9', MENEUR), vivant('s1', 'demo-9', 'testwriter', 10, { ligne: true })]
    );
    expect(attentes(t)).not.toContain('demo-9');
    expect(enCours(t, 'testwriter')).toEqual(['demo-9']);
    expect(enCours(t, MENEUR)).toEqual(['demo-9']);
  });

  it('3uv.49 critère 3 : a ticket without a manager still waits for the next role of the flow', () => {
    const t = plateau(
      [T('demo-9'), T('demo-10')],
      [fin('t1', 'demo-9', 'testwriter', '09:00'), fin('t2', 'demo-10', 'testwriter', '09:00')],
      [vivant('c0', 'demo-9', MENEUR)]
    );
    expect(bloc(t, 'developpeur')!.attend.map(x => x.id)).toEqual(['demo-10']);
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
    lireTranscription(readFileSync(f, 'utf8')),
    RACINE
  );
}
// A manager's id as the tool writes it, and the parent id its sub-agents carry.
const ID_MENEUR = 'ademo-9-agent-0-4f3ac190df511767';

// Decided by the owner on 2026-10-17 (grill, Q10): a ticket a manager led waits under no block of
// its own.
describe('a ticket a manager led: its running agents hold it, and it waits as any other', () => {
  it('a testwriter running on the led ticket holds it in progress, waiting nowhere', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('c0', 'demo-9', MENEUR, '09:00')],
      [vivant('s1', 'demo-9', 'testwriter', 10, { ligne: true })]
    );
    expect(enCours(t, 'testwriter')).toEqual(['demo-9']);
    expect(attentes(t)).toEqual([]);
  });

  it('a manager resumed by a message after its end stands in progress, not waiting', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('c0', 'demo-9', MENEUR, '09:00')],
      [vivant('c0', 'demo-9', MENEUR, 40, { entre: Date.parse(at('11:00')) })]
    );
    expect(enCours(t, MENEUR)).toEqual(['demo-9']);
    expect(attentes(t)).toEqual([]);
  });

  it('after its manager and its testwriter finished, the led ticket waits for the developer, not under 0', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('t1', 'demo-9', 'testwriter', '09:00'), fin('c0', 'demo-9', MENEUR, '11:00')],
      []
    );
    expect(bloc(t, MENEUR)!.attend).toEqual([]);
    expect(bloc(t, 'developpeur')!.attend.map(x => x.id)).toEqual(['demo-9']);
  });

  it('a closed, deferred or to-validate ticket a manager led waits nowhere', () => {
    const t = plateau(
      [
        T('demo-9', { status: 'closed', closed_at: at('11:30') }),
        T('demo-10', { status: 'deferred' }),
        T('demo-11', { labels: ['a-valider'] }),
      ],
      [
        fin('c0', 'demo-9', MENEUR, '11:00'),
        fin('c1', 'demo-10', MENEUR, '11:00'),
        fin('c2', 'demo-11', MENEUR, '11:00'),
      ],
      []
    );
    expect(attentes(t)).toEqual([]);
  });
});

// grillhouse-3uv.95.4, grillhouse-3uv.95.5: the block 1 holds the explorateur and the
// questionneur, and no block stands out of the sequence of the steps.
describe('the block of 1 names the explorateur and the questionneur', () => {
  it('the block of 1 is shown « explorateur ⇄ questionneur », and no block stands out of the steps', () => {
    const t = plateau([T('demo-9')], [], [vivant('c0', 'demo-9', MENEUR)]);
    expect(bloc(t, MENEUR)).toMatchObject({
      numero: '1',
      titre: 'Plan',
      qui: 'explorateur ⇄ questionneur',
    });
    expect(agentsTextes(t).map(x => x.texte.trimEnd())).toContain(
      '  1 · Plan · explorateur ⇄ questionneur'
    );
    expect(t.agents.filter(b => b.numero === null)).toEqual([]);
  });
});

// A repository whose Beads answers from files: a fake `bd` on the PATH (its tickets, and the
// comments of `demo-9`), its package.json, the register in a file.
const depotFactice = (tickets: object[], commentaires: object[], registre: object[]) => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  writeFileSync(path.join(bin, 'tous.json'), JSON.stringify(tickets));
  writeFileSync(path.join(bin, 'commentaires.json'), JSON.stringify(commentaires));
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\ncase "$1" in\n  config) echo demo ;;\n  list) cat '${bin}/tous.json' ;;\n  comments) cat '${bin}/commentaires.json' ;;\n  *) echo '[]' ;;\nesac\n`,
    { mode: 0o755 }
  );
  writeFileSync(path.join(racine, 'package.json'), l({ name: 'demo' }));
  const fichier = path.join(bin, 'registre.jsonl');
  writeFileSync(fichier, registre.map(r => l({ ...r, projet: racine })).join('\n') + '\n');
  vi.stubEnv('PATH', `${bin}:${process.env.PATH}`);
  vi.stubEnv('GRILLHOUSE_REGISTRE', fichier);
  return racine;
};

describe("3uv.49 critère 9 : a manager's passage leaves the ticket to the flow", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("3uv.49 critère 9 : a manager's finished passage leaves the ticket to the next role of the flow", () => {
    const t = plateau(
      [T('demo-9')],
      [fin('t1', 'demo-9', 'testwriter', '09:00'), fin('c0', 'demo-9', MENEUR, '11:00')],
      []
    );
    expect(bloc(t, 'developpeur')!.attend.map(x => x.id)).toEqual(['demo-9']);
  });

  it('3uv.49 critère 9 : a review accepted then a manager finished last, the board reads the verdict: the ticket waits for no agent, the circuit integrates it', () => {
    const racine = depotFactice(
      [T('demo-9')],
      [
        {
          id: 1,
          issue_id: 'demo-9',
          author: 'relecteur',
          text: 'ACCEPTÉ — le lot',
          created_at: at('10:45'),
        },
      ],
      [
        fin('t1', 'demo-9', 'testwriter', '09:00'),
        fin('d1', 'demo-9', 'developpeur', '10:00'),
        fin('r1', 'demo-9', 'relecteur', '10:40'),
        fin('c0', 'demo-9', MENEUR, '11:00'),
      ]
    );
    const t = tableau(racine, { home: nouveauHome() }) as unknown as Board;
    expect(t.agents.flatMap(b => b.attend.map(x => x.id))).toEqual([]);
  });
});

// A ticket open and blocked by another open ticket (Beads' « blocks » dependency).
const bloque = (id: string, par: string, o: object = {}) =>
  T(id, { status: 'open', dependencies: [{ type: 'blocks', depends_on_id: par }], ...o });

describe('3uv.49 critère 10 : a blocked ticket in the circuit waits for the next role of the flow', () => {
  // Decided by the owner on 2026-10-17 (grill, Q10): the supervisor launches the circuit, whose
  // first agent is the testwriter.
  it('a blocked ticket in the circuit without any passage waits for the testwriter, the circuit launching it first', () => {
    const t = plateau([bloque('demo-9', 'demo-8'), T('demo-8')], [], []);
    expect(bloc(t, 'testwriter')!.attend.map(x => x.id)).toContain('demo-9');
    expect(bloc(t, MENEUR)!.attend.map(x => x.id)).not.toContain('demo-9');
  });

  it('3uv.49 critère 10 : a blocked ticket no manager led still waits for the next role of the flow', () => {
    const t = plateau(
      [bloque('demo-9', 'demo-8'), T('demo-8')],
      [fin('t1', 'demo-9', 'testwriter', '09:00')],
      []
    );
    expect(bloc(t, 'developpeur')!.attend.map(x => x.id)).toEqual(['demo-9']);
    expect(bloc(t, MENEUR)!.attend).toEqual([]);
  });
});

describe('3uv.49 critère 11 : only an agent of a block puts a ticket in progress', () => {
  it('3uv.49 critère 11 : an Explore running on a led ticket leaves it waiting for the testwriter', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('c0', 'demo-9', MENEUR, '09:00')],
      [vivant('e1', 'demo-9', 'Explore', 30)]
    );
    expect(bloc(t, 'testwriter')!.attend.map(x => x.id)).toEqual(['demo-9']);
    expect(t.agents.flatMap(b => b.enCours)).toEqual([]);
  });

  it('3uv.49 critère 11 : a reviewer running on the led ticket, an agent of a block, holds it in progress', () => {
    const t = plateau(
      [T('demo-9')],
      [fin('c0', 'demo-9', MENEUR, '09:00')],
      [vivant('r1', 'demo-9', 'relecteur', 30)]
    );
    expect(enCours(t, 'relecteur')).toEqual(['demo-9']);
    expect(attentes(t)).toEqual([]);
  });
});

// grillhouse-3uv.95.4: a sub-agent takes its ticket from its own prompt alone, never from the agent
// that launched it.
describe('3uv.49 critère 12 : a sub-agent naming no ticket takes none, whatever launched it', () => {
  it('3uv.49 critère 12 : a sub-agent launched by a reviewer takes no ticket, running and finished', () => {
    const home = nouveauHome();
    sousAgent(home, 'arel-1', { agentType: 'relecteur' }, 'demo-9', 2);
    sousAgentMuet(home, 'e1', { agentType: 'Explore', parentAgentId: 'arel-1' }, 1);
    expect(vivants(home).find(x => x.agent === 'e1')).toMatchObject({ ticket: null });
    expect(ligneFinie(home, 'e1')).toMatchObject({ ticket: null });
  });

  it('3uv.49 critère 12 : an Explore launched by a manager on its ticket takes no ticket, running and finished', () => {
    const home = nouveauHome();
    sousAgent(home, ID_MENEUR, { agentType: MENEUR }, 'demo-9', 2);
    sousAgentMuet(home, 'e2', { agentType: 'Explore', parentAgentId: ID_MENEUR }, 3);
    expect(vivants(home).find(x => x.agent === 'e2')).toMatchObject({
      role: 'Explore',
      ticket: null,
    });
    expect(ligneFinie(home, 'e2')).toMatchObject({ ticket: null, role: 'Explore' });
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
      { agentType: MENEUR },
      enAppel({
        ticket: 'demo-9',
        prompt: 20 * MIN,
        appels: [{ id: 'toolu_c20', envoi: 6 * MIN, reponse: 5 * MIN + 30 * SEC }],
        ensuite: 5 * MIN,
      }),
      5 * MIN
    );
    sousAgent(home, 'r20', { agentType: 'relecteur', parentAgentId: 'c20' }, 'demo-9', 1);
    const ps = agentShell(home, 's-t20', 'testwriter', 'demo-9');
    const v = vivants(home, ps);
    expect(v.find(x => x.agent === 'r20')).toMatchObject({ role: 'relecteur' });
    expect(v.find(x => x.agent === 'c20')).toBeUndefined();
  });

  it('3uv.49 critère 13 : the real case, a manager silent 5 minutes in the middle of a call and its reviewer silent 3 minutes in the middle of a call, both run, the ticket shown under both', () => {
    const home = nouveauHome();
    enAttente(home, ID_MENEUR, { agentType: MENEUR }, 'demo-9', 5 * MIN);
    enAttente(home, 'r21', { agentType: 'relecteur', parentAgentId: ID_MENEUR }, 'demo-9', 3 * MIN);
    const v = vivants(home);
    expect(v.find(x => x.agent === ID_MENEUR)).toMatchObject({
      role: MENEUR,
      ticket: 'demo-9',
    });
    expect(v.find(x => x.agent === 'r21')).toMatchObject({
      role: 'relecteur',
      ticket: 'demo-9',
    });
    const t = plateauVivant(home, [T('demo-9')]);
    expect(enCours(t, MENEUR)).toEqual(['demo-9']);
    expect(enCours(t, 'relecteur')).toEqual(['demo-9']);
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
    const meneur = sousAgent(home, ID_MENEUR, { agentType: MENEUR }, 'demo-9', 2, 35 * MIN);
    sousAgentMuet(home, 'e40', { agentType: 'Explore', parentAgentId: ID_MENEUR }, 1);
    const cache: Record<string, unknown> = {};
    const v = vivants(home, '', cache);
    expect(v.find(x => x.agent === 'e40')).toMatchObject({ role: 'Explore', ticket: null });
    expect(v.find(x => x.agent === ID_MENEUR)).toBeUndefined();
    expect(Object.keys(cache)).not.toContain(meneur);
  });

  it('3uv.49 critère 16 : a shell agent whose transcript is 40 minutes old shows by its process, without the measures of its transcript', () => {
    const home = nouveauHome();
    const ps = agentShell(home, 's-t41', 'testwriter', 'demo-9');
    const f = path.join(home, '.claude/projects/-depot--claude-worktrees-demo-9/s-t41.jsonl');
    const quand = (Date.now() - 40 * MIN) / 1000;
    utimesSync(f, quand, quand);
    const cache: Record<string, unknown> = {};
    const v = vivants(home, ps, cache).find(x => x.ticket === 'demo-9');
    expect(v).toMatchObject({
      role: 'testwriter',
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
    expect(enCours(t, 'testwriter')).toEqual(['demo-9']);
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
