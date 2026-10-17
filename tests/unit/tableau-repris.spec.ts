// An agent resumed by a message (a reviewer asked to review again): the register holds one line
// per stop, each the reading of the whole transcript at that stop; the transcript keeps moving.
// The board reads an agent's state on its last event: running when an incoming message follows
// its last end in the register (grillhouse-3uv.45), finished otherwise; its measures count its
// transcript once.
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { assembler, lireVivant, tableau } from '../../scripts/tableau.mjs';
import { ligneEnveloppe } from './tableau-essai.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-repris-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = '/depot';
const l = (o: object) => JSON.stringify(o);
const MIN = 60_000;
const at = (hm: string) => `2026-10-11T${hm}:00Z`;

// A transcript: the prompt at 08:00, then one answer of 10 tokens at each time given; a time
// marked `>` is a message of the person, which opens a turn.
const transcription = (ticket: string, reponses: string[], role?: string) =>
  [
    ...(role ? [l({ type: 'agent-setting', agentSetting: role })] : []),
    l({
      type: 'user',
      timestamp: at('08:00'),
      message: { content: `TON TICKET : ${ticket} — le lot` },
    }),
    ...reponses.map((hm, i) =>
      hm.startsWith('>')
        ? l({
            type: 'user',
            timestamp: at(hm.slice(1)),
            origin: { kind: 'human' },
            message: { content: 'Relis le lot.' },
          })
        : l({
            type: 'assistant',
            timestamp: at(hm),
            message: { id: `m${i}`, usage: { input_tokens: 6, output_tokens: 4 } },
          })
    ),
  ].join('\n');

// The register's line of a stop at `hm`: the reading of the transcript up to then.
const fin = (agent: string, ticket: string, role: string, hm: string, reponses: number) => ({
  projet: RACINE,
  agent,
  ticket,
  role,
  debut: at('08:00'),
  fin: at(hm),
  travail: Date.parse(at(hm)) - Date.parse(at('08:00')),
  jetons: 10 * reponses,
  cache: 0,
  cout: null,
});

// A home with a sub-agent's transcript (written now, so it counts as recent).
const avecSousAgent = (id: string, role: string, ticket: string, reponses: string[]) => {
  const home = mkdtempSync(path.join(ESSAIS, 'home-repris-'));
  const sous = path.join(home, '.claude/projects/-depot/sess/subagents');
  mkdirSync(sous, { recursive: true });
  writeFileSync(path.join(sous, `agent-${id}.jsonl`), transcription(ticket, reponses));
  writeFileSync(path.join(sous, `agent-${id}.meta.json`), l({ agentType: role }));
  return home;
};

// A home with a role agent launched in a shell, working in its copy.
const avecAgentShell = (session: string, role: string, ticket: string, reponses: string[]) => {
  const home = mkdtempSync(path.join(ESSAIS, 'home-repris-'));
  const copie = path.join(home, `.claude/projects/-depot--claude-worktrees-${ticket}`);
  mkdirSync(copie, { recursive: true });
  writeFileSync(path.join(copie, `${session}.jsonl`), transcription(ticket, reponses, role));
  return home;
};

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

interface Bloc {
  role: string;
  enCours: { id: string; jetons: number; travail: number }[];
  attend: { id: string }[];
}
interface Board {
  global: { cumul: { travail: number; jetons: number } };
  agents: Bloc[];
}

const plateau = (home: string, tickets: string[], registre: object[], ps = ''): Board => {
  const maintenant = Date.now();
  const vivants = lireVivant({ racine: RACINE, home, prefix: 'demo', maintenant, ps });
  return assembler({
    tous: tickets.map(id => T(id)),
    prefix: 'demo',
    registre,
    vivants,
    maintenant,
    jour: maintenant - 24 * 60 * MIN,
  }) as Board;
};
const enCours = (t: Board, role: string) =>
  t.agents.find(b => b.role === role)!.enCours.map(x => x.id);
const partout = (t: Board, cle: 'enCours' | 'attend') =>
  t.agents.flatMap(b => b[cle].map(x => x.id));

describe('3uv.40 critère 1 : an agent whose last end in the register is followed by an incoming message runs (3uv.45)', () => {
  it('3uv.40 critère 1 : a reviewer stopped twice then resumed by a message is in progress, waiting nowhere', () => {
    const home = avecSousAgent('a9', 'relecteur', 'demo-5', ['08:28', '08:41', '>08:45', '08:50']);
    const t = plateau(
      home,
      ['demo-5'],
      [fin('a9', 'demo-5', 'relecteur', '08:28', 1), fin('a9', 'demo-5', 'relecteur', '08:41', 2)]
    );
    expect(enCours(t, 'relecteur')).toEqual(['demo-5']);
    expect(partout(t, 'attend')).not.toContain('demo-5');
  });

  it('3uv.40 critère 1 : the last end is the latest one, whatever the order of the register lines', () => {
    const home = avecSousAgent('b4', 'relecteur', 'demo-7', ['08:28', '08:41', '>08:45', '08:50']);
    const t = plateau(
      home,
      ['demo-7'],
      [fin('b4', 'demo-7', 'relecteur', '08:41', 2), fin('b4', 'demo-7', 'relecteur', '08:28', 1)]
    );
    expect(enCours(t, 'relecteur')).toEqual(['demo-7']);
  });

  it('3uv.40 critère 1 : a role agent in a shell, resumed after its session ended, is in progress', () => {
    const home = avecAgentShell('s7', 'developpeur', 'demo-6', ['08:30', '>08:40', '08:50']);
    const ps = ligneEnveloppe(RACINE, 'demo-6', 'developpeur');
    const t = plateau(home, ['demo-6'], [fin('s7', 'demo-6', 'developpeur', '08:30', 1)], ps);
    expect(enCours(t, 'developpeur')).toEqual(['demo-6']);
    expect(partout(t, 'attend')).not.toContain('demo-6');
  });
});

describe('3uv.40 critère 2 : an agent whose last end is not older than its last writing stays finished', () => {
  it('3uv.40 critères 2 et 4 : a reviewer whose last end is its last message, its file just written, is finished', () => {
    const home = avecSousAgent('a9', 'relecteur', 'demo-5', ['08:28', '08:41']);
    const t = plateau(
      home,
      ['demo-5'],
      [fin('a9', 'demo-5', 'relecteur', '08:28', 1), fin('a9', 'demo-5', 'relecteur', '08:41', 2)]
    );
    expect(partout(t, 'enCours')).not.toContain('demo-5');
    expect(partout(t, 'attend')).toContain('demo-5');
  });

  it('3uv.40 critère 2 : a latest end after the last writing keeps it finished, an older line after it notwithstanding', () => {
    const home = avecSousAgent('c2', 'relecteur', 'demo-8', ['08:28', '08:41']);
    const t = plateau(
      home,
      ['demo-8'],
      [fin('c2', 'demo-8', 'relecteur', '08:50', 2), fin('c2', 'demo-8', 'relecteur', '08:28', 1)]
    );
    expect(partout(t, 'enCours')).not.toContain('demo-8');
  });
});

describe('3uv.40 critère 3 : a resumed agent counts its sessions already in the register once', () => {
  it('3uv.40 critère 3 : a running resumed reviewer counts its whole transcript once, in all and on its ticket', () => {
    const home = avecSousAgent('a9', 'relecteur', 'demo-5', [
      '08:28',
      '08:41',
      '>08:43',
      '08:45',
      '08:50',
    ]);
    const t = plateau(
      home,
      ['demo-5'],
      [fin('a9', 'demo-5', 'relecteur', '08:28', 1), fin('a9', 'demo-5', 'relecteur', '08:41', 2)]
    );
    // Its turns: 08:00 → 08:41, then 08:43 → 08:50; the wait for the message left out.
    expect(t.global.cumul).toEqual({ travail: 48 * MIN, jetons: 40 });
    const ligneTicket = t.agents.find(b => b.role === 'relecteur')!.enCours[0];
    expect(ligneTicket).toMatchObject({ travail: 48 * MIN, jetons: 40 });
  });

  it('3uv.40 critère 3 : two different agents on one ticket both count', () => {
    const home = mkdtempSync(path.join(ESSAIS, 'home-repris-'));
    const t = plateau(
      home,
      ['demo-5'],
      [fin('t1', 'demo-5', 'testeur', '08:28', 1), fin('a9', 'demo-5', 'relecteur', '08:41', 2)]
    );
    expect(t.global.cumul).toEqual({ travail: 69 * MIN, jetons: 30 });
  });
});

// The last writing of a transcript, around now: its last message `ilYa` ms ago.
const ilYa = (ms: number) => new Date(Date.now() - ms).toISOString();
const SEC = 1000;

describe('3uv.40 critère 4 : the time of a transcript is the time written in its messages, not the file date', () => {
  it('3uv.40 critère 4 : an incoming message after the last end runs, its file dated before that end notwithstanding', () => {
    const home = mkdtempSync(path.join(ESSAIS, 'home-repris-'));
    const sous = path.join(home, '.claude/projects/-depot/sess/subagents');
    mkdirSync(sous, { recursive: true });
    const f = path.join(sous, 'agent-d4.jsonl');
    writeFileSync(
      f,
      [
        l({
          type: 'user',
          timestamp: ilYa(100 * SEC),
          message: { content: 'TON TICKET : demo-9 — le lot' },
        }),
        l({
          type: 'assistant',
          timestamp: ilYa(60 * SEC),
          message: { id: 'm0', usage: { input_tokens: 6, output_tokens: 4 } },
        }),
        l({
          type: 'user',
          timestamp: ilYa(30 * SEC),
          origin: { kind: 'human' },
          message: { content: 'Relis le lot.' },
        }),
        l({
          type: 'assistant',
          timestamp: ilYa(20 * SEC),
          message: { id: 'm1', usage: { input_tokens: 6, output_tokens: 4 } },
        }),
      ].join('\n')
    );
    writeFileSync(path.join(sous, 'agent-d4.meta.json'), l({ agentType: 'relecteur' }));
    // The file is dated 80 s ago (still recent), before the end in the register (60 s ago).
    const date = (Date.now() - 80 * SEC) / 1000;
    utimesSync(f, date, date);
    const registre = [
      {
        projet: RACINE,
        agent: 'd4',
        ticket: 'demo-9',
        role: 'relecteur',
        debut: ilYa(100 * SEC),
        fin: ilYa(60 * SEC),
        travail: 40 * SEC,
        jetons: 10,
        cache: 0,
        cout: null,
      },
    ];
    const t = plateau(home, ['demo-9'], registre);
    expect(enCours(t, 'relecteur')).toEqual(['demo-9']);
  });
});

// A repository whose Beads answers from a file: a fake `bd` on the PATH, the register in a file.
const depotFactice = (tickets: object[], registre: object[]) => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-repris-'));
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-repris-'));
  writeFileSync(path.join(bin, 'tous.json'), JSON.stringify(tickets));
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\ncase "$1" in\n  config) echo demo ;;\n  list) cat '${bin}/tous.json' ;;\n  *) echo '[]' ;;\nesac\n`,
    { mode: 0o755 }
  );
  const fichier = path.join(bin, 'registre.jsonl');
  writeFileSync(fichier, registre.map(r => l({ ...r, projet: racine })).join('\n') + '\n');
  vi.stubEnv('PATH', `${bin}:${process.env.PATH}`);
  vi.stubEnv('GRILLHOUSE_REGISTRE', fichier);
  return racine;
};

interface Fiche {
  jetons: number;
}
interface Ligne {
  ticket?: string;
  travail?: number;
  jetons?: number;
}

describe('3uv.40 critère 5 : an agent resumed then finished again counts each of its sessions once, in all its measures', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('3uv.40 critère 5 : a resumed reviewer finished again counts its latest reading only, in all', () => {
    const home = mkdtempSync(path.join(ESSAIS, 'home-repris-'));
    const t = plateau(
      home,
      ['demo-5'],
      [fin('a9', 'demo-5', 'relecteur', '08:28', 1), fin('a9', 'demo-5', 'relecteur', '08:41', 2)]
    );
    expect(t.global.cumul).toEqual({ travail: 41 * MIN, jetons: 20 });
  });

  it('3uv.40 critère 5 : the latest reading is the latest end, whatever the order of the register lines', () => {
    const home = mkdtempSync(path.join(ESSAIS, 'home-repris-'));
    const t = plateau(
      home,
      ['demo-5'],
      [fin('a9', 'demo-5', 'relecteur', '08:41', 2), fin('a9', 'demo-5', 'relecteur', '08:28', 1)]
    );
    expect(t.global.cumul).toEqual({ travail: 41 * MIN, jetons: 20 });
  });

  it('3uv.40 critère 5 : the waiting line of its ticket counts its latest reading only', () => {
    const home = mkdtempSync(path.join(ESSAIS, 'home-repris-'));
    const t = plateau(
      home,
      ['demo-5'],
      [fin('a9', 'demo-5', 'relecteur', '08:28', 1), fin('a9', 'demo-5', 'relecteur', '08:41', 2)]
    );
    const ligne = t.agents
      .flatMap(b => b.attend as (Ligne & { id: string })[])
      .find(x => x.id === 'demo-5');
    expect(ligne).toMatchObject({ travail: 41 * MIN, jetons: 20 });
  });

  it('3uv.40 critère 5 : the card of its ticket counts its latest reading only, another agent on it added', () => {
    const home = mkdtempSync(path.join(ESSAIS, 'home-repris-'));
    const racine = depotFactice(
      [T('demo-1', { issue_type: 'epic' }), T('demo-5', { parent: 'demo-1' })],
      [
        fin('a9', 'demo-5', 'relecteur', '08:28', 1),
        fin('t1', 'demo-5', 'testeur', '08:20', 3),
        fin('a9', 'demo-5', 'relecteur', '08:41', 2),
      ]
    );
    const t = tableau(racine, { home }) as unknown as { fiches: Record<string, Fiche> };
    expect(t.fiches['demo-5']).toBeDefined();
    expect(t.fiches['demo-5'].jetons).toBe(50);
  });
});

// A sub-agent of `ticket` whose transcript ends `fini` ms ago, its file just written (recent);
// resumed `relance` ms ago by a message of the person, when given.
const avecSousAgentRecent = (id: string, ticket: string, fini: number, relance?: number) => {
  const home = mkdtempSync(path.join(ESSAIS, 'home-repris-'));
  const sous = path.join(home, '.claude/projects/-depot/sess/subagents');
  mkdirSync(sous, { recursive: true });
  writeFileSync(
    path.join(sous, `agent-${id}.jsonl`),
    [
      l({
        type: 'user',
        timestamp: ilYa(fini + 60 * SEC),
        message: { content: `TON TICKET : ${ticket} — le lot` },
      }),
      ...(relance === undefined
        ? []
        : [
            l({
              type: 'user',
              timestamp: ilYa(relance),
              origin: { kind: 'human' },
              message: { content: 'Relis le lot.' },
            }),
          ]),
      l({
        type: 'assistant',
        timestamp: ilYa(fini),
        message: { id: 'm0', usage: { input_tokens: 6, output_tokens: 4 } },
      }),
    ].join('\n')
  );
  writeFileSync(path.join(sous, `agent-${id}.meta.json`), l({ agentType: 'relecteur' }));
  return home;
};
// Its register line: its end is its last message (`fini` ms ago), or `finInscrite` ms ago.
const finRecente = (id: string, ticket: string, fini: number, finInscrite = fini) => ({
  projet: RACINE,
  agent: id,
  ticket,
  role: 'relecteur',
  debut: ilYa(fini + 60 * SEC),
  fin: ilYa(finInscrite),
  travail: 60 * SEC,
  jetons: 10,
  cache: 0,
  cout: null,
});

interface Panneau {
  global: { compteurs: { enCours: number; enAttente: number } };
  alertes: { texte: string }[];
  agents: Bloc[];
}
const panneau = (home: string, tickets: object[], registre: object[]): Panneau => {
  const maintenant = Date.now();
  const vivants = lireVivant({ racine: RACINE, home, prefix: 'demo', maintenant, ps: '' });
  return assembler({
    tous: tickets,
    prefix: 'demo',
    registre,
    vivants,
    maintenant,
    jour: maintenant - 24 * 60 * MIN,
  }) as Panneau;
};
// The alert of a ticket in progress without anything running; the board names it by its number.
const sansRien = (p: Panneau, id: string) =>
  p.alertes.some(a => a.texte === `${id.replace(/^demo-/, '')} en cours sans rien qui tourne`);
// A ticket claimed 40 minutes ago (past the 30 minutes of the alert), or open and ready.
const reclame = (id: string) => T(id, { status: 'in_progress', started_at: ilYa(40 * MIN) });
const ouvert = (id: string) => T(id, { status: 'open', started_at: undefined });

describe('3uv.40 critère 6 : the board has one definition of a running agent, for its tickets in progress and its alert', () => {
  it('3uv.40 critère 6 : a ticket in progress whose only sub-agent just finished raises the alert', () => {
    const home = avecSousAgentRecent('e1', 'demo-3', 30 * SEC);
    const p = panneau(home, [reclame('demo-3')], [finRecente('e1', 'demo-3', 30 * SEC)]);
    expect(sansRien(p, 'demo-3')).toBe(true);
    expect(partout(p as unknown as Board, 'enCours')).not.toContain('demo-3');
  });

  it('3uv.40 critère 6 : a ticket in progress whose sub-agent ended after its last message raises the alert', () => {
    const home = avecSousAgentRecent('e2', 'demo-4', 50 * SEC);
    const p = panneau(home, [reclame('demo-4')], [finRecente('e2', 'demo-4', 50 * SEC, 20 * SEC)]);
    expect(sansRien(p, 'demo-4')).toBe(true);
  });

  it('3uv.40 critère 6 : an open ticket whose only sub-agent just finished counts ready, not in progress', () => {
    const home = avecSousAgentRecent('e3', 'demo-2', 30 * SEC);
    const p = panneau(home, [ouvert('demo-2')], [finRecente('e3', 'demo-2', 30 * SEC)]);
    expect(p.global.compteurs).toMatchObject({ enCours: 0, enAttente: 1 });
  });

  it('3uv.40 critère 6 : among two tickets, only the one whose agent runs counts in progress', () => {
    const home = avecSousAgentRecent('e3', 'demo-2', 30 * SEC);
    const sous = path.join(home, '.claude/projects/-depot/sess/subagents');
    writeFileSync(
      path.join(sous, 'agent-e4.jsonl'),
      [
        l({
          type: 'user',
          timestamp: ilYa(90 * SEC),
          message: { content: 'TON TICKET : demo-8 — le lot' },
        }),
        l({
          type: 'user',
          timestamp: ilYa(30 * SEC),
          origin: { kind: 'human' },
          message: { content: 'Relis le lot.' },
        }),
        l({
          type: 'assistant',
          timestamp: ilYa(10 * SEC),
          message: { id: 'm0', usage: { input_tokens: 6, output_tokens: 4 } },
        }),
      ].join('\n')
    );
    writeFileSync(path.join(sous, 'agent-e4.meta.json'), l({ agentType: 'relecteur' }));
    // e4 resumed: a message (30 s ago) follows its end in the register (60 s ago).
    const p = panneau(
      home,
      [ouvert('demo-2'), ouvert('demo-8')],
      [finRecente('e3', 'demo-2', 30 * SEC), finRecente('e4', 'demo-8', 60 * SEC)]
    );
    expect(p.global.compteurs).toMatchObject({ enCours: 1, enAttente: 1 });
  });

  it('3uv.40 critère 6 : a ticket in progress whose sub-agent was resumed after its end raises no alert', () => {
    const home = avecSousAgentRecent('e5', 'demo-6', 10 * SEC, 30 * SEC);
    const p = panneau(home, [reclame('demo-6')], [finRecente('e5', 'demo-6', 10 * SEC, 60 * SEC)]);
    expect(sansRien(p, 'demo-6')).toBe(false);
  });
});

// BPScript 320.5.2: a mother and its children per component, led one after the other in one copy.
// While an agent runs on one ticket of the circuit, the others wait their turn: the circuit lives.
describe('the alert « en cours sans rien qui tourne » names a whole silent circuit only', () => {
  const vivant = (ticket: string) => ({
    agent: `a-${ticket}`,
    ticket,
    role: 'developpeur',
    ligne: false,
    depuis: Date.now() - MIN,
    entre: null,
    jetons: 0,
    travail: 0,
    tours: [],
  });
  const circuit = (vivants: object[]) => {
    const maintenant = Date.now();
    return assembler({
      tous: [
        reclame('demo-9'),
        { ...reclame('demo-9.1'), parent: 'demo-9' },
        { ...reclame('demo-9.2'), parent: 'demo-9' },
        reclame('demo-10'),
      ],
      prefix: 'demo',
      registre: [],
      vivants,
      maintenant,
      jour: maintenant - 24 * 60 * MIN,
    }) as Panneau;
  };

  it('the children waiting while an agent runs on their mother raise no alert', () => {
    const p = circuit([vivant('demo-9')]);
    expect(sansRien(p, 'demo-9.1')).toBe(false);
    expect(sansRien(p, 'demo-9.2')).toBe(false);
  });
  it('the mother and a sibling waiting while an agent runs on one child raise no alert', () => {
    const p = circuit([vivant('demo-9.2')]);
    expect(sansRien(p, 'demo-9')).toBe(false);
    expect(sansRien(p, 'demo-9.1')).toBe(false);
  });
  it('a circuit where nothing runs raises the alert for each of its tickets, another circuit running notwithstanding', () => {
    const p = circuit([vivant('demo-10')]);
    expect(sansRien(p, 'demo-9')).toBe(true);
    expect(sansRien(p, 'demo-9.1')).toBe(true);
    expect(sansRien(p, 'demo-10')).toBe(false);
  });
});
