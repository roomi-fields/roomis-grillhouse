// The trial server of Temporal whose port is refused (./port-d-essai.ts, `apresUnRefus`, which
// `demarrerLeServeur` of ./essai.ts follows): a first start takes another port, a restart on a base
// already served keeps its port, and the starts are counted in all.
import { describe, expect, it } from 'vitest';
import { apresUnRefus, type SuiteDUnRefus } from './port-d-essai.js';

// The starts of a server whose port is always refused, of <essais> in all: what follows each.
function suites(servie: boolean, essais: number): SuiteDUnRefus[] {
  const out: SuiteDUnRefus[] = [];
  for (let essai = 1; out.at(-1) !== 'echec'; essai++) {
    out.push(apresUnRefus({ servie, essai, essais }));
  }
  return out;
}

describe('le port du serveur d’essai refusé', () => {
  it('un premier démarrage prend un autre port à chaque refus, cinq démarrages en tout, donc quatre autres ports', () => {
    expect(suites(false, 5)).toEqual([
      'autre-port',
      'autre-port',
      'autre-port',
      'autre-port',
      'echec',
    ]);
  });

  it('un redémarrage sur une base déjà servie retente le même port, où sont ses clients', () => {
    expect(suites(true, 5)).toEqual(['meme-port', 'meme-port', 'meme-port', 'meme-port', 'echec']);
  });

  it('un seul démarrage permis échoue au premier refus', () => {
    expect(suites(false, 1)).toEqual(['echec']);
    expect(suites(true, 1)).toEqual(['echec']);
  });
});
