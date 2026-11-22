// Les arrêts du circuit et son délai d'immobilité (scripts/circuit.mjs) : une séance dont le
// transcript ne bouge plus pendant 20 minutes est arrêtée, et l'en-tête du circuit nomme chaque
// arrêt avec son code. Un test petit : une valeur exportée et la lecture d'un fichier.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARRETS, IMMOBILE_MS } from '../../scripts/circuit.mjs';

const CIRCUIT = path.resolve(__dirname, '../../scripts/circuit.mjs');

describe('le circuit arrête une séance immobile', () => {
  it('attend 20 minutes d’un transcript immobile avant d’arrêter une séance', () => {
    expect(IMMOBILE_MS).toBe(20 * 60 * 1000);
  });
});

describe('l’en-tête du circuit', () => {
  it('nomme chaque arrêt et son code', () => {
    const entete = readFileSync(CIRCUIT, 'utf8').split('\nimport ')[0]!;
    const arrets = Object.entries(ARRETS as Record<string, number>);
    expect(arrets.length).toBeGreaterThan(0);
    for (const [nom, code] of arrets) {
      expect(entete, nom).toContain(nom);
      expect(entete, nom).toContain(String(code));
    }
  });
});
