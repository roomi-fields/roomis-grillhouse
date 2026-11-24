// The lines an act writes on its output (src/temporal/acte.ts `lecteurDeLignes`): a character of
// several bytes cut between two chunks of the pipe comes out whole, as a long value (95 Ko) crosses
// the pipe in chunks of 64 Ko.
import { describe, expect, it } from 'vitest';
import { lecteurDeLignes } from '../../src/temporal/acte.js';

describe('le lecteur des lignes de la sortie d’un acte', () => {
  it('un caractère de plusieurs octets coupé entre deux morceaux sort intact', () => {
    const ligne = `resultat ${JSON.stringify({ texte: 'un dépôt ou un projet d’essai — 日本' })}`;
    const octets = Buffer.from(`${ligne}\n`);
    // Every cut of the bytes, the one inside « ô » included.
    for (let coupe = 1; coupe < octets.length; coupe++) {
      const lues: string[] = [];
      const lecteur = lecteurDeLignes(l => lues.push(l));
      lecteur.ecrire(octets.subarray(0, coupe));
      lecteur.ecrire(octets.subarray(coupe));
      lecteur.fin();
      expect(lues).toEqual([ligne]);
    }
  });

  it('une ligne en deux morceaux se joint, la dernière sans retour de ligne sort à la fin', () => {
    const lues: string[] = [];
    const lecteur = lecteurDeLignes(l => lues.push(l));
    lecteur.ecrire(Buffer.from('vie 1\nres'));
    lecteur.ecrire(Buffer.from('ultat 2'));
    expect(lues).toEqual(['vie 1']);
    lecteur.fin();
    expect(lues).toEqual(['vie 1', 'resultat 2']);
  });
});
