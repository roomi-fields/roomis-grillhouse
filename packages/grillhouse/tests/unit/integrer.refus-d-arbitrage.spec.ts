// The one rule of the label `arbitrage` (scripts/integration/integrer.mjs, `refusArbitrage`): a
// ticket labelled `arbitrage` holds a « ## Arbitrage » comment, and each one is settled or answered
// by the owner. The integration plays it after the verdict, the circuit at its launch and at each
// resumption.
import { describe, expect, it } from 'vitest';
import { refusArbitrage } from '../../scripts/integration/integrer.mjs';

const refus = refusArbitrage as (
  ticket: { id: string; labels?: string[] },
  comments: { author?: string; text: string }[]
) => string | null;

const ARBITRE = { id: 'demo-1', labels: ['arbitrage'] };
const OUVERT = '## Arbitrage — la mesure\n\n### Verdict — monte au responsable\n';
const TRANCHE = '## Arbitrage — la mesure\n\n### Verdict — tranché\n';
const REPONSE = '## Réponse du responsable — la mesure\n\nLa mesure double.\n';

describe('le refus d’un ticket étiqueté arbitrage', () => {
  it('refuse un ticket étiqueté arbitrage sans commentaire « Arbitrage »', () => {
    expect(refus(ARBITRE, [{ text: 'une passation' }])).toBe(
      'demo-1 est étiqueté arbitrage sans commentaire « Arbitrage ».'
    );
    expect(refus(ARBITRE, [])).toMatch(/est étiqueté arbitrage sans commentaire « Arbitrage »/);
  });

  it('refuse un arbitrage resté ouvert, ni tranché ni répondu, en le nommant', () => {
    expect(refus(ARBITRE, [{ text: OUVERT }])).toBe(
      "demo-1 : « ## Arbitrage — la mesure » n'est ni tranché ni répondu par le responsable."
    );
  });

  it('accepte un arbitrage tranché, ou répondu par le responsable après lui', () => {
    expect(refus(ARBITRE, [{ text: TRANCHE }])).toBeNull();
    expect(refus(ARBITRE, [{ text: OUVERT }, { text: REPONSE }])).toBeNull();
  });

  it('refuse un arbitrage dont la réponse du responsable vient avant lui', () => {
    expect(refus(ARBITRE, [{ text: REPONSE }, { text: OUVERT }])).toMatch(
      /n'est ni tranché ni répondu/
    );
  });

  it('refuse tant qu’un seul des arbitrages reste ouvert', () => {
    expect(refus(ARBITRE, [{ text: TRANCHE }, { text: OUVERT }])).toMatch(
      /n'est ni tranché ni répondu/
    );
  });

  it('ne demande rien à un ticket sans l’étiquette', () => {
    expect(refus({ id: 'demo-1', labels: ['circuit'] }, [])).toBeNull();
    expect(refus({ id: 'demo-1' }, [{ text: OUVERT }])).toBeNull();
  });
});
