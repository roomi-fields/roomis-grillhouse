// The circuit of a ticket on the board (scripts/circuit.mjs): its state
// `.claude/worktrees/<ticket>.circuit.json` and its process `node scripts/circuit.mjs <ticket>`.
// A circuit's ticket stands on one line, the only one of it in AGENTS, in the block of the role
// its step belongs to: one that runs shows its step, attempt and component; one that runs a
// session of the chef de chantier on its stop stands in the chef's block, running, with its stop's
// name and code; one that stopped stands there too, with its stop's name and code, and its card
// opens on where it stopped and the first line of its reason, or on the chef's question.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { assembler, fiches, lignes, lireCircuits } from '../../scripts/tableau.mjs';
import { ligneCircuit } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-circuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const CHEF = 'chef-de-chantier';
const MIN = 60_000;
const at = (hm: string) => `2026-10-18T${hm}:00Z`;
const MAINTENANT = Date.parse(at('12:00'));

interface Ligne {
  texte: string;
  ton?: string;
  ticket?: string;
  section?: string;
}
interface Board {
  alertes: { texte: string }[];
  agents: { role: string; enCours: { id: string }[]; attend: { id: string }[] }[];
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
const bloc = (t: Board, role: string) => t.agents.find(b => b.role === role)!;
const attentes = (t: Board) => t.agents.flatMap(b => b.attend.map(x => x.id));

describe("a circuit's line carries its ticket's working time and tokens", () => {
  const registre = [fin('a1', 'demo-12', 'testeur', '09:00')];
  it('a circuit that runs: its step, attempt and component, then the time and tokens so far', () => {
    const racine = depot({
      'demo-12': { etape: 'developpeur', composant: 'packages/demo', tentative: 2 },
    });
    const t = plateau([T('demo-12')], registre, [], circuits(racine, ligneCircuit('demo-12')));
    const a = agents(t);
    expect(a[a.indexOf('4 développeur') + 1]).toMatch(
      /^▶ 12 {2}Le sujet .* développeur 2 · demo · 1 h 00 · 10$/
    );
  });

  it('a circuit that stopped: its stop and code, then the time and tokens so far', () => {
    const racine = depot({
      'demo-12': { etape: 'controles', code: 14, raison: 'controles', rapport: 'Rouge.' },
    });
    const t = plateau([T('demo-12')], registre, [], circuits(racine));
    const a = agents(t);
    expect(a[a.indexOf('0 chef de chantier') + 1]).toMatch(
      /^■ 12 {2}Le sujet .* controles \(14\) · 1 h 00 · 10$/
    );
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

  it("the board draws it on one line in its step's block: its step, attempt and component", () => {
    const racine = depot({
      'demo-12': { etape: 'developpeur', composant: 'packages/demo', tentative: 2 },
    });
    const t = plateau([T('demo-12')], [], [], circuits(racine, ligneCircuit('demo-12')));
    const a = agents(t);
    expect(a).not.toContain('circuits');
    const i = a.indexOf('4 développeur');
    expect(i).toBeGreaterThan(-1);
    expect(a[i + 1]).toMatch(/^▶ 12 {2}Le sujet de demo-12 +développeur 2 · demo$/);
    expect(lignesAgents(t)[i + 1]).toMatchObject({ ton: 'actif', ticket: 'demo-12' });
    expect(a.filter(x => x.includes('Le sujet de demo-12'))).toHaveLength(1);
    expect(attentes(t)).toEqual([]);
  });

  it("each step stands in its role's block: proof with the testeur's, checks with the developpeur's, integration with the reviewer's", () => {
    const sous = (etape: string) => {
      const racine = depot({ 'demo-12': { etape, composant: 'packages/demo' } });
      const a = agents(plateau([T('demo-12')], [], [], circuits(racine, ligneCircuit('demo-12'))));
      const i = a.findIndex(x => x.includes('Le sujet de demo-12'));
      return [...a.slice(0, i)].reverse().find(x => /^\d /.test(x));
    };
    expect(sous('preuve')).toBe('3 testeur');
    expect(sous('controles')).toBe('4 développeur');
    expect(sous('relecture')).toBe('5 relecteur');
    expect(sous('integration')).toBe('5 relecteur');
  });

  it('the final pass is named at the checks', () => {
    const racine = depot({
      'demo-12': { etape: 'controles', composant: 'packages/demo', tentative: 1, finale: true },
    });
    const a = agents(plateau([T('demo-12')], [], [], circuits(racine, ligneCircuit('demo-12'))));
    expect(a.some(x => /passe finale 1 · demo$/.test(x))).toBe(true);
  });

  it("another ticket's circuit process does not make it run", () => {
    const racine = depot({ 'demo-12': { etape: 'preuve' } });
    expect(circuits(racine, ligneCircuit('demo-120'))[0]?.vivant).toBe(false);
  });

  it('a circuit integrated (« integre ») is no circuit of the board', () => {
    const racine = depot({ 'demo-12': { etape: 'integre', code: 0 } });
    expect(circuits(racine)).toEqual([]);
  });
});

describe('a circuit that stopped: its stop and its code, its reason on its card', () => {
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

  it('the board draws its stop and code on its line, and its card where it stopped and why', () => {
    const racine = depot({ 'demo-13': ARRET });
    const t = plateau([T('demo-13')], [], [], circuits(racine));
    const a = agents(t);
    const i = a.indexOf('0 chef de chantier');
    expect(a[i + 1]).toMatch(/^■ 13 {2}Le sujet de demo-13 +controles \(14\)$/);
    expect(lignesAgents(t)[i + 1]).toMatchObject({ ton: 'attention', ticket: 'demo-13' });
    expect(carte(t, [T('demo-13')], 'demo-13')).toMatch(
      /^Circuit arrêté en controles 3 · demo : Le test « tableau » reste rouge\./
    );
  });

  it('a circuit dead without a stop written is drawn arrêté, interrupted', () => {
    const racine = depot({ 'demo-13': { etape: 'preuve', composant: '.', tentative: 1 } });
    const t = plateau([T('demo-13')], [], [], circuits(racine));
    const a = agents(t);
    const i = a.indexOf('0 chef de chantier');
    expect(a[i + 1]).toMatch(/^■ 13 {2}Le sujet de demo-13 +interrompu$/);
    expect(carte(t, [T('demo-13')], 'demo-13')).toMatch(
      /^Circuit arrêté en preuve 1 · \. : le circuit ne tourne plus/
    );
  });

  it('a ticket stopped between two circuits, before a chef leaves, stands once, as a stop', () => {
    const racine = depot({ 'demo-13': ARRET });
    const t = plateau(
      [T('demo-13')],
      [fin('c0', 'demo-13', CHEF, '09:00'), fin('t1', 'demo-13', 'testeur', '10:00')],
      [],
      circuits(racine)
    );
    expect(attentes(t)).toEqual([]);
    expect(bloc(t, CHEF).enCours).toEqual([]);
    expect(
      lignesAgents(t)
        .filter(x => x.ticket === 'demo-13')
        .map(x => x.texte)
    ).toEqual([expect.stringMatching(/^■ .*controles \(14\) · \d+ (min|h \d\d) · \d+$/)]);
  });

  // grillhouse-3uv.85, critère 9: the chef de chantier is a session of the circuit. A circuit in
  // a chef's session runs on its ticket's line in block 0 (▶), with its stop; a circuit ended on
  // « question » stands in the same block (■), the chef's question at the head of its card.
  const SEANCE = { seance: '0b8e8c7e-1d2f-4a3b-9c4d-5e6f7a8b9c0d', arret: 'controles', code: 14 };

  it('critère 9 — a circuit that runs a chef on its stop runs on its one line in block 0 (▶), its stop named', () => {
    const racine = depot({ 'demo-13': { ...ARRET, chef: { ...SEANCE, rapport: ARRET.rapport } } });
    const lus = circuits(racine, ligneCircuit('demo-13'));
    expect(lus).toEqual([expect.objectContaining({ ticket: 'demo-13', vivant: true, chef: true })]);
    const t = plateau([T('demo-13')], [], [], lus);
    const a = agents(t);
    const i = a.indexOf('0 chef de chantier');
    expect(a[i + 1]).toMatch(/^▶ 13 {2}Le sujet de demo-13 +controles \(14\)$/);
    expect(lignesAgents(t)[i + 1]).toMatchObject({ ton: 'actif', ticket: 'demo-13' });
    expect(a.filter(x => x.includes('Le sujet de demo-13'))).toHaveLength(1);
  });

  it('critère 9 — a circuit ended on « question » stands in block 0 (■), the question at the head of its card', () => {
    const racine = depot({
      'demo-14': {
        ...ARRET,
        etape: 'developpeur',
        code: 18,
        raison: 'question',
        rapport: 'La mesure rend-elle le double ou le triple ?\nLe critère 1 ne le dit pas.',
        chef: { ...SEANCE, rapport: ARRET.rapport },
      },
    });
    const lus = circuits(racine);
    expect(lus).toEqual([expect.objectContaining({ ticket: 'demo-14', vivant: false })]);
    const t = plateau([T('demo-14')], [], [], lus);
    const a = agents(t);
    const i = a.indexOf('0 chef de chantier');
    expect(a[i + 1]).toMatch(/^■ 14 {2}Le sujet de demo-14 +question \(18\)$/);
    expect(lignesAgents(t)[i + 1]).toMatchObject({ ton: 'attention', ticket: 'demo-14' });
    expect(carte(t, [T('demo-14')], 'demo-14')).toMatch(
      /^Question du chef de chantier : La mesure rend-elle le double ou le triple \? Le critère 1 ne le dit pas\./
    );
  });

  it('a chef running as a sub-agent on a stopped circuit does not make it run: the chef is a session of the circuit', () => {
    const racine = depot({ 'demo-13': ARRET });
    const chef = {
      agent: 'c1',
      ticket: 'demo-13',
      role: CHEF,
      ligne: false,
      depuis: MAINTENANT - 5 * MIN,
      entre: null,
      jetons: 40,
      travail: 5 * MIN,
      tours: [[MAINTENANT - 5 * MIN, MAINTENANT]],
    };
    const t = plateau([T('demo-13')], [], [chef], circuits(racine));
    expect(
      lignesAgents(t)
        .filter(x => x.ticket === 'demo-13')
        .map(x => x.texte)
    ).toEqual([expect.stringMatching(/^■ .*controles \(14\) · \d+ (min|h \d\d) · \d+$/)]);
  });
});

// Decided by the owner on 2026-10-17 (grill, Q10): a chef comes only on a stop of the circuit,
// which always has its state; a ticket in progress with neither a state nor a living agent falls
// under the alert « en cours sans rien qui tourne ».
describe('a ticket in progress with no circuit and no agent: the alert, no wait under the chef', () => {
  const alerte = (t: Board) => t.alertes.map(x => x.texte);

  it('led by a chef, without a state and with nothing running, it raises the alert', () => {
    const t = plateau([T('demo-15')], [fin('c0', 'demo-15', CHEF, '09:00')], [], []);
    expect(alerte(t)).toContain('15 en cours sans rien qui tourne');
    expect(bloc(t, CHEF).attend).toEqual([]);
  });

  it('its circuit running, no alert', () => {
    const racine = depot({ 'demo-15': { etape: 'preuve' } });
    const t = plateau(
      [T('demo-15')],
      [fin('c0', 'demo-15', CHEF, '09:00')],
      [],
      circuits(racine, ligneCircuit('demo-15'))
    );
    expect(alerte(t)).not.toContain('15 en cours sans rien qui tourne');
  });
});
