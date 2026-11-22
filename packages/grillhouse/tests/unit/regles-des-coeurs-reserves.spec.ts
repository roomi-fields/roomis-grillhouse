// La réservation de cœurs des circuits (scripts/regles-des-places.mjs) : des réservations de 3 cœurs
// (ordinaire) et de 2 (direct) s'additionnent contre le budget de la machine ; ce qui ne tient pas
// attend, dans l'ordre d'arrivée, rang gardé ; la place de circuit est un compte à part, 12 au plus.
import { describe, expect, it } from 'vitest';
import { refusDePart, reserverDesCircuits } from '../../scripts/regles-des-places.mjs';

const GO = 1024 ** 3;
const budget = { coeurs: 28, memoire: 60 * GO };
const calme = () => ({ coeurs: 32, charge: 1, memoireLibre: 40 * GO });
const reservation = (coeurs: number) => ({ coeurs, memoire: GO });
const tenue = (id: string, coeurs: number) => ({ id, coeurs, memoire: GO, ticket: id });
const tenues = (n: number, coeurs = 3) =>
  Array.from({ length: n }, (_, i) => tenue(`t${i}`, coeurs));

describe('les réservations de cœurs s’additionnent contre le budget de la machine', () => {
  it('neuf circuits ordinaires de 3 cœurs tiennent dans 28, le dixième attend', () => {
    const neuf = tenues(9);
    expect(
      refusDePart(
        { prises: neuf.slice(0, 8), attentes: [] },
        {
          id: 'x',
          rang: 9,
          part: reservation(3),
          budget,
          mesurer: calme,
        }
      )
    ).toBeNull();
    expect(
      refusDePart(
        { prises: neuf, attentes: [] },
        {
          id: 'x',
          rang: 10,
          part: reservation(3),
          budget,
          mesurer: calme,
        }
      )
    ).toMatch(/cœurs : 3 demandés, 1 libres sur 28/);
  });

  it('un direct de 2 cœurs tient là où un ordinaire de 3 n’entre pas', () => {
    const etat = { prises: [...tenues(8), tenue('d', 2)], attentes: [] };
    const o = { id: 'x', rang: 10, budget, mesurer: calme };
    expect(refusDePart(etat, { ...o, part: reservation(2) })).toBeNull();
    expect(refusDePart(etat, { ...o, part: reservation(3) })).toMatch(/cœurs/);
  });

  it('un circuit qui redemande ses cœurs garde son rang : un direct arrivé après lui ne le dépasse pas', () => {
    // 2 cœurs libres : le direct (2) tiendrait, mais l'ordinaire (3, rang 5) attend avant lui.
    const etat = {
      prises: [...tenues(8), tenue('d0', 2)],
      attentes: [{ id: 'ordinaire', rang: 5, ticket: 'gh-1', raison: 'cœurs : 3 demandés' }],
    };
    expect(
      refusDePart(etat, {
        id: 'direct',
        rang: 6,
        part: reservation(2),
        budget,
        mesurer: calme,
      })
    ).toMatch(/gh-1/);
    // Le même direct passe dès que l'ordinaire a pris ses cœurs ou n'attend plus.
    expect(
      refusDePart(
        { ...etat, attentes: [] },
        {
          id: 'direct',
          rang: 6,
          part: reservation(2),
          budget,
          mesurer: calme,
        }
      )
    ).toBeNull();
  });

  it('une réservation plus grande que le budget attend tout le budget libre, sans dépasser', () => {
    expect(
      refusDePart(
        { prises: [], attentes: [] },
        {
          id: 'x',
          rang: 1,
          part: reservation(28),
          budget,
          mesurer: calme,
        }
      )
    ).toBeNull();
  });
});

describe('la place de circuit, douze au plus à la fois, directs compris', () => {
  const place = (ticket: string, rang: number) => ({
    racine: '/p',
    ticket,
    rang,
    accordee: true,
    depuis: 0,
    vu: 1000,
  });

  it('avec douze places tenues, le treizième circuit attend une place', () => {
    const places = Array.from({ length: 12 }, (_, i) => place(`gh-${i}`, i + 1));
    const r = reserverDesCircuits(
      places,
      { racine: '/p', vivants: places.map(p => p.ticket), candidats: ['gh-12'] },
      { rang: 12, plafond: 12, maintenant: 1000 }
    );
    expect(r.accordes).toEqual([]);
    expect(r.circuits.filter(c => c.accordee)).toHaveLength(12);
  });

  it('une place rendue donne le tour au suivant', () => {
    const places = Array.from({ length: 11 }, (_, i) => place(`gh-${i}`, i + 1));
    const r = reserverDesCircuits(
      places,
      { racine: '/p', vivants: places.map(p => p.ticket), candidats: ['gh-12'] },
      { rang: 12, plafond: 12, maintenant: 1000 }
    );
    expect(r.accordes).toEqual(['gh-12']);
  });
});
