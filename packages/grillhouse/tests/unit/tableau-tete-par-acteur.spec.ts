// The head of the board groups its counts by who acts, in three lines: « toi » (what the owner
// decides or validates: sans go, à valider, question), « file » (what waits in the queues: ● circuit
// prêt, ✎ direct, ⧗ attend archi, ⊘ bloqué) and « en cours » (where nobody acts: ▶ en cours, ✓ fait,
// ⏸ reporté). The signs of the agents paused mid-circuit leave the head; AGENTS keeps them. A ticket
// of the circuit without its section « ## Architecture » is « attend archi », a state of its own;
// the queue of the tickets and the board read one rule (`aSonArchitecture`).
import { describe, expect, it } from 'vitest';
import { aSonArchitecture, enFileSansArchitecture } from '../../scripts/file-des-tickets.mjs';
import {
  assembler,
  ensemble,
  ETATS,
  LARGEUR,
  ligneEtat,
  lignes,
  lignesEtats,
  TONS,
} from '../../scripts/tableau.mjs';
import { circuitLu } from './tableau-essai.js';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-13T12:00:00Z');
const ARCHI = '## Architecture\nLe modèle mûr.';

interface Ligne {
  texte: string;
  ton?: string;
  ticket?: string;
  section?: string;
}

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

const plateau = (prefix: string, tous: object[], circuits: object[] = [], o: object = {}) =>
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

// The head's three lines of a project's board, as the pane draws them.
const tete = (t: Parameters<typeof lignes>[0]) =>
  (lignes(t, 'demo') as Ligne[]).slice(1, 4).map(x => ({ texte: x.texte.trimEnd(), ton: x.ton }));

// A project whose AGENTS shows two ▶, two ⏸ and one ⛔ (a circuit ended without its issue), with
// five tickets in progress and two done.
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

describe('the head groups its counts by who acts', () => {
  it('says « toi », « file » and « en cours » on three lines, in that order', () => {
    const l = tete(projet('demo'));
    expect(l.map(x => x.texte)).toEqual([
      'toi : 0 sans go · 0 à valider · 1 question',
      'file : ● 0 · ✎ 0 · ⧗ 0 · ⊘ 0',
      'en cours : ▶ 5 · ✓ 2 · ⏸ 0',
    ]);
  });

  it('counts the tickets in progress under ▶, a ticket whose circuit waits for the supervisor too', () => {
    const t = plateau(
      'demo',
      [T('demo-1'), T('demo-2'), T('demo-3', { status: 'open', description: ARCHI })],
      [circuitLu('demo-1', { vivant: true }), circuitLu('demo-2', question('superviseur'))]
    );
    expect(tete(t)[2]?.texte).toBe('en cours : ▶ 2 · ✓ 0 · ⏸ 0');
  });

  it('counts a deferred ticket under ⏸, and a ticket closed and not integrated under ▶, not under ✓', () => {
    const t = plateau(
      'demo',
      [
        T('demo-1', { status: 'deferred', defer_until: '2026-11-14T17:30:00Z' }),
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
    );
    expect(tete(t)[2]?.texte).toBe('en cours : ▶ 1 · ✓ 1 · ⏸ 1');
  });

  it('keeps the signs of the agents paused mid-circuit out of the head, AGENTS keeping them', () => {
    const t = projet('demo');
    const l = lignes(t, 'demo') as Ligne[];
    // Two ⏸ in AGENTS, none in the head's reported count; no ⛔ in the head.
    expect(l.filter(x => x.section === 'agents' && x.ticket && x.texte.includes('⏸'))).toHaveLength(
      2
    );
    for (const x of l.slice(1, 4)) {
      expect(x.texte).not.toContain('⛔');
    }
    expect(l[3]?.texte).toContain('⏸ 0');
  });

  it('counts the queue: ● ready, ✎ direct, ⧗ attend archi, ⊘ blocked (an open ticket or an undelivered wait)', () => {
    const attendEnAutre = [{ type: 'blocks', depends_on_id: 'external:osc-bridge:X' }];
    const surB = [{ type: 'blocks', depends_on_id: 'demo-b' }];
    const t = plateau('demo', [
      T('demo-a', { status: 'open', description: ARCHI }),
      T('demo-b', { status: 'open' }),
      T('demo-c', { status: 'open', description: ARCHI, dependencies: surB }),
      T('demo-d', { status: 'open', dependencies: surB }),
      T('demo-e', { status: 'open', labels: ['direct'] }),
      T('demo-f', { status: 'open', dependencies: attendEnAutre }),
    ]);
    expect(tete(t)[1]?.texte).toBe('file : ● 1 · ✎ 1 · ⧗ 1 · ⊘ 3');
  });

  it('moves a ticket from ⧗ to ● when its section « ## Architecture » is written', () => {
    const sans = plateau('demo', [T('demo-1', { status: 'open' })]);
    const avec = plateau('demo', [T('demo-1', { status: 'open', description: ARCHI })]);
    expect(tete(sans)[1]?.texte).toBe('file : ● 0 · ✎ 0 · ⧗ 1 · ⊘ 0');
    expect(tete(avec)[1]?.texte).toBe('file : ● 1 · ✎ 0 · ⧗ 0 · ⊘ 0');
  });

  it('puts « attend archi » in « file », not in « toi »', () => {
    const t = plateau('demo', [T('demo-1', { status: 'open' })]);
    expect(tete(t)[0]?.texte).toBe('toi : 0 sans go · 0 à valider · 0 question');
  });

  it('puts a ticket without the owner’s go and a ticket to validate in « toi »', () => {
    const t = plateau('demo', [
      T('demo-1', { status: 'open', labels: [] }),
      T('demo-2', { status: 'open', labels: ['a-valider'] }),
      T('demo-3', { status: 'open', labels: ['a-valider'] }),
    ]);
    expect(tete(t)[0]?.texte).toBe('toi : 1 sans go · 2 à valider · 0 question');
  });

  it('keeps the status line as it was: ▶ ⏸ ⛔ of AGENTS', () => {
    expect(ligneEtat(projet('demo'))).toContain('▶ 2 · ⏸ 2 · ⛔ 1');
  });

  it('draws lines no wider than the pane', () => {
    for (const x of tete(projet('demo'))) {
      expect([...x.texte].length).toBeLessThanOrEqual(LARGEUR);
    }
  });
});

describe('the tone of each line of the head comes from TONS', () => {
  it('« toi » takes attention when a counter is not 0, « file » stays discreet, « en cours » is active when ▶ is not 0', () => {
    const l = tete(
      plateau('demo', [T('demo-1'), T('demo-2', { status: 'open', labels: ['a-valider'] })])
    );
    expect(l.map(x => x.ton)).toEqual([TONS.aValider, TONS.attendArchi, TONS.enCours]);
    expect(l.map(x => x.ton)).toEqual(['attention', 'discret', 'actif']);
  });

  it('« toi » is attention for a question alone', () => {
    const t = plateau(
      'demo',
      [T('demo-1')],
      [
        circuitLu('demo-1', {
          sansIssue: true,
          interrompu: true,
          qui: 'superviseur',
          etape: 'controles',
          question: 'Fini sans issue.',
        }),
      ]
    );
    expect(tete(t)[0]?.texte).toBe('toi : 0 sans go · 0 à valider · 1 question');
    expect(tete(t)[0]?.ton).toBe('attention');
  });

  it('« toi » and « en cours » are discreet when all their counters are 0 (✓ and ⏸ do not warm it)', () => {
    const t = plateau('demo', [
      T('demo-1', { status: 'closed', closed_at: '2026-11-13T10:00:00Z' }),
      T('demo-2', { status: 'deferred', defer_until: '2026-11-14T17:30:00Z' }),
    ]);
    expect(tete(t).map(x => x.ton)).toEqual(['discret', 'discret', 'discret']);
  });

  it('gives each state of a ticket its tone in one table', () => {
    for (const cle of ['enAttente', 'fileDirecte', 'bloques', 'attendArchi', 'reportes'] as const) {
      expect(TONS[cle], cle).toBe('discret');
    }
    expect(TONS.enCours).toBe('actif');
    expect(TONS.sansGo).toBe('attention');
    expect(TONS.aValider).toBe('attention');
  });
});

describe('the board of several projects groups by who acts, a line per actor under the project’s label', () => {
  const trois = () =>
    ensemble([
      { etiquette: 'OB', t: projet('OB') },
      { etiquette: 'SH', t: plateau('SH', [T('SH-1')], [circuitLu('SH-1', { vivant: true })]) },
      { etiquette: 'OSD', erreur: 'dossier introuvable' },
    ]);

  it('says the three lines of each project under its label, a project in fault keeping its fault line', () => {
    const l = (lignes(trois(), 'ob + sh + osd') as Ligne[]).slice(1, 8);
    expect(l.map(x => x.texte.trimEnd())).toEqual([
      '[OB]  toi : 0 sans go · 0 à valider · 1 question',
      '      file : ● 0 · ✎ 0 · ⧗ 0 · ⊘ 0',
      '      en cours : ▶ 5 · ✓ 2 · ⏸ 0',
      '[SH]  toi : 0 sans go · 0 à valider · 0 question',
      '      file : ● 0 · ✎ 0 · ⧗ 0 · ⊘ 0',
      '      en cours : ▶ 1 · ✓ 0 · ⏸ 0',
      '[OSD] ⚠ dossier introuvable',
    ]);
    expect(l.map(x => x.ton)).toEqual([
      'attention',
      'discret',
      'actif',
      'discret',
      'discret',
      'actif',
      'alerte',
    ]);
  });

  it('counts « attend archi » per project', () => {
    const t = ensemble([
      { etiquette: 'OB', t: plateau('OB', [T('OB-1', { status: 'open' })]) },
      { etiquette: 'SH', t: plateau('SH', [T('SH-1', { status: 'open', description: ARCHI })]) },
    ]);
    const l = (lignes(t, 'ob + sh') as Ligne[]).slice(1, 7).map(x => x.texte.trimEnd());
    expect(l[1]).toBe('     file : ● 0 · ✎ 0 · ⧗ 1 · ⊘ 0');
    expect(l[4]).toBe('     file : ● 1 · ✎ 0 · ⧗ 0 · ⊘ 0');
  });

  it('reads a counter that is absent as 0 and shows the line anyway, for one project and for several', () => {
    const seul = plateau('demo', []);
    const c = seul.global.compteurs as Record<string, number>;
    delete c.attendArchi;
    delete c.bloques;
    delete c.fileDirecte;
    delete c.reportes;
    expect(tete(seul).map(x => x.texte)).toEqual([
      'toi : 0 sans go · 0 à valider · 0 question',
      'file : ● 0 · ✎ 0 · ⧗ 0 · ⊘ 0',
      'en cours : ▶ 0 · ✓ 0 · ⏸ 0',
    ]);
    const plusieurs = ensemble([{ etiquette: 'OB', t: plateau('OB', []) }]);
    const p = (plusieurs.projets as { compteurs: Record<string, number> }[])[0]!.compteurs;
    delete p.attendArchi;
    delete p.reportes;
    expect((lignes(plusieurs, 'ob') as Ligne[]).slice(1, 4).map(x => x.texte.trimEnd())).toEqual([
      '[OB] toi : 0 sans go · 0 à valider · 0 question',
      '     file : ● 0 · ✎ 0 · ⧗ 0 · ⊘ 0',
      '     en cours : ▶ 0 · ✓ 0 · ⏸ 0',
    ]);
  });
});

describe('« attend archi » is a state of a ticket', () => {
  it('stands in ETATS between « en attente » and « en direct », with its meaning', () => {
    const cles = ETATS.map((e: { cle: string }) => e.cle);
    expect(cles.indexOf('attendArchi')).toBe(cles.indexOf('enAttente') + 1);
    expect(cles.indexOf('fileDirecte')).toBe(cles.indexOf('attendArchi') + 1);
    const e = ETATS.find((x: { cle: string }) => x.cle === 'attendArchi') as {
      nom: string;
      sens: string;
    };
    expect(e.nom).toBe('attend archi');
    expect(e.sens.length).toBeGreaterThan(5);
  });

  const chantier = (tickets: object[]) =>
    plateau('demo', [
      T('demo-e', { issue_type: 'epic', status: 'in_progress', title: 'e — Le chantier' }),
      ...tickets.map(t => ({ parent: 'demo-e', ...t })),
    ]);

  it('is listed in the states view between « en attente » and « en direct », with its tickets in the tone of TONS', () => {
    const t = chantier([
      T('demo-e.1', { status: 'open', description: ARCHI }),
      T('demo-e.2', { status: 'open' }),
    ]);
    const v = lignesEtats(t) as Ligne[];
    const titres = v.filter(x => !x.ticket && x.texte.trim() && x.texte.trim() !== '—');
    const noms = titres.map(x => x.texte.split(' — ')[0]);
    expect(noms.indexOf('ATTEND ARCHI')).toBe(noms.indexOf('EN ATTENTE') + 1);
    expect(noms.indexOf('EN DIRECT')).toBe(noms.indexOf('ATTEND ARCHI') + 1);
    const i = v.findIndex(x => x.texte.startsWith('ATTEND ARCHI'));
    expect(v[i + 1]?.ticket).toBe('demo-e.2');
    expect(v[i + 1]?.ton).toBe(TONS.attendArchi);
    expect(v.find(x => x.ticket === 'demo-e.1')?.ton).toBe(TONS.enAttente);
    expect(v.find(x => x.ticket === 'demo-e.1')).toBeDefined();
  });

  it('is an « attend archi » for a ticket whose blocking ticket is closed, a « bloqué » while it is open', () => {
    const dep = [{ type: 'blocks', depends_on_id: 'demo-x' }];
    const ferme = plateau('demo', [
      T('demo-x', { status: 'closed', closed_at: '2026-11-13T10:00:00Z' }),
      T('demo-1', { status: 'open', dependencies: dep }),
    ]);
    const ouvert = plateau('demo', [
      T('demo-x', { status: 'open', description: ARCHI }),
      T('demo-1', { status: 'open', dependencies: dep }),
    ]);
    expect(tete(ferme)[1]?.texte).toBe('file : ● 0 · ✎ 0 · ⧗ 1 · ⊘ 0');
    expect(tete(ouvert)[1]?.texte).toBe('file : ● 1 · ✎ 0 · ⧗ 0 · ⊘ 1');
  });

  it('is no state of a ticket without the label « circuit » (sans go), nor of a ticket to validate', () => {
    const t = plateau('demo', [
      T('demo-1', { status: 'open', labels: [] }),
      T('demo-2', { status: 'open', labels: ['circuit', 'a-valider'] }),
    ]);
    expect(t.global.compteurs).toMatchObject({ attendArchi: 0, sansGo: 1, aValider: 1 });
  });

  it('is counted with the other states: attendArchi in the counters, one state per ticket', () => {
    const t = plateau('demo', [
      T('demo-1', { status: 'open' }),
      T('demo-2', { status: 'open', description: ARCHI }),
    ]);
    const c = t.global.compteurs as Record<string, number>;
    expect(c.attendArchi).toBe(1);
    expect(c.enAttente).toBe(1);
    expect(c.bloques).toBe(0);
  });
});

describe('the board and the queue of the tickets read one rule for the section « ## Architecture »', () => {
  it('aSonArchitecture: the heading « ## Architecture » on a line of its own, anywhere in the description', () => {
    expect(aSonArchitecture({ description: '## Architecture\nx' })).toBe(true);
    expect(aSonArchitecture({ description: 'Intro.\n\n## Architecture\nx' })).toBe(true);
    expect(aSonArchitecture({ description: '## Architecture du lot' })).toBe(true);
    expect(aSonArchitecture({ description: 'Voir ## Architecture' })).toBe(false);
    expect(aSonArchitecture({ description: '### Architecture' })).toBe(false);
    expect(aSonArchitecture({ description: '## Architectures' })).toBe(false);
    expect(aSonArchitecture({ description: '' })).toBe(false);
    expect(aSonArchitecture({})).toBe(false);
  });

  it('every ticket the queue names without architecture and without a blocker is « attend archi » on the board', () => {
    const tous = [
      T('demo-1', { status: 'open' }),
      T('demo-2', { status: 'open', description: ARCHI }),
      T('demo-3', { status: 'open', description: 'Rien.' }),
      T('demo-4', { status: 'open', labels: ['circuit', 'direct'] }),
      T('demo-5', {
        status: 'open',
        dependencies: [{ type: 'blocks', depends_on_id: 'demo-1' }],
      }),
    ];
    const sans = enFileSansArchitecture(tous) as { id: string }[];
    expect(sans.map(x => x.id)).toEqual(['demo-1', 'demo-3', 'demo-5']);
    const t = plateau('demo', tous);
    // demo-5 is blocked by an open ticket, so « bloqué »: the other two wait for their architecture.
    expect((t.global.compteurs as Record<string, number>).attendArchi).toBe(2);
    expect((t.global.compteurs as Record<string, number>).bloques).toBe(1);
  });
});
