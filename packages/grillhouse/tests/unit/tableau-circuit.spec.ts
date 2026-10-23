// The circuit of a ticket on the board (scripts/circuit.mjs): its state
// `.claude/worktrees/<ticket>.circuit.json` and its process `grillhouse circuit <ticket>`.
// A circuit's ticket stands on one line, the only one of it in AGENTS, at the step of its state
// (scripts/etapes.mjs); one that stopped on a question for the supervisor stands under its step,
// after the line « ⤷ Question · <qui> », who must answer it (grillhouse-3uv.95.4), its card opening
// on that question; one stopped without a question stands at its step, its card opening on where it
// stopped, its stop's name and code and the first line of its reason.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { assembler, fiches, lignes, lireCircuits } from '../../scripts/tableau.mjs';
import { ligneCircuit } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-circuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const MIN = 60_000;
const at = (hm: string) => `2026-10-18T${hm}:00Z`;
const MAINTENANT = Date.parse(at('12:00'));

interface Ligne {
  texte: string;
  alterne?: string;
  ton?: string;
  ticket?: string;
  section?: string;
}
interface Board {
  alertes: { texte: string }[];
  agents: { roles: string[]; enCours: { id: string }[]; attend: { id: string }[] }[];
}

// A repository with the state of each circuit `etats` names, written as scripts/circuit.mjs
// writes it.
const depot = (etats: Record<string, object>) => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const dossier = path.join(racine, '.claude', 'worktrees');
  mkdirSync(dossier, { recursive: true });
  for (const [ticket, e] of Object.entries(etats)) {
    const etat = {
      etape: 'testwriter',
      composant: '.',
      tentative: 1,
      code: null,
      raison: null,
      rapport: null,
      dernier: '.',
      finale: false,
      seance: null,
      renvois: null,
      journal: path.join(dossier, `${ticket}.log`),
      ...e,
    };
    writeFileSync(
      path.join(dossier, `${ticket}.circuit.json`),
      `${JSON.stringify(etat, null, 2)}\n`
    );
  }
  return racine;
};
const circuits = (racine: string, ps = '') => lireCircuits({ racine, prefix: 'demo', ps });

const T = (id: string, o: object = {}) => ({
  id,
  title: `${id.slice(5)} — Le sujet de ${id} — packages/demo`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: at('07:00'),
  labels: ['circuit'],
  ...o,
});
const fin = (agent: string, ticket: string, role: string, hm: string) => ({
  projet: '/depot',
  agent,
  ticket,
  role,
  debut: at('08:00'),
  fin: at(hm),
  travail: Date.parse(at(hm)) - Date.parse(at('08:00')),
  jetons: 10,
  cache: 0,
  cout: null,
});
const plateau = (tous: object[], registre: object[], vivants: object[], lus: object[]): Board =>
  assembler({
    tous,
    prefix: 'demo',
    registre,
    vivants,
    circuits: lus,
    maintenant: MAINTENANT,
    jour: MAINTENANT - 24 * 60 * MIN,
  }) as Board;
// The text of the card of <id> on the board <t> of the tickets <tous>, as the pane receives it.
const carte = (t: Board, tous: object[], id: string) =>
  (
    fiches(tous, lignes(t, 'depot'), '', {}, (t as { circuits?: object[] }).circuits) as Record<
      string,
      { resume: string }
    >
  )[id]?.resume ?? '';
const lignesAgents = (t: Board) =>
  (lignes(t, 'depot') as Ligne[]).filter(x => x.section === 'agents');
const agents = (t: Board) => lignesAgents(t).map(x => x.texte.trimEnd());
const QUESTION = '  ⤷ Question · superviseur';
// The question of a stop, as scripts/circuit.mjs keeps it in the state.
const question = (o: object = {}) => ({
  arret: 'controles',
  fait: 'Le test « tableau » reste rouge.',
  piece: 'packages/demo/test/tableau.test.ts:3',
  question: 'Quel composant lève ce rouge ?',
  qui: 'superviseur',
  ...o,
});
const attentes = (t: Board) => t.agents.flatMap(b => b.attend.map(x => x.id));

describe("a circuit's line carries its ticket's working time and tokens", () => {
  const registre = [fin('a1', 'demo-12', 'testwriter', '09:00')];
  it('a circuit that runs: at its step, then the time and tokens so far', () => {
    const racine = depot({
      'demo-12': { etape: 'developpeur', composant: 'packages/demo', tentative: 2 },
    });
    const t = plateau([T('demo-12')], registre, [], circuits(racine, ligneCircuit('demo-12')));
    const a = agents(t);
    expect(a[a.indexOf('  2.3 · Code · développeur') + 1]).toMatch(
      /^▶ 12 {2}Le sujet de demo-12 +1 h 00 · 10$/
    );
  });

  it('a circuit that stopped: under its step, then the time and tokens so far', () => {
    const racine = depot({
      'demo-12': {
        etape: 'controles',
        code: 14,
        raison: 'controles',
        rapport: 'Rouge.',
        question: question(),
      },
    });
    const t = plateau([T('demo-12')], registre, [], circuits(racine));
    const a = agents(t);
    const i = a.indexOf('  2.4 · Contrôles · auto');
    expect(a[i + 1]).toBe(QUESTION);
    expect(a[i + 2]).toMatch(/^■ 12 {2}Le sujet de demo-12 +1 h 00 · 10$/);
  });
});

describe('a circuit that runs: its step, its component and its attempt', () => {
  it('its state and its process make it run, at the step, component and attempt of the state', () => {
    const racine = depot({
      'demo-12': { etape: 'developpeur', composant: 'packages/demo', tentative: 2 },
    });
    expect(circuits(racine, ligneCircuit('demo-12', { options: '--reprendre' }))).toEqual([
      expect.objectContaining({
        ticket: 'demo-12',
        etape: 'developpeur',
        composant: 'packages/demo',
        tentative: 2,
        vivant: true,
      }),
    ]);
  });

  it('the board draws it on one line at its step: its subject, in turn its component', () => {
    const racine = depot({
      'demo-12': { etape: 'developpeur', composant: 'packages/demo', tentative: 2 },
    });
    const t = plateau([T('demo-12')], [], [], circuits(racine, ligneCircuit('demo-12')));
    const a = agents(t);
    expect(a).not.toContain('circuits');
    const i = a.indexOf('  2.3 · Code · développeur');
    expect(i).toBeGreaterThan(-1);
    expect(a[i + 1]).toBe('▶ 12  Le sujet de demo-12');
    expect(lignesAgents(t)[i + 1]?.alterne).toBe('▶ 12  demo');
    expect(lignesAgents(t)[i + 1]).toMatchObject({ ton: 'actif', ticket: 'demo-12' });
    expect(a.filter(x => x.includes('Le sujet de demo-12'))).toHaveLength(1);
    expect(attentes(t)).toEqual([]);
  });

  it('each step of the state stands at its numbered step, the automatic ones included', () => {
    const sous = (etape: string) => {
      const racine = depot({ 'demo-12': { etape, composant: 'packages/demo' } });
      const a = agents(plateau([T('demo-12')], [], [], circuits(racine, ligneCircuit('demo-12'))));
      const i = a.findIndex(x => x.includes('Le sujet de demo-12'));
      return [...a.slice(0, i)].reverse().find(x => /^ *\d+(\.\d+)? · /.test(x));
    };
    expect(sous('preuve')).toBe('  2.2 · Preuve du rouge · auto');
    expect(sous('controles')).toBe('  2.4 · Contrôles · auto');
    expect(sous('relecture')).toBe('  4 · Relecture · relecteur');
    expect(sous('integration')).toBe('  5.1 · Commit · auto');
    expect(sous('file')).toBe('  5.2 · File : main, poussée, CI · auto');
  });

  it('the checks once `finale` are the final pass, step 3', () => {
    const racine = depot({
      'demo-12': { etape: 'controles', composant: 'packages/demo', tentative: 1, finale: true },
    });
    const a = agents(plateau([T('demo-12')], [], [], circuits(racine, ligneCircuit('demo-12'))));
    const i = a.indexOf('  3 · Passe finale · auto');
    expect(a[i + 1]).toMatch(/^▶ 12 /);
    expect(a[i - 1]).toBe('▸ 2 · Composants');
  });

  it("another ticket's circuit process does not make it run", () => {
    const racine = depot({ 'demo-12': { etape: 'preuve' } });
    expect(circuits(racine, ligneCircuit('demo-120'))[0]?.vivant).toBe(false);
  });

  it('the start of the step the circuit leads itself (`mene`) is read from its state, null between two', () => {
    const racine = depot({
      'demo-12': { etape: 'controles', mene: at('11:50') },
      'demo-13': { etape: 'developpeur' },
    });
    const lus = circuits(racine, `${ligneCircuit('demo-12')}\n${ligneCircuit('demo-13')}`);
    expect(lus.find(c => c.ticket === 'demo-12')).toMatchObject({
      mene: Date.parse(at('11:50')),
    });
    expect(lus.find(c => c.ticket === 'demo-13')).toMatchObject({ mene: null });
    // Running since 11:50, its step counts 10 min at noon on its ticket.
    const t = plateau([T('demo-12')], [], [], lus) as Board & {
      parTicket: Record<string, { travail: number }>;
    };
    expect(t.parTicket['demo-12']).toEqual({ travail: 10 * MIN, jetons: 0 });
  });

  it('a circuit integrated (« integre ») is no circuit of the board', () => {
    const racine = depot({ 'demo-12': { etape: 'integre', code: 0 } });
    expect(circuits(racine)).toEqual([]);
  });
});

describe('a circuit that stopped: under its step, its stop, its code and its reason on its card', () => {
  const ARRET = {
    etape: 'controles',
    composant: 'packages/demo',
    tentative: 3,
    code: 14,
    raison: 'controles',
    rapport: '\nLe test « tableau » reste rouge.\n\nSortie : …',
  };

  it('without its process, the state gives its stop, its code and the first line of its reason', () => {
    const racine = depot({ 'demo-13': ARRET });
    expect(circuits(racine)).toEqual([
      expect.objectContaining({
        ticket: 'demo-13',
        vivant: false,
        code: 14,
        arret: 'controles',
        raison: 'Le test « tableau » reste rouge.',
        question: null,
        qui: null,
      }),
    ]);
  });

  it('stopped without a question, the board draws it at its step, and its card where it stopped and why', () => {
    const racine = depot({ 'demo-13': ARRET });
    const t = plateau([T('demo-13')], [], [], circuits(racine));
    const a = agents(t);
    const i = a.indexOf('  2.4 · Contrôles · auto');
    expect(a[i + 1]).toBe('■ 13  Le sujet de demo-13');
    expect(lignesAgents(t)[i + 1]).toMatchObject({ ton: 'attention', ticket: 'demo-13' });
    expect(a).not.toContain(QUESTION);
    expect(carte(t, [T('demo-13')], 'demo-13')).toMatch(
      /^Circuit arrêté en 2\.4 Contrôles 3 · demo, arrêt controles \(14\) : Le test « tableau » reste rouge\./
    );
  });

  it('a circuit dead without a stop written is drawn arrêté, interrupted', () => {
    const racine = depot({ 'demo-13': { etape: 'preuve', composant: '.', tentative: 1 } });
    const t = plateau([T('demo-13')], [], [], circuits(racine));
    const a = agents(t);
    const i = a.indexOf('  2.2 · Preuve du rouge · auto');
    expect(a[i + 1]).toBe('■ 13  Le sujet de demo-13');
    expect(carte(t, [T('demo-13')], 'demo-13')).toMatch(
      /^Circuit arrêté en 2\.2 Preuve du rouge 1 · \., interrompu : le circuit ne tourne plus/
    );
  });

  // grillhouse-3uv.95.4, criterion 4: the board shows the stop « question » and who must answer it.
  it('stopped on a question, it stands under its step after « ⤷ Question · superviseur », the question at the head of its card', () => {
    const racine = depot({ 'demo-13': { ...ARRET, question: question() } });
    const lus = circuits(racine);
    expect(lus).toEqual([
      expect.objectContaining({
        ticket: 'demo-13',
        question: 'Quel composant lève ce rouge ?',
        qui: 'superviseur',
      }),
    ]);
    const t = plateau([T('demo-13')], [], [], lus);
    const a = agents(t);
    const i = a.indexOf(QUESTION);
    expect(a[i - 1]).toBe('  2.4 · Contrôles · auto');
    expect(a[i + 1]).toBe('■ 13  Le sujet de demo-13');
    expect(lignesAgents(t)[i]).toMatchObject({ ton: 'titre' });
    expect(lignesAgents(t)[i + 1]).toMatchObject({ ton: 'attention', ticket: 'demo-13' });
    expect(carte(t, [T('demo-13')], 'demo-13')).toMatch(
      /^Question · superviseur : Quel composant lève ce rouge \?/
    );
  });

  it('a question the owner must answer stands after « ⤷ Question · responsable », beside the supervisor’s', () => {
    const racine = depot({
      'demo-13': { ...ARRET, question: question() },
      'demo-14': {
        ...ARRET,
        etape: 'relecture',
        code: 20,
        raison: 'besoin',
        question: question({
          arret: 'besoin',
          question: 'Le relecteur demande : « mesure » est-il le mot juste ?',
          qui: 'responsable',
        }),
      },
    });
    const t = plateau([T('demo-13'), T('demo-14')], [], [], circuits(racine));
    const a = agents(t);
    const i = a.indexOf('  ⤷ Question · responsable');
    expect(a[i - 1]).toBe('  4 · Relecture · relecteur');
    expect(a[i + 1]).toBe('■ 14  Le sujet de demo-14');
    expect(a[a.indexOf(QUESTION) + 1]).toBe('■ 13  Le sujet de demo-13');
    expect(carte(t, [T('demo-14')], 'demo-14')).toMatch(
      /^Question · responsable : Le relecteur demande/
    );
  });

  it('a circuit that runs again after the answer stands at its step, running, its question gone', () => {
    const racine = depot({ 'demo-13': { ...ARRET, code: null, raison: null } });
    const t = plateau([T('demo-13')], [], [], circuits(racine, ligneCircuit('demo-13')));
    const a = agents(t);
    const i = a.indexOf('  2.4 · Contrôles · auto');
    expect(a[i + 1]).toBe('▶ 13  Le sujet de demo-13');
    expect(a.filter(x => x.startsWith('  ⤷ '))).toEqual([]);
  });
});

// grillhouse-3uv.90, grillhouse-3uv.95.4: a circuit whose plan the questionneur reads stands at
// 1.2 Questionnement, which it reads once.
describe('a circuit at the questioning', () => {
  const SEANCE = '0b8e8c7e-1d2f-4a3b-9c4d-5e6f7a8b9c0d';

  it('runs on its one line, at 1.2 for the plan', () => {
    const racine = depot({
      'demo-12': { questionnement: { objet: 'plan', tour: 1, seance: SEANCE } },
    });
    const lus = circuits(racine, ligneCircuit('demo-12'));
    expect(lus).toEqual([expect.objectContaining({ ticket: 'demo-12', questionnement: 'plan' })]);
    const t = plateau([T('demo-12')], [], [], lus);
    const a = agents(t);
    const i = a.indexOf('  1.2 · Questionnement · questionneur');
    expect(i).toBeGreaterThan(-1);
    expect(a[i + 1]).toBe('▶ 12  Le sujet de demo-12');
  });
});

describe('a ticket in progress with no circuit and no agent: the alert', () => {
  const alerte = (t: Board) => t.alertes.map(x => x.texte);

  it('without a state and with nothing running, it raises the alert', () => {
    const t = plateau([T('demo-15')], [fin('t0', 'demo-15', 'testwriter', '09:00')], [], []);
    expect(alerte(t)).toContain('15 en cours sans rien qui tourne');
  });

  it('its circuit running, no alert', () => {
    const racine = depot({ 'demo-15': { etape: 'preuve' } });
    const t = plateau(
      [T('demo-15')],
      [fin('t0', 'demo-15', 'testwriter', '09:00')],
      [],
      circuits(racine, ligneCircuit('demo-15'))
    );
    expect(alerte(t)).not.toContain('15 en cours sans rien qui tourne');
  });
});
