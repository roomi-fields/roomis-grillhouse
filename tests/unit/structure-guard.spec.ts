import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Ticket grillhouse-3uv.31, critère 5: the structure guard (UserPromptSubmit hook) knows « étage »
// and « étages », with or without the accent, as structure nouns, as it knows « couche »: a message
// asking a structure decision about them is reminded that it goes through the grill.
const GARDE = path.resolve(__dirname, '../../scripts/structure-guard.sh');
const rappel = (prompt: string) => {
  const r = spawnSync('bash', [GARDE], { input: JSON.stringify({ prompt }), encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.includes('## Décision de structure');
};

describe('the structure guard and its structure nouns', () => {
  it('critère 5 — « couche », the reference: a decision about it is reminded', () => {
    expect(rappel('faut-il découper cette couche ?')).toBe(true);
  });
  it('critère 5 — « étage » and « étages », with the accent, are structure nouns', () => {
    expect(rappel('faut-il découper cet étage ?')).toBe(true);
    expect(rappel('on sépare les deux étages du compilateur')).toBe(true);
    expect(rappel('doit-on fusionner les étages natif et web ?')).toBe(true);
  });
  it('critère 5 — « etage » and « etages », without the accent, are structure nouns', () => {
    expect(rappel('faut-il scinder cet etage ?')).toBe(true);
    expect(rappel('should we merge the etages')).toBe(true);
    expect(rappel('extraire un etage de rendu')).toBe(true);
  });
  it('critère 5 — « étage » without a decision stays silent, as « couche » does', () => {
    expect(rappel('le deuxième étage compile le natif')).toBe(false);
    expect(rappel('la couche réseau compile')).toBe(false);
  });
});
