// grillhouse-3uv.88: the board's AGENTS section lists the steps of the process (scripts/etapes.mjs),
// each ticket at the step where it is at each instant. The maquette the owner validated:
//
//   AGENTS  ▶ en cours · en attente
//   1 · Exploration · explorateur
//   ▶ 330    Le renderer audio …            18 min · 410 k
//   2 · Arbitrage · régulateur
//   ■ 318    Le checker refuse … · de 5 Code   41 min · 1,2 M
//   5 · Code · développeur
//   ▶ 320.3  Le binder lit les portées    2 · 12 min · 340 k
//           (5 s plus tard)
//   ▶ 320.3  030-binder                   2 · 12 min · 340 k
//
// - AGENTS shows every step of the list, in its order, each on its line « number · title · who »:
//   the owner saw a single step and could not read the flow. A step without a ticket is in the
//   discreet tone; a step with a ticket is a title, its tickets under it. The arbitrage has one
//   line per role when either role holds a ticket, else one line « référent technique ou
//   régulateur ».
// - A ticket at the regulator recalls the step it comes from (« · de 5 Code »), where it returns.
// - A ticket's line in a circuit alternates, every 5 s, its subject and its component under way
//   (the board gives both texts, `texte` and `alterne`; the mod alternates), then its attempt,
//   its time and its tokens. A ticket without a component keeps one text.
import { describe, expect, it } from 'vitest';
import { assembler, fiches, LARGEUR, lignes } from '../../scripts/tableau.mjs';

const MIN = 60_000;
const at = (hm: string) => `2026-10-20T${hm}:00Z`;
const MAINTENANT = Date.parse(at('12:00'));

interface Ligne {
  texte: string;
  alterne?: string;
  ton?: string;
  ticket?: string;
  section?: string;
}
interface Bloc {
  numero: number;
  titre: string;
  role: string;
  qui: string;
  enCours: { id: string }[];
  attend: { id: string }[];
}
interface Board {
  agents: Bloc[];
  circuits?: object[];
}

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
const vivant = (agent: string, ticket: string, role: string) => ({
  agent,
  ticket,
  role,
  ligne: false,
  depuis: MAINTENANT - 30 * MIN,
  entre: null,
  jetons: 40,
  travail: 20 * MIN,
  tours: [[MAINTENANT - 20 * MIN, MAINTENANT]],
});
// A circuit as lireCircuits reads it from its state and the process list.
const circuit = (ticket: string, o: object = {}) => ({
  ticket,
  etape: 'developpeur',
  composant: 'packages/030-binder',
  tentative: 2,
  finale: false,
  code: null,
  arret: null,
  raison: null,
  question: null,
  regulateur: false,
  rang: 1,
  total: 1,
  boucles: {},
  mene: null,
  vivant: true,
  ...o,
});
const plateau = (
  tous: object[],
  o: { registre?: object[]; vivants?: object[]; circuits?: object[] } = {}
): Board =>
  assembler({
    tous,
    prefix: 'demo',
    registre: o.registre ?? [],
    vivants: o.vivants ?? [],
    circuits: o.circuits ?? [],
    maintenant: MAINTENANT,
    jour: MAINTENANT - 24 * 60 * MIN,
  }) as Board;
const lignesAgents = (t: Board) =>
  (lignes(t, 'depot') as Ligne[]).filter(x => x.section === 'agents');
// The AGENTS section, from its title on.
const agents = (t: Board) => {
  const l = lignesAgents(t);
  return l.slice(l.findIndex(x => x.texte.startsWith('AGENTS')));
};
const textes = (t: Board) => agents(t).map(x => x.texte.trimEnd());
// The step's line above the line of <id>.
const etapeDe = (t: Board, id: string) => {
  const a = agents(t);
  const i = a.findIndex(x => x.ticket === id);
  return [...a.slice(0, i)].reverse().find(x => /^\d+ · /.test(x.texte))?.texte ?? null;
};
const ligneDe = (t: Board, id: string) => agents(t).find(x => x.ticket === id)!;

describe("AGENTS lists the steps, each step's line its number, title and who works there", () => {
  it('a board without a ticket at any step shows every step, in discreet tone, the arbitrage on one line', () => {
    expect(agents(plateau([]))).toEqual([
      expect.objectContaining({ texte: 'AGENTS  ▶ en cours · en attente', ton: 'titre' }),
      ...[
        '1 · Exploration · explorateur',
        '2 · Arbitrage · référent technique ou régulateur',
        '2.1 · Questionnement · questionneur',
        '3 · Tests · testeur',
        '4 · Preuve du rouge · automatique',
        '5 · Code · développeur',
        '6 · Contrôles · automatique',
        '7 · Passe finale · automatique',
        '8 · Relecture · relecteur',
        '9 · Intégration · automatique',
        '10 · File : main, poussée, CI · automatique',
      ].map(texte => expect.objectContaining({ texte, ton: 'discret' })),
    ]);
  });

  it('the data holds a block per step and role, in the order of the list', () => {
    expect(plateau([]).agents.map(b => [b.numero, b.titre, b.qui])).toEqual([
      [1, 'Exploration', 'explorateur'],
      [2, 'Arbitrage', 'référent technique'],
      [2, 'Arbitrage', 'régulateur'],
      [2.1, 'Questionnement', 'questionneur'],
      [3, 'Tests', 'testeur'],
      [4, 'Preuve du rouge', 'automatique'],
      [5, 'Code', 'développeur'],
      [6, 'Contrôles', 'automatique'],
      [7, 'Passe finale', 'automatique'],
      [8, 'Relecture', 'relecteur'],
      [9, 'Intégration', 'automatique'],
      [10, 'File : main, poussée, CI', 'automatique'],
    ]);
  });

  it('an explorer running on a ticket stands under « 1 · Exploration · explorateur »', () => {
    const t = plateau([T('demo-30')], { vivants: [vivant('e1', 'demo-30', 'explorateur')] });
    expect(textes(t).slice(0, 4)).toEqual([
      'AGENTS  ▶ en cours · en attente',
      '1 · Exploration · explorateur',
      expect.stringMatching(/^▶ 30 {2}Le sujet de demo-30 +20 min · 40$/),
      '2 · Arbitrage · référent technique ou régulateur',
    ]);
    expect(agents(t)[1]).toMatchObject({ ton: 'titre' });
  });

  it('the arbitrage names the role that works on it: a line per role with a ticket, the technical referent first', () => {
    const t = plateau([T('demo-31'), T('demo-32')], {
      vivants: [vivant('a1', 'demo-31', 'referent-technique')],
      circuits: [circuit('demo-32', { regulateur: true, code: 20, arret: 'besoin' })],
    });
    expect(textes(t).filter(x => /^2 · /.test(x))).toEqual([
      '2 · Arbitrage · référent technique',
      '2 · Arbitrage · régulateur',
    ]);
    expect(etapeDe(t, 'demo-31')).toBe('2 · Arbitrage · référent technique');
    expect(etapeDe(t, 'demo-32')).toBe('2 · Arbitrage · régulateur');
  });

  it('a ticket at one role of the arbitrage shows both roles, the empty one in discreet tone', () => {
    const t = plateau([T('demo-48')], { vivants: [vivant('a2', 'demo-48', 'referent-technique')] });
    const arbitrage = agents(t).filter(x => /^2 · /.test(x.texte));
    expect(arbitrage).toEqual([
      expect.objectContaining({ texte: '2 · Arbitrage · référent technique', ton: 'titre' }),
      expect.objectContaining({ texte: '2 · Arbitrage · régulateur', ton: 'discret' }),
    ]);
  });

  it('a ticket at step 5 shows every step, step 5 a title with its ticket under it, the others discreet', () => {
    const t = plateau([T('demo-33')], { circuits: [circuit('demo-33')] });
    const a = agents(t);
    const etapes = a.filter(x => /^\d+(\.\d+)? · /.test(x.texte));
    expect(etapes.map(x => x.texte)).toEqual([
      '1 · Exploration · explorateur',
      '2 · Arbitrage · référent technique ou régulateur',
      '2.1 · Questionnement · questionneur',
      '3 · Tests · testeur',
      '4 · Preuve du rouge · automatique',
      '5 · Code · développeur',
      '6 · Contrôles · automatique',
      '7 · Passe finale · automatique',
      '8 · Relecture · relecteur',
      '9 · Intégration · automatique',
      '10 · File : main, poussée, CI · automatique',
    ]);
    expect(etapes.map(x => x.ton)).toEqual(
      etapes.map(x => (x.texte.startsWith('5 ') ? 'titre' : 'discret'))
    );
    const i = a.findIndex(x => x.texte === '5 · Code · développeur');
    expect(a[i + 1]).toMatchObject({ ticket: 'demo-33' });
    expect(a[i + 2]!.texte).toBe('6 · Contrôles · automatique');
  });
});

describe("a circuit's ticket stands at the step of its state, at each instant", () => {
  const sous = (o: object) =>
    etapeDe(plateau([T('demo-34')], { circuits: [circuit('demo-34', o)] }), 'demo-34');

  it('each step of the state at its numbered step, automatic ones included', () => {
    expect(sous({ etape: 'testeur' })).toBe('3 · Tests · testeur');
    expect(sous({ etape: 'preuve' })).toBe('4 · Preuve du rouge · automatique');
    expect(sous({ etape: 'developpeur' })).toBe('5 · Code · développeur');
    expect(sous({ etape: 'controles' })).toBe('6 · Contrôles · automatique');
    expect(sous({ etape: 'controles', finale: true })).toBe('7 · Passe finale · automatique');
    expect(sous({ etape: 'relecture' })).toBe('8 · Relecture · relecteur');
    expect(sous({ etape: 'integration' })).toBe('9 · Intégration · automatique');
    expect(sous({ etape: 'file' })).toBe('10 · File : main, poussée, CI · automatique');
  });

  it('a circuit at the regulator, running or stopped, stands at the arbitrage', () => {
    expect(sous({ regulateur: true, code: 14, arret: 'controles' })).toBe(
      '2 · Arbitrage · régulateur'
    );
    expect(sous({ vivant: false, code: 14, arret: 'controles' })).toBe(
      '2 · Arbitrage · régulateur'
    );
    expect(sous({ vivant: false })).toBe('2 · Arbitrage · régulateur');
  });

  it('a waiting ticket waits under the step of the role it waits for', () => {
    const t = plateau([T('demo-35', { status: 'open' }), T('demo-36'), T('demo-37')], {
      registre: [
        fin('t1', 'demo-36', 'testeur', '09:00'),
        fin('t2', 'demo-37', 'testeur', '09:00'),
        fin('d2', 'demo-37', 'developpeur', '10:00'),
      ],
    });
    expect(etapeDe(t, 'demo-35')).toBe('3 · Tests · testeur');
    expect(etapeDe(t, 'demo-36')).toBe('5 · Code · développeur');
    expect(etapeDe(t, 'demo-37')).toBe('8 · Relecture · relecteur');
    expect(ligneDe(t, 'demo-36').texte).toMatch(/^· 36 {2}Le sujet de demo-36/);
  });
});

describe('the line of a ticket in a circuit: its subject and its component in turn, then time and tokens', () => {
  const t = plateau([T('demo-38')], {
    registre: [fin('t1', 'demo-38', 'testeur', '08:12')],
    circuits: [circuit('demo-38')],
  });

  it('the subject, then the time and the tokens', () => {
    expect(ligneDe(t, 'demo-38').texte).toMatch(/^▶ 38 {2}Le sujet de demo-38 +12 min · 10$/);
    expect(ligneDe(t, 'demo-38')).toMatchObject({ ton: 'actif', ticket: 'demo-38' });
  });

  it('the other text: the short name of the component under way in place of the subject, the rest the same', () => {
    expect(ligneDe(t, 'demo-38').alterne).toMatch(/^▶ 38 {2}030-binder +12 min · 10$/);
    expect(ligneDe(t, 'demo-38').texte).toHaveLength(LARGEUR);
    expect(ligneDe(t, 'demo-38').alterne).toHaveLength(LARGEUR);
  });

  it('the component carries its rank among the components of the title, never « 1/1 »', () => {
    const r = plateau([T('demo-46')], {
      registre: [fin('t1', 'demo-46', 'testeur', '08:12')],
      circuits: [circuit('demo-46', { rang: 3, total: 5 })],
    });
    expect(ligneDe(r, 'demo-46').alterne).toMatch(/^▶ 46 {2}030-binder 3\/5 +12 min · 10$/);
    expect(ligneDe(r, 'demo-46').texte).not.toMatch(/3\/5/);
    expect(ligneDe(t, 'demo-38').alterne).not.toMatch(/1\/1/);
  });

  it('the root component reads « . »', () => {
    const r = plateau([T('demo-39')], { circuits: [circuit('demo-39', { composant: '.' })] });
    expect(ligneDe(r, 'demo-39').alterne).toBe('▶ 39  .');
  });

  it('a circuit without a component keeps one text, and so does a ticket out of a circuit', () => {
    const r = plateau([T('demo-40'), T('demo-41')], {
      circuits: [circuit('demo-40', { composant: null })],
      vivants: [vivant('e2', 'demo-41', 'explorateur')],
    });
    expect(ligneDe(r, 'demo-40').alterne).toBeUndefined();
    expect(ligneDe(r, 'demo-41').alterne).toBeUndefined();
  });

  it('a ticket at the regulator recalls the step it comes from, in both texts, its time and tokens on the right', () => {
    const r = plateau([T('demo-42')], {
      registre: [fin('t1', 'demo-42', 'testeur', '08:41')],
      circuits: [circuit('demo-42', { vivant: false, code: 20, arret: 'besoin' })],
    });
    expect(ligneDe(r, 'demo-42').texte).toMatch(
      /^■ 42 {2}Le sujet de demo-42 · de 5 Code +41 min · 10$/
    );
    expect(ligneDe(r, 'demo-42').alterne).toMatch(/^■ 42 {2}030-binder · de 5 Code +41 min · 10$/);
    expect(ligneDe(r, 'demo-42')).toMatchObject({ ton: 'attention' });
    const enSeance = plateau([T('demo-43')], {
      circuits: [
        circuit('demo-43', { etape: 'controles', finale: true, regulateur: true, code: 14 }),
      ],
    });
    expect(ligneDe(enSeance, 'demo-43').texte).toBe(
      '▶ 43  Le sujet de demo-43 · de 7 Passe finale'
    );
    expect(ligneDe(enSeance, 'demo-43')).toMatchObject({ ton: 'actif' });
  });

  it('a long subject is cut before the step it comes from, which stays whole', () => {
    const long = T('demo-44', { title: `44 — ${'Le checker refuse '.repeat(4)}— packages/demo` });
    const r = plateau([long], { circuits: [circuit('demo-44', { vivant: false, code: 20 })] });
    expect(ligneDe(r, 'demo-44').texte).toMatch(/^■ 44 {2}Le checker refuse .*… · de 5 Code$/);
    expect(ligneDe(r, 'demo-44').texte).toHaveLength(LARGEUR);
  });

  it("the tickets' numbers line up in one column, as in the maquette", () => {
    const r = plateau([T('demo-320.3'), T('demo-318')], {
      circuits: [circuit('demo-320.3'), circuit('demo-318', { vivant: false, code: 20 })],
    });
    expect(ligneDe(r, 'demo-320.3').texte).toMatch(/^▶ 320\.3 {2}Le sujet/);
    expect(ligneDe(r, 'demo-318').texte).toMatch(/^■ 318 {4}Le sujet/);
  });
});

// Each bounded loop of the circuit (`boucle` of its step, scripts/etapes.mjs) shows its count on
// its maximum on the ticket's line, at the step where it runs, from its second pass; it replaces
// the attempt of the maquette.
describe('the counter of a bounded loop, from its second pass', () => {
  const ligne = (o: object) =>
    ligneDe(
      plateau([T('demo-47')], {
        registre: [fin('t1', 'demo-47', 'testeur', '08:12')],
        circuits: [circuit('demo-47', { rang: 3, total: 5, ...o })],
      }),
      'demo-47'
    );

  it("the developpeur's sessions at step 5: « essai 2/3 », after the subject and after the component", () => {
    const l = ligne({ etape: 'developpeur', boucles: { 5: 2 } });
    expect(l.texte).toMatch(/^▶ 47 {2}Le sujet de demo-47 · essai 2\/3 +12 min · 10$/);
    expect(l.alterne).toMatch(/^▶ 47 {2}030-binder 3\/5 · essai 2\/3 +12 min · 10$/);
  });

  it("the testeur's sessions after a refused proof at step 3: « essai 3/3 »", () => {
    expect(ligne({ etape: 'testeur', tentative: 3, boucles: { 3: 3 } }).texte).toMatch(
      /^▶ 47 {2}Le sujet de demo-47 · essai 3\/3 +12 min · 10$/
    );
  });

  it('the reviews at step 8: « tour 2/3 »', () => {
    expect(ligne({ etape: 'relecture', boucles: { 8: 2 } }).texte).toMatch(
      /^▶ 47 {2}Le sujet de demo-47 · tour 2\/3 +12 min · 10$/
    );
  });

  it('the same stop come back after a RELANCE, at the arbitrage: « arrêt 2/3 », after the step it comes from', () => {
    expect(ligne({ regulateur: true, code: 14, boucles: { 2: 2 } }).texte).toMatch(
      /^▶ 47 {2}Le sujet .*… · de 5 Code · arrêt 2\/3 12 min · 10$/
    );
  });

  it('a first pass shows no counter, nor the attempt', () => {
    expect(ligne({ etape: 'developpeur', tentative: 1, boucles: { 5: 1 } }).texte).toMatch(
      /^▶ 47 {2}Le sujet de demo-47 +12 min · 10$/
    );
    expect(ligne({ etape: 'controles', tentative: 2, boucles: null }).texte).toMatch(
      /^▶ 47 {2}Le sujet de demo-47 +12 min · 10$/
    );
  });

  it("a step's counter shows only at that step", () => {
    expect(ligne({ etape: 'controles', boucles: { 5: 2 } }).texte).not.toMatch(/essai/);
  });
});

describe('the card of a stopped ticket says its step by number and title', () => {
  it('the step, the component, the stop and the first line of its reason', () => {
    const tous = [T('demo-45')];
    const c = circuit('demo-45', {
      etape: 'controles',
      tentative: 3,
      vivant: false,
      code: 14,
      arret: 'controles',
      raison: 'Le test « tableau » reste rouge.',
    });
    const t = plateau(tous, { circuits: [c] }) as Board & { circuits: object[] };
    const carte = (
      fiches(tous, lignes(t, 'depot'), 'demo', {}, t.circuits) as Record<string, { resume: string }>
    )['demo-45']!.resume;
    expect(carte).toMatch(
      /^Circuit arrêté en 6 Contrôles 3 · 030-binder, arrêt controles \(14\) : Le test « tableau » reste rouge\./
    );
  });
});
