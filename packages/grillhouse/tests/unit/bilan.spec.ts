// The figures of a ticket (scripts/bilan.mjs, grillhouse-3uv.89, L8): computed from the register
// of finished agents (the agents' sessions and the steps the circuit leads itself), the structured
// results the circuit keeps (`<ticket>.fiches.jsonl`: each session it launches, each session's
// sheet, each proof's and check's outcome, each stop, each end of a run on a stop, L3), and the
// circuit's state, as the analysis of BPScript 320.3 was made by hand: the wall time, the time of each category, the sessions by
// role, the stops by kind, the tokens, the cache and the cost, compared with the last bilan of the
// project, or with nothing. The data here are trial data, never the real register.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  bilan,
  bilansGardes,
  ecrireLeBilan,
  enBref,
  garder,
  lignesDuProjet,
  plageDeNuit,
  precedent,
  texteDuBilan,
} from '../../scripts/bilan.mjs';
import { fiches } from '../../scripts/tableau.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'bilan-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const TICKET = 'demo-7';
const PROJET = '/depot';
const S = 1000;
const MIN = 60 * S;
const T0 = Date.parse('2026-10-20T10:00:00Z');
// The instant <m> minutes (and <s> seconds) after T0.
const a = (m: number, s = 0) => T0 + m * MIN + s * S;
const iso = (t: number) => new Date(t).toISOString();
// The time of an entry of the circuit, to the millisecond; <ms> apart two entries of one second.
const quand = (m: number, s: number, ms = 0) => iso(a(m, s) + ms);

interface Ligne {
  projet: string;
  agent: string;
  ticket: string | null;
  role: string;
  etape?: string;
  debut: string;
  fin: string;
  travail: number;
  tours: [number, number][];
  jetons: number;
  cache: number;
  cout: number | null;
}
// An entry of `<ticket>.fiches.jsonl`, as the circuit writes it.
interface Entree {
  date: string;
  role: string;
  etape?: string;
  fiche?: object;
  resultat?: object;
  arret?: string;
  finale?: boolean;
  inchange?: boolean;
  questionnement?: object;
  lancement?: { role: string; seance: string };
  montee?: { code: number; raison: string | null; qui: string | null };
}
interface Categorie {
  ms: number;
  n: number;
  jetons: number;
  cache: number;
  cout: number;
}
interface Bilan {
  ticket: string;
  debut: string;
  fin: string;
  mur: number;
  murHorsNuit: number;
  statut: string;
  perdu: number;
  perduHorsAttentes: number;
  categories: Record<
    | 'travail'
    | 'sansEffet'
    | 'questionnement'
    | 'superviseur'
    | 'responsable'
    | 'nuit'
    | 'automatique'
    | 'finales'
    | 'rejeu'
    | 'intervalles',
    Categorie
  >;
  seances: {
    total: number;
    parRole: Record<string, number>;
    horsCircuit: { total: number; parRole: Record<string, number>; cout: number };
  };
  etapes: Record<string, number>;
  arrets: Record<string, number>;
  questionnement: { questions: number; changes: number; ouvertes: number };
  jetons: number;
  cache: number;
  cout: number;
}

// The register line of a session of the agent <agent>, its turns given in minutes after T0.
const seance = (
  role: string,
  agent: string,
  tours: [number, number][],
  { jetons = 1000, cache = 10_000, cout = 0.5 as number | null, ticket = TICKET } = {}
): Ligne => {
  const t = tours.map(([d, f]) => [a(d), a(f)] as [number, number]);
  return {
    projet: PROJET,
    agent,
    ticket,
    role,
    debut: iso(t[0][0]),
    fin: iso(t.at(-1)![1]),
    travail: t.reduce((s, [d, f]) => s + f - d, 0),
    tours: t,
    jetons,
    cache,
    cout,
  };
};
// The register line of a step the circuit leads itself, as ligneDEtape writes it.
const etape = (nom: string, d: number, f: number): Ligne => ({
  projet: PROJET,
  agent: `circuit:${TICKET}:${iso(a(d))}`,
  ticket: TICKET,
  role: 'circuit',
  etape: nom,
  debut: iso(a(d)),
  fin: iso(a(f)),
  travail: a(f) - a(d),
  tours: [[a(d), a(f)]],
  jetons: 0,
  cache: 0,
  cout: null,
});
// The sheet of a session of <role>, kept <m> minutes and <s> seconds after T0.
const fiche = (m: number, s: number, role: string, f: object = { statut: 'FAIT' }): Entree => ({
  date: quand(m, s),
  role,
  fiche: f,
});
// The outcome of a proof, as the circuit keeps it: its counts, whether it passed, whether its lot
// holds no file.
const preuve = (
  m: number,
  s: number,
  [rouges, justifies, sans, anciens]: number[],
  ok: boolean,
  vide = false
): Entree => ({
  date: quand(m, s),
  role: 'circuit',
  etape: 'preuve',
  resultat: { ok, rouges, justifies, sans, casses: 0, anciens, vide },
});
// The outcome of checks, or of the final pass.
const controles = (
  m: number,
  s: number,
  issue: 'vert' | 'rouge' | 'a-repasser',
  finale: boolean
): Entree => ({
  date: quand(m, s),
  role: 'circuit',
  etape: 'controles',
  resultat: { issue, finale },
});
// A stop of the circuit at the step <etape>, <ms> after the second.
const arret = (
  m: number,
  s: number,
  etape: string,
  nom: string,
  { finale = false, ms = 1 } = {}
): Entree => ({
  date: quand(m, s, ms),
  role: 'circuit',
  etape,
  arret: nom,
  ...(finale ? { finale } : {}),
});
// A developpeur resumed who finds the lot delivered and changes nothing.
const inchange = (m: number, s: number): Entree => ({
  date: quand(m, s, 1),
  role: 'circuit',
  etape: 'developpeur',
  inchange: true,
});
// The end of a run of the circuit on a stop (code <code>), whose question <qui> must answer, <ms>
// after the second.
const montee = (
  m: number,
  s: number,
  code: number,
  raison: string,
  { ms = 2, qui = 'superviseur' as string | null } = {}
): Entree => ({
  date: quand(m, s, ms),
  role: 'circuit',
  montee: { code, raison, qui },
});

// The bilan of the lines <lignes> and the entries <entrees>: the circuit kept the launch of each
// session at its first turn (`lancement`, its role and its session id), save the agents
// <superviseur> launched.
const calculer = (
  lignes: Ligne[],
  entrees: Entree[],
  etat: object | null = null,
  { superviseur = [] as string[], commentaires = [] as { created_at: string; text: string }[] } = {}
) => {
  const lancees = lignes
    .filter(l => l.role !== 'circuit' && !superviseur.includes(l.agent))
    .map(l => ({
      date: iso(l.tours[0][0]),
      role: 'circuit',
      lancement: { role: l.role, seance: l.agent },
    }));
  return bilan({
    ticket: TICKET,
    lignes,
    entrees: [...lancees, ...entrees],
    etat,
    commentaires,
  }) as Bilan;
};
const min = (ms: number) => Math.round((ms / MIN) * 100) / 100;

describe('the wall time and its categories', () => {
  // One ticket, each step doing its work once; its checks are the final pass.
  const lignes = [
    seance('testwriter', 't1', [[0, 10]], { jetons: 2000, cache: 30_000, cout: 1 }),
    etape('preuve', 10.25, 11),
    seance('developpeur', 'd1', [[11.25, 20]], { jetons: 1000, cache: 20_000, cout: 0.25 }),
    etape('controles', 20.25, 30),
    seance('relecteur', 'r1', [[30.25, 35]], { jetons: 500, cache: 5000, cout: 0.5 }),
    etape('integration', 35.25, 36),
    etape('file', 36, 38),
  ];
  const entrees = [
    fiche(10, 5, 'testwriter'),
    preuve(11, 0, [1, 0, 0, 0], true),
    fiche(20, 5, 'developpeur'),
    controles(30, 0, 'vert', true),
    fiche(35, 5, 'relecteur', { verdict: 'ACCEPTÉ' }),
  ];
  const b = calculer(lignes, entrees, { etape: 'integre' });

  it('runs from the start of the first session to the last line of the circuit', () => {
    expect(b.debut).toBe(iso(a(0)));
    expect(b.fin).toBe(iso(a(38)));
    expect(b.mur).toBe(38 * MIN);
    expect(b.statut).toBe('intégré');
  });

  it('counts each session that delivered as work kept in the lot, the reviewer included', () => {
    expect(min(b.categories.travail.ms)).toBe(10 + 8.75 + 4.75);
    expect(b.categories.travail.n).toBe(3);
    expect(b.categories.travail.cout).toBeCloseTo(1.75);
  });

  it('counts the steps the circuit leads as automatic, the final pass apart, at its own line', () => {
    expect(min(b.categories.automatique.ms)).toBe(0.75 + 0.75 + 2);
    expect(b.categories.automatique.jetons).toBe(0);
    expect(min(b.categories.finales.ms)).toBe(9.75);
    expect(b.categories.finales.n).toBe(1);
    expect(texteDuBilan(b, null).split('\n')).toContain('- passes finales : 10 min');
  });

  it('counts what no session nor step covers as the time between two steps', () => {
    expect(min(b.categories.intervalles.ms)).toBe(0.25 * 5);
    expect(b.perdu).toBe(b.categories.intervalles.ms);
  });

  it('names the steps by their titles in the one list of the steps', () => {
    expect(b.etapes).toEqual({
      'Preuve du rouge': 1,
      'Passe finale': 1,
      Commit: 1,
      'File : main, poussée, CI': 1,
    });
  });

  it('sums the tokens, the cache reads and the cost of the sessions', () => {
    expect(b.jetons).toBe(3500);
    expect(b.cache).toBe(55_000);
    expect(b.cout).toBeCloseTo(1.75);
    expect(b.seances).toEqual({
      total: 3,
      parRole: { testwriter: 1, developpeur: 1, relecteur: 1 },
      horsCircuit: { total: 0, parRole: {}, cout: 0 },
    });
  });
});

// grillhouse-3uv.95.9: the checks of 3.1 and the final pass are both steps `controles`; in the
// trial circuit, the final pass ends within the gap after the checks, and its result was the
// checks' too: two final passes for one.
describe('a step and the next of its name, within the gap', () => {
  const finale: Ligne = {
    ...etape('controles', 20, 21),
    agent: 'circuit:finale',
    debut: quand(20, 0, 500),
    fin: quand(20, 1, 500),
    tours: [[a(20, 0) + 500, a(20, 1) + 500]],
  };
  const lignes = [seance('developpeur', 'd1', [[0, 10]]), etape('controles', 10, 20), finale];
  const entrees = [
    fiche(10, 0, 'developpeur'),
    controles(20, 0, 'vert', false),
    { ...controles(20, 1, 'vert', true), date: quand(20, 1, 500) },
  ];
  const b = calculer(lignes, entrees, { etape: 'integre' });

  it('gives each step its own result: the checks, then one final pass', () => {
    expect(b.etapes).toEqual({ Contrôles: 1, 'Passe finale': 1 });
  });
});

describe('a relaunch without effect', () => {
  // The final passes of one ticket.
  const lignes = [
    seance('testwriter', 't1', [[0, 5]]),
    etape('preuve', 5, 6),
    seance('testwriter', 't2', [[6, 7]]),
    etape('preuve', 7, 8),
    seance('developpeur', 'd1', [[8, 10]]),
    seance('developpeur', 'd2', [[11, 12]]),
    etape('controles', 12, 18),
    seance('developpeur', 'd3', [[18, 19]]),
    etape('controles', 19, 25),
    seance('developpeur', 'd4', [[25, 28]]),
    etape('controles', 28, 34),
  ];
  const entrees = [
    fiche(5, 0, 'testwriter'),
    preuve(6, 0, [1, 0, 2, 3], false),
    fiche(7, 0, 'testwriter'),
    preuve(8, 0, [1, 2, 0, 3], true),
    fiche(10, 0, 'developpeur'),
    arret(10, 0, 'developpeur', 'sans-livraison'),
    fiche(12, 0, 'developpeur'),
    inchange(12, 0),
    controles(18, 0, 'rouge', true),
    fiche(19, 0, 'developpeur'),
    arret(19, 0, 'developpeur', 'sans-livraison'),
    controles(25, 0, 'rouge', true),
    fiche(28, 0, 'developpeur'),
    controles(34, 0, 'vert', true),
  ];
  const b = calculer(lignes, entrees);

  it('counts the developer who changes nothing, stopped or resumed unchanged, as without effect', () => {
    // d1, d2, d3 ; d4 delivers.
    expect(b.categories.travail.n).toBe(2);
    expect(min(b.categories.travail.ms)).toBe(5 + 3);
  });

  it('counts the testwriter relaunched for its « vert attendu » alone, and the proof it replays, as without effect', () => {
    // t2 (1 min), the second proof (1 min), d1 (2), d2 (1), d3 (1), the second final pass (6).
    expect(min(b.categories.sansEffet.ms)).toBe(1 + 1 + 2 + 1 + 1 + 6);
    expect(b.categories.sansEffet.n).toBe(6);
  });

  it('counts a final pass that plays the same red on a lot nothing delivered to as without effect', () => {
    expect(b.etapes['Passe finale']).toBe(3);
    expect(min(b.categories.finales.ms)).toBe(12);
    expect(min(b.categories.automatique.ms)).toBe(1);
  });

  // grillhouse-3uv.95.4: no role of arbitrage, no category of its own.
  it('counts every category outside the work, the automatic steps and the final passes as lost, with no role of arbitrage', () => {
    expect(Object.keys(b.categories)).not.toContain('regulateur');
    expect(Object.keys(b.seances.parRole)).not.toContain('regulateur');
    expect(b.categories.sansEffet.cout).toBeCloseTo(4 * 0.5);
    expect(b.perdu).toBe(
      b.mur - b.categories.travail.ms - b.categories.automatique.ms - b.categories.finales.ms
    );
    expect(b.arrets).toEqual({ 'sans-livraison': 2 });
  });
});

// grillhouse-3uv.89.1 (L9), grillhouse-3uv.95.4: the questioning of the plan, its readings and
// the plans it changed, counted from the results the circuit keeps.
describe('the questioning', () => {
  const lignes = [
    seance('questionneur', 'q1', [
      [0, 2],
      [4, 5],
    ]),
    seance('testwriter', 't1', [[5, 10]]),
    seance('questionneur', 'q2', [[12, 13]], { cout: 0.25 }),
  ];
  // The end of a questioning as the circuit keeps it: the questions the questionneur asked, whether
  // an answer changed the plan, the questions left open.
  const fin = (
    m: number,
    questions: number,
    change: boolean,
    issue: string,
    ouvertes: number
  ): Entree => ({
    date: quand(m, 0, 1),
    role: 'circuit',
    questionnement: { objet: 'plan', questions, change, issue, ouvertes },
  });
  const entrees = [
    fiche(2, 0, 'questionneur', { issue: 'QUESTIONS', questions: [] }),
    fiche(5, 0, 'explorateur', { reponses: [] }),
    fin(5, 2, true, 'QUESTIONS', 0),
    fiche(10, 0, 'testwriter'),
    fiche(13, 0, 'questionneur', { issue: 'DÉSACCORD', desaccord: 'x' }),
    fin(13, 1, false, 'DÉSACCORD', 1),
  ];
  const b = calculer(lignes, entrees);

  it('counts the questions asked, the plans an answer changed and the questions left open, as the circuit keeps them', () => {
    expect(b.questionnement).toEqual({ questions: 3, changes: 1, ouvertes: 1 });
  });

  it('counts the questionneur’s time apart, as kept', () => {
    expect(min(b.categories.questionnement.ms)).toBe(3 + 1);
    expect(b.categories.questionnement.cout).toBeCloseTo(0.75);
    expect(b.perdu).toBe(
      b.mur - b.categories.travail.ms - b.categories.automatique.ms - b.categories.questionnement.ms
    );
    expect(b.seances.parRole).toMatchObject({ questionneur: 2 });
  });

  it('says its questions, the plans changed and the questions left open on its line, no round', () => {
    const l = texteDuBilan(b, null).split('\n');
    expect(l).toContain(
      '- questionnement : 4 min, 0,75 $ (3 questions, 1 plan changé, 1 question ouverte)'
    );
    expect(l.join('\n')).not.toMatch(/tour|décision/);
  });
});

describe('a replay of steps already green', () => {
  // grillhouse-3uv.95.6: one testwriter and one developpeur for the whole ticket. Its checks and
  // its final pass green, a RENDU sends the testwriter back, who finds the lot proven: the circuit
  // plays again what nothing changed.
  const lignes = [
    seance('testwriter', 't1', [[0, 2]]),
    etape('preuve', 2, 3),
    seance('developpeur', 'd1', [[3, 4]]),
    etape('controles', 4, 5),
    etape('controles', 5, 11),
    seance('relecteur', 'r1', [[11, 13]]),
    seance('testwriter', 't2', [[13, 15]]),
    etape('preuve', 15, 16),
    etape('controles', 16, 17),
    etape('controles', 17, 23),
  ];
  const entrees = [
    fiche(2, 0, 'testwriter'),
    preuve(3, 0, [1, 0, 0, 1], true),
    fiche(4, 0, 'developpeur'),
    controles(5, 0, 'vert', false),
    controles(11, 0, 'vert', true),
    fiche(13, 1, 'relecteur', { verdict: 'RENDU' }),
    fiche(15, 0, 'testwriter'),
    preuve(16, 0, [1, 0, 0, 1], true),
    controles(17, 0, 'vert', false),
    controles(23, 0, 'vert', true),
  ];
  const b = calculer(lignes, entrees);

  it('counts the testwriter run again on a proven lot, its proof, and the checks and final pass green again with nothing delivered since as a replay', () => {
    expect(min(b.categories.rejeu.ms)).toBe(2 + 1 + 1 + 6);
    expect(b.categories.rejeu.n).toBe(4);
  });

  it('counts by step, the checks of the plan apart from the final pass, and by role', () => {
    expect(b.etapes).toEqual({ 'Preuve du rouge': 2, Contrôles: 2, 'Passe finale': 2 });
    expect(b.seances.parRole).toEqual({ testwriter: 2, developpeur: 1, relecteur: 1 });
  });

  it('counts the first checks and final pass, after the developpeur delivered, as automatic and final', () => {
    expect(min(b.categories.automatique.ms)).toBe(1 + 1);
    expect(min(b.categories.finales.ms)).toBe(6);
  });
});

// grillhouse-3uv.92.10 (BPScript 320.4, n° 16): the bilan counted 69 sessions (68 launched by the
// circuit) and 1.7 min of wait (23.8 measured).
describe('the wait for the supervisor and the sessions the circuit launches', () => {
  // The developer delivers nothing, the circuit ends on its question; the supervisor launches a
  // questionneur of its own, then answers 21 min after.
  const lignes = [
    seance('developpeur', 'd1', [[0, 5]]),
    seance('questionneur', 'q9', [[10, 14]], { cout: 1.64 }),
    seance('developpeur', 'd2', [[26, 30]]),
  ];
  const entrees = [
    fiche(5, 0, 'developpeur'),
    arret(5, 0, 'developpeur', 'sans-livraison'),
    montee(5, 0, 15, 'sans-livraison'),
    fiche(30, 0, 'developpeur'),
  ];
  const b = calculer(lignes, entrees, null, { superviseur: ['q9'] });

  it('runs from the circuit’s end on the stop to the first session of the run that answers it', () => {
    expect(min(b.categories.superviseur.ms)).toBe(21);
    expect(b.categories.superviseur.n).toBe(1);
    expect(texteDuBilan(b, null).split('\n')).toContain(
      '- attente du superviseur : 21 min (1 montée)'
    );
  });

  it('counts a stop the window ends on, still unanswered, as no wait', () => {
    const fin = calculer([lignes[0]], entrees.slice(0, 3));
    expect(fin.categories.superviseur).toMatchObject({ ms: 0, n: 0 });
  });

  it('counts the sessions the circuit launched, and those of the supervisor apart, out of the categories and the cost', () => {
    expect(b.seances).toEqual({
      total: 2,
      parRole: { developpeur: 2 },
      horsCircuit: { total: 1, parRole: { questionneur: 1 }, cout: 1.64 },
    });
    expect(b.cout).toBeCloseTo(1);
    expect(texteDuBilan(b, null).split('\n')[0]).toContain(
      '2 séances (2 développeur) ; 1 séance hors circuit, lancée par le superviseur (1 questionneur), 1,64 $ ;'
    );
  });

  it('counts the developer who delivered as work, the one who delivered nothing as without effect', () => {
    expect(min(b.categories.travail.ms)).toBe(4);
    expect(min(b.categories.sansEffet.ms)).toBe(5);
  });
});

describe('what the bilan reads of the register', () => {
  // grillhouse-3uv.95.5: the explorateur is a role of the circuit, at its plan; one the supervisor
  // launched on the ticket before the circuit counts apart, as any session the circuit did not launch.
  it('reads the latest line of each agent, the lines of the ticket only, an exploration the supervisor launched apart', () => {
    const lignes = [
      seance('explorateur', 'x1', [[-60, -30]], { cout: 3 }),
      seance('testwriter', 't1', [[0, 4]], { jetons: 100, cout: 0.5 }),
      // A resumed session: its latest line holds its two turns and all its tokens.
      seance('testwriter', 't1', [[0, 4]], { jetons: 100, cout: 0.5 }),
      seance(
        'testwriter',
        't1',
        [
          [0, 4],
          [6, 8],
        ],
        { jetons: 300, cache: 3000, cout: 1.5 }
      ),
      seance('developpeur', 'autre', [[1, 3]], { ticket: 'demo-8', cout: 9 }),
      seance('developpeur', 'd1', [[9, 11]], { jetons: 50, cout: null }),
      etape('preuve', 4, 6),
      etape('preuve', 8, 9),
    ];
    const entrees = [
      fiche(4, 0, 'testwriter'),
      preuve(6, 0, [0, 0, 1, 0], false),
      fiche(8, 0, 'testwriter'),
      preuve(9, 0, [0, 0, 1, 0], false),
      fiche(11, 0, 'developpeur'),
      arret(11, 0, 'developpeur', 'sans-livraison'),
      arret(11, 1, 'developpeur', 'sans-livraison'),
      arret(11, 2, 'controles', 'a-repasser', { finale: true }),
    ];
    const b = calculer(
      lignes,
      entrees,
      { etape: 'controles', raison: 'a-repasser', code: 75 },
      { superviseur: ['x1'] }
    );
    expect(b.seances).toEqual({
      total: 2,
      parRole: { testwriter: 1, developpeur: 1 },
      horsCircuit: { total: 1, parRole: { explorateur: 1 }, cout: 3 },
    });
    expect(b.jetons).toBe(350);
    expect(b.cout).toBeCloseTo(1.5);
    expect(b.debut).toBe(iso(a(0)));
    expect(b.arrets).toEqual({ 'sans-livraison': 2, 'a-repasser': 1 });
    expect(b.statut).toBe('arrêt a-repasser (75)');
    // The testwriter's tokens go to its turns by their time: 4 min of work, 2 without effect.
    expect(b.categories.travail.jetons + b.categories.sansEffet.jetons).toBe(350);
    expect(b.categories.travail.jetons).toBe(200);
  });
});

describe('the lines of the project in the register', () => {
  it('reads the lines of the main tree and of its folders, out of the other projects and the torn lines', () => {
    const l = (projet: string) => JSON.stringify({ projet, agent: projet });
    const texte = [
      l('/depot'),
      l('/depot/.claude/worktrees/demo-7/packages/a/test'),
      l('/depot-voisin'),
      l('/autre'),
      '{ cassé',
    ].join('\n');
    expect((lignesDuProjet(texte, '/depot') as { agent: string }[]).map(x => x.agent)).toEqual([
      '/depot',
      '/depot/.claude/worktrees/demo-7/packages/a/test',
    ]);
  });
});

// grillhouse-3uv.95.9: the wait splits as the lead time of DORA separates the wait for review from
// the work: the supervisor's, the owner's (each by who must answer the question the run ended on),
// and the night, a range of hours the project declares (23 h – 8 h by default), in local time.
describe('the night, the supervisor’s wait and the owner’s', () => {
  // 22:00 local, the evening of 20 October 2026, far from a change of hour.
  const SOIR = new Date(2026, 9, 20, 22, 0).getTime();
  const b0 = (m: number) => SOIR + m * MIN;
  const ligne = (role: string, agent: string, d: number, f: number): Ligne => ({
    ...seance(role, agent, [[0, 1]]),
    debut: iso(b0(d)),
    fin: iso(b0(f)),
    travail: (f - d) * MIN,
    tours: [[b0(d), b0(f)]],
  });
  const le = (m: number, e: Omit<Entree, 'date'>): Entree => ({ date: iso(b0(m) + 2), ...e });
  // The testwriter writes, its proof plays 2 min after; the run ends on a question for the
  // supervisor at 22:33, answered at 22:50; the developpeur's question for the owner ends the run
  // at 22:55, answered at 9:00 the next morning.
  const lignes = [
    ligne('testwriter', 't1', 0, 30),
    { ...etape('preuve', 0, 1), debut: iso(b0(32)), fin: iso(b0(33)), tours: [[b0(32), b0(33)]] },
    ligne('developpeur', 'd1', 50, 55),
    ligne('developpeur', 'd2', 660, 670),
  ] as Ligne[];
  const entrees = [
    le(30, { role: 'testwriter', fiche: { statut: 'FAIT' } }),
    le(33, {
      role: 'circuit',
      etape: 'preuve',
      resultat: { ok: false, rouges: 1, justifies: 0, sans: 0, casses: 0, anciens: 0 },
    }),
    le(33, { role: 'circuit', montee: { code: 21, raison: 'preuve', qui: 'superviseur' } }),
    le(55, { role: 'developpeur', fiche: { statut: 'BESOIN' } }),
    le(55, { role: 'circuit', montee: { code: 16, raison: 'besoin', qui: 'responsable' } }),
    le(670, { role: 'developpeur', fiche: { statut: 'FAIT' } }),
  ];
  const b = calculer(lignes, entrees);

  it('splits the wait by who must answer, the night apart', () => {
    expect(min(b.categories.superviseur.ms)).toBe(17);
    expect(b.categories.superviseur.n).toBe(1);
    expect(min(b.categories.responsable.ms)).toBe(5 + 60);
    expect(b.categories.responsable.n).toBe(1);
    expect(min(b.categories.nuit.ms)).toBe(9 * 60);
  });

  it('gives the wall time, the wall time out of the night and the time lost out of the waits', () => {
    expect(min(b.mur)).toBe(670);
    expect(min(b.murHorsNuit)).toBe(670 - 540);
    expect(min(b.perdu)).toBe(17 + 65 + 540 + 2);
    expect(min(b.perduHorsAttentes)).toBe(2);
    const l = texteDuBilan(b, null).split('\n');
    expect(l[0]).toMatch(
      /^en cours en 670 min, 130 min hors nuit d'attente ; 624 min perdues \(93 %\), 2 min hors attentes ; /
    );
    expect(l).toContain('- attente du superviseur : 17 min (1 montée)');
    expect(l).toContain('- attente du responsable : 65 min (1 montée)');
    expect(l).toContain('- nuit : 540 min');
    expect(l.join('\n')).not.toMatch(/attente humaine/);
  });

  it('takes the night the project declares, its hours in local time', () => {
    const autre = bilan({
      ticket: TICKET,
      lignes,
      entrees: [
        ...lignes
          .filter(l => l.role !== 'circuit')
          .map(l => ({
            date: iso(l.tours[0][0]),
            role: 'circuit',
            lancement: { role: l.role, seance: l.agent },
          })),
        ...entrees,
      ],
      nuit: { debut: 1, fin: 7 },
    }) as Bilan;
    expect(min(autre.categories.nuit.ms)).toBe(6 * 60);
    expect(min(autre.categories.responsable.ms)).toBe(605 - 360);
  });

  it('computes the bilan of a project from its register, its results and the night its package.json declares', () => {
    // The project at <nom>, its night <plage> declared or not: the night of its bilan, kept.
    const nuitDu = (nom: string, plage?: object) => {
      const racine = path.join(ESSAIS, nom);
      mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
      writeFileSync(
        path.join(racine, 'package.json'),
        JSON.stringify({ name: nom, ...(plage ? { grillhouse: { plageDeNuit: plage } } : {}) })
      );
      const registre = path.join(racine, 'registre.jsonl');
      writeFileSync(
        registre,
        lignes.map(l => JSON.stringify({ ...l, projet: racine })).join('\n') + '\n'
      );
      const lancees = lignes
        .filter(l => l.role !== 'circuit')
        .map(l => ({
          date: iso(l.tours[0][0]),
          role: 'circuit',
          lancement: { role: l.role, seance: l.agent },
        }));
      writeFileSync(
        path.join(racine, '.claude', 'worktrees', `${TICKET}.fiches.jsonl`),
        [...lancees, ...entrees].map(e => JSON.stringify(e)).join('\n') + '\n'
      );
      const avant = process.env.GRILLHOUSE_REGISTRE;
      process.env.GRILLHOUSE_REGISTRE = registre;
      try {
        ecrireLeBilan(racine, TICKET);
      } finally {
        if (avant === undefined) {
          delete process.env.GRILLHOUSE_REGISTRE;
        } else {
          process.env.GRILLHOUSE_REGISTRE = avant;
        }
      }
      const f = path.join(racine, '.claude', 'worktrees', `${TICKET}.bilan.json`);
      return JSON.parse(readFileSync(f, 'utf8')) as Bilan;
    };
    expect(min(nuitDu('projet-sans-plage').categories.nuit.ms)).toBe(9 * 60);
    const declaree = nuitDu('projet-plage', { debut: 1, fin: 7 });
    expect(min(declaree.categories.nuit.ms)).toBe(6 * 60);
    expect(min(declaree.categories.responsable.ms)).toBe(605 - 360);
  });

  it('reads the range from the key grillhouse.plageDeNuit of the project’s package.json, 23 h – 8 h without it', () => {
    const racine = (nom: string, grillhouse?: object) => {
      const d = path.join(ESSAIS, nom);
      mkdirSync(d, { recursive: true });
      writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: nom, grillhouse }));
      return d;
    };
    expect(plageDeNuit(racine('sans-plage'))).toEqual({ debut: 23, fin: 8 });
    expect(plageDeNuit(racine('plage', { plageDeNuit: { debut: 22, fin: 6 } }))).toEqual({
      debut: 22,
      fin: 6,
    });
    expect(plageDeNuit(racine('plage-fausse', { plageDeNuit: { debut: 25, fin: 6 } }))).toEqual({
      debut: 23,
      fin: 8,
    });
    expect(plageDeNuit(path.join(ESSAIS, 'aucun-depot'))).toEqual({ debut: 23, fin: 8 });
  });
});

// grillhouse-ybq.1: on BPScript 320.8, the register wrote each role of the frame's plugin scoped
// by the plugin (`grillhouse:developpeur`), and the bilan counted « 0 séances, 0,00 $ » for 25
// sessions and 20,36 $. A role reads the same way on the board and in the bilan.
describe('the roles the register writes scoped by the frame’s plugin', () => {
  const pref = (l: Ligne): Ligne => ({ ...l, role: `grillhouse:${l.role}` });
  const lignes = [
    pref(seance('testwriter', 't1', [[0, 10]], { jetons: 2000, cache: 30_000, cout: 1 })),
    etape('preuve', 10.25, 11),
    pref(seance('developpeur', 'd1', [[11.25, 20]], { jetons: 1000, cache: 20_000, cout: 0.25 })),
    pref(seance('questionneur', 'q9', [[12, 13]], { cout: 0.4 })),
  ];
  const entrees = [
    fiche(10, 5, 'testwriter'),
    preuve(11, 0, [1, 0, 0, 0], true),
    fiche(20, 5, 'developpeur'),
  ];
  const b = calculer(lignes, entrees, null, { superviseur: ['q9'] });

  it('counts each session, its tokens and its cost, under its bare role', () => {
    expect(b.seances).toEqual({
      total: 2,
      parRole: { testwriter: 1, developpeur: 1 },
      horsCircuit: { total: 1, parRole: { questionneur: 1 }, cout: 0.4 },
    });
    expect(b.jetons).toBe(3000);
    expect(b.cache).toBe(50_000);
    expect(b.cout).toBeCloseTo(1.25);
  });

  it('gives each session the category of its role', () => {
    expect(min(b.categories.travail.ms)).toBe(10 + 8.75);
    expect(b.categories.travail.cout).toBeCloseTo(1.25);
    expect(b.perdu).toBeLessThan(MIN);
  });
});

// grillhouse-ybq.1: the circuit writes who must answer the question it stops on, the supervisor
// for every stop but the reviewer's question; the supervisor carries a question to the owner, and
// writes his answer at the ticket under « ## Réponse du responsable — <la question> » (skill
// pitmaster). On 320.8, the 78 min of the owner's answer counted as the supervisor's wait.
describe('the owner’s answer the supervisor carries', () => {
  const lignes = [seance('developpeur', 'd1', [[0, 5]]), seance('developpeur', 'd2', [[85, 90]])];
  const entrees = [
    fiche(5, 0, 'developpeur', { statut: 'BESOIN' }),
    montee(5, 0, 20, 'besoin'),
    fiche(90, 0, 'developpeur'),
  ];
  const reponse = (m: number, text = '## Réponse du responsable — le critère 5\n\n« ok »') => ({
    created_at: iso(a(m)).replace(/\.\d{3}Z$/, 'Z'),
    text,
  });

  it('counts the wait as the owner’s when his answer is written at the ticket during it', () => {
    const b = calculer(lignes, entrees, null, { commentaires: [reponse(84)] });
    expect(min(b.categories.responsable.ms)).toBe(80);
    expect(b.categories.responsable.n).toBe(1);
    expect(b.categories.superviseur).toMatchObject({ ms: 0, n: 0 });
    expect(texteDuBilan(b, null).split('\n')).toContain(
      '- attente du responsable : 80 min (1 montée)'
    );
  });

  it('leaves the wait to the supervisor without an answer of the owner during it', () => {
    for (const commentaires of [
      [],
      [reponse(2)],
      [reponse(87)],
      [reponse(84, '## Arbitrage — le critère 5')],
      [reponse(84, 'Le superviseur relaie : ## Réponse du responsable')],
      [reponse(84, '## Réponse du responsables — le critère 5')],
    ]) {
      const b = calculer(lignes, entrees, null, { commentaires });
      expect(min(b.categories.superviseur.ms)).toBe(80);
      expect(b.categories.responsable).toMatchObject({ ms: 0, n: 0 });
    }
  });

  it('reads the comments of the ticket by bd, from the main tree', () => {
    const racine = path.join(ESSAIS, 'projet-reponse');
    const bin = path.join(racine, 'bin');
    mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(racine, 'package.json'), JSON.stringify({ name: 'projet-reponse' }));
    // The stand-in for bd: `comments <ticket> --json` prints the ticket's comments.
    writeFileSync(
      path.join(bin, 'bd'),
      `#!/bin/sh\n[ "$1 $2 $3" = "comments ${TICKET} --json" ] && cat <<'FIN'\n${JSON.stringify([reponse(84)])}\nFIN\n`,
      { mode: 0o755 }
    );
    const registre = path.join(racine, 'registre.jsonl');
    writeFileSync(
      registre,
      lignes.map(l => JSON.stringify({ ...l, projet: racine })).join('\n') + '\n'
    );
    const lancees = lignes.map(l => ({
      date: iso(l.tours[0][0]),
      role: 'circuit',
      lancement: { role: l.role, seance: l.agent },
    }));
    writeFileSync(
      path.join(racine, '.claude', 'worktrees', `${TICKET}.fiches.jsonl`),
      [...lancees, ...entrees].map(e => JSON.stringify(e)).join('\n') + '\n'
    );
    const avant = { registre: process.env.GRILLHOUSE_REGISTRE, path: process.env.PATH };
    process.env.GRILLHOUSE_REGISTRE = registre;
    process.env.PATH = `${bin}${path.delimiter}${process.env.PATH ?? ''}`;
    try {
      ecrireLeBilan(racine, TICKET);
    } finally {
      process.env.PATH = avant.path;
      if (avant.registre === undefined) {
        delete process.env.GRILLHOUSE_REGISTRE;
      } else {
        process.env.GRILLHOUSE_REGISTRE = avant.registre;
      }
    }
    const f = path.join(racine, '.claude', 'worktrees', `${TICKET}.bilan.json`);
    const b = JSON.parse(readFileSync(f, 'utf8')) as Bilan;
    expect(min(b.categories.responsable.ms)).toBe(80);
    expect(b.categories.superviseur.ms).toBe(0);
  });
});

describe('the text of the bilan and its base', () => {
  const lignes = [
    seance('testwriter', 't1', [[0, 10]], { jetons: 2_000_000, cache: 30_000_000, cout: 3.5 }),
    seance('developpeur', 'd1', [[10, 12]], { jetons: 500_000, cache: 0, cout: 1 }),
  ];
  const entrees = [
    fiche(10, 0, 'testwriter'),
    fiche(12, 0, 'developpeur'),
    arret(12, 0, 'developpeur', 'sans-livraison'),
    montee(16, 0, 15, 'sans-livraison'),
  ];
  const b = calculer(lignes, entrees, {
    etape: 'developpeur',
    raison: 'sans-livraison',
    code: 15,
  });

  it('opens on the stop, the wall time, the time lost and the sessions, then a line per category', () => {
    const t = texteDuBilan(b, null);
    const l = t.split('\n');
    expect(l[0]).toBe(
      "arrêt sans-livraison (15) en 16 min, 16 min hors nuit d'attente ; 6 min perdues (38 %), 6 min hors attentes ; 2 séances (1 testwriter, 1 développeur) ; 4,50 $ ; 2,50 M jetons, 30,00 M lus du cache."
    );
    expect(l).toContain('- travail resté au lot : 10 min, 3,50 $');
    expect(l).toContain('- relance sans effet : 2 min, 1,00 $');
    expect(l).toContain('- entre deux étapes : 4 min');
    expect(l).toContain('- passes finales : 0 min');
    expect(t).toMatch(/^Arrêts : 1 sans-livraison\.$/m);
    expect(t).toMatch(/^Aucun bilan d'avant dans ce projet : pas de base\.$/m);
    expect(l.length).toBeLessThanOrEqual(14);
  });

  it('compares itself with the bilan before, ticket named, each key figure before and now', () => {
    const avant = { ...b, ticket: 'demo-6', mur: 460 * MIN, perdu: 194 * MIN, cout: 54.93 };
    avant.seances = { total: 84, parRole: {}, horsCircuit: { total: 0, parRole: {}, cout: 0 } };
    expect(texteDuBilan(b, avant)).toMatch(
      /^Face au bilan de demo-6 : mur 460 → 16 min, perte 42 → 38 %, séances 84 → 2, coût 54,93 → 4,50 \$\.$/m
    );
  });

  it('keeps each bilan in the main tree and finds the last one of another ticket', () => {
    const racine = path.join(ESSAIS, 'depot');
    mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
    const avant = (r: string) => precedent(r, TICKET) as Bilan | null;
    expect(avant(racine)).toBeNull();
    garder(racine, { ...b, ticket: 'demo-5', calcule: '2026-10-19T10:00:00.000Z' });
    garder(racine, { ...b, ticket: 'demo-6', calcule: '2026-10-19T12:00:00.000Z' });
    garder(racine, { ...b, ticket: TICKET, calcule: '2026-10-20T12:00:00.000Z' });
    writeFileSync(path.join(racine, '.claude', 'worktrees', 'demo-9.bilan.json'), '{ cassé');
    const f = path.join(racine, '.claude', 'worktrees', `${TICKET}.bilan.json`);
    expect((JSON.parse(readFileSync(f, 'utf8')) as Bilan).ticket).toBe(TICKET);
    expect(avant(racine)?.ticket).toBe('demo-6');
    expect(Object.keys(bilansGardes(racine)).sort()).toEqual(['demo-5', 'demo-6', TICKET]);
  });

  it('says its key figures in one short sentence', () => {
    expect(enBref(b)).toBe('Bilan : 16 min, 38 % perdus, 2 séances, 4,50 $.');
  });
});

describe('the card of a ticket on the board', () => {
  it('opens on the key figures of its bilan, before the start of its description', () => {
    const t = {
      id: 'demo-7',
      title: '7 — La mesure — packages/a',
      status: 'closed',
      description: 'Le résumé.',
    };
    const b = {
      ticket: 'demo-7',
      mur: 16 * MIN,
      perdu: 6 * MIN,
      cout: 4.5,
      seances: { total: 2, parRole: {} },
    };
    const f = fiches([t], [{ texte: 'x', ticket: 'demo-7' }], 'demo', {}, [], {
      'demo-7': b,
    }) as Record<string, { resume: string }>;
    expect(f['demo-7'].resume).toBe('Bilan : 16 min, 38 % perdus, 2 séances, 4,50 $. Le résumé.');
    const sans = fiches([t], [{ texte: 'x', ticket: 'demo-7' }], 'demo') as Record<
      string,
      { resume: string }
    >;
    expect(sans['demo-7'].resume).toBe('Le résumé.');
  });
});
