// grillhouse-3uv.90: the board's AGENTS section shows the tree of the steps (scripts/etapes.mjs),
// each ticket at the step where it is at each instant, as a pipeline of GitLab CI shows its stages
// and folds the jobs of a stage that has nothing. The maquette the owner validated (2026-10-21):
//
//   AGENTS  ▶ en cours · en attente
//   0 · Exploration · explorateur
//   ▸ 1 · Ouverture
//   ▾ 2 · Composants
//     2.1 · Tests · testeur
//     2.2 · Preuve du rouge · auto
//     2.3 · Code · développeur
//   ▶ 320.3  Le binder lit les portées · essai 2/3   12 min · 340 k
//           (5 s plus tard)
//   ▶ 320.3  030-binder 2/3 · essai 2/3              12 min · 340 k
//     2.4 · Contrôles · auto
//     ⤷ Arbitrage de l'arrêt · régulateur ⇄ questionneur
//   ■ 318    Le checker refuse … · arrêt 2/3          41 min · 1,2 M
//   3 · Passe finale · auto
//   4 · Relecture · relecteur
//   ▸ 5 · Intégration
//
// A stop of the opening, which the circuit ends on for the supervisor with no regulator (the
// owner, 2026-10-21):
//
//   ▾ 1 · Ouverture
//     1.1 · Relevé des composants · auto
//     ⤷ Arrêt · superviseur
//   ■ 322    Le parser garde…
//     1.2 · Questionnement · questionneur ⇄ référent
//
// - Every step stands in its order. A step with sub-steps is folded (▸) while none of them holds
//   a ticket, unfolded (▾) once one does, all its sub-steps then shown, the empty ones in the
//   discreet tone; a step without sub-steps stands on one line, discreet when empty.
// - A stopped ticket stands under its step, on a line « ⤷ Arbitrage de l'arrêt · régulateur ⇄
//   questionneur » then its own line, which unfolds its step: the arbitrage is out of the
//   sequence, tied to the stopped step. A stop whose kind the table of the stops sends to the
//   supervisor (scripts/etapes.mjs) stands under a line « ⤷ Arrêt · superviseur » instead.
// - The line of 1.2 names its roles « questionneur ⇄ référent », to hold in 52 columns.
// - A ticket's line in a circuit alternates, every 5 s, its subject and its component under way
//   (the board gives both texts, `texte` and `alterne`; the mod alternates), with its rank among
//   the title's components, then the counters of its loops, its time and its tokens.
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
  numero: string | null;
  titre: string;
  roles: string[];
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
  questionnement: null,
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
// A step's line, folded, unfolded, a sub-step or the arbitrage's.
const ETAPE = /^(?:[▸▾] | {2})?\d+(?:\.\d+)? · /;
const ARBITRAGE = "⤷ Arbitrage de l'arrêt · régulateur ⇄ questionneur";
// The step's line above the line of <id>, and the arbitrage's line when it stands between them.
const etapeDe = (t: Board, id: string) => {
  const a = agents(t);
  const i = a.findIndex(x => x.ticket === id);
  return [...a.slice(0, i)].reverse().find(x => ETAPE.test(x.texte))?.texte ?? null;
};
const arbitreDe = (t: Board, id: string) => {
  const a = agents(t);
  const i = a.findIndex(x => x.ticket === id);
  const au = [...a.slice(0, i)].reverse().find(x => ETAPE.test(x.texte) || x.texte.includes('⤷'));
  return au?.texte.includes('⤷') ?? false;
};
const ligneDe = (t: Board, id: string) => agents(t).find(x => x.ticket === id)!;
const sous = (o: object) =>
  etapeDe(plateau([T('demo-34')], { circuits: [circuit('demo-34', o)] }), 'demo-34');

describe('AGENTS shows the tree of the steps, folded where nothing runs', () => {
  it('a board without a ticket shows each step, discreet, those with sub-steps folded', () => {
    expect(agents(plateau([])).map(x => [x.texte.trimEnd(), x.ton])).toEqual([
      ['AGENTS  ▶ en cours · en attente', 'titre'],
      ...[
        '0 · Exploration · explorateur',
        '▸ 1 · Ouverture',
        '▸ 2 · Composants',
        '3 · Passe finale · auto',
        '4 · Relecture · relecteur',
        '▸ 5 · Intégration',
      ].map(texte => [texte, 'discret']),
    ]);
  });

  it('the data holds a block per step and sub-step, in the order of the list, then the arbitrage', () => {
    expect(plateau([]).agents.map(b => [b.numero, b.titre, b.qui])).toEqual([
      ['0', 'Exploration', 'explorateur'],
      ['1', 'Ouverture', ''],
      ['1.1', 'Relevé des composants', 'auto'],
      ['1.2', 'Questionnement', 'questionneur ⇄ référent'],
      ['2', 'Composants', ''],
      ['2.1', 'Tests', 'testeur'],
      ['2.2', 'Preuve du rouge', 'auto'],
      ['2.3', 'Code', 'développeur'],
      ['2.4', 'Contrôles', 'auto'],
      ['3', 'Passe finale', 'auto'],
      ['4', 'Relecture', 'relecteur'],
      ['5', 'Intégration', ''],
      ['5.1', 'Commit', 'auto'],
      ['5.2', 'File : main, poussée, CI', 'auto'],
      [null, "Arbitrage de l'arrêt", 'régulateur ⇄ questionneur'],
    ]);
  });

  it('a ticket at 2.3 unfolds step 2: every sub-step shown, the empty ones discreet', () => {
    const t = plateau([T('demo-33')], { circuits: [circuit('demo-33')] });
    expect(agents(t).map(x => [x.texte.trimEnd().replace(/^▶ .*/, '▶'), x.ton])).toEqual([
      ['AGENTS  ▶ en cours · en attente', 'titre'],
      ['0 · Exploration · explorateur', 'discret'],
      ['▸ 1 · Ouverture', 'discret'],
      ['▾ 2 · Composants', 'titre'],
      ['  2.1 · Tests · testeur', 'discret'],
      ['  2.2 · Preuve du rouge · auto', 'discret'],
      ['  2.3 · Code · développeur', 'titre'],
      ['▶', 'actif'],
      ['  2.4 · Contrôles · auto', 'discret'],
      ['3 · Passe finale · auto', 'discret'],
      ['4 · Relecture · relecteur', 'discret'],
      ['▸ 5 · Intégration', 'discret'],
    ]);
  });

  it('an explorer running on a ticket stands under « 0 · Exploration · explorateur », a title', () => {
    const t = plateau([T('demo-30')], { vivants: [vivant('e1', 'demo-30', 'explorateur')] });
    expect(textes(t).slice(0, 4)).toEqual([
      'AGENTS  ▶ en cours · en attente',
      '0 · Exploration · explorateur',
      expect.stringMatching(/^▶ 30 {2}Le sujet de demo-30 +20 min · 40$/),
      '▸ 1 · Ouverture',
    ]);
    expect(agents(t)[1]).toMatchObject({ ton: 'titre' });
  });

  it('a technical referent on a ticket stands at 1.2, which unfolds the opening, its line whole in the width', () => {
    const t = plateau([T('demo-31')], { vivants: [vivant('a1', 'demo-31', 'referent-technique')] });
    const a = agents(t);
    expect(a.slice(2, 5).map(x => [x.texte.trimEnd(), x.ton])).toEqual([
      ['▾ 1 · Ouverture', 'titre'],
      ['  1.1 · Relevé des composants · auto', 'discret'],
      ['  1.2 · Questionnement · questionneur ⇄ référent', 'titre'],
    ]);
    expect(a[5]).toMatchObject({ ticket: 'demo-31' });
    expect(a.every(x => x.texte.length <= LARGEUR)).toBe(true);
  });

  it('a ticket at 5.2 unfolds the integration, its commit shown discreet', () => {
    const t = plateau([T('demo-32')], { circuits: [circuit('demo-32', { etape: 'file' })] });
    expect(textes(t).slice(-4)).toEqual([
      '▾ 5 · Intégration',
      '  5.1 · Commit · auto',
      '  5.2 · File : main, poussée, CI · auto',
      expect.stringMatching(/^▶ 32 /),
    ]);
  });
});

describe("a circuit's ticket stands at the step of its state, at each instant", () => {
  it('each step of the state at its numbered step, the auto ones included', () => {
    expect(sous({ etape: 'testeur' })).toBe('  2.1 · Tests · testeur');
    expect(sous({ etape: 'preuve' })).toBe('  2.2 · Preuve du rouge · auto');
    expect(sous({ etape: 'developpeur' })).toBe('  2.3 · Code · développeur');
    expect(sous({ etape: 'controles' })).toBe('  2.4 · Contrôles · auto');
    expect(sous({ etape: 'controles', finale: true })).toBe('3 · Passe finale · auto');
    expect(sous({ etape: 'relecture' })).toBe('4 · Relecture · relecteur');
    expect(sous({ etape: 'integration' })).toBe('  5.1 · Commit · auto');
    expect(sous({ etape: 'file' })).toBe('  5.2 · File : main, poussée, CI · auto');
  });

  it('the questioning of the plan at 1.2, its round from the second', () => {
    const t = plateau([T('demo-35')], {
      circuits: [
        circuit('demo-35', {
          etape: 'testeur',
          questionnement: 'plan',
          boucles: { questionnement: 2 },
        }),
      ],
    });
    expect(etapeDe(t, 'demo-35')).toMatch(/^ {2}1\.2 · Questionnement · /);
    expect(arbitreDe(t, 'demo-35')).toBe(false);
    expect(ligneDe(t, 'demo-35').texte).toMatch(/^▶ 35 {2}Le sujet de demo-35 · tour 2\/4( |$)/);
  });

  it('a stopped circuit stands under its step, after the line of the arbitrage, which unfolds its step', () => {
    const t = plateau([T('demo-36')], {
      circuits: [
        circuit('demo-36', { etape: 'controles', vivant: false, code: 14, arret: 'controles' }),
      ],
    });
    const a = textes(t);
    const i = a.indexOf('  2.4 · Contrôles · auto');
    expect(a.slice(i, i + 3)).toEqual([
      '  2.4 · Contrôles · auto',
      `  ${ARBITRAGE}`,
      expect.stringMatching(/^■ 36 {2}Le sujet de demo-36/),
    ]);
    expect(a).toContain('▾ 2 · Composants');
    expect(
      agents(t)[agents(t).findIndex(x => x.texte.trimEnd() === '  2.4 · Contrôles · auto')]
    ).toMatchObject({
      ton: 'titre',
    });
  });

  it('a stop at a step without sub-steps: the arbitrage under it, at the margin', () => {
    const t = plateau([T('demo-37')], {
      circuits: [
        circuit('demo-37', { etape: 'controles', finale: true, regulateur: true, code: 14 }),
      ],
    });
    const a = textes(t);
    const i = a.indexOf('3 · Passe finale · auto');
    expect(a.slice(i, i + 3)).toEqual([
      '3 · Passe finale · auto',
      ARBITRAGE,
      expect.stringMatching(/^▶ 37 {2}Le sujet de demo-37/),
    ]);
    expect(ligneDe(t, 'demo-37')).toMatchObject({ ton: 'actif' });
  });

  it('the stops of the opening stand at their step: the survey at 1.1, the questioning at 1.2', () => {
    expect(sous({ etape: 'testeur', vivant: false, code: 21, arret: 'composants-manquants' })).toBe(
      '  1.1 · Relevé des composants · auto'
    );
    expect(sous({ etape: 'testeur', vivant: false, code: 22, arret: 'questionnement' })).toMatch(
      /^ {2}1\.2 · Questionnement · /
    );
  });

  it('a stop of the survey at 1.1 stands under « ⤷ Arrêt · superviseur », which unfolds the opening', () => {
    const t = plateau([T('demo-322')], {
      circuits: [
        circuit('demo-322', {
          etape: 'testeur',
          vivant: false,
          code: 21,
          arret: 'composants-manquants',
        }),
      ],
    });
    const a = textes(t);
    const i = a.indexOf('▾ 1 · Ouverture');
    expect(a.slice(i, i + 5)).toEqual([
      '▾ 1 · Ouverture',
      '  1.1 · Relevé des composants · auto',
      '  ⤷ Arrêt · superviseur',
      expect.stringMatching(/^■ 322 {2}Le sujet de demo-322/),
      '  1.2 · Questionnement · questionneur ⇄ référent',
    ]);
    expect(a).not.toContain(`  ${ARBITRAGE}`);
    expect(agents(t)[i + 2]).toMatchObject({ ton: 'titre' });
    expect(ligneDe(t, 'demo-322')).toMatchObject({ ton: 'attention' });
  });

  it('a questioning of the plan that does not converge stands at 1.2 under « ⤷ Arrêt · superviseur », its rounds shown', () => {
    const t = plateau([T('demo-323')], {
      circuits: [
        circuit('demo-323', {
          etape: 'testeur',
          vivant: false,
          code: 22,
          arret: 'questionnement',
          boucles: { questionnement: 4 },
        }),
      ],
    });
    const a = textes(t);
    const i = a.indexOf('  1.2 · Questionnement · questionneur ⇄ référent');
    expect(a.slice(i, i + 3)).toEqual([
      '  1.2 · Questionnement · questionneur ⇄ référent',
      '  ⤷ Arrêt · superviseur',
      expect.stringMatching(/^■ 323 {2}Le sujet de demo-323 · tour 4\/4( |$)/),
    ]);
    expect(a).not.toContain(`  ${ARBITRAGE}`);
  });

  it('a stop the regulator settles keeps the line of the arbitrage beside a stop for the supervisor', () => {
    const t = plateau([T('demo-324'), T('demo-325')], {
      circuits: [
        circuit('demo-324', {
          etape: 'testeur',
          vivant: false,
          code: 21,
          arret: 'composants-manquants',
        }),
        circuit('demo-325', { vivant: false, code: 20, arret: 'besoin' }),
      ],
    });
    expect(arbitreDe(t, 'demo-324')).toBe(true);
    const a = textes(t);
    expect(a[a.findIndex(x => x.startsWith('■ 324')) - 1]).toBe('  ⤷ Arrêt · superviseur');
    expect(a[a.findIndex(x => x.startsWith('■ 325')) - 1]).toBe(`  ${ARBITRAGE}`);
  });

  it('the questioning of a decision of the regulator stands at the arbitrage of the stopped step', () => {
    const t = plateau([T('demo-38')], {
      circuits: [
        circuit('demo-38', {
          regulateur: true,
          code: 14,
          arret: 'controles',
          questionnement: 'decision',
          boucles: { arret: 2, questionnement: 3 },
        }),
      ],
    });
    expect(etapeDe(t, 'demo-38')).toBe('  2.3 · Code · développeur');
    expect(arbitreDe(t, 'demo-38')).toBe(true);
    expect(ligneDe(t, 'demo-38').texte).toMatch(/· arrêt 2\/3 · tour 3\/4( |$)/);
  });

  it('two tickets at one step: the running one, then the arbitrage and the stopped one', () => {
    const t = plateau([T('demo-39'), T('demo-40')], {
      circuits: [
        circuit('demo-39'),
        circuit('demo-40', { vivant: false, code: 20, arret: 'besoin' }),
      ],
    });
    const a = textes(t);
    const i = a.indexOf('  2.3 · Code · développeur');
    expect(a.slice(i, i + 4)).toEqual([
      '  2.3 · Code · développeur',
      expect.stringMatching(/^▶ 39 /),
      `  ${ARBITRAGE}`,
      expect.stringMatching(/^■ 40 /),
    ]);
  });

  it('a waiting ticket waits under the step of the role it waits for', () => {
    const t = plateau([T('demo-41', { status: 'open' }), T('demo-42'), T('demo-43')], {
      registre: [
        fin('t1', 'demo-42', 'testeur', '09:00'),
        fin('t2', 'demo-43', 'testeur', '09:00'),
        fin('d2', 'demo-43', 'developpeur', '10:00'),
      ],
    });
    expect(etapeDe(t, 'demo-41')).toBe('  2.1 · Tests · testeur');
    expect(etapeDe(t, 'demo-42')).toBe('  2.3 · Code · développeur');
    expect(etapeDe(t, 'demo-43')).toBe('4 · Relecture · relecteur');
    expect(ligneDe(t, 'demo-42').texte).toMatch(/^· 42 {2}Le sujet de demo-42/);
  });

  it('a regulator running on a ticket without a circuit stands under the arbitrage, after the steps', () => {
    const t = plateau([T('demo-44')], { vivants: [vivant('r1', 'demo-44', 'regulateur')] });
    expect(textes(t).slice(-2)).toEqual([
      ARBITRAGE,
      expect.stringMatching(/^▶ 44 {2}Le sujet de demo-44 +20 min · 40$/),
    ]);
  });
});

describe('the line of a ticket in a circuit: its subject and its component in turn, then time and tokens', () => {
  const t = plateau([T('demo-45')], {
    registre: [fin('t1', 'demo-45', 'testeur', '08:12')],
    circuits: [circuit('demo-45')],
  });

  it('the subject, then the time and the tokens', () => {
    expect(ligneDe(t, 'demo-45').texte).toMatch(/^▶ 45 {2}Le sujet de demo-45 +12 min · 10$/);
    expect(ligneDe(t, 'demo-45')).toMatchObject({ ton: 'actif', ticket: 'demo-45' });
  });

  it('the other text: the short name of the component under way in place of the subject, the rest the same', () => {
    expect(ligneDe(t, 'demo-45').alterne).toMatch(/^▶ 45 {2}030-binder +12 min · 10$/);
    expect(ligneDe(t, 'demo-45').texte).toHaveLength(LARGEUR);
    expect(ligneDe(t, 'demo-45').alterne).toHaveLength(LARGEUR);
  });

  it('the component carries its rank among the components of the title, « composant n/N », never « 1/1 »', () => {
    const r = plateau([T('demo-46')], {
      registre: [fin('t1', 'demo-46', 'testeur', '08:12')],
      circuits: [circuit('demo-46', { rang: 3, total: 5 })],
    });
    expect(ligneDe(r, 'demo-46').alterne).toMatch(/^▶ 46 {2}030-binder 3\/5 +12 min · 10$/);
    expect(ligneDe(r, 'demo-46').texte).not.toMatch(/3\/5/);
    expect(ligneDe(t, 'demo-45').alterne).not.toMatch(/1\/1/);
  });

  it('the root component reads « . »', () => {
    const r = plateau([T('demo-47')], { circuits: [circuit('demo-47', { composant: '.' })] });
    expect(ligneDe(r, 'demo-47').alterne).toBe('▶ 47  .');
  });

  it('a circuit without a component keeps one text, and so does a ticket out of a circuit', () => {
    const r = plateau([T('demo-48'), T('demo-49')], {
      circuits: [circuit('demo-48', { composant: null })],
      vivants: [vivant('e2', 'demo-49', 'explorateur')],
    });
    expect(ligneDe(r, 'demo-48').alterne).toBeUndefined();
    expect(ligneDe(r, 'demo-49').alterne).toBeUndefined();
  });

  it('a stopped ticket stands under its step and names no step it comes from', () => {
    const r = plateau([T('demo-50')], {
      registre: [fin('t1', 'demo-50', 'testeur', '08:41')],
      circuits: [circuit('demo-50', { vivant: false, code: 20, arret: 'besoin' })],
    });
    expect(ligneDe(r, 'demo-50').texte).toMatch(/^■ 50 {2}Le sujet de demo-50 +41 min · 10$/);
    expect(ligneDe(r, 'demo-50').alterne).toMatch(/^■ 50 {2}030-binder +41 min · 10$/);
    expect(ligneDe(r, 'demo-50')).toMatchObject({ ton: 'attention' });
  });

  it("the tickets' numbers line up in one column, as in the maquette", () => {
    const r = plateau([T('demo-320.3'), T('demo-318')], {
      circuits: [circuit('demo-320.3'), circuit('demo-318', { vivant: false, code: 20 })],
    });
    expect(ligneDe(r, 'demo-320.3').texte).toMatch(/^▶ 320\.3 {2}Le sujet/);
    expect(ligneDe(r, 'demo-318').texte).toMatch(/^■ 318 {4}Le sujet/);
  });
});

// Each bounded loop of the circuit (`boucles` of its step, scripts/etapes.mjs) shows its count on
// its maximum on the ticket's line, at each step it spans, from its second pass.
describe('the counters of the bounded loops, from their second pass', () => {
  const ligne = (o: object) =>
    ligneDe(
      plateau([T('demo-51')], {
        registre: [fin('t1', 'demo-51', 'testeur', '08:12')],
        circuits: [circuit('demo-51', { rang: 3, total: 5, ...o })],
      }),
      'demo-51'
    );

  it("the developpeur's sessions at 2.3: « essai 2/3 », after the subject and after the component", () => {
    const l = ligne({ etape: 'developpeur', boucles: { code: 2 } });
    expect(l.texte).toMatch(/^▶ 51 {2}Le sujet de demo-51 · essai 2\/3 +12 min · 10$/);
    expect(l.alterne).toMatch(/^▶ 51 {2}030-binder 3\/5 · essai 2\/3 +12 min · 10$/);
  });

  it('the same loop at its checks, 2.4', () => {
    expect(ligne({ etape: 'controles', boucles: { code: 3 } }).texte).toMatch(/· essai 3\/3 /);
  });

  it("the testeur's sessions after a refused proof, at 2.1 and at its proof 2.2: « essai 3/3 »", () => {
    expect(ligne({ etape: 'testeur', tentative: 3, boucles: { tests: 3 } }).texte).toMatch(
      /^▶ 51 {2}Le sujet de demo-51 · essai 3\/3 +12 min · 10$/
    );
    expect(ligne({ etape: 'preuve', boucles: { tests: 2 } }).texte).toMatch(/· essai 2\/3 /);
  });

  it('the reviews at 4: « tour 2/3 »', () => {
    expect(ligne({ etape: 'relecture', boucles: { relecture: 2 } }).texte).toMatch(
      /^▶ 51 {2}Le sujet de demo-51 · tour 2\/3 +12 min · 10$/
    );
  });

  it('the same stop come back after a RELANCE, at the arbitrage: « arrêt 2/3 »', () => {
    expect(ligne({ regulateur: true, code: 14, boucles: { arret: 2 } }).texte).toMatch(
      /^▶ 51 {2}Le sujet de demo-51 · arrêt 2\/3 +12 min · 10$/
    );
  });

  it('a first pass shows no counter, nor the attempt', () => {
    expect(ligne({ etape: 'developpeur', tentative: 1, boucles: { code: 1 } }).texte).toMatch(
      /^▶ 51 {2}Le sujet de demo-51 +12 min · 10$/
    );
    expect(ligne({ etape: 'controles', tentative: 2, boucles: null }).texte).toMatch(
      /^▶ 51 {2}Le sujet de demo-51 +12 min · 10$/
    );
  });

  it("a loop's counter shows only at the steps it spans", () => {
    expect(ligne({ etape: 'relecture', boucles: { code: 2 } }).texte).not.toMatch(/essai/);
    expect(ligne({ etape: 'controles', finale: true, boucles: { code: 2 } }).texte).not.toMatch(
      /essai/
    );
  });
});

describe('the card of a stopped ticket says its step by number and title', () => {
  it('the step, the component, the stop and the first line of its reason', () => {
    const tous = [T('demo-52')];
    const c = circuit('demo-52', {
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
    )['demo-52']!.resume;
    expect(carte).toMatch(
      /^Circuit arrêté en 2\.4 Contrôles 3 · 030-binder, arrêt controles \(14\) : Le test « tableau » reste rouge\./
    );
  });
});
