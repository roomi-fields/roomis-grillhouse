// `verifier --base <commit>` (scripts/langages/typescript/verifier.mjs): the options of the pass are
// read by `lireLesDemandes`, which publishes what the pass needs: the guards alone, the complete
// pass, the base, and the arguments left to the tasks. The base belongs to `verifier` alone: it
// is never an argument of a task, and the guards alone do not read it.
//
// Small tests: the reading of the options, without a repository or a process.
import { describe, expect, it } from 'vitest';
import * as verifier from '../../../../scripts/langages/typescript/verifier.mjs';

type Demandes = { gardesSeules: boolean; tout: boolean; base?: string; args: string[] };
const lireLesDemandes = (demandes: string[]) =>
  (verifier as unknown as { lireLesDemandes: (d: string[]) => Demandes }).lireLesDemandes(demandes);

describe('the option --base of verifier', () => {
  it('reads --base <commit> and leaves it out of the arguments of the tasks', () => {
    const d = lireLesDemandes(['--base', 'abc1234', '--filter=a']);
    expect(d.base).toBe('abc1234');
    expect(d.args).toEqual(['--filter=a']);
  });

  it('reads --base=<commit> and leaves it out of the arguments of the tasks', () => {
    const d = lireLesDemandes(['--base=abc1234']);
    expect(d.base).toBe('abc1234');
    expect(d.args).toEqual([]);
  });

  it('reads no base when none is given', () => {
    const d = lireLesDemandes(['--filter=a']);
    expect(d.base).toBeUndefined();
    expect(d.args).toEqual(['--filter=a']);
  });

  it('reads --base alone as a base without a value, left out of the arguments', () => {
    const d = lireLesDemandes(['--base']);
    expect(d.base).toBe('');
    expect(d.args).toEqual([]);
  });

  it('reads --base followed by another option as a base without a value', () => {
    const d = lireLesDemandes(['--base', '--tout']);
    expect(d.base).toBe('');
    expect(d.tout).toBe(true);
    expect(d.args).toEqual([]);
  });

  it('reads --base= as a base without a value', () => {
    const d = lireLesDemandes(['--base=']);
    expect(d.base).toBe('');
    expect(d.args).toEqual([]);
  });

  it('keeps --tout and --gardes as before, with or without a base', () => {
    expect(lireLesDemandes(['--tout']).tout).toBe(true);
    expect(lireLesDemandes(['--force']).tout).toBe(true);
    expect(lireLesDemandes(['--gardes']).gardesSeules).toBe(true);
    expect(lireLesDemandes(['--tout', '--base', 'abc1234']).tout).toBe(true);
  });

  it('does not read the base with --gardes: the guards alone measure nothing', () => {
    const d = lireLesDemandes(['--gardes', '--base', 'abc1234']);
    expect(d.gardesSeules).toBe(true);
    expect(d.base).toBeUndefined();
    expect(d.args).toEqual([]);
  });
});
