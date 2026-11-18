// Le budget de la machine et la part d'une passe : des fonctions pures, matériel et réglages en
// entrée, sans toucher la machine (scripts/plafond-de-la-machine.mjs pour le budget et la part,
// aussi, pour la clé `grillhouse.part` du package.json d'un projet).
import { describe, expect, it } from 'vitest';
import {
  budgetDe,
  partDe,
  partDeclareeDe,
  partParDefautDe,
  reserveDe,
} from '../../scripts/plafond-de-la-machine.mjs';

const P = { budgetDe, partDe, partParDefautDe, reserveDe };
const C = { partDeclareeDe };
const GO = 1024 ** 3;
// Le poste : le texte de machine.env et le nombre de cœurs de la machine (12 sauf mention).
const poste = (texte: string, coeurs = 12) => ({ lire: () => texte, coeurs });

describe('la réserve de l’utilisateur', () => {
  it.each([
    [2, 0],
    [4, 0],
    [6, 2],
    [8, 4],
    [32, 4],
  ])(
    'par défaut sur %i cœurs, la réserve en cœurs vaut %i (au moins 4 cœurs restent aux passes) et 4 Go de mémoire',
    (coeurs, attendu) => {
      expect(P.reserveDe({}, poste('', coeurs))).toEqual({ coeurs: attendu, memoire: 4 * GO });
    }
  );

  it('une réserve réglée à 4 sur 4 cœurs est lue telle quelle, puis refusée par le budget', () => {
    const r = P.reserveDe({ GRILLHOUSE_RESERVE_COEURS: '4' }, poste('', 4));
    expect(r.coeurs).toBe(4);
    expect(() => P.budgetDe({ coeurs: 4, memoireTotale: 32 * GO }, r)).toThrow(
      /GRILLHOUSE_RESERVE_COEURS/
    );
  });

  it('une réserve réglée à 4 sur 6 cœurs est admise : budget de 2 cœurs', () => {
    const r = P.reserveDe({}, poste('GRILLHOUSE_RESERVE_COEURS=4\n', 6));
    expect(P.budgetDe({ coeurs: 6, memoireTotale: 32 * GO }, r).coeurs).toBe(2);
  });

  it('une réserve réglée à zéro est admise sur 4 cœurs : budget de 4 cœurs', () => {
    const r = P.reserveDe({ GRILLHOUSE_RESERVE_COEURS: '0' }, poste('', 4));
    expect(r.coeurs).toBe(0);
    expect(P.budgetDe({ coeurs: 4, memoireTotale: 32 * GO }, r).coeurs).toBe(4);
  });

  it('le budget par défaut d’une machine de 4 cœurs ou moins est tous ses cœurs, sans refus', () => {
    for (const coeurs of [1, 2, 4]) {
      const r = P.reserveDe({}, poste('', coeurs));
      expect(P.budgetDe({ coeurs, memoireTotale: 32 * GO }, r).coeurs).toBe(coeurs);
    }
  });

  it('se règle dans machine.env', () => {
    const r = P.reserveDe(
      {},
      poste('GRILLHOUSE_RESERVE_COEURS=2\nGRILLHOUSE_RESERVE_MEMOIRE_GO=8\n')
    );
    expect(r).toEqual({ coeurs: 2, memoire: 8 * GO });
  });

  it('la variable d’environnement l’emporte sur le fichier', () => {
    const r = P.reserveDe(
      { GRILLHOUSE_RESERVE_COEURS: '1' },
      poste('GRILLHOUSE_RESERVE_COEURS=2\n')
    );
    expect(r.coeurs).toBe(1);
  });

  it('admet zéro cœur et zéro Go de réserve', () => {
    const r = P.reserveDe(
      { GRILLHOUSE_RESERVE_COEURS: '0', GRILLHOUSE_RESERVE_MEMOIRE_GO: '0' },
      poste('')
    );
    expect(r).toEqual({ coeurs: 0, memoire: 0 });
  });

  it.each(['abc', '-1', '1.5', '2 cœurs'])(
    'refuse la valeur fautive « %s » des cœurs par le nom de la variable',
    v => {
      expect(() => P.reserveDe({ GRILLHOUSE_RESERVE_COEURS: v }, poste(''))).toThrow(
        /GRILLHOUSE_RESERVE_COEURS/
      );
    }
  );

  it.each(['abc', '-1', '2.5'])(
    'refuse la valeur fautive « %s » de la mémoire par le nom de la variable',
    v => {
      expect(() => P.reserveDe({ GRILLHOUSE_RESERVE_MEMOIRE_GO: v }, poste(''))).toThrow(
        /GRILLHOUSE_RESERVE_MEMOIRE_GO/
      );
    }
  );
});

describe('le budget de la machine', () => {
  const materiel = { coeurs: 12, memoireTotale: 32 * GO };

  it('vaut les cœurs et la mémoire moins la réserve', () => {
    expect(P.budgetDe(materiel, { coeurs: 4, memoire: 4 * GO })).toEqual({
      coeurs: 8,
      memoire: 28 * GO,
    });
  });

  it('une réserve nulle donne la machine entière', () => {
    expect(P.budgetDe(materiel, { coeurs: 0, memoire: 0 })).toEqual({
      coeurs: 12,
      memoire: 32 * GO,
    });
  });

  it('une réserve de cœurs égale au nombre de cœurs est refusée par son nom', () => {
    expect(() =>
      P.budgetDe({ coeurs: 4, memoireTotale: 32 * GO }, { coeurs: 4, memoire: 0 })
    ).toThrow(/GRILLHOUSE_RESERVE_COEURS/);
  });

  it('une réserve de cœurs supérieure aux cœurs est refusée par son nom', () => {
    expect(() =>
      P.budgetDe({ coeurs: 2, memoireTotale: 32 * GO }, { coeurs: 4, memoire: 0 })
    ).toThrow(/GRILLHOUSE_RESERVE_COEURS/);
  });

  it('une réserve de mémoire qui prend toute la mémoire est refusée par son nom', () => {
    expect(() =>
      P.budgetDe({ coeurs: 12, memoireTotale: 4 * GO }, { coeurs: 0, memoire: 4 * GO })
    ).toThrow(/GRILLHOUSE_RESERVE_MEMOIRE_GO/);
  });

  it('un cœur de budget reste admis', () => {
    expect(P.budgetDe({ coeurs: 5, memoireTotale: 8 * GO }, { coeurs: 4, memoire: 0 }).coeurs).toBe(
      1
    );
  });
});

describe('la part par défaut d’une passe', () => {
  it('vaut au moins 4 cœurs quand le budget les a', () => {
    for (const coeurs of [4, 5, 8, 16, 64]) {
      const p = P.partParDefautDe({ coeurs, memoire: 32 * GO });
      expect(p.coeurs).toBeGreaterThanOrEqual(4);
      expect(p.coeurs).toBeLessThanOrEqual(coeurs);
    }
  });

  it.each([
    [4, 4],
    [5, 4],
    [8, 4],
    [12, 4],
    [13, 5],
    [28, 10],
  ])(
    'sur un budget de %i cœurs, la part par défaut vaut min(budget, max(4, plafond(budget/3))) = %i',
    (coeurs, attendu) => {
      expect(P.partParDefautDe({ coeurs, memoire: 32 * GO }).coeurs).toBe(attendu);
    }
  );

  it.each([
    [6, 4, 4],
    [8, 4, 4],
    [16, 12, 4],
    [32, 28, 10],
  ])(
    'sur %i cœurs sans réglage, le budget est de %i cœurs et la part par défaut de %i',
    (coeurs, budgetAttendu, partAttendue) => {
      const budget = P.budgetDe(
        { coeurs, memoireTotale: 64 * GO },
        P.reserveDe({}, poste('', coeurs))
      );
      expect(budget.coeurs).toBe(budgetAttendu);
      expect(P.partParDefautDe(budget).coeurs).toBe(partAttendue);
    }
  );

  it('la mémoire par défaut vaut le budget de mémoire × part en cœurs / budget en cœurs', () => {
    expect(P.partParDefautDe({ coeurs: 28, memoire: 56 * GO })).toEqual({
      coeurs: 10,
      memoire: (56 * GO * 10) / 28,
    });
  });

  it('sur un budget d’une seule part, la part est le budget entier', () => {
    expect(P.partParDefautDe({ coeurs: 4, memoire: 16 * GO })).toEqual({
      coeurs: 4,
      memoire: 16 * GO,
    });
  });

  it('ne dépasse jamais le budget, ni ne descend sous un cœur', () => {
    const p = P.partParDefautDe({ coeurs: 2, memoire: 8 * GO });
    expect(p.coeurs).toBe(2);
    expect(P.partParDefautDe({ coeurs: 1, memoire: 8 * GO }).coeurs).toBe(1);
  });

  it('la mémoire par défaut tient dans la mémoire du budget et suit les cœurs', () => {
    const budget = { coeurs: 16, memoire: 32 * GO };
    const p = P.partParDefautDe(budget);
    expect(p.memoire).toBeGreaterThan(0);
    expect(p.memoire).toBeLessThanOrEqual(budget.memoire);
    expect(p.memoire).toBeCloseTo((budget.memoire * p.coeurs) / budget.coeurs, -6);
  });
});

describe('la part d’une passe, déclarée ou par défaut', () => {
  const budget = { coeurs: 8, memoire: 16 * GO };

  it('sans déclaration, la part est celle par défaut', () => {
    expect(P.partDe({ declaree: null, budget })).toEqual(P.partParDefautDe(budget));
  });

  it('une part déclarée est reprise telle quelle quand elle tient', () => {
    expect(P.partDe({ declaree: { coeurs: 2, memoire: 3 * GO }, budget })).toEqual({
      coeurs: 2,
      memoire: 3 * GO,
    });
  });

  it('une déclaration sans mémoire garde les cœurs et la mémoire par défaut', () => {
    const p = P.partDe({ declaree: { coeurs: 2 }, budget });
    expect(p.coeurs).toBe(2);
    expect(p.memoire).toBeGreaterThan(0);
  });

  it('une part plus grande que le budget vaut le budget', () => {
    expect(P.partDe({ declaree: { coeurs: 20, memoire: 64 * GO }, budget })).toEqual(budget);
  });

  it('une part ne descend jamais sous un cœur', () => {
    expect(P.partDe({ declaree: { coeurs: 0, memoire: GO }, budget }).coeurs).toBe(1);
  });
});

describe('la clé grillhouse.part du package.json', () => {
  it('absente, aucune déclaration et aucune faute', () => {
    expect(C.partDeclareeDe({})).toEqual({ declaree: null, faute: null });
    expect(C.partDeclareeDe({ grillhouse: {} })).toEqual({ declaree: null, faute: null });
  });

  it('se lit en cœurs et en Go', () => {
    expect(C.partDeclareeDe({ grillhouse: { part: { coeurs: 6, memoireGo: 12 } } })).toEqual({
      declaree: { coeurs: 6, memoire: 12 * GO },
      faute: null,
    });
  });

  it('admet les cœurs seuls', () => {
    expect(C.partDeclareeDe({ grillhouse: { part: { coeurs: 3 } } })).toEqual({
      declaree: { coeurs: 3 },
      faute: null,
    });
  });

  it.each([
    [{ coeurs: 0 }],
    [{ coeurs: 1.5 }],
    [{ coeurs: '4' }],
    [{ memoireGo: -1 }],
    [{ memoireGo: 'beaucoup' }],
    [{ cœurs: 4 }],
    [4],
    ['4 cœurs'],
  ])('refuse la clé fautive %j par son nom', part => {
    const r = C.partDeclareeDe({ grillhouse: { part } });
    expect(r.declaree).toBeNull();
    expect(r.faute).toContain('grillhouse.part');
  });
});
