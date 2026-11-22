// `ligneDEtape` (scripts/registre.mjs) : la ligne du registre d'une étape que le circuit mène
// lui-même (la preuve, les contrôles, l'intégration, la file), comme la ligne d'une séance : son
// rôle `circuit`, son étape, un tour, aucun jeton, pour que le tableau la compte au temps de
// travail du ticket. Des tests petits : la fonction seule.
import { describe, expect, it } from 'vitest';
import { ligneDEtape } from '../../scripts/registre.mjs';

interface Ligne {
  projet: string;
  agent: string;
  ticket: string;
  role: string;
  etape: string;
  debut: string;
  fin: string;
  travail: number;
  tours: [number, number][];
  jetons: number;
  cache: number;
  cout: number | null;
}
const ligne = ligneDEtape as (e: {
  projet: string;
  ticket: string;
  etape: string;
  debut: string;
  fin: string;
}) => Ligne;

const DEBUT = '2026-11-22T10:00:00.000Z';
const FIN = '2026-11-22T10:00:07.500Z';
const ETAPE = { projet: '/depot', ticket: 'demo-1', etape: 'preuve', debut: DEBUT, fin: FIN };

describe('la ligne du registre d’une étape du circuit', () => {
  it('porte le projet, le ticket, l’étape et le rôle `circuit`', () => {
    expect(ligne(ETAPE)).toMatchObject({
      projet: '/depot',
      ticket: 'demo-1',
      etape: 'preuve',
      role: 'circuit',
      debut: DEBUT,
      fin: FIN,
    });
  });

  it('compte un tour, du début à la fin, et son temps de travail', () => {
    const l = ligne(ETAPE);
    expect(l.travail).toBe(7500);
    expect(l.tours).toEqual([[Date.parse(DEBUT), Date.parse(FIN)]]);
  });

  it('ne compte aucun jeton ni aucun coût', () => {
    expect(ligne(ETAPE)).toMatchObject({ jetons: 0, cache: 0, cout: null });
  });

  it('un agent par étape : le tableau garde la dernière ligne de chaque agent', () => {
    const preuve = ligne(ETAPE);
    const controles = ligne({
      ...ETAPE,
      etape: 'controles',
      debut: FIN,
      fin: '2026-11-22T10:01:00.000Z',
    });
    expect(preuve.agent).toContain('demo-1');
    expect(preuve.agent).not.toBe(controles.agent);
  });

  it('ne nomme aucun composant', () => {
    expect(ligne(ETAPE)).not.toHaveProperty('composant');
  });
});
