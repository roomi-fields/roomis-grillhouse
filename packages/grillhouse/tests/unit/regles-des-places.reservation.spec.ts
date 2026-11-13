// La réservation exclusive de la machine par la nuit, dans les règles des places
// (scripts/regles-des-places.mjs) : pendant la réservation, une demande qui ne porte pas le jeton
// de la nuit attend avec sa raison (la nuit), même sous le plafond et à vide de charge ; la
// réservation des circuits ne donne aucune place neuve et garde les circuits vivants ; la phase de
// la nuit suit les prises ; une réservation sans battement depuis PERIME_MS est périmée.
// Petits tests : les règles pures, sans processus.
import { describe, expect, it } from 'vitest';
import {
  PERIME_MS,
  phaseDeLaNuit,
  refusDeLaPlace,
  reservationPerimee,
  reserverDesCircuits,
} from '../../scripts/regles-des-places.mjs';

const GO = 1024 ** 3;
const base = { coeurs: 12, charge: 1, memoireLibre: 16 * GO };
const RESERVATION = { jeton: 'jeton-de-la-nuit', depuis: 1_000, battement: 1_000 };

type Etat = Parameters<typeof refusDeLaPlace>[0] & {
  reservation?: typeof RESERVATION | null;
};
const vide = (): Etat => ({ prises: [], attentes: [], dernier: 0 });
const reservee = (o: Partial<Etat> = {}): Etat => ({ ...vide(), reservation: RESERVATION, ...o });
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

describe('une demande de place sans le jeton de la nuit attend pendant la réservation', () => {
  it('sous le plafond et à vide de charge, elle attend avec la nuit pour raison', () => {
    expect(prise(reservee())).toMatch(/nuit/);
  });

  it('au plafond atteint, la raison reste la nuit', () => {
    expect(prise(reservee({ prises: [{}, {}, {}] }))).toMatch(/nuit/);
  });

  it('un autre jeton que celui de la réservation attend aussi', () => {
    expect(prise(reservee(), { jeton: 'un-autre' })).toMatch(/nuit/);
  });

  it('sans réservation, la même demande passe comme avant', () => {
    expect(prise(vide())).toBeNull();
    expect(prise({ ...vide(), reservation: null })).toBeNull();
  });
});

describe('une demande qui porte le jeton de la nuit est donnée pendant la réservation', () => {
  it('elle passe sous le plafond', () => {
    expect(prise(reservee(), { jeton: RESERVATION.jeton })).toBeNull();
  });

  it('une attente d’un rang plus bas sans jeton ne lui garde pas son tour', () => {
    const etat = reservee({
      attentes: [{ id: 'autre', rang: 1, ticket: 'bp-1', raison: 'la nuit' }],
    });
    expect(prise(etat, { jeton: RESERVATION.jeton })).toBeNull();
  });

  it('le plafond la borne encore', () => {
    const etat = reservee({ prises: [{}, {}, {}] });
    expect(prise(etat, { jeton: RESERVATION.jeton })).toContain('aucune place libre');
  });
});

describe('la réservation des circuits ne donne aucune place neuve pendant la nuit', () => {
  const vivante = {
    racine: '/p',
    ticket: 'p-1',
    rang: 1,
    accordee: true,
    depuis: 0,
    vu: 90_000,
  };
  const o = { rang: 1, plafond: 3, maintenant: 100_000, reservee: true };

  it('un candidat attend, même avec des places libres sous le plafond', () => {
    const r = reserverDesCircuits([], { racine: '/p', candidats: ['p-2', 'p-3'] }, o);
    expect(r.accordes).toEqual([]);
    expect(r.circuits.filter(c => c.accordee)).toEqual([]);
    expect(r.circuits.map(c => c.ticket).sort()).toEqual(['p-2', 'p-3']);
  });

  it('un circuit vivant garde sa place et son rang', () => {
    const r = reserverDesCircuits(
      [vivante],
      { racine: '/p', vivants: ['p-1'], candidats: ['p-2'] },
      o
    );
    const c = r.circuits.find(x => x.ticket === 'p-1');
    expect(c).toMatchObject({ accordee: true, rang: 1 });
    expect(r.accordes).toEqual([]);
  });

  it('un circuit repris après sa question attend aussi', () => {
    const r = reserverDesCircuits([], { racine: '/p', reprise: { ticket: 'p-9', rang: 4 } }, o);
    expect(r.accordes).toEqual([]);
    expect(r.circuits.find(c => c.ticket === 'p-9')).toMatchObject({ accordee: false, rang: 4 });
  });

  it('à la levée, les candidats qui attendent sont donnés dans l’ordre d’arrivée', () => {
    const pendant = reserverDesCircuits([], { racine: '/p', candidats: ['p-2', 'p-3'] }, o);
    const apres = reserverDesCircuits(
      pendant.circuits,
      { racine: '/p', candidats: ['p-2', 'p-3'] },
      { ...o, reservee: false, maintenant: 101_000 }
    );
    expect(apres.accordes).toEqual(['p-2', 'p-3']);
  });

  it('sans réservation, un candidat est donné comme avant', () => {
    const r = reserverDesCircuits(
      [],
      { racine: '/p', candidats: ['p-2'] },
      {
        ...o,
        reservee: false,
      }
    );
    expect(r.accordes).toEqual(['p-2']);
  });
});

describe('la phase de la nuit suit les prises', () => {
  it('sans réservation, aucune phase', () => {
    expect(phaseDeLaNuit({ prises: [], reservation: null })).toBeNull();
    expect(phaseDeLaNuit({ prises: [{ id: 'a', jeton: null }] })).toBeNull();
  });

  it('tant qu’une place d’une étape est prise : attend la fin des étapes en cours', () => {
    expect(phaseDeLaNuit({ prises: [{ id: 'a', jeton: null }], reservation: RESERVATION })).toBe(
      'attend'
    );
  });

  it('toutes les places rendues : en cours', () => {
    expect(phaseDeLaNuit({ prises: [], reservation: RESERVATION })).toBe('en cours');
  });

  it('les seules places des passes de la nuit : en cours', () => {
    expect(
      phaseDeLaNuit({
        prises: [{ id: 'n', jeton: RESERVATION.jeton }],
        reservation: RESERVATION,
      })
    ).toBe('en cours');
  });
});

describe('une réservation sans battement est périmée à la durée de péremption des places', () => {
  it('un battement récent : vivante', () => {
    expect(reservationPerimee(RESERVATION, 1_000 + PERIME_MS - 1)).toBe(false);
  });

  it('le battement le plus vieux de PERIME_MS : périmée', () => {
    expect(reservationPerimee(RESERVATION, 1_000 + PERIME_MS)).toBe(true);
  });

  it('une nuit longue dont les battements arrivent n’est jamais périmée', () => {
    const r = { ...RESERVATION, battement: 5 * 3_600_000 };
    expect(reservationPerimee(r, 5 * 3_600_000 + 60_000)).toBe(false);
  });
});
