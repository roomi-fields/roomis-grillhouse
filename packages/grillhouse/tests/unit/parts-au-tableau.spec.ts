// Les parts au tableau (scripts/tableau.mjs) : le budget pris (passes en cours, cœurs et
// mémoire réservés sur le total), qui tient une part, qui attend quoi.
import { describe, expect, it } from 'vitest';
import { lignesDesParts } from '../../scripts/tableau.mjs';

const GO = 1024 ** 3;
const budget = { coeurs: 8, memoire: 16 * GO };
const tient = (id: string, ticket: string, projet: string, coeurs: number, memoireGo: number) => ({
  id,
  ticket,
  projet,
  sorte: 'Vérification',
  coeurs,
  memoire: memoireGo * GO,
});

describe('le budget pris, dit au tableau', () => {
  it('sans passe, dit un budget libre sur le total', () => {
    const [tete] = lignesDesParts({ budget, prises: [], attentes: [] });
    expect(tete).toMatch(/0 passe/);
    expect(tete).toMatch(/0 sur 8 cœurs/);
    expect(tete).toMatch(/0 sur 16 Go/);
  });

  it('compte les passes en cours, les cœurs et la mémoire réservés sur le total', () => {
    const [tete] = lignesDesParts({
      budget,
      prises: [tient('a', 'gh-1', 'demo', 4, 8), tient('b', 'gh-2', 'autre', 2, 3)],
      attentes: [],
    });
    expect(tete).toMatch(/2 passes/);
    expect(tete).toMatch(/6 sur 8 cœurs/);
    expect(tete).toMatch(/11 sur 16 Go/);
  });

  it('nomme qui tient une part : son projet, son ticket et sa part', () => {
    const lignes = lignesDesParts({
      budget,
      prises: [tient('a', 'gh-1', 'demo', 4, 8)],
      attentes: [],
    });
    const l = lignes.find(x => x.includes('gh-1'));
    expect(l).toBeDefined();
    expect(l).toContain('demo');
    expect(l).toMatch(/4 cœurs/);
  });

  it('nomme qui attend, et quoi', () => {
    const lignes = lignesDesParts({
      budget,
      prises: [tient('a', 'gh-1', 'demo', 6, 8)],
      attentes: [
        {
          id: 'b',
          ticket: 'gh-2',
          projet: 'autre',
          sorte: 'Nuit',
          rang: 2,
          raison: 'cœurs : 8 demandés, 2 libres sur 8',
        },
      ],
    });
    const l = lignes.find(x => x.includes('gh-2'));
    expect(l).toBeDefined();
    expect(l).toContain('autre');
    expect(l).toContain('cœurs : 8 demandés, 2 libres sur 8');
  });

  it('une passe qui attend ne compte pas dans le budget pris', () => {
    const [tete] = lignesDesParts({
      budget,
      prises: [],
      attentes: [{ id: 'b', ticket: 'gh-2', projet: 'autre', sorte: 'Nuit', rang: 2, raison: 'x' }],
    });
    expect(tete).toMatch(/0 passe/);
  });

  it('une passe qui consomme nettement plus que sa part est dite à la ligne de sa part', () => {
    const lignes = lignesDesParts({
      budget,
      prises: [{ ...tient('a', 'gh-1', 'demo', 4, 8), depasse: 'cœurs : 7,5 mesurés pour 4' }],
      attentes: [],
    });
    expect(lignes.find(x => x.includes('gh-1'))).toContain('cœurs : 7,5 mesurés pour 4');
  });
});
