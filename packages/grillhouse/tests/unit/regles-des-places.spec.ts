// grillhouse-4nr.7, criteria 1, 2 and 4: the rule the workflow of the machine decides by
// (scripts/regles-des-places.mjs). The admission takes up
// the cases of tests/unit/places-de-la-machine.spec.ts (the load under the cores, 4 GB free); the
// refusal of a taking: the ceiling, the turn of a lower rank, the measure read only when the place
// and the turn pass, the spacing of the starts.
import { describe, expect, it } from 'vitest';
import {
  admission,
  refusDeLaPlace,
  reserverDesCircuits,
} from '../../scripts/regles-des-places.mjs';

const GO = 1024 ** 3;
const base = { coeurs: 12, charge: 1, memoireLibre: 16 * GO };
type Etat = Parameters<typeof refusDeLaPlace>[0];
const vide = (): Etat => ({ prises: [], attentes: [], dernier: 0 });
const prise = (etat: Etat, o: Partial<Parameters<typeof refusDeLaPlace>[1]> = {}) =>
  refusDeLaPlace(etat, {
    id: 'moi',
    rang: 5,
    plafond: 2,
    espacementMs: 0,
    maintenant: 100_000,
    mesurer: () => base,
    ...o,
  });

describe('l’admission à la charge et à la mémoire, les cas des places sur leur fichier', () => {
  it('under the load of the cores, with 4 GB free: admitted', () => {
    expect(admission(base)).toEqual({ ok: true });
  });
  it('a load that reaches the cores refuses, and says « charge »', () => {
    const r = admission({ ...base, charge: 12 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.raison).toContain('charge');
  });
  it('a load just under the cores passes', () => {
    expect(admission({ ...base, charge: 11.9 }).ok).toBe(true);
  });
  it('under 4 GB free refuses, and says « mémoire »', () => {
    const r = admission({ ...base, memoireLibre: 4 * GO - 1 });
    expect(!r.ok && r.raison).toContain('mémoire');
  });
  it('4 GB free exactly pass', () => {
    expect(admission({ ...base, memoireLibre: 4 * GO }).ok).toBe(true);
  });
});

describe('le refus d’une prise', () => {
  it('the ceiling reached refuses, and says « place »', () => {
    const etat = { ...vide(), prises: [{}, {}] };
    expect(prise(etat)).toContain('aucune place libre : 2 prises sur 2');
  });
  it('a wait of a lower rank keeps its turn, between projects', () => {
    const etat = {
      ...vide(),
      attentes: [{ id: 'autre', rang: 3, ticket: 'bp-1', raison: 'charge' }],
    };
    expect(prise(etat)).toContain('place réservée : bp-1');
    expect(prise(etat, { rang: 2 })).toBeNull();
  });
  it('the measure is read only when the place and the turn pass', () => {
    let lue = 0;
    const mesurer = () => {
      lue += 1;
      return base;
    };
    prise({ ...vide(), prises: [{}, {}] }, { mesurer });
    expect(lue).toBe(0);
    prise(vide(), { mesurer });
    expect(lue).toBe(1);
  });
  it('the load of the measure refuses', () => {
    expect(prise(vide(), { mesurer: () => ({ ...base, charge: 20 }) })).toContain('charge');
  });
  it('two starts closer than the spacing refuse, and say « espacement »', () => {
    const etat = { ...vide(), dernier: 95_000 };
    expect(prise(etat, { espacementMs: 10_000 })).toContain('espacement');
    expect(prise(etat, { espacementMs: 5_000 })).toBeNull();
  });
});

describe('les places des circuits de la machine, dans l’ordre d’arrivée de tous les projets', () => {
  const T0 = 1_000_000;
  const reserver = (
    places: Parameters<typeof reserverDesCircuits>[0],
    demande: Parameters<typeof reserverDesCircuits>[1],
    o: Partial<Parameters<typeof reserverDesCircuits>[2]> = {}
  ) => reserverDesCircuits(places, demande, { rang: 0, plafond: 5, maintenant: T0, ...o });

  it('une machine à 5, trois projets réglés à 2 : le sixième ticket attend', () => {
    let places: Parameters<typeof reserverDesCircuits>[0] = [];
    let rang = 0;
    const accordes: string[][] = [];
    for (const racine of ['/a', '/b', '/c']) {
      const r = reserver(
        places,
        { racine, vivants: [], candidats: [`${racine}-1`, `${racine}-2`] },
        { rang }
      );
      places = r.circuits;
      rang = r.rang;
      accordes.push(r.accordes);
    }
    expect(accordes).toEqual([['/a-1', '/a-2'], ['/b-1', '/b-2'], ['/c-1']]);
  });

  it('une place libérée va au premier arrivé, quel que soit son projet', () => {
    const premier = reserver([], { racine: '/a', vivants: [], candidats: ['a-1'] }, { plafond: 1 });
    const b = reserver(
      premier.circuits,
      { racine: '/b', vivants: [], candidats: ['b-1'] },
      {
        plafond: 1,
        rang: premier.rang,
      }
    );
    const c = reserver(
      b.circuits,
      { racine: '/c', vivants: [], candidats: ['c-1'] },
      {
        plafond: 1,
        rang: b.rang,
      }
    );
    expect([b.accordes, c.accordes]).toEqual([[], []]);
    // a-1 a fini : /a ne le donne plus ; /c repasse avant /b, mais b-1 est arrivé le premier.
    const fini = reserver(
      c.circuits,
      { racine: '/a', vivants: [], candidats: [] },
      { plafond: 1, rang: c.rang }
    );
    expect(
      reserver(fini.circuits, { racine: '/c', vivants: [], candidats: ['c-1'] }, { plafond: 1 })
        .accordes
    ).toEqual([]);
    expect(
      reserver(fini.circuits, { racine: '/b', vivants: [], candidats: ['b-1'] }, { plafond: 1 })
        .accordes
    ).toEqual(['b-1']);
  });

  it('un circuit vivant tient sa place sans la demander', () => {
    const r = reserver([], { racine: '/a', vivants: ['a-1'], candidats: ['a-2'] }, { plafond: 1 });
    expect(r.accordes).toEqual([]);
    expect(r.circuits.find(c => c.ticket === 'a-1')?.accordee).toBe(true);
  });

  it('la place qu’aucune file ne redonne depuis 10 min est perdue', () => {
    const vieille = reserver([], { racine: '/a', vivants: ['a-1'], candidats: [] }, { plafond: 1 });
    const r = reserver(
      vieille.circuits,
      { racine: '/b', vivants: [], candidats: ['b-1'] },
      {
        plafond: 1,
        maintenant: T0 + 10 * 60_000,
      }
    );
    expect(r.accordes).toEqual(['b-1']);
  });
});

describe('un circuit en pause rend sa place, le disque des copies borne un départ', () => {
  const T0 = 1_000_000;
  type Places = Parameters<typeof reserverDesCircuits>[0];
  const reserver = (
    places: Places,
    demande: Parameters<typeof reserverDesCircuits>[1],
    o: Partial<Parameters<typeof reserverDesCircuits>[2]> = {}
  ) => reserverDesCircuits(places, demande, { rang: 10, plafond: 1, maintenant: T0, ...o });

  it('un circuit en pause n’est plus actif : sa place va au candidat suivant', () => {
    const tenu = reserver([], { racine: '/a', vivants: ['a-1'], candidats: [] });
    const r = reserver(tenu.circuits, { racine: '/a', vivants: [], candidats: ['a-2'] });
    expect(r.accordes).toEqual(['a-2']);
  });

  it('un candidat sans place disque attend avec sa raison, sans retenir les autres', () => {
    const a = reserver([], { racine: '/a', candidats: ['a-1'], disque: 'disque plein' });
    expect(a.accordes).toEqual([]);
    expect(a.circuits[0]).toMatchObject({ ticket: 'a-1', raison: 'disque plein' });
    const b = reserver(a.circuits, { racine: '/b', candidats: ['b-1'] }, { rang: a.rang });
    expect(b.accordes).toEqual(['b-1']);
  });

  it('un circuit repris redemande sa place avec son rang d’origine, avant les arrivés après lui', () => {
    const attend = reserver([], { racine: '/b', candidats: ['b-1'] }, { plafond: 0, rang: 20 });
    const repris = reserver(
      attend.circuits,
      { racine: '/a', reprise: { ticket: 'a-1', rang: 3 } },
      { plafond: 1, rang: attend.rang }
    );
    expect(repris.accordes).toEqual(['a-1']);
    expect(repris.circuits.find(c => c.ticket === 'b-1')?.accordee).toBe(false);
  });

  it('la file de son projet garde la demande d’un circuit repris qui attend', () => {
    const repris = reserver(
      [],
      { racine: '/a', reprise: { ticket: 'a-1', rang: 3 } },
      { plafond: 0 }
    );
    const r = reserver(
      repris.circuits,
      { racine: '/a', vivants: [], candidats: [] },
      { plafond: 0 }
    );
    expect(r.circuits.map(c => c.ticket)).toEqual(['a-1']);
  });
});
