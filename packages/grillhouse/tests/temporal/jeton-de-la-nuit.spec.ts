// Le jeton de la réservation de la machine passe de la nuit à ses passes par l'environnement : la
// passe de la nuit (`grillhouse nuit`) le reçoit sous VARIABLE_JETON, et la prise de place le joint
// à sa demande (`demandeDePlace`, scripts/places-de-la-machine.mjs). Petits tests : sans processus.
import { describe, expect, it } from 'vitest';
import { demandeDePlace, VARIABLE_JETON } from '../../scripts/places-de-la-machine.mjs';
import { environnementDeLaNuit } from '../../src/temporal/nuits/activites.js';

describe('le jeton de la nuit passe par l’environnement de ses passes', () => {
  it('l’environnement de la passe porte le jeton sous la variable publiée, le reste inchangé', () => {
    const env = environnementDeLaNuit({ PATH: '/bin', HOME: '/h' }, 'jeton-1');
    expect(env[VARIABLE_JETON]).toBe('jeton-1');
    expect(env.PATH).toBe('/bin');
    expect(env.HOME).toBe('/h');
  });

  it('un jeton déjà présent est remplacé par celui de la nuit', () => {
    expect(environnementDeLaNuit({ [VARIABLE_JETON]: 'vieux' }, 'neuf')[VARIABLE_JETON]).toBe(
      'neuf'
    );
  });

  it('la demande de place joint le jeton de l’environnement', () => {
    const d = demandeDePlace({
      env: { [VARIABLE_JETON]: 'jeton-1' },
      pid: 42,
      depart: 'x',
      ticket: null,
    });
    expect(d).toMatchObject({ pid: 42, jeton: 'jeton-1' });
  });

  it('sans jeton dans l’environnement, la demande n’en porte aucun', () => {
    const d = demandeDePlace({ env: {}, pid: 42, depart: 'x', ticket: 't-1' });
    expect(d.jeton ?? null).toBeNull();
    expect(d).toMatchObject({ pid: 42, ticket: 't-1' });
  });
});
