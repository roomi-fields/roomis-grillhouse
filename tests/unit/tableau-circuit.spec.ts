// The circuit of a ticket on the board (scripts/circuit.mjs): its state
// `.claude/worktrees/<ticket>.circuit.json` and its process `node scripts/circuit.mjs <ticket>`.
// A circuit's ticket stands on one line, the only one of it in AGENTS, at the step of its state
// (scripts/etapes.mjs); one that runs a session of the regulator on its stop stands under its
// step, after the line of the arbitrage of the stop, running; one that stopped stands there too,
// and its card opens on where it stopped, its stop's name and code and the first line of its
// reason, or on the regulator's question.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { assembler, fiches, lignes, lireCircuits } from '../../scripts/tableau.mjs';
import { ligneCircuit } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-circuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const REGULATEUR = 'regulateur';
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
      etape: 'testeur',
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
const bloc = (t: Board, role: string) => t.agents.find(b => b.roles.includes(role))!;
const ARBITRAGE = "  ⤷ Arbitrage de l'arrêt · régulateur ⇄ questionneur";
const attentes = (t: Board) => t.agents.flatMap(b => b.attend.map(x => x.id));

describe("a circuit's line carries its ticket's working time and tokens", () => {
  const registre = [fin('a1', 'demo-12', 'testeur', '09:00')];
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
      'demo-12': { etape: 'controles', code: 14, raison: 'controles', rapport: 'Rouge.' },
    });
    const t = plateau([T('demo-12')], registre, [], circuits(racine));
    const a = agents(t);
    const i = a.indexOf('  2.4 · Contrôles · auto');
    expect(a[i + 1]).toBe(ARBITRAGE);
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
    expect(sous('relecture')).toBe('4 · Relecture · relecteur');
    expect(sous('integration')).toBe('  5.1 · Commit · auto');
    expect(sous('file')).toBe('  5.2 · File : main, poussée, CI · auto');
  });

  it('the checks once `finale` are the final pass, step 3', () => {
    const racine = depot({
      'demo-12': { etape: 'controles', composant: 'packages/demo', tentative: 1, finale: true },
    });
    const a = agents(plateau([T('demo-12')], [], [], circuits(racine, ligneCircuit('demo-12'))));
    const i = a.indexOf('3 · Passe finale · auto');
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

describe('a circuit that stopped: under its step, at the arbitrage, its stop, its code and its reason on its card', () => {
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
      }),
    ]);
  });

  it('the board draws it under its step after the line of the arbitrage, and its card where it stopped and why', () => {
    const racine = depot({ 'demo-13': ARRET });
    const t = plateau([T('demo-13')], [], [], circuits(racine));
    const a = agents(t);
    const i = a.indexOf(ARBITRAGE);
    expect(a[i - 1]).toBe('  2.4 · Contrôles · auto');
    expect(a[i + 1]).toBe('■ 13  Le sujet de demo-13');
    expect(lignesAgents(t)[i + 1]).toMatchObject({ ton: 'attention', ticket: 'demo-13' });
    expect(carte(t, [T('demo-13')], 'demo-13')).toMatch(
      /^Circuit arrêté en 2\.4 Contrôles 3 · demo, arrêt controles \(14\) : Le test « tableau » reste rouge\./
    );
  });

  it('a circuit dead without a stop written is drawn arrêté, interrupted', () => {
    const racine = depot({ 'demo-13': { etape: 'preuve', composant: '.', tentative: 1 } });
    const t = plateau([T('demo-13')], [], [], circuits(racine));
    const a = agents(t);
    const i = a.indexOf(ARBITRAGE);
    expect(a[i - 1]).toBe('  2.2 · Preuve du rouge · auto');
    expect(a[i + 1]).toBe('■ 13  Le sujet de demo-13');
    expect(carte(t, [T('demo-13')], 'demo-13')).toMatch(
      /^Circuit arrêté en 2\.2 Preuve du rouge 1 · \., interrompu : le circuit ne tourne plus/
    );
  });

  it('a ticket stopped between two circuits, before a regulateur leaves, stands once, as a stop', () => {
    const racine = depot({ 'demo-13': ARRET });
    const t = plateau(
      [T('demo-13')],
      [fin('c0', 'demo-13', REGULATEUR, '09:00'), fin('t1', 'demo-13', 'testeur', '10:00')],
      [],
      circuits(racine)
    );
    expect(attentes(t)).toEqual([]);
    expect(bloc(t, REGULATEUR).enCours).toEqual([]);
    expect(
      lignesAgents(t)
        .filter(x => x.ticket === 'demo-13')
        .map(x => x.texte)
    ).toEqual([expect.stringMatching(/^■ 13 {2}Le sujet de demo-13 +\d+ (min|h \d\d) · \d+$/)]);
  });

  // grillhouse-3uv.85, critère 9: the regulator is a session of the circuit. A circuit in a
  // regulator's session runs on its ticket's line at the arbitrage of its stopped step (▶); a
  // circuit ended on « question » stands there too (■), the regulator's question at the head of
  // its card.
  const SEANCE = { seance: '0b8e8c7e-1d2f-4a3b-9c4d-5e6f7a8b9c0d', arret: 'controles', code: 14 };

  it('critère 9 — a circuit that runs a regulateur on its stop runs on its one line at the arbitrage of its step (▶)', () => {
    const racine = depot({
      'demo-13': { ...ARRET, regulateur: { ...SEANCE, rapport: ARRET.rapport } },
    });
    const lus = circuits(racine, ligneCircuit('demo-13'));
    expect(lus).toEqual([
      expect.objectContaining({ ticket: 'demo-13', vivant: true, regulateur: true }),
    ]);
    const t = plateau([T('demo-13')], [], [], lus);
    const a = agents(t);
    const i = a.indexOf(ARBITRAGE);
    expect(a[i - 1]).toBe('  2.4 · Contrôles · auto');
    expect(a[i + 1]).toBe('▶ 13  Le sujet de demo-13');
    expect(lignesAgents(t)[i + 1]).toMatchObject({ ton: 'actif', ticket: 'demo-13' });
    expect(a.filter(x => x.includes('Le sujet de demo-13'))).toHaveLength(1);
  });

  it('critère 9 — a circuit ended on « question » stands at the arbitrage (■), the question at the head of its card', () => {
    const racine = depot({
      'demo-14': {
        ...ARRET,
        etape: 'developpeur',
        code: 18,
        raison: 'question',
        rapport: 'La mesure rend-elle le double ou le triple ?\nLe critère 1 ne le dit pas.',
        regulateur: { ...SEANCE, rapport: ARRET.rapport },
      },
    });
    const lus = circuits(racine);
    expect(lus).toEqual([expect.objectContaining({ ticket: 'demo-14', vivant: false })]);
    const t = plateau([T('demo-14')], [], [], lus);
    const a = agents(t);
    const i = a.indexOf(ARBITRAGE);
    expect(a[i - 1]).toBe('  2.3 · Code · développeur');
    expect(a[i + 1]).toBe('■ 14  Le sujet de demo-14');
    expect(lignesAgents(t)[i + 1]).toMatchObject({ ton: 'attention', ticket: 'demo-14' });
    expect(carte(t, [T('demo-14')], 'demo-14')).toMatch(
      /^Question du régulateur : La mesure rend-elle le double ou le triple \? Le critère 1 ne le dit pas\./
    );
  });

  it('a regulateur running as a sub-agent on a stopped circuit does not make it run: the regulateur is a session of the circuit', () => {
    const racine = depot({ 'demo-13': ARRET });
    const regulateur = {
      agent: 'c1',
      ticket: 'demo-13',
      role: REGULATEUR,
      ligne: false,
      depuis: MAINTENANT - 5 * MIN,
      entre: null,
      jetons: 40,
      travail: 5 * MIN,
      tours: [[MAINTENANT - 5 * MIN, MAINTENANT]],
    };
    const t = plateau([T('demo-13')], [], [regulateur], circuits(racine));
    expect(
      lignesAgents(t)
        .filter(x => x.ticket === 'demo-13')
        .map(x => x.texte)
    ).toEqual([expect.stringMatching(/^■ 13 {2}Le sujet de demo-13 +\d+ (min|h \d\d) · \d+$/)]);
  });
});

// Decided by the owner on 2026-10-17 (grill, Q10): a regulator comes only on a stop of the circuit,
// which always has its state; a ticket in progress with neither a state nor a living agent falls
// under the alert « en cours sans rien qui tourne ».
// grillhouse-3uv.90: a circuit whose plan the questionneur questions stands at 1.2 Questionnement
// du plan; one whose regulator's decision it questions stands at the arbitrage of its stopped step;
// each shows the round of its bounded loop from the second.
describe('a circuit at the questioning', () => {
  const SEANCE = '0b8e8c7e-1d2f-4a3b-9c4d-5e6f7a8b9c0d';

  it('runs on its one line, at 1.2 for the plan, at the arbitrage for a decision, its round from the second', () => {
    const racine = depot({
      'demo-12': {
        questionnement: { objet: 'plan', tour: 2, seance: SEANCE },
        boucles: { questionnement: 2 },
      },
      'demo-13': {
        etape: 'developpeur',
        code: 15,
        raison: 'sans-livraison',
        regulateur: { seance: SEANCE, arret: 'sans-livraison', code: 15, rapport: 'x' },
        questionnement: { objet: 'decision', tour: 1, seance: SEANCE },
        boucles: { arret: 1, questionnement: 1 },
      },
    });
    const lus = circuits(racine, `${ligneCircuit('demo-12')}\n${ligneCircuit('demo-13')}`);
    expect(lus).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ticket: 'demo-12', questionnement: 'plan' }),
        expect.objectContaining({ ticket: 'demo-13', questionnement: 'decision' }),
      ])
    );
    const t = plateau([T('demo-12'), T('demo-13')], [], [], lus);
    const a = agents(t);
    const i = a.findIndex(x => x.startsWith('  1.2 · Questionnement du plan'));
    expect(i).toBeGreaterThan(-1);
    expect(a[i + 1]).toBe('▶ 12  Le sujet de demo-12 · tour 2/4');
    const j = a.indexOf(ARBITRAGE);
    expect(a[j - 1]).toBe('  2.3 · Code · développeur');
    expect(a[j + 1]).toBe('▶ 13  Le sujet de demo-13');
    expect(a.filter(x => x.includes('Le sujet de demo-13'))).toHaveLength(1);
  });
});

describe('a ticket in progress with no circuit and no agent: the alert, no wait under the regulateur', () => {
  const alerte = (t: Board) => t.alertes.map(x => x.texte);

  it('led by a regulateur, without a state and with nothing running, it raises the alert', () => {
    const t = plateau([T('demo-15')], [fin('c0', 'demo-15', REGULATEUR, '09:00')], [], []);
    expect(alerte(t)).toContain('15 en cours sans rien qui tourne');
    expect(bloc(t, REGULATEUR).attend).toEqual([]);
  });

  it('its circuit running, no alert', () => {
    const racine = depot({ 'demo-15': { etape: 'preuve' } });
    const t = plateau(
      [T('demo-15')],
      [fin('c0', 'demo-15', REGULATEUR, '09:00')],
      [],
      circuits(racine, ligneCircuit('demo-15'))
    );
    expect(alerte(t)).not.toContain('15 en cours sans rien qui tourne');
  });
});
