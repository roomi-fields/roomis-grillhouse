// The memory the workflow of a ticket keeps from one act of the circuit to the next
// (scripts/faits-du-circuit.mjs): each act plays in a process of its own, so what the opening reads
// of the project's package.json (its tools, its data, its generated files) and the supervisor's
// context reach the later acts by it alone, and a context the act is given is kept over it.
import { describe, expect, it } from 'vitest';
import { laMemoire, laMemoireReprise } from '../../scripts/faits-du-circuit.mjs';

const OUTILS = { TEMPORAL: '/opt/temporal' };

describe('la mémoire d’un acte du circuit', () => {
  it('keeps the tools, the data, the generated files and the context, and not the flows of the CI', () => {
    const memoire = laMemoire({
      outils: OUTILS,
      donnees: ['data/*.json'],
      engendres: [{ nom: 'index' }],
      contexte: 'le contexte du superviseur',
      flux: { ci: ['packages/a'] },
      base: { dossier: '/tmp/base' },
    }) as Record<string, unknown>;
    expect(memoire).toMatchObject({
      outils: OUTILS,
      donnees: ['data/*.json'],
      engendres: [{ nom: 'index' }],
      contexte: 'le contexte du superviseur',
    });
    expect(memoire).not.toHaveProperty('flux');
    expect(memoire).not.toHaveProperty('base');
  });

  it('a later act takes the tools back, and keeps the context it is given over the kept one', () => {
    const memoire = laMemoire({ outils: OUTILS, contexte: 'gardé' });
    expect(laMemoireReprise(memoire, { contexte: 'donné' })).toMatchObject({ outils: OUTILS });
    expect(laMemoireReprise(memoire, { contexte: 'donné' })).not.toHaveProperty('contexte');
    expect(laMemoireReprise(memoire)).toMatchObject({ outils: OUTILS, contexte: 'gardé' });
  });
});
