// Le refus d'une part sous la réservation de la machine (scripts/regles-des-places.mjs,
// `refusDePart`), comme `kubectl cordon` : un nœud fermé ne reçoit aucun travail neuf. Sous la
// fermeture du superviseur aucune passe ne prend sa part, aucun jeton n'y ouvre rien ; hors de
// toute réservation, rien ne change, la nuit comprise : elle ne réserve rien et ne refuse la part
// de personne. Petits tests : une règle pure.
import { describe, expect, it } from 'vitest';
import { refusDePart } from '../../scripts/regles-des-places.mjs';

type Reservation = { auteur: 'superviseur'; jeton: string; depuis?: number } | null;
const GO = 1024 ** 3;
const budget = { coeurs: 8, memoire: 16 * GO };
const part = { coeurs: 2, memoire: 2 * GO };
const calme = { coeurs: 12, charge: 1, memoireLibre: 16 * GO };
const FERMEE = { auteur: 'superviseur', jeton: 'j-sup', depuis: 1 } as const;

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

describe('la nuit ne refuse la part de personne', () => {
  it('une part dont le budget a la place passe, la nuit jouant ou non : aucune raison « la nuit »', () => {
    const nuit = { id: 'nuit', sorte: 'Nuit', coeurs: 4, memoire: 4 * GO };
    expect(refus(null, undefined, { prises: [nuit] })).toBeNull();
  });

  it('une part qui attend le budget le dit en cœurs, pas par la nuit', () => {
    const nuit = { id: 'nuit', sorte: 'Nuit', coeurs: 7, memoire: 4 * GO };
    const r = refus(null, undefined, { prises: [nuit] });
    expect(r).toMatch(/cœurs : 2 demandés, 1 libres sur 8/);
    expect(r).not.toMatch(/la nuit tient la machine/);
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
