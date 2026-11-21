// Une nuit qui demande la machine fermée par le superviseur ne la prend pas et n'échoue pas : elle
// est sautée (src/temporal/nuits/choix.ts, `raisonDeLaNuitSautee` sur la fermeture que lisent les
// places), la raison « machine fermée par le superviseur ». La machine ouverte, ou fermée par la
// nuit elle-même, ne saute rien. Petits tests : la décision pure.
import { describe, expect, it } from 'vitest';
import { raisonDeLaNuitSautee } from '../../src/temporal/nuits/choix.js';

describe('la nuit qui demande une machine fermée par le superviseur est sautée', () => {
  it('la raison nomme la fermeture du superviseur', () => {
    expect(raisonDeLaNuitSautee({ auteur: 'superviseur', depuis: 1, phase: 'vide' })).toBe(
      'machine fermée par le superviseur'
    );
  });

  it('la phase de la fermeture n’y change rien', () => {
    expect(raisonDeLaNuitSautee({ auteur: 'superviseur', depuis: 1, phase: 'attend' })).toBe(
      'machine fermée par le superviseur'
    );
  });

  it('sans fermeture, la nuit joue', () => {
    expect(raisonDeLaNuitSautee(null)).toBeNull();
    expect(raisonDeLaNuitSautee(undefined)).toBeNull();
  });

  it('une réservation de la nuit n’est pas un saut', () => {
    expect(raisonDeLaNuitSautee({ auteur: 'nuit', depuis: 1, phase: 'en cours' })).toBeNull();
  });
});
