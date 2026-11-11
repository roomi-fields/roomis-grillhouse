// The tranche of a pass in each language (`verifier --tranche i/n`): the task of tests of a package
// reads it from the variable of the tests (`cheminsDeLaTache`, scripts/taches-du-graphe.mjs); cargo
// passes nextest its own split, and what a tool cannot split plays in the first tranche alone, so
// each test plays once in the union of the tranches.
//
// Small tests: the functions, by import, without a process.
import { describe, expect, it } from 'vitest';
import {
  cheminsDeLaTache,
  joueCeQuiNeSeDivisePas,
  TESTS_CIBLES,
} from '../../scripts/taches-du-graphe.mjs';
import { partitionDeNextest } from '../../scripts/langages/cargo/commandes.mjs';

const RACINE = '/depot';
const lire = (variable: unknown) =>
  cheminsDeLaTache({
    racine: RACINE,
    donnes: ['crates/a'],
    env: variable === undefined ? {} : { [TESTS_CIBLES]: JSON.stringify(variable) },
    dossierDe: () => '/depot/crates/a',
  });

describe('the tranche the task of tests of a package reads', () => {
  it('is the tranche the variable of the tests carries', () => {
    expect(lire({ arguments: [], tranche: '2/3', rapports: '/r' }).tranche).toEqual({
      index: 2,
      count: 3,
    });
  });

  it('is none without a tranche, or with one not of the form i/n', () => {
    expect(lire(undefined).tranche).toBeNull();
    expect(lire({ arguments: [] }).tranche).toBeNull();
    expect(lire({ arguments: [], tranche: '4/3' }).tranche).toBeNull();
  });

  it('leaves the paths and the options as they are', () => {
    const r = lire({ arguments: ['--x'], tranche: '1/2' });
    expect(r.chemins).toEqual(['crates/a']);
    expect(r.options).toEqual(['--x']);
  });
});

describe('the tests a tool cannot split', () => {
  it('play in a pass without a tranche, and in the first tranche alone', () => {
    expect(joueCeQuiNeSeDivisePas(null)).toBe(true);
    expect(joueCeQuiNeSeDivisePas({ index: 1, count: 3 })).toBe(true);
    expect(joueCeQuiNeSeDivisePas({ index: 2, count: 3 })).toBe(false);
    expect(joueCeQuiNeSeDivisePas({ index: 3, count: 3 })).toBe(false);
  });
});

describe('the tranche of nextest', () => {
  it('is its own split by hash, an empty part green', () => {
    expect(partitionDeNextest({ index: 2, count: 3 })).toEqual([
      '--partition',
      'hash:2/3',
      '--no-tests=warn',
    ]);
  });

  it('adds nothing without a tranche', () => {
    expect(partitionDeNextest(null)).toEqual([]);
  });
});
