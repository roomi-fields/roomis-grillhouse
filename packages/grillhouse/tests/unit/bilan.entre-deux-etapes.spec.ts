/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
// Le bilan d'un circuit détaille « entre deux étapes » par cause, tiré du journal des états
// (`journal`, ses lignes : attentes et prises de place, lignes de la file) et des lancements de
// séance : chaque intervalle reçoit une seule cause, par priorité (démarrage d'une séance, cœurs
// ou place, autre circuit ou projet, file, non attribué), et la somme des causes égale la ligne.
import { describe, expect, it } from 'vitest';
import { bilan, texteDuBilan } from '../../scripts/bilan.mjs';

const TICKET = 'demo-7';
const PROJET = '/depot';
const MIN = 60_000;
const T0 = Date.parse('2026-10-20T10:00:00Z');
const a = (m: number) => T0 + m * MIN;
const iso = (t: number) => new Date(t).toISOString();

const session = (role: string, agent: string, d: number, f: number) => ({
  projet: PROJET,
  agent,
  ticket: TICKET,
  role,
  debut: iso(a(d)),
  fin: iso(a(f)),
  travail: (f - d) * MIN,
  tours: [[a(d), a(f)]],
  jetons: 0,
  cache: 0,
  cout: 0,
});
const etape = (nom: string, d: number, f: number) => ({
  ...session('circuit', `circuit:${TICKET}:${iso(a(d))}`, d, f),
  etape: nom,
});
const lancement = (m: number, role: string, seance: string) => ({
  date: iso(a(m)),
  role: 'circuit',
  lancement: { role, seance },
});
// Une ligne du journal des états du ticket, <m> minutes après T0.
const places = (m: number, evenement: string, extra: object = {}) => ({
  ts: iso(a(m)),
  genre: 'places',
  ticket: TICKET,
  etape: evenement,
  boucle: null,
  place: null,
  raison: '',
  ...extra,
});
const file = (m: number, evenement: string, extra: object = {}) => ({
  ts: iso(a(m)),
  genre: 'file',
  ticket: TICKET,
  etape: evenement,
  boucle: null,
  place: null,
  raison: '',
  ...extra,
});

// Trois intervalles : [10, 30], [31, 41] et [50, 60], 40 minutes en tout.
const lignes = [
  session('testwriter', 't1', 0, 10),
  etape('preuve', 30, 31),
  session('developpeur', 'd1', 41, 50),
  etape('controles', 60, 61),
];
const lancees = [lancement(0, 'testwriter', 't1'), lancement(36, 'developpeur', 'd1')];
const calculer = (journal?: object[]): any =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  bilan({
    ticket: TICKET,
    lignes,
    entrees: lancees,
    etat: null,
    ...(journal ? { journal } : {}),
  }) as any;
const lignesDuTexte = (b: any) => texteDuBilan(b, null).split('\n');

const JOURNAL = [
  // [10, 30] : attente de place 12→15 (la raison nomme un autre circuit : reste « cœurs ou place »),
  // file 15→18, autre circuit 18→20.
  places(12, 'attente', { raison: 'attend la place du circuit demo-8' }),
  places(15, 'prise', { place: 'p1' }),
  file(15, 'attente'),
  file(18, 'attente', { autre: 'demo-8' }),
  file(20, 'lance'),
  // [31, 41] : attente de place 33→39, mais la séance d1 est lancée à 36 : le démarrage prime.
  places(33, 'attente', { raison: 'cœurs' }),
  places(39, 'prise', { place: 'p2' }),
  // Une attente d'un autre ticket ne compte pas.
  places(52, 'attente', { ticket: 'autre-1', raison: 'cœurs' }),
  places(55, 'prise', { ticket: 'autre-1', place: 'p3' }),
];

describe('le détail de « entre deux étapes » par cause', () => {
  const b = calculer(JOURNAL);
  const causes = b.categories.intervalles.causes;

  it('attribue chaque intervalle à une cause, la somme égale à la minute près la ligne', () => {
    expect(b.categories.intervalles.ms).toBe(40 * MIN);
    expect(causes.seance).toBe(5 * MIN);
    expect(causes.place).toBe(6 * MIN);
    expect(causes.autre).toBe(2 * MIN);
    expect(causes.file).toBe(3 * MIN);
    expect(causes.nonAttribue).toBe(24 * MIN);
    const somme = Object.values(causes as Record<string, number>).reduce((m, x) => m + x, 0);
    expect(somme).toBe(b.categories.intervalles.ms);
  });

  it('donne à un instant couvert par deux traces la première cause de la liste', () => {
    // Démarrage d'une séance (36→41) avant l'attente de place (33→39).
    expect(causes.seance).toBe(5 * MIN);
    expect(causes.place).toBe((3 + 3) * MIN);
  });

  it('laisse « cœurs ou place » à une attente de place dont la raison nomme un autre circuit', () => {
    const seul = calculer([
      places(12, 'attente', { raison: 'attend la place du circuit demo-8' }),
      places(15, 'prise', { place: 'p1' }),
    ]);
    expect(seul.categories.intervalles.causes.place).toBe(3 * MIN);
    expect(seul.categories.intervalles.causes.autre).toBe(0);
  });

  it("ne compte « autre circuit ou projet » que pour une attente de départ qu'une ligne de la file lui attribue", () => {
    const seul = calculer([file(15, 'attente', { autre: 'demo-8' }), file(20, 'lance')]);
    expect(seul.categories.intervalles.causes.autre).toBe(5 * MIN);
    expect(seul.categories.intervalles.causes.file).toBe(0);
    const sans = calculer([file(15, 'attente'), file(20, 'lance')]);
    expect(sans.categories.intervalles.causes.file).toBe(5 * MIN);
    expect(sans.categories.intervalles.causes.autre).toBe(0);
  });

  it('écrit des sous-lignes par cause sous la ligne « entre deux étapes », leur somme égale à la ligne', () => {
    const l = lignesDuTexte(b);
    const i = l.indexOf('- entre deux étapes : 40 min');
    expect(i).toBeGreaterThan(-1);
    expect(l.slice(i + 1, i + 6).map(x => x.trim())).toEqual([
      "- démarrage d'une séance : 5 min",
      '- cœurs ou place : 6 min',
      '- autre circuit ou projet : 2 min',
      '- file : 3 min',
      '- non attribué : 24 min',
    ]);
  });
});

describe("le temps que le journal n'attribue pas", () => {
  it('tombe en entier dans « non attribué » sans trace de place ni de file', () => {
    const b = calculer([]);
    const c = b.categories.intervalles.causes;
    expect(c.nonAttribue).toBe(b.categories.intervalles.ms - c.seance);
    expect(c.place).toBe(0);
    expect(c.autre).toBe(0);
    expect(c.file).toBe(0);
  });

  it('garde la ligne « entre deux étapes » et son total sans journal', () => {
    const sans = calculer();
    const vide = calculer([]);
    expect(sans.categories.intervalles.ms).toBe(40 * MIN);
    expect(sans.perdu).toBe(vide.perdu);
    expect(lignesDuTexte(sans)).toContain('- entre deux étapes : 40 min');
    expect(sans.categories.intervalles.causes.nonAttribue).toBe(
      40 * MIN - sans.categories.intervalles.causes.seance
    );
  });

  it("ne tire le détail d'aucune ligne de réservation", () => {
    const avec = JOURNAL.map(l =>
      l.etape === 'prise'
        ? { ...l, reservation: { coeurs: 3, memoireGo: 4, qui: `${TICKET} testwriter` } }
        : l
    );
    expect(calculer(avec).categories.intervalles.causes).toEqual({
      seance: 5 * MIN,
      place: 6 * MIN,
      autre: 2 * MIN,
      file: 3 * MIN,
      nonAttribue: 24 * MIN,
    });
  });
});
