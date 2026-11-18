// L'admission d'une passe par sa part (scripts/regles-des-places.mjs) : une règle pure. La part tient
// dans le budget restant (cœurs, mémoire), puis les seuils de l'admission restent (charge sous les
// cœurs, 4 Go libres) ; une passe refusée dit ce qu'elle attend, chiffres à l'appui ; les rangs
// départagent, la nuit et une mesure de temps demandent le budget entier.
import { describe, expect, it } from 'vitest';
import { admissionDePart, refusDePart } from '../../scripts/regles-des-places.mjs';

const R = { admissionDePart, refusDePart };
const GO = 1024 ** 3;
const budget = { coeurs: 8, memoire: 16 * GO };
const calme = { coeurs: 12, charge: 1, memoireLibre: 16 * GO };
const part = (coeurs: number, memoireGo: number) => ({ coeurs, memoire: memoireGo * GO });
const prise = (id: string, coeurs: number, memoireGo: number) => ({
  id,
  coeurs,
  memoire: memoireGo * GO,
});

describe('l’admission d’une part sur le budget restant', () => {
  it('une part qui tient sur une machine calme est admise', () => {
    expect(R.admissionDePart({ part: part(4, 8), budget, prises: [], mesure: calme })).toEqual({
      ok: true,
    });
  });

  it('deux parts qui tiennent ensemble sont admises l’une après l’autre', () => {
    expect(
      R.admissionDePart({
        part: part(4, 8),
        budget,
        prises: [prise('a', 4, 8)],
        mesure: calme,
      }).ok
    ).toBe(true);
  });

  it('une part qui ne tient plus attend des cœurs, et dit ses chiffres', () => {
    const r = R.admissionDePart({
      part: part(6, 4),
      budget,
      prises: [prise('a', 4, 4)],
      mesure: calme,
    });
    expect(r.ok).toBe(false);
    expect(r.attend).toBe('cœurs');
    expect(r.raison).toMatch(/cœurs/);
    expect(r.raison).toMatch(/6/);
    expect(r.raison).toMatch(/4 libres/);
    expect(r.raison).toMatch(/8/);
  });

  it('une part qui ne tient plus attend de la mémoire, et dit ses chiffres', () => {
    const r = R.admissionDePart({
      part: part(2, 12),
      budget,
      prises: [prise('a', 2, 8)],
      mesure: calme,
    });
    expect(r.ok).toBe(false);
    expect(r.attend).toBe('mémoire');
    expect(r.raison).toMatch(/mémoire/);
    expect(r.raison).toMatch(/12/);
    expect(r.raison).toMatch(/8 Go libres/);
    expect(r.raison).toMatch(/16/);
  });

  it('plusieurs parts prises se cumulent sur le budget', () => {
    const r = R.admissionDePart({
      part: part(3, 1),
      budget,
      prises: [prise('a', 3, 1), prise('b', 3, 1)],
      mesure: calme,
    });
    expect(r.ok).toBe(false);
    expect(r.attend).toBe('cœurs');
    expect(r.raison).toMatch(/2 libres/);
  });

  it('une part qui prend exactement le reste est admise', () => {
    expect(
      R.admissionDePart({
        part: part(4, 8),
        budget,
        prises: [prise('a', 4, 8)],
        mesure: calme,
      }).ok
    ).toBe(true);
  });

  it('une charge de la machine qui atteint les cœurs refuse, avec ses chiffres', () => {
    const r = R.admissionDePart({
      part: part(4, 8),
      budget,
      prises: [],
      mesure: { ...calme, charge: 12.5 },
    });
    expect(r.ok).toBe(false);
    expect(r.attend).toBe('charge');
    expect(r.raison).toContain('charge de la machine 12,5 sur 12 cœurs');
  });

  it('une mémoire libre sous 4 Go refuse, avec ses chiffres', () => {
    const r = R.admissionDePart({
      part: part(4, 8),
      budget,
      prises: [],
      mesure: { ...calme, memoireLibre: 3.1 * GO },
    });
    expect(r.ok).toBe(false);
    expect(r.attend).toBe('mémoire');
    expect(r.raison).toContain('mémoire libre 3,1 Go, sous les 4 Go demandés');
  });

  it('une part qui tient dans le budget mais que la charge refuse attend la charge', () => {
    const r = R.admissionDePart({
      part: part(2, 2),
      budget,
      prises: [],
      mesure: { ...calme, charge: 20 },
    });
    expect(r.attend).toBe('charge');
  });
});

describe('le tour d’une passe qui attend sa part', () => {
  type Etat = {
    prises: { id: string; coeurs: number; memoire: number }[];
    attentes: { id: string; rang: number; ticket?: string; raison: string }[];
  };
  type Options = Partial<Parameters<typeof refusDePart>[1]>;
  const vide = (): Etat => ({ prises: [], attentes: [] });
  const jouer = (etat: Etat, o: Options = {}) =>
    R.refusDePart(etat, {
      id: 'moi',
      rang: 5,
      part: part(4, 8),
      budget,
      mesurer: () => calme,
      ...o,
    });

  it('rend null quand la part tient et que personne n’attend avant', () => {
    expect(jouer(vide())).toBeNull();
  });

  it('rend la raison de l’admission quand la part ne tient pas', () => {
    const etat = { ...vide(), prises: [prise('a', 6, 8)] };
    expect(jouer(etat)).toMatch(/cœurs/);
  });

  it('une passe arrivée avant et qui attend garde son rang, et se nomme', () => {
    const etat = {
      ...vide(),
      attentes: [{ id: 'avant', rang: 2, ticket: 'gh-7', raison: 'cœurs : 8 demandés' }],
    };
    expect(jouer(etat)).toMatch(/gh-7/);
  });

  it('une passe arrivée après n’empêche pas', () => {
    const etat = { ...vide(), attentes: [{ id: 'apres', rang: 9, ticket: 'gh-8', raison: 'x' }] };
    expect(jouer(etat)).toBeNull();
  });

  it('la mesure du cadre, de rang plus petit, passe avant celle d’un projet', () => {
    const etat = { ...vide(), attentes: [{ id: 'cadre', rang: 1, raison: 'cœurs' }] };
    expect(jouer(etat, { rang: 4 })).not.toBeNull();
    expect(jouer(etat, { id: 'cadre', rang: 1 })).toBeNull();
  });

  it('la mesure est lue seulement quand la part et le tour passent', () => {
    let lues = 0;
    const mesurer = () => {
      lues += 1;
      return calme;
    };
    jouer({ ...vide(), prises: [prise('a', 8, 1)] }, { mesurer });
    expect(lues).toBe(0);
    jouer(vide(), { mesurer });
    expect(lues).toBe(1);
  });

  it('la nuit, qui demande le budget entier, joue seule', () => {
    const entier = { ...budget };
    expect(jouer(vide(), { part: entier })).toBeNull();
    expect(jouer({ ...vide(), prises: [prise('a', 1, 1)] }, { part: entier })).toMatch(/cœurs/);
  });
});
