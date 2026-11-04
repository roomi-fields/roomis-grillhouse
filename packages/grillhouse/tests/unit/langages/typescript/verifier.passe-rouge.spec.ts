// `npm run verifier` (scripts/langages/typescript/verifier.mjs), grillhouse-44b.5, critère 9 : le
// dernier vert est posé par la seule passe de la vérification, une fois, quand toutes les tâches
// de tous les langages sont vertes. Un module qui joue après un module rouge reçoit
// GRILLHOUSE_PASSE_ROUGE : sa passe verte ne pose aucun vert.
//
// Petit test : la décision de poser le vert est `poserLeVert`, que verifier.mjs publie ; elle
// reçoit le code de la passe, la mesure et l'environnement, et la pose du vert (`garder`) en
// paramètre. Une passe verte simulée, sans dépôt ni processus.
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error — module .mjs sans déclaration de types
import { poserLeVert } from '../../../../scripts/langages/typescript/verifier.mjs';

const ETAT = { commit: 'abc', arbre: 'def' };

function jouer(opts: {
  code?: number;
  etat?: unknown;
  args?: string[];
  env?: Record<string, string>;
}) {
  const garder = vi.fn();
  poserLeVert({
    code: opts.code ?? 0,
    etat: 'etat' in opts ? opts.etat : ETAT,
    args: opts.args ?? [],
    env: opts.env ?? {},
    garder,
  });
  return garder;
}

describe('critère 9 : la passe verte de typescript pose le dernier vert sauf après un module rouge', () => {
  it('critère 9 : une passe verte sans GRILLHOUSE_PASSE_ROUGE pose le dernier vert (témoin)', () => {
    const garder = jouer({});
    expect(garder).toHaveBeenCalledTimes(1);
    expect(garder).toHaveBeenCalledWith(ETAT);
  });

  it('critère 9 : une passe verte lancée avec GRILLHOUSE_PASSE_ROUGE=1 ne pose aucun dernier vert', () => {
    expect(jouer({ env: { GRILLHOUSE_PASSE_ROUGE: '1' } })).not.toHaveBeenCalled();
  });

  it('critère 9 : une passe rouge ne pose aucun dernier vert', () => {
    expect(jouer({ code: 1 })).not.toHaveBeenCalled();
  });

  it('critère 9 : une passe restreinte par un filtre de Turborepo ne pose aucun dernier vert', () => {
    expect(jouer({ args: ['--filter=a'] })).not.toHaveBeenCalled();
  });

  it('critère 9 : une passe sans mesure (les gardes seules) ne pose aucun dernier vert', () => {
    expect(jouer({ etat: null })).not.toHaveBeenCalled();
  });
});
