// grillhouse-erp.1: a session that coordinates several projects keeps the usual board, the head,
// AGENTS by step and the chantiers, and each project's tickets enter it at their step and in their
// chantier, prefixed by their project's label. The owner's maquette (2026-11-01):
//
//   OSC-BRIDGE + SH + OSD
//   [OB]  ▶ 2 en cours · 1 en attente · 40 faits
//   [SH]  ▶ 1 en cours · 3 en attente · 112 faits
//   [OSD] ▶ 0 en cours · 0 en attente · 9 faits
//   🌙 [SH] Nuit rouge depuis le 01/11            SH-zq7
//
//   AGENTS  ▶ en cours · en attente
//   ▾ 1 · Plan · explorateur ⇄ questionneur
//      [SH]  SH-13y.6   Le paquet interface    ▶ 12 min
//   ▸ 2 · Tests · testwriter
//   ▾ 3 · Code · développeur
//      [OB]  OB-k2      Le pont MIDI            ▶ 8 min
//   ▸ 4 · Passe finale et relecture
//   ▸ 5 · Intégration
//
//   CHANTIER [OB] k — Le pont MIDI
//     12/18 faits · 4 h 10 · 3,1 M jetons
//
// Each line holds in the pane's width, as one project's board does (critère 7).
import { describe, expect, it } from 'vitest';
import { assembler, ensemble, LARGEUR, lignes, lignesEtats } from '../../scripts/tableau.mjs';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-01T12:00:00Z');

interface Ligne {
  texte: string;
  ton?: string;
  ticket?: string;
  chantier?: boolean;
  section?: string;
}

const T = (id: string, titre: string, o: object = {}) => ({
  id,
  title: `${id.slice(id.indexOf('-') + 1)} — ${titre} — packages/x`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: '2026-11-01T11:00:00Z',
  labels: ['circuit'],
  ...o,
});
const vivant = (agent: string, ticket: string, role: string, minutes: number) => ({
  agent,
  ticket,
  role,
  ligne: false,
  depuis: MAINTENANT - minutes * MIN,
  entre: null,
  jetons: 40_000,
  travail: minutes * MIN,
  tours: [[MAINTENANT - minutes * MIN, MAINTENANT]],
});
const circuit = (ticket: string) => ({
  ticket,
  etape: 'developpeur',
  tentative: 1,
  finale: false,
  code: null,
  arret: null,
  raison: null,
  question: null,
  qui: null,
  questionnement: null,
  boucles: {},
  mene: null,
  vivant: true,
});
const plateau = (
  prefix: string,
  tous: object[],
  o: { vivants?: object[]; circuits?: object[] } = {}
) =>
  assembler({
    tous,
    prefix,
    registre: [],
    vivants: o.vivants ?? [],
    circuits: o.circuits ?? [],
    maintenant: MAINTENANT,
    jour: MAINTENANT - 12 * 60 * MIN,
  });

const OB = plateau(
  'OB',
  [
    T('OB-k', 'Le pont MIDI', { issue_type: 'epic', title: 'k — Le pont MIDI' }),
    T('OB-k2', 'Le pont MIDI', { parent: 'OB-k' }),
    T('OB-k3', 'La table des notes', { parent: 'OB-k', status: 'open', labels: ['a-valider'] }),
  ],
  { circuits: [circuit('OB-k2')] }
);
const SH = plateau(
  'SH',
  [
    T('SH-13y.6', 'Le paquet interface'),
    T('SH-zq7', 'La nuit est rouge', {
      status: 'open',
      labels: ['nuit'],
      created_at: '2026-11-01T03:00:00Z',
    }),
  ],
  { vivants: [vivant('e1', 'SH-13y.6', 'explorateur', 12)] }
);
const OSD = plateau('OSD', []);

const trois = () =>
  ensemble([
    { etiquette: 'OB', t: OB },
    { etiquette: 'SH', t: SH },
    { etiquette: 'OSD', t: OSD },
  ]);
const NOM = 'osc-bridge + SH + OSD';
const textes = (l: Ligne[]) => l.map(x => x.texte.trimEnd());

describe('critère 1 : the usual board, each project prefixed', () => {
  it('the head names the projects, then the three lines of states of each project, then the alerts prefixed', () => {
    const l = textes(lignes(trois(), NOM) as Ligne[]);
    expect(l.slice(0, 12)).toEqual([
      'OSC-BRIDGE + SH + OSD',
      '[OB]  ▶ 1 · ⏸ 0 · ⛔ 0 · ✓ 0',
      '      ⏭ file : ● 0 · ✎ 0 · ⊘ 0',
      '      0 sans go · 1 à valider · 0 reportés',
      '[SH]  ▶ 1 · ⏸ 0 · ⛔ 0 · ✓ 0',
      '      ⏭ file : ● 0 · ✎ 0 · ⊘ 0',
      '      1 sans go · 0 à valider · 0 reportés',
      '[OSD] ▶ 0 · ⏸ 0 · ⛔ 0 · ✓ 0',
      '      ⏭ file : ● 0 · ✎ 0 · ⊘ 0',
      '      0 sans go · 0 à valider · 0 reportés',
      '🔍 0 new · 0 →check · 0 rejetés · 0 validés',
      expect.stringMatching(/^🌙 \[SH\] Nuit rouge depuis le 01\/11 +SH-zq7$/),
    ]);
  });

  it('AGENTS keeps its steps; each ticket stands at its step, « [projet] id  sujet … signe durée »', () => {
    const l = lignes(trois(), NOM) as Ligne[];
    const a = l.slice(l.findIndex(x => x.texte.startsWith('AGENTS')));
    const agents = a.filter(x => x.section === 'agents').map(x => [x.texte.trimEnd(), x.ticket]);
    expect(agents).toEqual([
      ['AGENTS  ▶ en cours · en attente', undefined],
      ['▾ 1 · Plan · explorateur ⇄ questionneur', undefined],
      [
        expect.stringMatching(/^\[SH\] {2}SH-13y\.6 {2}Le paquet interface +▶ 12 min · 40 k$/),
        'SH-13y.6',
      ],
      ['  1.1 · Geste mécanique · explorateur', undefined],
      ['▸ 2 · Tests · testwriter', undefined],
      ['▾ 3 · Code · développeur', undefined],
      [expect.stringMatching(/^\[OB\] {2}OB-k2 {5}Le pont MIDI +▶$/), 'OB-k2'],
      ['  3.1 · Contrôles · auto', undefined],
      ['▸ 4 · Passe finale et relecture', undefined],
      ['▸ 5 · Intégration', undefined],
    ]);
  });

  it('a chantier is titled with its project, its tickets prefixed', () => {
    const l = lignes(trois(), NOM) as Ligne[];
    const ch = l.filter(x => x.section === 'chantier' && x.texte.trim());
    expect(ch[0]).toMatchObject({ ticket: 'OB-k', chantier: true });
    expect(textes(ch)).toEqual([
      'CHANTIER [OB] k — Le pont MIDI',
      '  0/2 faits · 0 min · 0 jetons',
      expect.stringMatching(/^ {2}à valider +1$/),
      '   [OB] k3  La table des notes',
    ]);
  });

  it("the states' view names each ticket's project", () => {
    const vue = textes(lignesEtats(trois()) as Ligne[]);
    expect(vue.some(x => /^ {2}\[OB\] k2 {2}Le pont MIDI/.test(x))).toBe(true);
  });
});

describe('les découvertes s’additionnent projet par projet', () => {
  const AUJ = '2026-11-01T06:00:00Z';
  const dec = (id: string, o: object) => T(id, 'Une découverte', { labels: ['decouverte'], ...o });
  const A = plateau('A', [
    dec('A-d1', { status: 'closed', closed_at: AUJ }), // new
    dec('A-d2', { status: 'open', labels: ['decouverte', 'a-valider'] }), // →check
  ]);
  const B = plateau('B', [
    dec('B-d1', { status: 'closed', closed_at: AUJ, labels: ['decouverte', 'traitee'] }), // rejetés
    dec('B-d2', { status: 'open', labels: ['decouverte', 'circuit'], updated_at: AUJ }), // validés
  ]);
  const t = ensemble([
    { etiquette: 'A', t: A },
    { etiquette: 'B', t: B },
  ]) as { decouvertes: Record<string, number> };

  it('ensemble somme les quatre cases des deux projets', () => {
    expect(t.decouvertes).toEqual({ new: 1, check: 1, rejetes: 1, valides: 1 });
  });

  it('la ligne de tête 🔍 montre la somme des projets', () => {
    const l = textes(lignes(t, 'A + B') as Ligne[]);
    expect(l).toContain('🔍 1 new · 1 →check · 1 rejetés · 1 validés');
  });
});

describe('critère 2 : a step unfolds with the tickets of every project', () => {
  it('a ticket of one project at a step unfolds it, another project holding none there', () => {
    const t = ensemble([
      { etiquette: 'OB', t: plateau('OB', []) },
      { etiquette: 'SH', t: SH },
    ]);
    const l = textes(lignes(t, 'osc-bridge + SH') as Ligne[]);
    expect(l).toContain('▾ 1 · Plan · explorateur ⇄ questionneur');
    expect(l).toContain('▸ 3 · Code · développeur');
  });
});

describe('critère 4 : a project whose board does not read is named in the head with its fault', () => {
  it('its line in the head carries its fault, in the tone of an alert; the others stay', () => {
    const t = ensemble([
      { etiquette: 'OB', t: OB },
      { etiquette: 'OSD', erreur: 'dossier introuvable' },
    ]);
    const l = lignes(t, 'osc-bridge + OSD') as Ligne[];
    expect(l.slice(1, 5).map(x => [x.texte.trimEnd(), x.ton])).toEqual([
      ['[OB]  ▶ 1 · ⏸ 0 · ⛔ 0 · ✓ 0', undefined],
      ['      ⏭ file : ● 0 · ✎ 0 · ⊘ 0', undefined],
      ['      0 sans go · 1 à valider · 0 reportés', 'attention'],
      ['[OSD] ⚠ dossier introuvable', 'alerte'],
    ]);
    expect(l.some(x => x.ticket === 'OB-k2')).toBe(true);
  });
});

// grillhouse-erp.1 critère 7: since 0.28.1 the pane was shifted left with an empty band on its
// right: the fused lines put a label before lines already as wide as the pane. Every line of the
// board of several projects holds in the board's width, and a line with a right part fills it.
describe('critère 7 : every line holds in the width, a line with a right part fills it', () => {
  it('no line passes LARGEUR; each ticket line with its figures is LARGEUR wide', () => {
    const t = trois();
    const l = [...(lignes(t, NOM) as Ligne[]), ...(lignesEtats(t) as Ligne[])];
    expect(l.filter(x => x.texte.length > LARGEUR).map(x => x.texte)).toEqual([]);
    const pleines = l.filter(x => x.section === 'agents' && x.ticket);
    expect(pleines.length).toBeGreaterThan(0);
    expect(pleines.map(x => x.texte.length)).toEqual(pleines.map(() => LARGEUR));
  });

  it('a long subject and a long label are cut, the figures kept whole', () => {
    const long = plateau(
      'OPEN-SYNTH',
      [T('OPEN-SYNTH-b91.2.9', 'Un sujet bien plus long que la place qui lui reste')],
      {
        vivants: [vivant('e2', 'OPEN-SYNTH-b91.2.9', 'explorateur', 75)],
      }
    );
    const l = lignes(
      ensemble([
        { etiquette: 'OB', t: OB },
        { etiquette: 'OPEN-SYNTH', t: long },
      ]),
      'osc-bridge + OPEN-SYNTH'
    ) as Ligne[];
    const x = l.find(y => y.ticket === 'OPEN-SYNTH-b91.2.9');
    expect(x?.texte.length).toBe(LARGEUR);
    expect(x?.texte).toMatch(/…\s+▶ 1 h 15 · 40 k$/);
  });
});
