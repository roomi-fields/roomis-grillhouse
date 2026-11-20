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
  const M = 56 * GO;

  it.each([
    [28, 7, 4],
    [28, 3, 9],
    [12, 3, 4],
    [30, 7, 4],
    [10, 7, 2],
    [4, 7, 2],
    [28, 1, 28],
    [16, 2, 8],
  ])(
    'sur un budget de %i cœurs et %i places, les cœurs valent la division entière, 2 au moins : %i',
    (coeurs, places, attendu) => {
      expect(P.partParDefautDe({ coeurs, memoire: M }, places, undefined).coeurs).toBe(attendu);
    }
  );

  it('ne dépasse jamais le budget en cœurs, ni ne descend sous un cœur', () => {
    expect(P.partParDefautDe({ coeurs: 2, memoire: 8 * GO }, 7, undefined).coeurs).toBe(2);
    expect(P.partParDefautDe({ coeurs: 1, memoire: 8 * GO }, 7, undefined).coeurs).toBe(1);
  });

  it('la mémoire vaut le plus grand pic mesuré plus un quart, et ne suit pas la division', () => {
    const p = P.partParDefautDe({ coeurs: 28, memoire: M }, 7, 4 * GO);
    expect(p).toEqual({ coeurs: 4, memoire: 5 * GO });
  });

  it('la mémoire d’un autre pic suit ce pic', () => {
    expect(P.partParDefautDe({ coeurs: 28, memoire: M }, 7, 5.6 * GO).memoire).toBeCloseTo(
      7 * GO,
      -3
    );
  });

  it('sans pic mesuré, la mémoire est le tiers du budget, indépendante de la division par les places', () => {
    expect(P.partParDefautDe({ coeurs: 28, memoire: M }, 7, undefined)).toEqual({
      coeurs: 4,
      memoire: (M * 10) / 28,
    });
    expect(P.partParDefautDe({ coeurs: 28, memoire: M }, 2, undefined).memoire).toBe((M * 10) / 28);
  });

  it('la mémoire ne dépasse jamais la mémoire du budget', () => {
    expect(P.partParDefautDe({ coeurs: 28, memoire: 4 * GO }, 7, 40 * GO).memoire).toBe(4 * GO);
  });
});

describe('la part d’une passe, déclarée ou par défaut', () => {
  const budget = { coeurs: 8, memoire: 16 * GO };
  const places = 2;

  it('sans déclaration, la part est celle par défaut', () => {
    expect(P.partDe({ declaree: null, budget, places, pic: 2 * GO })).toEqual(
      P.partParDefautDe(budget, places, 2 * GO)
    );
  });

  it('une part déclarée en entier est reprise telle quelle quand elle tient', () => {
    expect(
      P.partDe({ declaree: { coeurs: 2, memoire: 3 * GO }, budget, places, pic: 9 * GO })
    ).toEqual({ coeurs: 2, memoire: 3 * GO });
  });

  it('des cœurs seuls déclarés gardent la mémoire du plus grand pic plus un quart', () => {
    expect(P.partDe({ declaree: { coeurs: 6 }, budget, places, pic: 2 * GO })).toEqual({
      coeurs: 6,
      memoire: 2.5 * GO,
    });
  });

  it('des cœurs seuls déclarés, sans pic mesuré, gardent la mémoire par défaut, le tiers du budget', () => {
    expect(P.partDe({ declaree: { coeurs: 6 }, budget, places, pic: undefined })).toEqual({
      coeurs: 6,
      memoire: 8 * GO,
    });
  });

  it('une mémoire seule déclarée garde les cœurs par défaut, le budget divisé par les places', () => {
    expect(P.partDe({ declaree: { memoire: 3 * GO }, budget, places, pic: 9 * GO })).toEqual({
      coeurs: 4,
      memoire: 3 * GO,
    });
  });

  it('une part plus grande que le budget vaut le budget', () => {
    expect(
      P.partDe({ declaree: { coeurs: 20, memoire: 64 * GO }, budget, places, pic: undefined })
    ).toEqual(budget);
  });

  it('une part ne descend jamais sous un cœur', () => {
    expect(
      P.partDe({ declaree: { coeurs: 0, memoire: GO }, budget, places, pic: undefined }).coeurs
    ).toBe(1);
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
