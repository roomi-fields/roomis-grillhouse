import { describe, expect, it } from 'vitest';
import { constats } from '../../../../scripts/langages/typescript/code-mort.mjs';

const rapport = (issues: object[]) => JSON.stringify({ issues });

describe('the dead-code guard', () => {
  it('names each finding with its file', () => {
    const r = rapport([
      { file: 'src/a.ts', files: [{ name: 'src/a.ts' }], exports: [] },
      { file: 'src/b.ts', exports: [{ name: 'mort' }], types: [{ name: 'Vieux' }] },
      { file: 'package.json', dependencies: [{ name: 'zod' }] },
      { file: 'src/c.ts', duplicates: [[{ name: 'x' }, { name: 'y' }]] },
    ]);
    expect(constats(r)?.map(c => c.message)).toEqual([
      'src/a.ts : fichier sans appelant',
      'src/b.ts : export sans appelant — mort',
      'src/b.ts : type exporté sans appelant — Vieux',
      'package.json : dépendance sans usage — zod',
      'src/c.ts : export en double — x, y',
    ]);
  });
  it('keys each finding by its file and knip’s kind of issue', () => {
    const r = rapport([{ file: 'src/b.ts', exports: [{ name: 'mort' }] }]);
    expect(constats(r)).toEqual([
      { fichier: 'src/b.ts', regle: 'exports', message: 'src/b.ts : export sans appelant — mort' },
    ]);
  });
  it('finds nothing in a clean report', () => {
    expect(constats(rapport([]))).toEqual([]);
  });
  it('refuses a report that is not knip’s: an empty green is not a measure', () => {
    expect(constats('')).toBeNull();
    expect(constats('{"autre":1}')).toBeNull();
  });
});
