// The figures of a ticket (scripts/bilan.mjs, grillhouse-3uv.89, L8): computed from the register
// of finished agents (the agents' sessions and the steps the circuit leads itself), the lines
// `Circuit · <composant> · <étape> : …` of the ticket and the circuit's state, as the analysis of
// BPScript 320.3 was made by hand: the wall time, the time of each category, the sessions by
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
// bd gives a comment's time to the second.
const isoBd = (t: number) => `${new Date(t).toISOString().slice(0, 19)}Z`;

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
interface Commentaire {
  author: string;
  text: string;
  created_at: string;
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
    'travail' | 'sansEffet' | 'regulateur' | 'attente' | 'automatique' | 'rejeu' | 'intervalles',
    Categorie
  > & { automatique: Categorie & { dontFinales: number } };
  passesFinales: { n: number; ms: number };
  seances: { total: number; parRole: Record<string, number> };
  etapes: Record<string, number>;
  arrets: Record<string, number>;
  questions: number;
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
// A line of the circuit at the ticket, <m> minutes and <s> seconds after T0.
const ligne = (
  m: number,
  s: number,
  composant: string,
  nom: string,
  texte: string
): Commentaire => ({
  author: 'circuit',
  text: `Circuit · ${composant} · ${nom} : ${texte}`,
  created_at: isoBd(a(m, s)),
});
const de = (author: string, m: number, s: number, text: string): Commentaire => ({
  author,
  text,
  created_at: isoBd(a(m, s)),
});
// The summary line of a proof, as the circuit writes it.
const preuve = (
  r: number,
  j: number,
  sans: number,
  head: number,
  suite: string,
  rouges: string[] = []
) =>
  `${r} rouge(s), ${j} vert(s) justifié(s), ${sans} vert(s) sans vert attendu, 0 fichier(s) qui ne se charge(nt) pas, ${head} test(s) vert(s) que HEAD tient déjà, laissé(s) de côté ; ${suite}.${
    rouges.length ? `\n\nRouges (${rouges.length}) :\n${rouges.map(x => `- ${x}`).join('\n')}` : ''
  }`;
const AU_DEV = 'au développeur';
const RELANCE_T = 'testeur relancé (séance 2)';

const calculer = (lignes: Ligne[], commentaires: Commentaire[], etat: object | null = null) =>
  bilan({ ticket: TICKET, lignes, commentaires, etat }) as Bilan;
const min = (ms: number) => Math.round((ms / MIN) * 100) / 100;

describe('the wall time and its categories', () => {
  // One component, packages/a, whose checks are the final pass: each step does its work once.
  const lignes = [
    seance('testeur', 't1', [[0, 10]], { jetons: 2000, cache: 30_000, cout: 1 }),
    etape('preuve', 'packages/a', 10.25, 11),
    seance('developpeur', 'd1', [[11.25, 20]], { jetons: 1000, cache: 20_000, cout: 0.25 }),
    etape('controles', 'packages/a', 20.25, 30),
    seance('relecteur', 'r1', [[30.25, 35]], { jetons: 500, cache: 5000, cout: 0.5 }),
    etape('integration', 'packages/a', 35.25, 36),
    etape('file', 'packages/a', 36, 38),
  ];
  const commentaires = [
    ligne(10, 5, 'packages/a', 'testeur', 'séance 1 finie, passation au ticket.'),
    ligne(
      11,
      0,
      'packages/a',
      'preuve',
      preuve(1, 0, 0, 0, AU_DEV, ['packages/a/t.test.ts › c1 — x'])
    ),
    ligne(20, 5, 'packages/a', 'developpeur', 'séance 1 finie, passation au ticket.'),
    ligne(30, 0, 'packages/a', 'controles', 'verts : npm run verifier.'),
    ligne(35, 5, 'packages/a', 'relecture', 'ACCEPTÉ ; le lot va à l’intégration.'),
    ligne(
      36,
      0,
      'packages/a',
      'integration',
      'commit abc sur agent/demo-7 ; la branche est en file.'
    ),
    ligne(38, 0, 'packages/a', 'file', 'intégré : abc.'),
  ];
  const b = calculer(lignes, commentaires, { etape: 'integre', composant: 'packages/a' });

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

  it('counts the steps the circuit leads as automatic, the final pass among them', () => {
    expect(min(b.categories.automatique.ms)).toBe(0.75 + 9.75 + 0.75 + 2);
    expect(min(b.categories.automatique.dontFinales)).toBe(9.75);
    expect(b.passesFinales).toEqual({ n: 1, ms: 9.75 * MIN });
    expect(b.categories.automatique.jetons).toBe(0);
  });

  it('counts what no session nor step covers as the time between two steps', () => {
    expect(min(b.categories.intervalles.ms)).toBe(0.25 * 5);
    expect(b.perdu).toBe(b.categories.intervalles.ms);
  });

  it('names the steps by their titles in the one list of the steps', () => {
    expect(b.etapes).toEqual({
      'Preuve du rouge': 1,
      'Passe finale': 1,
      Intégration: 1,
      'File : main, poussée, CI': 1,
    });
  });

  it('sums the tokens, the cache reads and the cost of the sessions', () => {
    expect(b.jetons).toBe(3500);
    expect(b.cache).toBe(55_000);
    expect(b.cout).toBeCloseTo(1.75);
    expect(b.seances).toEqual({ total: 3, parRole: { testeur: 1, developpeur: 1, relecteur: 1 } });
  });
});

describe('a relaunch without effect', () => {
  // packages/b, last of the title (its checks are the final pass).
  const lignes = [
    seance('testeur', 't1', [[0, 5]]),
    etape('preuve', 'packages/b', 5, 6),
    seance('testeur', 't2', [[6, 7]]),
    etape('preuve', 'packages/b', 7, 8),
    seance('developpeur', 'd1', [[8, 10]]),
    seance('regulateur', 'g1', [[10, 11]], { cout: 0.2 }),
    seance('developpeur', 'd2', [[11, 12]]),
    etape('controles', 'packages/b', 12, 18),
    seance('developpeur', 'd3', [[18, 19]]),
    etape('controles', 'packages/b', 19, 25),
    seance('developpeur', 'd4', [[25, 28]]),
    etape('controles', 'packages/b', 28, 34),
  ];
  const commentaires = [
    ligne(5, 0, 'packages/b', 'testeur', 'séance 1 finie, passation au ticket.'),
    ligne(
      6,
      0,
      'packages/b',
      'preuve',
      preuve(1, 0, 2, 3, RELANCE_T, ['packages/b/t.test.ts › c1 — x'])
    ),
    ligne(7, 0, 'packages/b', 'testeur', 'séance 2 finie, passation au ticket.'),
    ligne(
      8,
      0,
      'packages/b',
      'preuve',
      preuve(1, 2, 0, 3, AU_DEV, ['packages/b/t.test.ts › c1 — x'])
    ),
    ligne(
      10,
      0,
      'packages/b',
      'developpeur',
      'arrêt sans-livraison — La séance 1 du développeur de packages/b ne change aucun fichier de packages/b : …'
    ),
    ligne(11, 1, 'packages/b', 'regulateur', 'RELANCE --reprendre'),
    ligne(
      12,
      0,
      'packages/b',
      'developpeur',
      "séance 1 reprise sans changement, le composant garde la livraison d'avant : aux contrôles."
    ),
    ligne(
      18,
      0,
      'packages/b',
      'controles',
      'rouge : 1 rouge(s) — npm run verifier (code 1) ; développeur relancé (séance 2).'
    ),
    ligne(
      19,
      0,
      'packages/b',
      'developpeur',
      'arrêt sans-livraison — La séance 2 du développeur de packages/b ne change aucun fichier de packages/b : …'
    ),
    ligne(
      25,
      0,
      'packages/b',
      'controles',
      'rouge : 1 rouge(s) — npm run verifier (code 1) ; développeur relancé (séance 2).'
    ),
    ligne(28, 0, 'packages/b', 'developpeur', 'séance 2 finie, passation au ticket.'),
    ligne(34, 0, 'packages/b', 'controles', 'verts : npm run verifier.'),
  ];
  const b = calculer(lignes, commentaires);

  it('counts the developer who changes nothing, stopped or resumed unchanged, as without effect', () => {
    // d1, d2, d3 ; d4 delivers.
    expect(b.categories.travail.n).toBe(2);
    expect(min(b.categories.travail.ms)).toBe(5 + 3);
  });

  it('counts the tester relaunched for its « vert attendu » alone, and the proof it replays, as without effect', () => {
    // t2 (1 min), the second proof (1 min), d1 (2), d2 (1), d3 (1), the second final pass (6).
    expect(min(b.categories.sansEffet.ms)).toBe(1 + 1 + 2 + 1 + 1 + 6);
    expect(b.categories.sansEffet.n).toBe(6);
  });

  it('counts a final pass that plays the same red on a lot nothing delivered to as without effect', () => {
    expect(b.passesFinales).toEqual({ n: 3, ms: 18 * MIN });
    expect(min(b.categories.automatique.dontFinales)).toBe(12);
    expect(min(b.categories.automatique.ms)).toBe(1 + 12);
  });

  it('counts the regulator apart, and every category outside the work and the automatic steps as lost', () => {
    expect(min(b.categories.regulateur.ms)).toBe(1);
    expect(b.categories.regulateur.cout).toBeCloseTo(0.2);
    expect(b.perdu).toBe(b.mur - b.categories.travail.ms - b.categories.automatique.ms);
    expect(b.arrets).toEqual({ 'sans-livraison': 2 });
  });
});

describe('a replay of steps already green', () => {
  // Three components, a, b, c; c's checks are the final pass. A RENDU sends the developer of a.
  const lignes = [
    seance('testeur', 'ta', [[0, 2]]),
    etape('preuve', 'packages/a', 2, 3),
    seance('developpeur', 'da', [[3, 4]]),
    etape('controles', 'packages/a', 4, 5),
    seance('testeur', 'tb', [[5, 7]]),
    etape('preuve', 'packages/b', 7, 8),
    seance('developpeur', 'db', [[8, 9]]),
    etape('controles', 'packages/b', 9, 10),
    seance('testeur', 'tc', [[10, 12]]),
    etape('preuve', 'packages/c', 12, 13),
    seance('developpeur', 'dc', [[13, 14]]),
    etape('controles', 'packages/c', 14, 20),
    seance('relecteur', 'r1', [[20, 22]]),
    seance('developpeur', 'da2', [[22, 23]]),
    etape('controles', 'packages/a', 23, 24),
    etape('controles', 'packages/b', 24, 26),
    seance('testeur', 'tc2', [[26, 28]]),
    etape('preuve', 'packages/c', 28, 29),
    etape('controles', 'packages/c', 29, 35),
  ];
  const ok = (c: string, n: number) =>
    preuve(1, 0, 0, n, AU_DEV, [`packages/${c}/t.test.ts › c1 — x`]);
  const commentaires = [
    ligne(2, 0, 'packages/a', 'testeur', 'séance 1 finie, passation au ticket.'),
    ligne(3, 0, 'packages/a', 'preuve', ok('a', 1)),
    ligne(4, 0, 'packages/a', 'developpeur', 'séance 1 finie, passation au ticket.'),
    ligne(
      5,
      0,
      'packages/a',
      'controles',
      "verts : npm test -- packages/a ; laissés à la passe finale, rouges dans un composant d'après : npm run gardes (code 1)."
    ),
    ligne(7, 0, 'packages/b', 'testeur', 'séance 1 finie, passation au ticket.'),
    ligne(8, 0, 'packages/b', 'preuve', ok('b', 2)),
    ligne(9, 0, 'packages/b', 'developpeur', 'séance 1 finie, passation au ticket.'),
    ligne(
      10,
      0,
      'packages/b',
      'controles',
      'rouge : 1 rouge(s) — npm test -- packages/b (code 1) ; développeur relancé (séance 2).'
    ),
    ligne(12, 0, 'packages/c', 'testeur', 'séance 1 finie, passation au ticket.'),
    ligne(13, 0, 'packages/c', 'preuve', ok('c', 3)),
    ligne(14, 0, 'packages/c', 'developpeur', 'séance 1 finie, passation au ticket.'),
    ligne(20, 0, 'packages/c', 'controles', 'verts : npm run verifier.'),
    ligne(
      22,
      1,
      'packages/c',
      'relecture',
      'RENDU (relecture 1) ; le circuit relance developpeur packages/a, puis les composants d’après, la passe finale et le relecteur.'
    ),
    ligne(23, 0, 'packages/a', 'developpeur', 'séance 1 finie, passation au ticket.'),
    ligne(24, 0, 'packages/a', 'controles', 'verts : npm test -- packages/a.'),
    ligne(26, 0, 'packages/b', 'controles', 'verts : npm test -- packages/b.'),
    ligne(28, 0, 'packages/c', 'testeur', 'séance 1 finie, passation au ticket.'),
    ligne(29, 0, 'packages/c', 'preuve', ok('c', 3)),
    ligne(35, 0, 'packages/c', 'controles', 'verts : npm run verifier.'),
  ];
  const b = calculer(lignes, commentaires);

  it('counts the checks of a component green again with nothing of it delivered since as a replay', () => {
    // b's checks turned from red to green without its agents: they say something new, automatic.
    // The tester of c run again on its proven lot, and the proof that finds the same lot: replays.
    expect(min(b.categories.rejeu.ms)).toBe(2 + 1);
    expect(b.categories.rejeu.n).toBe(2);
  });

  it('tells a component’s checks, whose line may name the final pass, from the final pass', () => {
    expect(b.etapes).toEqual({ 'Preuve du rouge': 4, Contrôles: 4, 'Passe finale': 2 });
  });

  it('counts the checks of a component its own developer delivered to as automatic', () => {
    // The first round (three proofs, a's and b's checks, the final pass), then a's checks after da2
    // (1), b's checks red → green (2), the final pass after the RENDU (6).
    expect(min(b.categories.automatique.ms)).toBe(1 + 1 + 1 + 1 + 1 + 6 + 1 + 2 + 6);
  });
});

describe('the wait for the supervisor', () => {
  it('runs from the regulator’s question to the answer, out of the regulator’s time', () => {
    const lignes = [
      seance('developpeur', 'd1', [[0, 5]]),
      // The regulator of an older circuit waits in its turn for the answer.
      seance('regulateur', 'g1', [[5, 12]]),
      seance('developpeur', 'd2', [[12, 15]]),
    ];
    const commentaires = [
      ligne(5, 0, 'packages/a', 'developpeur', 'arrêt sans-livraison — rien.'),
      ligne(6, 0, 'packages/a', 'regulateur', 'MONTE : Faut-il ajouter 020-loader au titre ?'),
      de('roomi-fields', 10, 0, 'Réponse du superviseur : oui.'),
      ligne(12, 0, 'packages/a', 'regulateur', 'RELANCE --depuis developpeur packages/a'),
      ligne(15, 0, 'packages/a', 'developpeur', 'séance 1 finie, passation au ticket.'),
    ];
    const b = calculer(lignes, commentaires);
    expect(min(b.categories.attente.ms)).toBe(4);
    expect(min(b.categories.regulateur.ms)).toBe(3);
    expect(b.questions).toBe(1);
  });

  it('runs up to the regulator’s session resumed by the answer when no one writes it at the ticket', () => {
    const lignes = [
      seance('developpeur', 'd1', [[0, 5]]),
      seance('regulateur', 'g1', [
        [5, 6],
        [20, 21],
      ]),
      seance('developpeur', 'd2', [[21, 25]]),
    ];
    const commentaires = [
      ligne(5, 0, 'packages/a', 'developpeur', 'arrêt sans-livraison — rien.'),
      ligne(6, 2, 'packages/a', 'regulateur', 'MONTE : Faut-il ajouter 020-loader au titre ?'),
      ligne(21, 2, 'packages/a', 'regulateur', 'RELANCE --reprendre'),
      ligne(25, 0, 'packages/a', 'developpeur', 'séance 1 finie, passation au ticket.'),
    ];
    const b = calculer(lignes, commentaires);
    expect(Math.round(b.categories.attente.ms / S)).toBe(14 * 60 - 2);
    expect(min(b.categories.regulateur.ms)).toBe(2);
    expect(b.seances.parRole).toEqual({ developpeur: 2, regulateur: 1 });
  });
});

describe('what the bilan reads of the register', () => {
  it('reads the latest line of each agent, the lines of the ticket only, out of the explorations before the circuit', () => {
    const lignes = [
      seance('explorateur', 'x1', [[-60, -30]], { cout: 3 }),
      seance('testeur', 't1', [[0, 4]], { jetons: 100, cout: 0.5 }),
      // A resumed session: its latest line holds its two turns and all its tokens.
      seance('testeur', 't1', [[0, 4]], { jetons: 100, cout: 0.5 }),
      seance(
        'testeur',
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
    const commentaires = [
      ligne(4, 0, 'packages/a', 'testeur', 'séance 1 finie, passation au ticket.'),
      ligne(6, 0, 'packages/a', 'preuve', preuve(0, 0, 1, 0, RELANCE_T)),
      ligne(8, 0, 'packages/a', 'testeur', 'séance 2 finie, passation au ticket.'),
      ligne(9, 0, 'packages/a', 'preuve', preuve(0, 0, 1, 0, 'testeur relancé (séance 3)')),
      ligne(11, 0, 'packages/a', 'developpeur', 'arrêt sans-livraison — rien.'),
      ligne(11, 1, 'packages/a', 'developpeur', 'arrêt sans-livraison — rien.'),
      ligne(11, 2, 'packages/a', 'controles', 'arrêt a-repasser — Contrôles de la passe finale…'),
    ];
    const b = calculer(lignes, commentaires, {
      etape: 'controles',
      raison: 'a-repasser',
      code: 75,
    });
    expect(b.seances).toEqual({ total: 2, parRole: { testeur: 1, developpeur: 1 } });
    expect(b.jetons).toBe(350);
    expect(b.cout).toBeCloseTo(1.5);
    expect(b.debut).toBe(iso(a(0)));
    expect(b.arrets).toEqual({ 'sans-livraison': 2, 'a-repasser': 1 });
    expect(b.statut).toBe('arrêt a-repasser (75)');
    // The tester's tokens go to its turns by their time: 4 min of work, 2 without effect.
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
    seance('testeur', 't1', [[0, 10]], { jetons: 2_000_000, cache: 30_000_000, cout: 3.5 }),
    seance('developpeur', 'd1', [[10, 12]], { jetons: 500_000, cache: 0, cout: 1 }),
  ];
  const commentaires = [
    ligne(10, 0, 'packages/a', 'testeur', 'séance 1 finie, passation au ticket.'),
    ligne(12, 0, 'packages/a', 'developpeur', 'arrêt sans-livraison — rien.'),
    ligne(16, 0, 'packages/a', 'regulateur', 'MONTE : Une question ?'),
  ];
  const b = calculer(lignes, commentaires, {
    etape: 'developpeur',
    raison: 'question',
    code: 18,
  });

  it('opens on the stop, the wall time, the time lost and the sessions, then a line per category', () => {
    const t = texteDuBilan(b, null);
    const l = t.split('\n');
    expect(l[0]).toBe(
      'arrêt question (18) en 16 min ; 6 min perdues (38 %) ; 2 séances (1 testeur, 1 développeur) ; 4,50 $ ; 2,50 M jetons, 30,00 M lus du cache.'
    );
    expect(l).toContain('- travail resté au lot : 10 min, 3,50 $');
    expect(l).toContain('- relance sans effet : 2 min, 1,00 $');
    expect(l).toContain('- entre deux étapes : 4 min');
    expect(l).toContain('Passes finales : 0.');
    expect(t).toMatch(/^Arrêts : 1 sans-livraison\.$/m);
    expect(t).toMatch(/^Aucun bilan d'avant dans ce projet : pas de base\.$/m);
    expect(l.length).toBeLessThanOrEqual(12);
  });

  it('compares itself with the bilan before, ticket named, each key figure before and now', () => {
    const avant = { ...b, ticket: 'demo-6', mur: 460 * MIN, perdu: 194 * MIN, cout: 54.93 };
    avant.seances = { total: 84, parRole: {} };
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
