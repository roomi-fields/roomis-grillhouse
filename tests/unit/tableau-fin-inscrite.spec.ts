// An agent is resumed when an incoming message (a message of the person, of another agent, a
// notification: the turns of grillhouse-3uv.41) follows its latest end in the register; the events
// of its last turn written after that end (its final answer, an attachment, a tool's result) leave
// it finished. Its ticket closed, those late writings show no agent running on it. The header of
// the board's script tells its rules true, in 100 columns (grillhouse-3uv.45).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { assembler, lignes, lireVivant } from '../../scripts/tableau.mjs';
import { ligneEnveloppe } from './tableau-essai.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-fin-inscrite-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = '/depot';
const SCRIPT = path.resolve(__dirname, '../../scripts/tableau.mjs');
const l = (o: object) => JSON.stringify(o);
const SEC = 1000;
const MIN = 60 * SEC;
// The times of a trial: `m` minutes (and `s` seconds) after a start 40 minutes before now.
const DEPART = Date.now() - 40 * MIN;
const quand = (m: number, s = 0) => new Date(DEPART + m * MIN + s * SEC).toISOString();

// The events of a transcript, each at its time.
type Evenement = (t: string) => object;
const invite =
  (ticket: string): Evenement =>
  t => ({ type: 'user', timestamp: t, message: { content: `TON TICKET : ${ticket} — le lot` } });
let n = 0;
const reponse: Evenement = t => ({
  type: 'assistant',
  timestamp: t,
  message: { id: `m${n++}`, usage: { input_tokens: 6, output_tokens: 4 } },
});
// The events of a turn that open none.
const piece: Evenement = t => ({
  type: 'attachment',
  timestamp: t,
  attachment: { type: 'file', filename: 'lot.patch' },
});
const outil: Evenement = t => ({
  type: 'user',
  timestamp: t,
  message: { content: [{ type: 'tool_result', tool_use_id: 'u1', content: 'ok' }] },
});
const meta: Evenement = t => ({
  type: 'user',
  timestamp: t,
  isMeta: true,
  message: { content: '<system-reminder>rappel</system-reminder>' },
});
const systeme: Evenement = t => ({
  type: 'system',
  subtype: 'turn_duration',
  timestamp: t,
  durationMs: 4000,
});
const interruption: Evenement = t => ({
  type: 'user',
  timestamp: t,
  message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] },
});
// The incoming messages.
const venu =
  (kind: string): Evenement =>
  t => ({ type: 'user', timestamp: t, origin: { kind }, message: { content: 'Relis le lot.' } });
const personne = venu('human');
const pair = venu('peer');
const avis = venu('task-notification');
// The supervisor's message that resumes a sub-agent: a meta message with its own origin.
const coordinateur: Evenement = t => ({
  type: 'user',
  timestamp: t,
  isMeta: true,
  origin: { kind: 'coordinator' },
  message: { content: 'The coordinator sent a message while you were working:\nRelis le lot.' },
});
const sansOrigine: Evenement = t => ({
  type: 'user',
  timestamp: t,
  message: { content: 'Relis le lot.' },
});

type Pas = [Evenement, string];
const texte = (pas: Pas[], role?: string) =>
  [
    ...(role ? [l({ type: 'agent-setting', agentSetting: role })] : []),
    ...pas.map(([e, t]) => l(e(t))),
  ].join('\n');

// A home with a sub-agent's transcript (written now, so it counts as recent).
const sousAgent = (id: string, role: string, pas: Pas[]) => {
  const home = mkdtempSync(path.join(ESSAIS, 'home-'));
  const sous = path.join(home, '.claude/projects/-depot/sess/subagents');
  mkdirSync(sous, { recursive: true });
  writeFileSync(path.join(sous, `agent-${id}.jsonl`), texte(pas));
  writeFileSync(path.join(sous, `agent-${id}.meta.json`), l({ agentType: role }));
  return home;
};
// Another sub-agent in the same home.
const ajouter = (home: string, id: string, role: string, pas: Pas[]) => {
  const sous = path.join(home, '.claude/projects/-depot/sess/subagents');
  writeFileSync(path.join(sous, `agent-${id}.jsonl`), texte(pas));
  writeFileSync(path.join(sous, `agent-${id}.meta.json`), l({ agentType: role }));
};
// A home with a role agent launched in a shell, working in its copy; its process still listed.
const agentShell = (session: string, role: string, ticket: string, pas: Pas[]) => {
  const home = mkdtempSync(path.join(ESSAIS, 'home-'));
  const copie = path.join(home, `.claude/projects/-depot--claude-worktrees-${ticket}`);
  mkdirSync(copie, { recursive: true });
  writeFileSync(path.join(copie, `${session}.jsonl`), texte(pas, role));
  return { home, ps: ligneEnveloppe(RACINE, ticket, role) };
};

// The register's line of a stop at `fin`.
const arret = (agent: string, ticket: string, role: string, fin: string) => ({
  projet: RACINE,
  agent,
  ticket,
  role,
  debut: quand(0),
  fin,
  travail: Date.parse(fin) - DEPART,
  jetons: 10,
  cache: 0,
  cout: null,
});

// A fixture ticket is in the circuit (label `circuit`): the owner launched it.
const T = (id: string, o: object = {}) => ({
  id,
  title: `${id.slice(5)} — Sujet ${id.slice(5)}`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: quand(0),
  labels: ['circuit'],
  ...o,
});

interface Bloc {
  role: string;
  enCours: { id: string }[];
  attend: ({ id: string } & Mesure)[];
}
interface Mesure {
  travail: number;
  jetons: number;
}
interface Board {
  global: { compteurs: { enCours: number; fermes: number }; jour: Mesure; cumul: Mesure };
  agents: Bloc[];
  faitsDuJour: { id: string }[];
}
interface Ligne {
  texte: string;
  ticket?: string;
  section?: string;
}

const plateau = (home: string, tous: object[], registre: object[], ps = ''): Board => {
  const maintenant = Date.now();
  const vivants = lireVivant({ racine: RACINE, home, prefix: 'demo', maintenant, ps });
  return assembler({
    tous,
    prefix: 'demo',
    registre,
    vivants,
    maintenant,
    jour: maintenant - 24 * 60 * MIN,
  }) as Board;
};
const enCours = (t: Board) => t.agents.flatMap(b => b.enCours.map(x => x.id));
const enCoursDe = (t: Board, role: string) =>
  t.agents.find(b => b.role === role)!.enCours.map(x => x.id);
const attend = (t: Board) => t.agents.flatMap(b => b.attend.map(x => x.id));

// The events after the end that belong to the last turn, and the incoming messages.
const DU_DERNIER_TOUR: [string, Evenement][] = [
  ['its final answer', reponse],
  ['an attachment', piece],
  ["a tool's result", outil],
  ['a meta message', meta],
  ['a system event', systeme],
  ['the interruption mark', interruption],
];
const ENTRANTS: [string, Evenement][] = [
  ['a message of the person', personne],
  ['a message of another agent', pair],
  ['a notification', avis],
  ['a message of the supervisor that resumes a sub-agent', coordinateur],
  ['a message without origin', sansOrigine],
];

describe('3uv.45 critère 1 : an agent followed after its end only by events of its last turn stays finished', () => {
  it('3uv.45 critère 1 : the witness — an integrator whose final answer comes 5 s after its end is finished', () => {
    const home = sousAgent('a76', 'integrateur', [
      [invite('demo-5'), quand(0)],
      [reponse, quand(10)],
      [reponse, quand(20, 42)],
      [reponse, quand(20, 47)],
    ]);
    const t = plateau(home, [T('demo-5')], [arret('a76', 'demo-5', 'integrateur', quand(20, 42))]);
    expect(enCours(t)).not.toContain('demo-5');
    expect(attend(t)).toContain('demo-5');
  });

  it.each(DU_DERNIER_TOUR)(
    '3uv.45 critère 1 : a reviewer followed after its end by %s only is finished, waiting for the next role',
    (_, apres) => {
      const home = sousAgent('r1', 'relecteur', [
        [invite('demo-6'), quand(0)],
        [reponse, quand(15)],
        [apres, quand(15, 3)],
      ]);
      const t = plateau(home, [T('demo-6')], [arret('r1', 'demo-6', 'relecteur', quand(15))]);
      expect(enCours(t)).not.toContain('demo-6');
      expect(attend(t)).toContain('demo-6');
    }
  );

  it('3uv.45 critères 1 et 9 : every sort of last-turn event after the end, one after the other, leaves it finished', () => {
    const home = sousAgent('r2', 'relecteur', [
      [invite('demo-6'), quand(0)],
      [reponse, quand(15)],
      ...DU_DERNIER_TOUR.map(([, e], i): Pas => [e, quand(15, i + 1)]),
    ]);
    const t = plateau(home, [T('demo-6')], [arret('r2', 'demo-6', 'relecteur', quand(15))]);
    expect(enCours(t)).not.toContain('demo-6');
  });

  it('3uv.45 critère 1 : a role agent in a shell whose final answer follows its end is finished', () => {
    const { home, ps } = agentShell('s7', 'developpeur', 'demo-7', [
      [invite('demo-7'), quand(0)],
      [reponse, quand(12)],
      [reponse, quand(12, 4)],
    ]);
    const t = plateau(home, [T('demo-7')], [arret('s7', 'demo-7', 'developpeur', quand(12))], ps);
    expect(enCours(t)).not.toContain('demo-7');
  });

  it('3uv.45 critère 1 : a message before the end, then only its turn after it, leaves it finished', () => {
    const home = sousAgent('r3', 'relecteur', [
      [invite('demo-8'), quand(0)],
      [reponse, quand(10)],
      [personne, quand(20)],
      [reponse, quand(25)],
      [reponse, quand(25, 4)],
      [piece, quand(25, 5)],
    ]);
    const t = plateau(
      home,
      [T('demo-8')],
      [arret('r3', 'demo-8', 'relecteur', quand(10)), arret('r3', 'demo-8', 'relecteur', quand(25))]
    );
    expect(enCours(t)).not.toContain('demo-8');
  });

  it('3uv.45 critère 1 : a message between two ends counts against the latest end, whatever the order of the lines', () => {
    const home = sousAgent('r4', 'relecteur', [
      [invite('demo-8'), quand(0)],
      [reponse, quand(10)],
      [avis, quand(20)],
      [reponse, quand(25)],
      [reponse, quand(25, 4)],
    ]);
    const t = plateau(
      home,
      [T('demo-8')],
      [arret('r4', 'demo-8', 'relecteur', quand(25)), arret('r4', 'demo-8', 'relecteur', quand(10))]
    );
    expect(enCours(t)).not.toContain('demo-8');
  });
});

describe('3uv.45 critère 2 : an agent whose end is followed by an incoming message runs', () => {
  it.each(ENTRANTS)(
    '3uv.45 critère 2 : a reviewer followed after its end by %s is in progress, waiting nowhere',
    (_, message) => {
      const home = sousAgent('r5', 'relecteur', [
        [invite('demo-9'), quand(0)],
        [reponse, quand(15)],
        [message, quand(20)],
        [reponse, quand(21)],
      ]);
      const t = plateau(home, [T('demo-9')], [arret('r5', 'demo-9', 'relecteur', quand(15))]);
      expect(enCoursDe(t, 'relecteur')).toEqual(['demo-9']);
      expect(attend(t)).not.toContain('demo-9');
    }
  );

  it('3uv.45 critère 2 : an incoming message as the last event, no answer yet, runs', () => {
    const home = sousAgent('r6', 'relecteur', [
      [invite('demo-9'), quand(0)],
      [reponse, quand(15)],
      [personne, quand(20)],
    ]);
    const t = plateau(home, [T('demo-9')], [arret('r6', 'demo-9', 'relecteur', quand(15))]);
    expect(enCoursDe(t, 'relecteur')).toEqual(['demo-9']);
  });

  it('3uv.45 critère 2 : an incoming message one millisecond after the end runs', () => {
    const fin = quand(15);
    const juste = new Date(Date.parse(fin) + 1).toISOString();
    const home = sousAgent('r7', 'relecteur', [
      [invite('demo-9'), quand(0)],
      [reponse, fin],
      [pair, juste],
      [reponse, quand(16)],
    ]);
    const t = plateau(home, [T('demo-9')], [arret('r7', 'demo-9', 'relecteur', fin)]);
    expect(enCoursDe(t, 'relecteur')).toEqual(['demo-9']);
  });

  it('3uv.45 critère 2 : a message after the latest of two ends runs, whatever the order of the lines', () => {
    const home = sousAgent('r8', 'relecteur', [
      [invite('demo-9'), quand(0)],
      [reponse, quand(10)],
      [personne, quand(12)],
      [reponse, quand(20)],
      [personne, quand(25)],
      [reponse, quand(26)],
    ]);
    const t = plateau(
      home,
      [T('demo-9')],
      [arret('r8', 'demo-9', 'relecteur', quand(20)), arret('r8', 'demo-9', 'relecteur', quand(10))]
    );
    expect(enCoursDe(t, 'relecteur')).toEqual(['demo-9']);
  });

  it('3uv.45 critère 2 : a role agent in a shell followed after its end by a message of the person runs', () => {
    const { home, ps } = agentShell('s8', 'developpeur', 'demo-7', [
      [invite('demo-7'), quand(0)],
      [reponse, quand(12)],
      [personne, quand(18)],
      [reponse, quand(19)],
    ]);
    const t = plateau(home, [T('demo-7')], [arret('s8', 'demo-7', 'developpeur', quand(12))], ps);
    expect(enCoursDe(t, 'developpeur')).toEqual(['demo-7']);
  });
});

describe('3uv.45 critère 3 : a closed ticket has no agent running from writings after its agents ended', () => {
  const TOUS = [
    T('demo-e', { issue_type: 'epic', title: 'e — Le chantier' }),
    T('demo-e.1', { parent: 'demo-e' }),
    T('demo-e.2', { parent: 'demo-e', status: 'closed', closed_at: quand(22) }),
  ];
  const avecFinTardive = () => {
    const home = sousAgent('t1', 'testeur', [
      [invite('demo-e.2'), quand(0)],
      [reponse, quand(5)],
      [reponse, quand(5, 4)],
    ]);
    ajouter(home, 'i1', 'integrateur', [
      [invite('demo-e.2'), quand(15)],
      [reponse, quand(20, 42)],
      [reponse, quand(20, 47)],
      [piece, quand(20, 48)],
    ]);
    return plateau(home, TOUS, [
      arret('t1', 'demo-e.2', 'testeur', quand(5)),
      arret('i1', 'demo-e.2', 'integrateur', quand(20, 42)),
    ]);
  };

  it('3uv.45 critère 3 : no agent block shows the closed ticket in progress', () => {
    expect(enCours(avecFinTardive())).not.toContain('demo-e.2');
  });

  it('3uv.45 critère 3 : the closed ticket counts done, none in progress', () => {
    expect(avecFinTardive().global.compteurs).toMatchObject({ enCours: 1, fermes: 1 });
  });

  it("3uv.45 critère 3 : its lines stand in FAITS AUJOURD'HUI only, none in the agents' section", () => {
    const t = avecFinTardive();
    expect(t.faitsDuJour.map(x => x.id)).toContain('demo-e.2');
    const siennes = (lignes(t, 'demo') as Ligne[]).filter(x => x.ticket === 'demo-e.2');
    expect(siennes.length).toBeGreaterThan(0);
    expect([...new Set(siennes.map(x => x.section))]).toEqual(['faits']);
  });
});

describe('3uv.45 critère 5 : an incoming message stamped exactly at the end resumes nothing', () => {
  it.each(ENTRANTS)(
    '3uv.45 critère 5 : %s at the very time of the end, then answers, leaves it finished',
    (_, message) => {
      const fin = quand(15);
      const home = sousAgent('r10', 'relecteur', [
        [invite('demo-9'), quand(0)],
        [reponse, quand(14)],
        [message, fin],
        [reponse, quand(15, 2)],
        [piece, quand(15, 3)],
      ]);
      const t = plateau(home, [T('demo-9')], [arret('r10', 'demo-9', 'relecteur', fin)]);
      expect(enCours(t)).not.toContain('demo-9');
    }
  );

  it('3uv.45 critère 5 : a shell agent sent a message at the very time of its end stays finished', () => {
    const fin = quand(12);
    const { home, ps } = agentShell('s9', 'developpeur', 'demo-7', [
      [invite('demo-7'), quand(0)],
      [reponse, quand(11)],
      [pair, fin],
      [reponse, quand(12, 5)],
    ]);
    const t = plateau(home, [T('demo-7')], [arret('s9', 'demo-7', 'developpeur', fin)], ps);
    expect(enCours(t)).not.toContain('demo-7');
  });

  it('3uv.45 critère 5 : at the latest of two ends, a message at its very time resumes nothing', () => {
    const home = sousAgent('r11', 'relecteur', [
      [invite('demo-9'), quand(0)],
      [reponse, quand(10)],
      [personne, quand(12)],
      [reponse, quand(19)],
      [avis, quand(20)],
      [reponse, quand(20, 3)],
    ]);
    const t = plateau(
      home,
      [T('demo-9')],
      [
        arret('r11', 'demo-9', 'relecteur', quand(20)),
        arret('r11', 'demo-9', 'relecteur', quand(10)),
      ]
    );
    expect(enCours(t)).not.toContain('demo-9');
  });
});

describe('3uv.45 critère 6 : an agent without an end runs while its transcript moved in the last 2 minutes', () => {
  const sansFin = (id: string, ageMs: number, pas: Pas[]) => {
    const home = sousAgent(id, 'relecteur', pas);
    const f = path.join(home, `.claude/projects/-depot/sess/subagents/agent-${id}.jsonl`);
    const quandBouge = new Date(Date.now() - ageMs);
    utimesSync(f, quandBouge, quandBouge);
    return home;
  };

  it('3uv.45 critère 6 : a sub-agent without an end whose transcript moved now is in progress', () => {
    const home = sansFin('n1', 0, [
      [invite('demo-9'), quand(0)],
      [reponse, quand(30)],
    ]);
    const t = plateau(home, [T('demo-9')], []);
    expect(enCoursDe(t, 'relecteur')).toEqual(['demo-9']);
  });

  it('3uv.45 critère 6 : without an end, only events of its turn (no incoming message after the first) still run', () => {
    const home = sansFin('n2', 30 * SEC, [
      [invite('demo-9'), quand(0)],
      [reponse, quand(30)],
      [outil, quand(30, 2)],
      [piece, quand(30, 3)],
    ]);
    const t = plateau(home, [T('demo-9')], []);
    expect(enCoursDe(t, 'relecteur')).toEqual(['demo-9']);
  });

  it('3uv.45 critère 6 : a sub-agent without an end whose transcript last moved 3 minutes ago is not in progress', () => {
    const home = sansFin('n3', 3 * MIN, [
      [invite('demo-9'), quand(0)],
      [reponse, quand(30)],
    ]);
    const t = plateau(home, [T('demo-9')], []);
    expect(enCours(t)).not.toContain('demo-9');
  });

  it('3uv.45 critère 6 : another agent ending does not end it — the end of another agent counts against that one only', () => {
    const home = sansFin('n4', 0, [
      [invite('demo-9'), quand(0)],
      [reponse, quand(30)],
    ]);
    const t = plateau(home, [T('demo-9')], [arret('autre', 'demo-9', 'testeur', quand(35))]);
    expect(enCoursDe(t, 'relecteur')).toEqual(['demo-9']);
  });
});

describe('3uv.45 critère 10 : a shell agent without an end runs while its process runs, its transcript still', () => {
  // A shell agent whose transcript last moved `ageMs` ago, its process listed or not.
  const immobile = (session: string, role: string, ticket: string, ageMs: number) => {
    const { home, ps } = agentShell(session, role, ticket, [
      [invite(ticket), quand(0)],
      [reponse, quand(5)],
    ]);
    const f = path.join(
      home,
      `.claude/projects/-depot--claude-worktrees-${ticket}/${session}.jsonl`
    );
    const quandBouge = new Date(Date.now() - ageMs);
    utimesSync(f, quandBouge, quandBouge);
    return { home, ps };
  };

  it.each([
    ['3 minutes', 3 * MIN],
    ['15 minutes', 15 * MIN],
    ['35 minutes', 35 * MIN],
  ])(
    '3uv.45 critère 10 : a developer in a shell whose transcript last moved %s ago, its process running, is in progress',
    (_, age) => {
      const { home, ps } = immobile('s20', 'developpeur', 'demo-7', age);
      const t = plateau(home, [T('demo-7')], [], ps);
      expect(enCoursDe(t, 'developpeur')).toEqual(['demo-7']);
    }
  );

  it('3uv.45 critère 10 : another role and ticket in a shell, still for 5 minutes, process running, is in progress', () => {
    const { home, ps } = immobile('s21', 'testeur', 'demo-8', 5 * MIN);
    const t = plateau(home, [T('demo-8')], [], ps);
    expect(enCoursDe(t, 'testeur')).toEqual(['demo-8']);
  });

  it('3uv.45 critère 10 : the same shell agent, its process gone, is not in progress', () => {
    const { home } = immobile('s22', 'developpeur', 'demo-7', 5 * MIN);
    const t = plateau(home, [T('demo-7')], [], '');
    expect(enCours(t)).not.toContain('demo-7');
  });
});

describe('3uv.45 critère 7 : an agent of a closed ticket followed after its end by an incoming message runs', () => {
  const TOUS = [
    T('demo-e', { issue_type: 'epic', title: 'e — Le chantier' }),
    T('demo-e.1', { parent: 'demo-e' }),
    T('demo-e.2', { parent: 'demo-e', status: 'closed', closed_at: quand(22) }),
  ];

  it.each(ENTRANTS)(
    '3uv.45 critère 7 : the integrator of the closed ticket, sent %s after its end, is in progress',
    (_, message) => {
      const home = sousAgent('i2', 'integrateur', [
        [invite('demo-e.2'), quand(15)],
        [reponse, quand(20, 42)],
        [message, quand(25)],
        [reponse, quand(25, 5)],
      ]);
      const t = plateau(home, TOUS, [arret('i2', 'demo-e.2', 'integrateur', quand(20, 42))]);
      expect(enCoursDe(t, 'integrateur')).toEqual(['demo-e.2']);
    }
  );

  it('3uv.45 critère 7 : of two agents on the closed ticket, only the one sent a message runs', () => {
    const home = sousAgent('t2', 'testeur', [
      [invite('demo-e.2'), quand(0)],
      [reponse, quand(5)],
      [reponse, quand(5, 4)],
    ]);
    ajouter(home, 'i3', 'integrateur', [
      [invite('demo-e.2'), quand(15)],
      [reponse, quand(20, 42)],
      [personne, quand(25)],
      [reponse, quand(25, 5)],
    ]);
    const t = plateau(home, TOUS, [
      arret('t2', 'demo-e.2', 'testeur', quand(5)),
      arret('i3', 'demo-e.2', 'integrateur', quand(20, 42)),
    ]);
    expect(enCoursDe(t, 'integrateur')).toEqual(['demo-e.2']);
    expect(enCoursDe(t, 'testeur')).toEqual([]);
  });
});

describe('3uv.45 critère 8 : a finished agent is measured by its latest end, without what was written after it', () => {
  it('3uv.45 critère 8 : the tokens and time of the waiting ticket are those of the register, not of the late answer', () => {
    const home = sousAgent('a77', 'integrateur', [
      [invite('demo-5'), quand(0)],
      [reponse, quand(10)],
      [reponse, quand(20, 42)],
      [reponse, quand(20, 47)],
      [reponse, quand(20, 50)],
    ]);
    const fin = arret('a77', 'demo-5', 'integrateur', quand(20, 42));
    const t = plateau(home, [T('demo-5')], [fin]);
    const x = t.agents.flatMap(b => b.attend).find(a => a.id === 'demo-5');
    expect(x).toMatchObject({ jetons: fin.jetons, travail: fin.travail });
  });

  it("3uv.45 critère 8 : the board's totals, of the day and in all, are those of the register", () => {
    const home = sousAgent('a78', 'relecteur', [
      [invite('demo-6'), quand(0)],
      [reponse, quand(15)],
      [reponse, quand(15, 3)],
      [outil, quand(15, 4)],
      [reponse, quand(15, 9)],
    ]);
    const fin = arret('a78', 'demo-6', 'relecteur', quand(15));
    const t = plateau(home, [T('demo-6')], [fin]);
    expect(t.global.cumul).toEqual({ jetons: fin.jetons, travail: fin.travail });
    expect(t.global.jour).toEqual({ jetons: fin.jetons, travail: fin.travail });
  });

  it('3uv.45 critère 8 : of two ends, the measure is the latest one, whatever the order of the lines', () => {
    const home = sousAgent('a79', 'relecteur', [
      [invite('demo-6'), quand(0)],
      [reponse, quand(10)],
      [personne, quand(12)],
      [reponse, quand(20)],
      [reponse, quand(20, 5)],
    ]);
    const tard = { ...arret('a79', 'demo-6', 'relecteur', quand(20)), jetons: 25 };
    const tot = { ...arret('a79', 'demo-6', 'relecteur', quand(10)), jetons: 12 };
    const t = plateau(home, [T('demo-6')], [tard, tot]);
    expect(t.global.cumul).toEqual({ jetons: 25, travail: tard.travail });
  });
});

describe('3uv.45 critère 9 : an agent with no incoming message after its end is finished, whatever follows it', () => {
  it('3uv.45 critère 9 : writings long after the end, none incoming, leave it finished', () => {
    const home = sousAgent('r12', 'relecteur', [
      [invite('demo-6'), quand(0)],
      [reponse, quand(10)],
      [reponse, quand(20)],
      [outil, quand(25)],
      [meta, quand(30)],
      [reponse, quand(35)],
      [systeme, quand(38)],
    ]);
    const t = plateau(home, [T('demo-6')], [arret('r12', 'demo-6', 'relecteur', quand(10))]);
    expect(enCours(t)).not.toContain('demo-6');
    expect(attend(t)).toContain('demo-6');
  });

  it('3uv.45 critère 9 : a transcript with no incoming message at all, written after the end, is finished', () => {
    const home = sousAgent('r13', 'relecteur', [
      [reponse, quand(1)],
      [outil, quand(2)],
      [reponse, quand(15)],
      [piece, quand(16)],
    ]);
    const fin = arret('r13', 'demo-6', 'relecteur', quand(10));
    const t = plateau(home, [T('demo-6')], [fin]);
    expect(enCours(t)).not.toContain('demo-6');
    expect(t.global.cumul).toEqual({ jetons: fin.jetons, travail: fin.travail });
  });

  it('3uv.45 critère 9 : an interruption mark after the end is no incoming message', () => {
    const { home, ps } = agentShell('s10', 'developpeur', 'demo-7', [
      [invite('demo-7'), quand(0)],
      [reponse, quand(12)],
      [interruption, quand(14)],
      [reponse, quand(14, 2)],
    ]);
    const t = plateau(home, [T('demo-7')], [arret('s10', 'demo-7', 'developpeur', quand(12))], ps);
    expect(enCours(t)).not.toContain('demo-7');
  });
});

// The header of the script: its comment lines before the first import.
const ENTETE = (() => {
  const out: string[] = [];
  for (const ligne of readFileSync(SCRIPT, 'utf8').split('\n')) {
    if (ligne.startsWith('import ')) {
      break;
    }
    out.push(ligne);
  }
  return out;
})();
const PROSE = ENTETE.map(x => x.replace(/^\/\/ ?/, '').trim()).join(' ');

describe('3uv.45 critère 4 : the header of the board script tells true, in 100 columns', () => {
  it('3uv.45 critère 4 : the header was read, and no line of it passes 100 columns', () => {
    expect(ENTETE.length).toBeGreaterThan(10);
    expect(ENTETE.filter(x => x.length > 100)).toEqual([]);
  });

  it('3uv.45 critère 4 : it no longer says the open tickets by number replace the tree', () => {
    expect(PROSE).not.toMatch(/open tickets by number replace the tree/);
  });

  it('3uv.45 critère 4 : it says every line of each list shows, AGENTS before CHANTIER', () => {
    expect(PROSE).not.toMatch(/30 lines/);
    expect(PROSE).toMatch(
      /AGENTS, CHANTIER, then FAITS AUJOURD'HUI, every line of each list shown/
    );
  });

  it('3uv.45 critère 4 : it says an agent runs on an incoming message after its end, not on its last message', () => {
    expect(PROSE).not.toMatch(/last message is after its latest end/);
    expect(PROSE).toMatch(/incoming message/);
  });
});
