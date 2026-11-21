// Le refus d'une part sous la réservation de la machine (scripts/regles-des-places.mjs,
// `refusDePart`), comme `kubectl cordon` : un nœud fermé ne reçoit aucun travail neuf. Sous la
// fermeture du superviseur aucune passe ne prend sa part, aucun jeton n'y ouvre rien ; sous la
// réservation de la nuit, seule la passe qui porte le jeton de la réservation la prend ; hors de
// toute réservation, rien ne change. Petits tests : une règle pure.
import { describe, expect, it } from 'vitest';
import { refusDePart } from '../../scripts/regles-des-places.mjs';

type Reservation = { auteur?: 'nuit' | 'superviseur'; jeton: string; depuis?: number } | null;
const GO = 1024 ** 3;
const budget = { coeurs: 8, memoire: 16 * GO };
const part = { coeurs: 2, memoire: 2 * GO };
const calme = { coeurs: 12, charge: 1, memoireLibre: 16 * GO };
const FERMEE = { auteur: 'superviseur', jeton: 'j-sup', depuis: 1 } as const;
const NUIT = { auteur: 'nuit', jeton: 'j-nuit', depuis: 1 } as const;

const refus = (
  reservation: Reservation | undefined,
  jeton: string | null | undefined,
  etat: { prises?: object[]; attentes?: object[] } = {}
) =>
  (refusDePart as unknown as (e: object, o: object) => string | null)(
    { prises: [], attentes: [], ...etat },
    { id: 'moi', rang: 1, part, budget, mesurer: () => calme, reservation, jeton }
  );

describe('le refus d’une part sous la fermeture du superviseur', () => {
  it('une passe sans jeton est refusée : machine fermée par le superviseur', () => {
    expect(refus(FERMEE, undefined)).toMatch(/machine fermée par le superviseur/);
  });

  it('le jeton de la fermeture elle-même n’ouvre rien', () => {
    expect(refus(FERMEE, 'j-sup')).toMatch(/machine fermée par le superviseur/);
  });

  it('un jeton de nuit n’ouvre rien non plus', () => {
    expect(refus(FERMEE, 'j-nuit')).toMatch(/machine fermée par le superviseur/);
  });

  it('la fermeture prime sur une part qui tiendrait et sur toute attente', () => {
    expect(refus(FERMEE, null, { attentes: [{ id: 'autre', rang: 0, raison: 'cœurs' }] })).toMatch(
      /machine fermée par le superviseur/
    );
  });
});

describe('le refus d’une part sous la réservation de la nuit', () => {
  it('une passe sans jeton est refusée : la nuit tient la machine', () => {
    expect(refus(NUIT, undefined)).toMatch(/la nuit tient la machine/);
    expect(refus(NUIT, null)).toMatch(/la nuit tient la machine/);
  });

  it('une passe au jeton d’une autre nuit est refusée', () => {
    expect(refus(NUIT, 'j-ancien')).toMatch(/la nuit tient la machine/);
  });

  it('une réservation sans auteur est celle de la nuit', () => {
    expect(refus({ jeton: 'j-nuit' }, 'autre')).toMatch(/la nuit tient la machine/);
    expect(refus({ jeton: 'j-nuit' }, 'j-nuit')).toBeNull();
  });

  it('la passe qui porte le jeton de la réservation prend sa part', () => {
    expect(refus(NUIT, 'j-nuit')).toBeNull();
  });
});

describe('le refus d’une part hors de toute réservation', () => {
  it('sans réservation, une passe passe, avec ou sans jeton', () => {
    expect(refus(null, undefined)).toBeNull();
    expect(refus(undefined, undefined)).toBeNull();
    expect(refus(null, 'j-nuit')).toBeNull();
  });

  it('sans réservation, un budget plein attend toujours sa raison de budget', () => {
    expect(refus(null, undefined, { prises: [{ id: 'a', coeurs: 8, memoire: 1 * GO }] })).toMatch(
      /cœurs/
    );
  });
});
