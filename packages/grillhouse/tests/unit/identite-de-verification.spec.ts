// grillhouse-6ay — la phase et le ticket d'une vérification, de son appelant au verrou de la machine.
// La nuit (scripts/nuit.sh) pose l'identité dans l'environnement de `npm run verifier`, « Nuit »
// sans ticket. La lecture par le verrou est dans
// tests/unit/verrou-de-machine.spec.ts, la ligne du panneau dans tests/unit/tableau-verrou.spec.ts.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../../..');
const NUIT = path.join(RACINE, 'packages/grillhouse/scripts/nuit.sh');

describe('grillhouse-6ay critères 2 et 9 — la nuit passe « Nuit », sans ticket', () => {
  it('critère 2 : la ligne de la passe complète de la nuit pose GRILLHOUSE_VERIFICATION_SORTE=Nuit et aucun ticket', () => {
    const lignes = readFileSync(NUIT, 'utf8')
      .split('\n')
      .filter(l => l.includes('run verifier'));
    const passe = lignes.find(l => l.includes('monter npm --prefix'));
    expect(passe).toBeDefined();
    expect(passe).toContain('GRILLHOUSE_VERIFICATION_SORTE=Nuit');
    expect(passe).not.toContain('GRILLHOUSE_VERIFICATION_TICKET');
  });
});
