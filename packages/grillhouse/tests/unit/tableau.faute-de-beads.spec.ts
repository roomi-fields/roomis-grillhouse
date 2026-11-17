// The board's alert « Tickets illisibles » (scripts/tableau.mjs) says the fault of Beads: the
// command `bd` missing from the PATH with its gesture, any other fault by its first line.
//
// Small tests: the fault of a call, without a process.
import { describe, expect, it } from 'vitest';
import { fauteDeBeads } from '../../scripts/tableau.mjs';

describe('la faute de Beads que dit le panneau', () => {
  it('a missing command says the gesture, not the error of the system', () => {
    const e = Object.assign(new Error('spawnSync bd ENOENT'), { code: 'ENOENT' });
    const faute = fauteDeBeads(e);
    expect(faute).toContain('la commande bd est absente du PATH');
    expect(faute).toContain('npm install -g @beads/bd');
    expect(faute).not.toContain('ENOENT');
  });

  it('another fault keeps the first line of its error output', () => {
    const e = Object.assign(new Error('Command failed'), {
      stderr: 'Error: no beads database found\nrun bd init',
    });
    expect(fauteDeBeads(e)).toBe('Error: no beads database found');
  });

  it('a fault without error output keeps the first line of its message', () => {
    expect(fauteDeBeads(new Error('délai dépassé\nsuite'))).toBe('délai dépassé');
  });
});
