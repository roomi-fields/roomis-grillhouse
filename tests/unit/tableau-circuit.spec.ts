// The circuit of a ticket on the board (scripts/circuit.mjs): its state
// `.claude/worktrees/<ticket>.circuit.json` and its process `node scripts/circuit.mjs <ticket>`.
// A circuit that runs shows its step, component and attempt; one that stopped shows « arrêté : »
// the first line of its reason, its stop's name and code. A ticket with a circuit waits in no
// block: a stopped one is no longer drawn under the chef de chantier (role 0), and a chef running
// on the stop stands in block 0 as before.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { assembler, lignes, lireCircuits } from '../../scripts/tableau.mjs';
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
const lignesAgents = (t: Board) =>
  (lignes(t, 'depot') as Ligne[]).filter(x => x.section === 'agents');
const agents = (t: Board) => lignesAgents(t).map(x => x.texte.trimEnd());
const bloc = (t: Board, role: string) => t.agents.find(b => b.role === role)!;
const attentes = (t: Board) => t.agents.flatMap(b => b.attend.map(x => x.id));

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

  it('the board draws it under circuits, in progress, with its step, component and attempt', () => {
    const racine = depot({
      'demo-12': { etape: 'developpeur', composant: 'packages/demo', tentative: 2 },
    });
    const t = plateau([T('demo-12')], [], [], circuits(racine, ligneCircuit('demo-12')));
    const a = agents(t);
    const i = a.indexOf('circuits');
    expect(i).toBeGreaterThan(-1);
    expect(a[i + 1]).toMatch(/^▶ 12 {2}Le sujet de demo-12 +circuit$/);
    expect(a[i + 2]).toBe('  developpeur · tentative 2 · packages/demo');
    expect(lignesAgents(t)[i + 1]).toMatchObject({ ton: 'actif', ticket: 'demo-12' });
    expect(attentes(t)).toEqual([]);
  });

  it('the final pass is named at the checks', () => {
    const racine = depot({
      'demo-12': { etape: 'controles', composant: 'packages/demo', tentative: 1, finale: true },
    });
    const a = agents(plateau([T('demo-12')], [], [], circuits(racine, ligneCircuit('demo-12'))));
    expect(a).toContain('  passe finale · tentative 1 · packages/demo');
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

describe('a circuit that stopped: « arrêté : » its reason, its stop and its code', () => {
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

  it('the board draws its stop and code on its line, « arrêté : <raison> », then where it stopped', () => {
    const racine = depot({ 'demo-13': ARRET });
    const t = plateau([T('demo-13')], [], [], circuits(racine));
    const a = agents(t);
    const i = a.indexOf('circuits');
    expect(a[i + 1]).toMatch(/^■ 13 {2}Le sujet de demo-13 +controles \(14\)$/);
    expect(lignesAgents(t)[i + 1]).toMatchObject({ ton: 'attention', ticket: 'demo-13' });
    expect(a[i + 2]).toBe('  arrêté : Le test « tableau » reste rouge.');
    expect(a[i + 3]).toBe('  controles · tentative 3 · packages/demo');
  });

  it('a circuit dead without a stop written is drawn arrêté, interrupted', () => {
    const racine = depot({ 'demo-13': { etape: 'preuve', composant: '.', tentative: 1 } });
    const a = agents(plateau([T('demo-13')], [], [], circuits(racine)));
    const i = a.indexOf('circuits');
    expect(a[i + 2]).toBe('  arrêté : le circuit ne tourne plus');
    expect(a[i + 1]).toMatch(/^■ 13 {2}Le sujet de demo-13 +interrompu$/);
    expect(a[i + 3]).toBe('  preuve · tentative 1 · .');
  });

  it('a ticket stopped between two circuits, before a chef leaves, is no longer under the chef', () => {
    const racine = depot({ 'demo-13': ARRET });
    const t = plateau(
      [T('demo-13')],
      [fin('c0', 'demo-13', CHEF, '09:00'), fin('t1', 'demo-13', 'testeur', '10:00')],
      [],
      circuits(racine)
    );
    expect(attentes(t)).toEqual([]);
    expect(bloc(t, CHEF).enCours).toEqual([]);
    const a = agents(t);
    expect(a).toContain('0 chef de chantier  —');
    expect(a.filter(x => x.includes('Le sujet de demo-13'))).toHaveLength(1);
  });

  it('a fresh chef running on the stop stands in block 0, the stop still drawn', () => {
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
    const t = plateau(
      [T('demo-13')],
      [fin('c0', 'demo-13', CHEF, '09:00')],
      [chef],
      circuits(racine)
    );
    expect(bloc(t, CHEF).enCours.map(x => x.id)).toEqual(['demo-13']);
    expect(agents(t)).toContain('  arrêté : Le test « tableau » reste rouge.');
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
