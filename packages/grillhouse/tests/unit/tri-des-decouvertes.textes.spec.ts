// The commit the tri of the discoveries names, and the texts that say the tri: the common charter,
// the explorateur's skill, the supervisor's, the instruction of an agent and the circuit's
// document. The commit the tri names is the one the queue integrated for its ticket, read in the
// reason of its closure, never main's last, another ticket's once several circuits run.
//
// @lit mods/grillhouse/charte.md mods/grillhouse/charte/** mods/grillhouse/skills/**
// @lit packages/grillhouse/docs/architecture/circuit.md
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import { lireLaCharte } from './charte-entiere.js';

const commitIntegre = activites.commitIntegre as (raison: string | null) => string | null;

describe('le commit du tri des découvertes', () => {
  it('est le commit que la file nomme en fermant le ticket', () => {
    expect(commitIntegre('intégré : abc1234')).toBe('abc1234');
    expect(commitIntegre('intégré : abc1234 ; la CI verte')).toBe('abc1234');
  });

  it('n’est aucun commit pour une autre raison de fermeture, ou aucune', () => {
    expect(commitIntegre('découverte consignée')).toBeNull();
    expect(commitIntegre(null)).toBeNull();
    expect(commitIntegre('intégré : ')).toBeNull();
  });
});

describe('les textes qui disent le tri des découvertes', () => {
  const RACINE = path.resolve(__dirname, '../../../..');
  const lire = (f: string) => readFileSync(path.join(RACINE, f), 'utf8');

  it.each([
    'mods/grillhouse/charte.md',
    'mods/grillhouse/skills/explorateur/SKILL.md',
    'mods/grillhouse/skills/pitmaster/SKILL.md',
    'mods/grillhouse/skills/pitmaster/references/consigne-agent.md',
    'packages/grillhouse/docs/architecture/circuit.md',
  ])('%s nomme le tri des découvertes et ses verdicts', f => {
    // The common charter is read with the modules it imports.
    const t = f === 'mods/grillhouse/charte.md' ? lireLaCharte().entiere : lire(f);
    expect(t).toMatch(/[Tt]ri(age)? (des|of the) (découvertes|discoveries)/);
    for (const v of ['a-porter', 'non-confirmee']) {
      expect(t, v).toContain(v);
    }
  });

  it('le superviseur ne porte plus à la main les découvertes au responsable', () => {
    expect(lire('mods/grillhouse/skills/pitmaster/SKILL.md')).not.toMatch(
      /je monte au responsable celles qui\s+touchent un usage réel/
    );
  });
});
