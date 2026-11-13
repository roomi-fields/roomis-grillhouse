// The first line of the head counts what AGENTS shows: « ▶ N · ⏸ N · ⛔ N · N faits », the signs
// alone as AGENTS signs its lines, its three counters exactly the ▶, ⏸ and ⛔ of AGENTS (one source,
// the state of each ticket's line, `etatsDAgents`), on one project's board as on the board of
// several, whose head keeps three lines per project. A circuit whose question is deferred waits: it
// counts under ⏸, not in « reportés »; a ticket closed and not integrated counts under its sign,
// not in « faits ». The tickets blocked by an open ticket count on the line of the queue. The
// status line says the same counters in the same signs.
import { describe, expect, it } from 'vitest';
import { assembler, ensemble, LARGEUR, ligneEtat, lignes } from '../../scripts/tableau.mjs';
import { circuitLu } from './tableau-essai.js';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-13T12:00:00Z');

interface Ligne {
  texte: string;
  ton?: string;
  ticket?: string;
  section?: string;
}

// The columns a line takes in a terminal: the signs ⛔ 🔒 ⏳ 💤 🌙 take two.
const colonnes = (s: string) => [...s].length + (s.match(/[⛔🔒⏳💤🌙]/gu)?.length ?? 0);

const T = (id: string, o: object = {}) => ({
  id,
  title: `${id.slice(id.indexOf('-') + 1)} — Le sujet de ${id} — packages/demo`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: '2026-11-13T11:00:00Z',
  labels: ['circuit'],
  ...o,
});
const question = (qui: string) => ({
  etape: 'controles',
  code: 14,
  arret: 'controles',
  question: 'Quel paquet lève ce rouge ?',
  qui,
});
const PLACES = {
  prises: 3,
  plafond: 3,
  charge: 2,
  coeurs: 12,
  memoireGo: 20,
  memoireTotaleGo: 30,
};

const plateau = (prefix: string, tous: object[], circuits: object[], o: object = {}) =>
  assembler({
    tous,
    prefix,
    registre: [],
    vivants: [],
    circuits,
    maintenant: MAINTENANT,
    jour: MAINTENANT - 12 * 60 * MIN,
    ...o,
  } as Parameters<typeof assembler>[0]);

// A project whose AGENTS shows two ▶ (a circuit that works, a ticket led in direct), two ⏸ (a
// place awaited, a question to the supervisor) and one ⛔ (a circuit ended without its issue), and
// two tickets done.
const projet = (prefix: string) => {
  const id = (n: number) => `${prefix}-${n}`;
  return plateau(
    prefix,
    [
      T(id(1)),
      T(id(2)),
      T(id(3)),
      T(id(4)),
      T(id(5), { labels: ['direct'] }),
      T(id(6), { status: 'closed', closed_at: '2026-11-13T10:00:00Z' }),
      T(id(7), { status: 'closed', closed_at: '2026-11-13T10:30:00Z' }),
    ],
    [
      circuitLu(id(1), { vivant: true }),
      circuitLu(id(2), { vivant: true }),
      circuitLu(id(3), question('superviseur')),
      circuitLu(id(4), {
        etape: 'controles',
        interrompu: true,
        sansIssue: true,
        qui: 'superviseur',
        question: 'Le déroulé du circuit a fini sans son issue (TERMINATED), aucun arrêt écrit.',
      }),
    ],
    { places: { ...PLACES, attentes: [{ ticket: id(2), depuis: MAINTENANT - MIN }] } }
  );
};

// The signs of the tickets' lines of AGENTS, counted: on one project's board the sign opens the
// line; on the board of several it stands on the right, the last one of the line.
const compte = (l: Ligne[], etiquette?: string) => {
  const lignesDeTickets = l.filter(
    x => x.section === 'agents' && x.ticket && (!etiquette || x.texte.startsWith(`[${etiquette}]`))
  );
  const signe = (x: Ligne) =>
    [...x.texte.matchAll(/[▶⏸⛔]/gu)].map(m => m[0])[etiquette ? 'pop' : 'shift']();
  return ['▶', '⏸', '⛔'].map(s => lignesDeTickets.filter(x => signe(x) === s).length);
};

describe('the first line of the head counts the signs of AGENTS', () => {
  it('on one project’s board: « ▶ N · ⏸ N · ⛔ N · N faits »', () => {
    const l = lignes(projet('demo'), 'demo') as Ligne[];
    expect(l[1]?.texte.trimEnd()).toBe('▶ 2 · ⏸ 2 · ⛔ 1 · 2 faits');
    expect(compte(l)).toEqual([2, 2, 1]);
  });

  it('on the board of several projects: each project’s line counts its own signs, three lines each', () => {
    const t = ensemble([
      { etiquette: 'OB', t: projet('OB') },
      { etiquette: 'SH', t: plateau('SH', [T('SH-1')], [circuitLu('SH-1', { vivant: true })]) },
    ]);
    const l = lignes(t, 'ob + sh') as Ligne[];
    expect(l[1]?.texte.trimEnd()).toBe('[OB] ▶ 2 · ⏸ 2 · ⛔ 1 · 2 faits');
    expect(l[2]?.texte).toMatch(/^ {5}⏭ file : /);
    expect(l[3]?.texte).toMatch(/^ {5}\d+ sans go/);
    expect(l[4]?.texte.trimEnd()).toBe('[SH] ▶ 1 · ⏸ 0 · ⛔ 0 · 0 faits');
    expect(compte(l, 'OB')).toEqual([2, 2, 1]);
    expect(compte(l, 'SH')).toEqual([1, 0, 0]);
  });

  it('a ticket closed and not integrated counts under its sign, not in « faits »', () => {
    const t = plateau(
      'demo',
      [
        T('demo-4', { status: 'closed', closed_at: '2026-11-13T11:50:00Z' }),
        T('demo-6', { status: 'closed', closed_at: '2026-11-13T10:00:00Z' }),
      ],
      [
        circuitLu('demo-4', {
          etape: 'file',
          code: 17,
          arret: 'integration',
          question: 'La CI de la branche est rouge.',
          qui: 'superviseur',
        }),
      ]
    ) as { faitsDuJour: { id: string }[] };
    const l = lignes(t, 'demo') as Ligne[];
    expect(l[1]?.texte.trimEnd()).toBe('▶ 0 · ⏸ 1 · ⛔ 0 · 1 faits');
    expect(compte(l)).toEqual([0, 1, 0]);
    expect(t.faitsDuJour.map(x => x.id)).toEqual(['demo-6']);
    expect(colonnes(l[1]!.texte)).toBeLessThanOrEqual(LARGEUR);
  });
});

describe('a circuit whose question is deferred waits', () => {
  it('it counts under ⏸, not in « reportés »', () => {
    const t = plateau(
      'demo',
      [T('demo-3', { status: 'deferred', defer_until: '2026-11-13T17:30:00Z' })],
      [circuitLu('demo-3', question('superviseur'))]
    );
    const l = lignes(t, 'demo') as Ligne[];
    expect(l[1]?.texte).toMatch(/^▶ 0 · ⏸ 1 · ⛔ 0 /);
    expect(l[3]?.texte).toMatch(/ · 0 reportés/);
  });
});

describe('the tickets blocked by an open ticket count on the line of the queue', () => {
  it('« ⏭ file : N en circuit · N en direct · N bloqués », and no longer on the first line', () => {
    const t = plateau(
      'demo',
      [
        T('demo-8', { status: 'open' }),
        T('demo-9', {
          status: 'open',
          dependencies: [{ type: 'blocks', depends_on_id: 'demo-8' }],
        }),
      ],
      []
    );
    const l = lignes(t, 'demo') as Ligne[];
    expect(l[1]?.texte).not.toContain('bloqués');
    expect(l[2]?.texte.trimEnd()).toBe('⏭ file : 1 en circuit · 0 en direct · 1 bloqués');
  });
});

describe('the status line says the counters of the head', () => {
  it('« ▶ N · ⏸ N · ⛔ N », the signs of AGENTS', () => {
    expect(ligneEtat(projet('demo'))).toContain('▶ 2 · ⏸ 2 · ⛔ 1');
  });
});
