/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// grillhouse-9kq — les places de la machine (scripts/places-de-la-machine.mjs) : un nombre fixe de
// places pour toute la machine, comme les exécuteurs de Jenkins et le serveur de tâches de GNU
// make ; une admission à la charge, comme `make -l` (un départ seulement sous la charge des cœurs,
// avec 4 Go de mémoire libres). Les places vivent sur le serveur Temporal (grillhouse-4nr.12) :
// leur prise, leur attente et leur rang se jouent avec un serveur d'essai
// (tests/temporal/places-de-la-machine.spec.ts) ; ce fichier joue ce qui se juge sans serveur : le
// plafond, les travailleurs, l'admission, et les lieux où aucune place ne se prend.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const MODULE = path.resolve(__dirname, '../../scripts/places-de-la-machine.mjs');
const GO = 1024 ** 3;
// Le module se charge à l'appel : s'il manque, chaque test échoue seul, au lieu du fichier entier.
/* eslint-disable @typescript-eslint/no-explicit-any */
const charger = (): any => createRequire(path.join(__dirname, 'x.cjs'))(MODULE);
// The rule of the admission, which the places and the workflow of the machine share.
const REGLES = path.resolve(__dirname, '../../scripts/regles-des-places.mjs');
const admission = (...a: any[]) =>
  createRequire(path.join(__dirname, 'x.cjs'))(REGLES).admission(...a);
const lirePlaces = (...a: any[]) => charger().lirePlaces(...a);
const plafondDe = (...a: any[]) => charger().plafondDe(...a);
const prendreUnePlace = (...a: any[]) => charger().prendreUnePlace(...a);
const prendreUnRang = (...a: any[]) => charger().prendreUnRang(...a);
const travailleursDe = (...a: any[]) => charger().travailleursDe(...a);
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('grillhouse-9kq critère 12 — le plafond : 3 par défaut, réglé par une variable d’environnement', () => {
  it('3 places sans variable', () => {
    expect(plafondDe({})).toBe(3);
  });

  it('GRILLHOUSE_PLACES règle le plafond', () => {
    expect(plafondDe({ GRILLHOUSE_PLACES: '5' })).toBe(5);
    expect(plafondDe({ GRILLHOUSE_PLACES: '1' })).toBe(1);
  });

  it.each(['abc', '0', '-2', '1.5', '3 places'])(
    'la valeur fautive « %s » est refusée par le nom de la variable',
    valeur => {
      expect(() => plafondDe({ GRILLHOUSE_PLACES: valeur })).toThrow(/GRILLHOUSE_PLACES/);
    }
  );
});

describe('grillhouse-9kq critères 5 et 17 — le nombre de travailleurs vaut max(1, cœurs ÷ places)', () => {
  it('12 cœurs, 3 places : 4 travailleurs', () => {
    expect(travailleursDe({ coeurs: 12, places: 3 })).toBe(4);
  });

  it('la division est entière : 12 cœurs, 5 places : 2', () => {
    expect(travailleursDe({ coeurs: 12, places: 5 })).toBe(2);
  });

  it('jamais moins de 1 : 2 cœurs, 3 places : 1', () => {
    expect(travailleursDe({ coeurs: 2, places: 3 })).toBe(1);
  });

  it('une seule place garde tous les cœurs', () => {
    expect(travailleursDe({ coeurs: 12, places: 1 })).toBe(12);
  });
});

describe('grillhouse-9kq critères 3 et 16 — l’admission à la charge, comme make -l', () => {
  const base = { coeurs: 12, charge: 3, memoireLibre: 16 * GO };

  it('sous la charge des cœurs, avec 4 Go libres : admis', () => {
    expect(admission(base)).toEqual({ ok: true });
  });

  it('la charge qui atteint le nombre de cœurs refuse, et dit « charge »', () => {
    const r = admission({ ...base, charge: 12 });
    expect(r.ok).toBe(false);
    expect(r.raison).toMatch(/charge/);
    expect(r.raison).toMatch(/12/);
  });

  it('une charge juste sous les cœurs passe', () => {
    expect(admission({ ...base, charge: 11.9 }).ok).toBe(true);
  });

  it('moins de 4 Go libres refuse, et dit « mémoire »', () => {
    const r = admission({ ...base, memoireLibre: 4 * GO - 1 });
    expect(r.ok).toBe(false);
    expect(r.raison).toMatch(/mémoire/);
  });

  it('4 Go libres exactement passent', () => {
    expect(admission({ ...base, memoireLibre: 4 * GO }).ok).toBe(true);
  });
});

// La CI n'a pas de serveur ; une machine d'essai sans le sien ne touche pas aux places de la
// machine de l'utilisateur ; une passe jouée sous une place tenue n'en prend pas une seconde.
describe('aucune place ne se prend là où le serveur n’est pas celui des places', () => {
  const lieux: [string, Record<string, string>][] = [
    ['la CI', { CI: 'true' }],
    ['une machine d’essai sans son serveur', { GRILLHOUSE_VERROU_MACHINE: '/tmp/essai.lock' }],
    ['une place déjà tenue', { GRILLHOUSE_PLACE_TENUE: 'une-place' }],
    // The place of the session, taken out of the envelope, covers its commands.
    [
      'l’enveloppe d’un agent',
      { GRILLHOUSE_ENVELOPPE: 'packages/a', TEMPORAL_ADDRESS: '127.0.0.1:1' },
    ],
  ];
  it.each(lieux)('%s : la place rendue ne tient rien, et aucun serveur n’est lu', (_, env) => {
    const place = prendreUnePlace({ env, ticket: 'demo-1', rang: 4, dire: () => {} });
    expect(place).toMatchObject({ id: null, rang: 4 });
    expect(place.env).toEqual(env);
    expect(() => place.rendre()).not.toThrow();
  });
  it('la CI, la machine d’essai sans serveur et l’enveloppe : ni rang, ni places lues', () => {
    for (const [, env] of [...lieux.slice(0, 2), lieux[3]!]) {
      expect(prendreUnRang({ env })).toBeNull();
      expect(lirePlaces({ env: { ...env, GRILLHOUSE_PLACES: '2' } })).toEqual({
        plafond: 2,
        prises: [],
        attentes: [],
      });
    }
  });
});
