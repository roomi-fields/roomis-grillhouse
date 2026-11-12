// Une question qu'on ne tranche que plus tard se reporte (`grillhouse circuit <ticket> --reporter
// <heure>`, src/temporal/circuit/appel.ts) : le ticket est reporté (`bd update --defer`), le circuit
// reste en attente, et la question se tait jusqu'à l'heure dans l'attente, le crochet d'arrêt et
// l'ouverture (`horsAttente` de scripts/superviseur.mjs), comme le report d'une revue. Un test petit.
import { describe, expect, it } from 'vitest';
import { Usage, lireLAppel } from '../../src/temporal/circuit/appel.js';
import { horsAttente } from '../../scripts/superviseur.mjs';
import { lesReponses } from '../../scripts/reponses-du-circuit.mjs';

describe('la réponse --reporter', () => {
  it('reads the hour of the deferral, with its motive', () => {
    expect(lireLAppel(['essai-1', '--reporter', '+6h', '--contexte', 'ce soir'])).toMatchObject({
      ticket: 'essai-1',
      reporter: '+6h',
      contexte: 'ce soir',
      reprendre: false,
      arreter: false,
    });
    expect(lireLAppel(['essai-1', '--reprendre'])).toMatchObject({ reporter: null });
  });

  it('refuses a deferral without its hour, or beside another answer', () => {
    expect(() => lireLAppel(['essai-1', '--reporter'])).toThrow(Usage);
    expect(() => lireLAppel(['essai-1', '--reporter', '--reprendre'])).toThrow(Usage);
    for (const autre of [['--reprendre'], ['--arreter'], ['--etendre', 'a'], ['--recommencer']]) {
      expect(() => lireLAppel(['essai-1', '--reporter', '+1h', ...autre]), autre[0]).toThrow(Usage);
    }
  });

  it('is among the answers a waiting circuit accepts', () => {
    expect(lesReponses('essai-1', 'RUNNING', true)).toContain('--reporter <heure>');
  });
});

describe('la question d’un ticket reporté', () => {
  const maintenant = Date.parse('2026-11-12T12:00:00Z');
  it('keeps quiet before its hour, as a closed ticket', () => {
    const hors = horsAttente(
      [
        { id: 'a', status: 'open', defer_until: '2026-11-12T23:00:00Z' },
        { id: 'b', status: 'closed' },
      ],
      maintenant
    );
    expect([...hors].sort()).toEqual(['a', 'b']);
  });

  it('goes up again once its hour has passed, as an open ticket', () => {
    const hors = horsAttente(
      [
        { id: 'a', status: 'open', defer_until: '2026-11-12T08:00:00Z' },
        { id: 'c', status: 'in_progress' },
      ],
      maintenant
    );
    expect([...hors]).toEqual([]);
  });
});
