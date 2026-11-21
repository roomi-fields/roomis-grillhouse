// La fermeture de la machine par le superviseur, dans les règles des places
// (scripts/regles-des-places.mjs) : une réservation de la machine à deux auteurs (`nuit`, absent
// valant nuit, ou `superviseur`), la même pour la règle des places. La fermeture du superviseur
// n'a pas de battement et ne périme jamais ; celle de la nuit garde son battement et sa
// péremption. Aucune demande de place n'est donnée sous la fermeture, même celle qui porte le
// jeton de la réservation ; la réservation des circuits ne donne rien de neuf, quel que soit
// l'auteur. Petits tests : les règles pures, sans processus.
import { describe, expect, it } from 'vitest';
import {
  PERIME_MS,
  phaseDeLaReservation,
  phaseDeLaNuit,
  refusDeLaPlace,
  reservationPerimee,
  reserverDesCircuits,
} from '../../scripts/regles-des-places.mjs';

const GO = 1024 ** 3;
const base = { coeurs: 12, charge: 1, memoireLibre: 16 * GO };
const FERMEE = { auteur: 'superviseur' as const, jeton: 'jeton-du-superviseur', depuis: 1_000 };
const NUIT = {
  auteur: 'nuit' as const,
  jeton: 'jeton-de-la-nuit',
  depuis: 1_000,
  battement: 1_000,
};

type Etat = Parameters<typeof refusDeLaPlace>[0] & { reservation?: object | null };
const vide = (): Etat => ({ prises: [], attentes: [], dernier: 0 });
const sous = (reservation: object, o: Partial<Etat> = {}): Etat => ({
  ...vide(),
  reservation,
  ...o,
});
const prise = (etat: Etat, o: Record<string, unknown> = {}) =>
  refusDeLaPlace(etat, {
    id: 'moi',
    rang: 5,
    plafond: 3,
    espacementMs: 0,
    maintenant: 100_000,
    mesurer: () => base,
    ...o,
  } as Parameters<typeof refusDeLaPlace>[1]);

describe('une machine fermée par le superviseur ne donne aucune place', () => {
  it('sous le plafond et à vide de charge, la demande attend, la raison nomme la fermeture du superviseur', () => {
    expect(prise(sous(FERMEE))).toMatch(/machine fermée par le superviseur/);
  });

  it('une demande sans jeton, avec un autre jeton ou avec celui de la fermeture attend de même', () => {
    for (const jeton of [null, 'un-autre', FERMEE.jeton]) {
      expect(prise(sous(FERMEE), { jeton }), String(jeton)).toMatch(
        /machine fermée par le superviseur/
      );
    }
  });

  it('au plafond atteint, la raison reste la fermeture', () => {
    expect(prise(sous(FERMEE, { prises: [{}, {}, {}] }))).toMatch(
      /machine fermée par le superviseur/
    );
  });

  it('la raison d’une nuit reste celle de la nuit, et ne parle pas du superviseur', () => {
    const r = prise(sous(NUIT));
    expect(r).toMatch(/nuit/);
    expect(r).not.toMatch(/superviseur/);
  });

  it('une réservation sans auteur vaut celle de la nuit', () => {
    const { auteur: _a, ...ancienne } = NUIT;
    expect(prise(sous(ancienne))).toMatch(/nuit/);
    expect(prise(sous(ancienne), { jeton: NUIT.jeton })).toBeNull();
  });

  it('une fois la fermeture levée, la même demande passe', () => {
    expect(prise({ ...vide(), reservation: null })).toBeNull();
  });
});

describe('la réservation des circuits traite la fermeture comme celle de la nuit', () => {
  const o = { rang: 1, plafond: 3, maintenant: 100_000, reservee: true };

  it('un candidat attend sous la fermeture, des places libres sous le plafond', () => {
    const r = reserverDesCircuits([], { racine: '/p', candidats: ['p-2', 'p-3'] }, o);
    expect(r.accordes).toEqual([]);
    expect(r.circuits.map(c => c.ticket).sort()).toEqual(['p-2', 'p-3']);
  });

  it('un circuit vivant garde sa place de circuit sous la fermeture', () => {
    const vivante = { racine: '/p', ticket: 'p-1', rang: 1, accordee: true, depuis: 0, vu: 90_000 };
    const r = reserverDesCircuits(
      [vivante],
      { racine: '/p', vivants: ['p-1'], candidats: ['p-2'] },
      o
    );
    expect(r.circuits.find(c => c.ticket === 'p-1')).toMatchObject({ accordee: true, rang: 1 });
    expect(r.accordes).toEqual([]);
  });
});

describe('la fermeture du superviseur ne périme jamais', () => {
  it('sans battement, jamais périmée, même des jours plus tard', () => {
    expect(reservationPerimee(FERMEE, FERMEE.depuis + PERIME_MS)).toBe(false);
    expect(reservationPerimee(FERMEE, FERMEE.depuis + 30 * 24 * 3_600_000)).toBe(false);
  });

  it('même un battement ancien ne la périme pas', () => {
    expect(reservationPerimee({ ...FERMEE, battement: 1 }, 30 * 24 * 3_600_000)).toBe(false);
  });

  it('celle de la nuit garde sa péremption à PERIME_MS', () => {
    expect(PERIME_MS).toBe(10 * 60_000);
    expect(reservationPerimee(NUIT, NUIT.battement + PERIME_MS - 1)).toBe(false);
    expect(reservationPerimee(NUIT, NUIT.battement + PERIME_MS)).toBe(true);
  });
});

describe('la phase d’une réservation de la machine dit ce qui reste à finir', () => {
  it('sans réservation, aucune phase', () => {
    expect(phaseDeLaReservation({ prises: [], reservation: null })).toBeNull();
  });

  it('fermée par le superviseur : « attend » tant qu’une place est prise, même avec le jeton', () => {
    expect(phaseDeLaReservation({ prises: [{ id: 'a', jeton: null }], reservation: FERMEE })).toBe(
      'attend'
    );
    expect(
      phaseDeLaReservation({ prises: [{ id: 'a', jeton: FERMEE.jeton }], reservation: FERMEE })
    ).toBe('attend');
  });

  it('fermée par le superviseur, toutes les places rendues : « vide »', () => {
    expect(phaseDeLaReservation({ prises: [], reservation: FERMEE })).toBe('vide');
  });

  it('la nuit garde ses phases « attend » puis « en cours »', () => {
    expect(phaseDeLaReservation({ prises: [{ id: 'a', jeton: null }], reservation: NUIT })).toBe(
      'attend'
    );
    expect(phaseDeLaReservation({ prises: [], reservation: NUIT })).toBe('en cours');
  });

  it('la fermeture du superviseur n’est pas une nuit : aucune phase de nuit', () => {
    expect(phaseDeLaNuit({ prises: [], reservation: FERMEE })).toBeNull();
    expect(phaseDeLaNuit({ prises: [{ id: 'a', jeton: null }], reservation: FERMEE })).toBeNull();
    expect(phaseDeLaNuit({ prises: [], reservation: NUIT })).toBe('en cours');
  });
});
