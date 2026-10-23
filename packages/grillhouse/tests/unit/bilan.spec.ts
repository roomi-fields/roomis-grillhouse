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
  enBref,
  garder,
  lignesDuProjet,
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
  composant?: string;
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
  composant: string;
  etape?: string;
  fiche?: object;
  resultat?: object;
  arret?: string;
  finale?: boolean;
  inchange?: boolean;
  questionnement?: object;
  lancement?: { role: string; seance: string };
  montee?: { code: number; raison: string | null };
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
  statut: string;
  perdu: number;
  categories: Record<
    | 'travail'
    | 'sansEffet'
    | 'questionnement'
    | 'attente'
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
  questionnement: { tours: number; changees: number; montees: number };
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
const etape = (nom: string, composant: string, d: number, f: number): Ligne => ({
  projet: PROJET,
  agent: `circuit:${TICKET}:${iso(a(d))}`,
  ticket: TICKET,
  role: 'circuit',
  etape: nom,
  composant,
  debut: iso(a(d)),
  fin: iso(a(f)),
  travail: a(f) - a(d),
  tours: [[a(d), a(f)]],
  jetons: 0,
  cache: 0,
  cout: null,
});
// The sheet of a session of <role> on <composant>, kept <m> minutes and <s> seconds after T0.
const fiche = (
  m: number,
  s: number,
  role: string,
  composant: string,
  f: object = { statut: 'FAIT' }
): Entree => ({ date: quand(m, s), role, composant, fiche: f });
// The outcome of a proof, as the circuit keeps it: its counts, whether it passed, whether its lot
// holds no file.
const preuve = (
  m: number,
  s: number,
  composant: string,
  [rouges, justifies, sans, anciens]: number[],
  ok: boolean,
  vide = false
): Entree => ({
  date: quand(m, s),
  role: 'circuit',
  etape: 'preuve',
  composant,
  resultat: { ok, rouges, justifies, sans, casses: 0, anciens, vide },
});
// The outcome of checks, or of the final pass.
const controles = (
  m: number,
  s: number,
  composant: string,
  issue: 'vert' | 'rouge' | 'a-repasser',
  finale: boolean
): Entree => ({
  date: quand(m, s),
  role: 'circuit',
  etape: 'controles',
  composant,
  resultat: { issue, finale },
});
// A stop of the circuit at the step <etape>, <ms> after the second.
const arret = (
  m: number,
  s: number,
  composant: string,
  etape: string,
  nom: string,
  { finale = false, ms = 1 } = {}
): Entree => ({
  date: quand(m, s, ms),
  role: 'circuit',
  etape,
  composant,
  arret: nom,
  ...(finale ? { finale } : {}),
});
// A developpeur resumed who finds his component delivered and changes nothing.
const inchange = (m: number, s: number, composant: string): Entree => ({
  date: quand(m, s, 1),
  role: 'circuit',
  etape: 'developpeur',
  composant,
  inchange: true,
});
// The end of a run of the circuit on a stop it hands to the supervisor (code <code>), <ms> after
// the second.
const montee = (m: number, s: number, code: number, raison: string, ms = 2): Entree => ({
  date: quand(m, s, ms),
  role: 'circuit',
  composant: 'packages/a',
  montee: { code, raison },
});

// The bilan of the lines <lignes> and the entries <entrees>: the circuit kept the launch of each
// session at its first turn (`lancement`, its role and its session id), save the agents
// <superviseur> launched.
const calculer = (
  lignes: Ligne[],
  entrees: Entree[],
  etat: object | null = null,
  { superviseur = [] as string[] } = {}
) => {
  const lancees = lignes
    .filter(l => l.role !== 'circuit' && !superviseur.includes(l.agent))
    .map(l => ({
      date: iso(l.tours[0][0]),
      role: 'circuit',
      composant: 'packages/a',
      lancement: { role: l.role, seance: l.agent },
    }));
  return bilan({ ticket: TICKET, lignes, entrees: [...lancees, ...entrees], etat }) as Bilan;
};
const min = (ms: number) => Math.round((ms / MIN) * 100) / 100;

describe('the wall time and its categories', () => {
  // One component, packages/a, whose checks are the final pass: each step does its work once.
  const lignes = [
    seance('testwriter', 't1', [[0, 10]], { jetons: 2000, cache: 30_000, cout: 1 }),
    etape('preuve', 'packages/a', 10.25, 11),
    seance('developpeur', 'd1', [[11.25, 20]], { jetons: 1000, cache: 20_000, cout: 0.25 }),
    etape('controles', 'packages/a', 20.25, 30),
    seance('relecteur', 'r1', [[30.25, 35]], { jetons: 500, cache: 5000, cout: 0.5 }),
    etape('integration', 'packages/a', 35.25, 36),
    etape('file', 'packages/a', 36, 38),
  ];
  const entrees = [
    fiche(10, 5, 'testwriter', 'packages/a'),
    preuve(11, 0, 'packages/a', [1, 0, 0, 0], true),
    fiche(20, 5, 'developpeur', 'packages/a'),
    controles(30, 0, 'packages/a', 'vert', true),
    fiche(35, 5, 'relecteur', 'packages/a', { verdict: 'ACCEPTÉ' }),
  ];
  const b = calculer(lignes, entrees, { etape: 'integre', composant: 'packages/a' });

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

describe('a relaunch without effect', () => {
  // packages/b, last of the title (its checks are the final pass).
  const lignes = [
    seance('testwriter', 't1', [[0, 5]]),
    etape('preuve', 'packages/b', 5, 6),
    seance('testwriter', 't2', [[6, 7]]),
    etape('preuve', 'packages/b', 7, 8),
    seance('developpeur', 'd1', [[8, 10]]),
    seance('developpeur', 'd2', [[11, 12]]),
    etape('controles', 'packages/b', 12, 18),
    seance('developpeur', 'd3', [[18, 19]]),
    etape('controles', 'packages/b', 19, 25),
    seance('developpeur', 'd4', [[25, 28]]),
    etape('controles', 'packages/b', 28, 34),
  ];
  const entrees = [
    fiche(5, 0, 'testwriter', 'packages/b'),
    preuve(6, 0, 'packages/b', [1, 0, 2, 3], false),
    fiche(7, 0, 'testwriter', 'packages/b'),
    preuve(8, 0, 'packages/b', [1, 2, 0, 3], true),
    fiche(10, 0, 'developpeur', 'packages/b'),
    arret(10, 0, 'packages/b', 'developpeur', 'sans-livraison'),
    fiche(12, 0, 'developpeur', 'packages/b'),
    inchange(12, 0, 'packages/b'),
    controles(18, 0, 'packages/b', 'rouge', true),
    fiche(19, 0, 'developpeur', 'packages/b'),
    arret(19, 0, 'packages/b', 'developpeur', 'sans-livraison'),
    controles(25, 0, 'packages/b', 'rouge', true),
    fiche(28, 0, 'developpeur', 'packages/b'),
    controles(34, 0, 'packages/b', 'vert', true),
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
  const fin = (
    m: number,
    objet: string,
    tours: number,
    change: boolean,
    issue: string
  ): Entree => ({
    date: quand(m, 0, 1),
    role: 'circuit',
    composant: 'packages/a',
    questionnement: { objet, tours, change, issue },
  });
  const entrees = [
    fiche(2, 0, 'questionneur', 'packages/a', { issue: 'QUESTIONS', questions: [] }),
    fiche(5, 0, 'questionneur', 'packages/a', { issue: 'AUCUNE' }),
    fin(5, 'plan', 2, true, 'AUCUNE'),
    fiche(10, 0, 'testwriter', 'packages/a'),
    fiche(13, 0, 'questionneur', 'packages/a', { issue: 'DÉSACCORD', desaccord: 'x' }),
    fin(13, 'plan', 1, false, 'DÉSACCORD'),
  ];
  const b = calculer(lignes, entrees);

  it('counts its rounds, the decisions it changed and those it sent up', () => {
    expect(b.questionnement).toEqual({ tours: 3, changees: 1, montees: 1 });
  });

  it('counts the questionneur’s time apart, as kept', () => {
    expect(min(b.categories.questionnement.ms)).toBe(3 + 1);
    expect(b.categories.questionnement.cout).toBeCloseTo(0.75);
    expect(b.perdu).toBe(
      b.mur - b.categories.travail.ms - b.categories.automatique.ms - b.categories.questionnement.ms
    );
    expect(b.seances.parRole).toMatchObject({ questionneur: 2 });
  });

  it('says its rounds and the decisions changed on its line', () => {
    expect(texteDuBilan(b, null).split('\n')).toContain(
      '- questionnement : 4 min, 0,75 $ (3 tours, 1 décision changée)'
    );
  });
});

describe('a replay of steps already green', () => {
  // Three components, a, b, c; c's checks are the final pass. A RENDU sends the developer of a.
  const lignes = [
    seance('testwriter', 'ta', [[0, 2]]),
    etape('preuve', 'packages/a', 2, 3),
    seance('developpeur', 'da', [[3, 4]]),
    etape('controles', 'packages/a', 4, 5),
    seance('testwriter', 'tb', [[5, 7]]),
    etape('preuve', 'packages/b', 7, 8),
    seance('developpeur', 'db', [[8, 9]]),
    etape('controles', 'packages/b', 9, 10),
    seance('testwriter', 'tc', [[10, 12]]),
    etape('preuve', 'packages/c', 12, 13),
    seance('developpeur', 'dc', [[13, 14]]),
    etape('controles', 'packages/c', 14, 20),
    seance('relecteur', 'r1', [[20, 22]]),
    seance('developpeur', 'da2', [[22, 23]]),
    etape('controles', 'packages/a', 23, 24),
    etape('controles', 'packages/b', 24, 26),
    seance('testwriter', 'tc2', [[26, 28]]),
    etape('preuve', 'packages/c', 28, 29),
    etape('controles', 'packages/c', 29, 35),
  ];
  const ok = (c: string, n: number, m: number) => preuve(m, 0, `packages/${c}`, [1, 0, 0, n], true);
  const entrees = [
    fiche(2, 0, 'testwriter', 'packages/a'),
    ok('a', 1, 3),
    fiche(4, 0, 'developpeur', 'packages/a'),
    controles(5, 0, 'packages/a', 'vert', false),
    fiche(7, 0, 'testwriter', 'packages/b'),
    ok('b', 2, 8),
    fiche(9, 0, 'developpeur', 'packages/b'),
    controles(10, 0, 'packages/b', 'rouge', false),
    fiche(12, 0, 'testwriter', 'packages/c'),
    ok('c', 3, 13),
    fiche(14, 0, 'developpeur', 'packages/c'),
    controles(20, 0, 'packages/c', 'vert', true),
    fiche(22, 1, 'relecteur', 'packages/c', { verdict: 'RENDU' }),
    fiche(23, 0, 'developpeur', 'packages/a'),
    controles(24, 0, 'packages/a', 'vert', false),
    controles(26, 0, 'packages/b', 'vert', false),
    fiche(28, 0, 'testwriter', 'packages/c'),
    ok('c', 3, 29),
    controles(35, 0, 'packages/c', 'vert', true),
  ];
  const b = calculer(lignes, entrees);

  it('counts the checks of a component green again with nothing of it delivered since as a replay', () => {
    // b's checks turned from red to green without its agents: they say something new, automatic.
    // The testwriter of c run again on its proven lot, and the proof that finds the same lot: replays.
    expect(min(b.categories.rejeu.ms)).toBe(2 + 1);
    expect(b.categories.rejeu.n).toBe(2);
  });

  it('tells a component’s checks, whose line may name the final pass, from the final pass', () => {
    expect(b.etapes).toEqual({ 'Preuve du rouge': 4, Contrôles: 4, 'Passe finale': 2 });
  });

  it('counts the checks of a component its own developer delivered to as automatic', () => {
    // The first round (three proofs, a's and b's checks), then a's checks after da2 (1), b's checks
    // red → green (2); the final passes, before and after the RENDU (6 each), at their own line.
    expect(min(b.categories.automatique.ms)).toBe(1 + 1 + 1 + 1 + 1 + 1 + 2);
    expect(min(b.categories.finales.ms)).toBe(6 + 6);
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
    fiche(5, 0, 'developpeur', 'packages/a'),
    arret(5, 0, 'packages/a', 'developpeur', 'sans-livraison'),
    montee(5, 0, 15, 'sans-livraison'),
    fiche(30, 0, 'developpeur', 'packages/a'),
  ];
  const b = calculer(lignes, entrees, null, { superviseur: ['q9'] });

  it('runs from the circuit’s end on the stop to the first session of the run that answers it', () => {
    expect(min(b.categories.attente.ms)).toBe(21);
    expect(b.categories.attente.n).toBe(1);
    expect(texteDuBilan(b, null).split('\n')).toContain('- attente humaine : 21 min (1 montée)');
  });

  it('counts a stop the window ends on, still unanswered, as no wait', () => {
    const fin = calculer([lignes[0]], entrees.slice(0, 3));
    expect(fin.categories.attente).toMatchObject({ ms: 0, n: 0 });
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
  it('reads the latest line of each agent, the lines of the ticket only, out of the explorations before the circuit', () => {
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
      etape('preuve', 'packages/a', 4, 6),
      etape('preuve', 'packages/a', 8, 9),
    ];
    const entrees = [
      fiche(4, 0, 'testwriter', 'packages/a'),
      preuve(6, 0, 'packages/a', [0, 0, 1, 0], false),
      fiche(8, 0, 'testwriter', 'packages/a'),
      preuve(9, 0, 'packages/a', [0, 0, 1, 0], false),
      fiche(11, 0, 'developpeur', 'packages/a'),
      arret(11, 0, 'packages/a', 'developpeur', 'sans-livraison'),
      arret(11, 1, 'packages/a', 'developpeur', 'sans-livraison'),
      arret(11, 2, 'packages/a', 'controles', 'a-repasser', { finale: true }),
    ];
    const b = calculer(lignes, entrees, {
      etape: 'controles',
      raison: 'a-repasser',
      code: 75,
    });
    expect(b.seances).toEqual({
      total: 2,
      parRole: { testwriter: 1, developpeur: 1 },
      horsCircuit: { total: 0, parRole: {}, cout: 0 },
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

describe('the text of the bilan and its base', () => {
  const lignes = [
    seance('testwriter', 't1', [[0, 10]], { jetons: 2_000_000, cache: 30_000_000, cout: 3.5 }),
    seance('developpeur', 'd1', [[10, 12]], { jetons: 500_000, cache: 0, cout: 1 }),
  ];
  const entrees = [
    fiche(10, 0, 'testwriter', 'packages/a'),
    fiche(12, 0, 'developpeur', 'packages/a'),
    arret(12, 0, 'packages/a', 'developpeur', 'sans-livraison'),
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
      'arrêt sans-livraison (15) en 16 min ; 6 min perdues (38 %) ; 2 séances (1 testwriter, 1 développeur) ; 4,50 $ ; 2,50 M jetons, 30,00 M lus du cache.'
    );
    expect(l).toContain('- travail resté au lot : 10 min, 3,50 $');
    expect(l).toContain('- relance sans effet : 2 min, 1,00 $');
    expect(l).toContain('- entre deux étapes : 4 min');
    expect(l).toContain('- passes finales : 0 min');
    expect(t).toMatch(/^Arrêts : 1 sans-livraison\.$/m);
    expect(t).toMatch(/^Aucun bilan d'avant dans ce projet : pas de base\.$/m);
    expect(l.length).toBeLessThanOrEqual(12);
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
