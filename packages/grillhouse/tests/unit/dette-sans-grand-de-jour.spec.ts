// The debt of the sizes of tests keeps no large test of the day: each one that was inscribed has
// left the day (moved to a night file of packages/grillhouse-essais, or rewritten small), and no
// new finding enters. The debt is the file `grillhouse-dette.json` at the root, which the circuit
// regenerates from the guard of the sizes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DETTE = path.resolve(__dirname, '../../../../grillhouse-dette.json');

describe('the debt of the sizes of tests', () => {
  const dette = JSON.parse(readFileSync(DETTE, 'utf8')) as Record<
    string,
    Record<string, Record<string, unknown>>
  >;
  it('keeps no finding of a large test of the day', () => {
    const grands = Object.entries(dette['tailles-des-tests'] ?? {})
      .filter(([, regles]) => 'grand-de-jour' in regles)
      .map(([fichier]) => fichier);
    expect(grands).toEqual([]);
  });
});
