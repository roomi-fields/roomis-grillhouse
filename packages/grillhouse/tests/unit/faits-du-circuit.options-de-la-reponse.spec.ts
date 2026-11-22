// The options of a run on the supervisor's answer (scripts/faits-du-circuit.mjs, `optionsDe`): the
// context of `--reprendre`, `--depuis`, `--mecanique` and `--etendre` reaches the run, and the role
// it is given to is the agent whose step `--depuis` names, none for any other answer.
import { describe, expect, it } from 'vitest';
import * as faits from '../../scripts/faits-du-circuit.mjs';

const optionsDe = (faits as unknown as { optionsDe: (r: object | null | undefined) => object })
  .optionsDe;

describe('les options d’une passe sur la réponse du superviseur', () => {
  it('sans réponse, aucune option', () => {
    expect(optionsDe(null)).toEqual({});
    expect(optionsDe(undefined)).toEqual({});
  });

  it('--reprendre reprend, son contexte à l’étape en cours, aucun rôle nommé', () => {
    expect(optionsDe({ genre: 'reprendre', contexte: 'Le superviseur a tranché.' })).toEqual({
      reprendre: true,
      contexte: 'Le superviseur a tranché.',
      destinataire: null,
    });
    expect(optionsDe({ genre: 'reprendre' })).toEqual({
      reprendre: true,
      contexte: null,
      destinataire: null,
    });
  });

  it.each(['testwriter', 'developpeur'])(
    '--depuis %s donne son contexte à ce rôle, dont la séance est jouée',
    role => {
      expect(optionsDe({ genre: 'depuis', role, contexte: 'Retire le correctif.' })).toEqual({
        depuis: role,
        contexte: 'Retire le correctif.',
        destinataire: role,
      });
    }
  );

  it.each(['preuve', 'controles', 'passe-finale'])(
    '--depuis %s joue cette étape sans rôle à qui donner le contexte',
    role => {
      expect(optionsDe({ genre: 'depuis', role, contexte: 'C' })).toEqual({
        depuis: role,
        contexte: 'C',
        destinataire: null,
      });
    }
  );

  it('--mecanique avec sa commande va au geste, sans rôle ; sans commande, au développeur qui reçoit la raison', () => {
    expect(optionsDe({ genre: 'mecanique', commande: 'mv a b', contexte: 'Renommer.' })).toEqual({
      mecanique: { commande: 'mv a b' },
      contexte: 'Renommer.',
      destinataire: null,
    });
    expect(optionsDe({ genre: 'mecanique', contexte: 'À la main.' })).toEqual({
      mecanique: { commande: null },
      contexte: 'À la main.',
      destinataire: 'developpeur',
    });
  });

  it('--etendre porte les paquets, le contexte à l’étape en cours', () => {
    expect(
      optionsDe({ genre: 'etendre', paquets: ['030-binder'], contexte: 'Plus large.' })
    ).toEqual({
      etendre: ['030-binder'],
      contexte: 'Plus large.',
      destinataire: null,
    });
  });
});
