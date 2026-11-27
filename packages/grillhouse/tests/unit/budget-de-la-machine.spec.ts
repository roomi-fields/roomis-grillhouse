// Le budget de la machine et la part d'une passe : des fonctions pures, matériel et réglages en
// entrée, sans toucher la machine (scripts/plafond-de-la-machine.mjs pour le budget et la part,
// aussi, pour la clé `grillhouse.part` du package.json d'un projet).
import { describe, expect, it } from 'vitest';
import * as plafond from '../../scripts/plafond-de-la-machine.mjs';
import {
  budgetDe,
  partDe,
  partDeclareeDe,
  reserveDe,
} from '../../scripts/plafond-de-la-machine.mjs';

const P = { budgetDe, partDe, reserveDe };
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

describe('la réservation de cœurs d’une passe, sans clé', () => {
  const M = 56 * GO;
  const budget28 = { coeurs: 28, memoire: M };
  const sans = (budget: { coeurs: number; memoire: number }, direct?: boolean) =>
    P.partDe({ declaree: null, budget, pic: undefined, ...(direct ? { direct } : {}) });

  it.each([28, 12, 8, 4, 3])(
    'sur un budget de %i cœurs, une passe ordinaire réserve 3 cœurs, sans division par les places',
    coeurs => {
      expect(sans({ coeurs, memoire: M }).coeurs).toBe(3);
    }
  );

  it('une séance direct réserve la part d’une autre séance, sans part fixe', () => {
    expect(sans(budget28, true)).toEqual(sans(budget28));
    const declaree = { coeurs: 6 };
    expect(P.partDe({ declaree, budget: budget28, pic: undefined, direct: true })).toEqual(
      P.partDe({ declaree, budget: budget28, pic: undefined })
    );
  });

  it('une réservation plus grande que le budget vaut le budget, jamais moins d’un cœur', () => {
    expect(sans({ coeurs: 2, memoire: 8 * GO }).coeurs).toBe(2);
    expect(sans({ coeurs: 1, memoire: 8 * GO }).coeurs).toBe(1);
    expect(sans({ coeurs: 1, memoire: 8 * GO }, true).coeurs).toBe(1);
  });

  it('la mémoire vaut le plus grand pic mesuré plus un quart', () => {
    expect(P.partDe({ declaree: null, budget: budget28, pic: 24 * GO })).toEqual({
      coeurs: 3,
      memoire: 30 * GO,
    });
    expect(P.partDe({ declaree: null, budget: budget28, pic: 32 * GO }).memoire).toBe(40 * GO);
  });

  it('un pic sous le plancher ne baisse pas la mémoire : le tiers du budget reste', () => {
    const plancher = (M * 10) / 28;
    expect(P.partDe({ declaree: null, budget: budget28, pic: 16 * 1024 ** 2 }).memoire).toBe(
      plancher
    );
    expect(sans(budget28)).toEqual({ coeurs: 3, memoire: plancher });
  });

  it('la mémoire ne dépasse jamais la mémoire du budget', () => {
    expect(
      P.partDe({ declaree: null, budget: { coeurs: 28, memoire: 4 * GO }, pic: 40 * GO }).memoire
    ).toBe(4 * GO);
  });

  it('la division du budget par les places et le plancher de 4 cœurs ne sont plus publiés', () => {
    expect(Object.keys(plafond)).not.toContain('partParDefautDe');
    expect(Object.keys(plafond)).not.toContain('MIN_COEURS_DE_LA_PART');
  });
});

describe('la part d’une passe, déclarée ou par défaut', () => {
  const budget = { coeurs: 8, memoire: 16 * GO };

  it('une part déclarée en entier est reprise telle quelle quand elle tient', () => {
    expect(P.partDe({ declaree: { coeurs: 2, memoire: 3 * GO }, budget, pic: 9 * GO })).toEqual({
      coeurs: 2,
      memoire: 3 * GO,
    });
  });

  it('des cœurs seuls déclarés gardent la mémoire du plus grand pic plus un quart', () => {
    expect(P.partDe({ declaree: { coeurs: 6 }, budget, pic: 10 * GO })).toEqual({
      coeurs: 6,
      memoire: 12.5 * GO,
    });
  });

  it('une mémoire seule déclarée garde les 3 cœurs par défaut', () => {
    expect(P.partDe({ declaree: { memoire: 3 * GO }, budget, pic: 9 * GO })).toEqual({
      coeurs: 3,
      memoire: 3 * GO,
    });
  });

  it('une part plus grande que le budget vaut le budget', () => {
    expect(
      P.partDe({ declaree: { coeurs: 20, memoire: 64 * GO }, budget, pic: undefined })
    ).toEqual(budget);
  });

  it('une part ne descend jamais sous un cœur', () => {
    expect(P.partDe({ declaree: { coeurs: 0, memoire: GO }, budget, pic: undefined }).coeurs).toBe(
      1
    );
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
