// La fermeture de la machine par le superviseur, dans les règles des places
// (scripts/regles-des-places.mjs) : la seule réservation de la machine. Aucune demande de place
// n'est donnée sous la fermeture, même celle qui porte un jeton ; la réservation des circuits ne
// donne rien de neuf ; la fermeture n'a pas de battement et ne périme jamais. La nuit ne réserve
// rien : ni jeton, ni raison, ni phase, ni péremption n'existent plus. Petits tests : les règles
// pures, sans processus.
import { describe, expect, it } from 'vitest';
import * as regles from '../../scripts/regles-des-places.mjs';
import {
  phaseDeLaReservation,
  refusDeLaPlace,
  reserverDesCircuits,
} from '../../scripts/regles-des-places.mjs';

const GO = 1024 ** 3;
const base = { coeurs: 12, charge: 1, memoireLibre: 16 * GO };
const FERMEE = { auteur: 'superviseur' as const, jeton: 'jeton-du-superviseur', depuis: 1_000 };

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

  it('une fois la fermeture levée, la même demande passe', () => {
    expect(prise({ ...vide(), reservation: null })).toBeNull();
  });

  it('sans réservation, une demande qui porte le jeton de l’ancienne nuit passe comme une autre', () => {
    expect(prise(vide(), { jeton: 'jeton-de-la-nuit' })).toBeNull();
  });
});

describe('la réservation des circuits sous la fermeture', () => {
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

describe('la phase de la fermeture dit ce qui reste à finir', () => {
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
});

describe('la nuit ne réserve plus la machine : ses règles n’existent plus', () => {
  it.each(['RAISON_DE_LA_NUIT', 'VARIABLE_JETON', 'phaseDeLaNuit', 'reservationPerimee'])(
    '%s n’est plus publié',
    nom => {
      expect(Object.keys(regles)).not.toContain(nom);
    }
  );
});
