import { describe, expect, it } from 'vitest';

import { couvre } from '../src/regle-de-permission.js';

// The shared matter's rule matcher (docs/INTERFACE.md, `couvre`): `*` any text, a final ` *` also nothing.
describe('couvre (matière de test partagée)', () => {
  it('une règle sans Bash() ne couvre que l’appel identique', () => {
    expect(couvre('Read', 'Read')).toBe(true);
    expect(couvre('Read', 'Write')).toBe(false);
  });

  it('un « * » final couvre la commande seule et ses arguments, pas un autre mot', () => {
    expect(couvre('Bash(git status *)', 'git status')).toBe(true);
    expect(couvre('Bash(git status *)', 'git status -s')).toBe(true);
    expect(couvre('Bash(git status *)', 'git statuses')).toBe(false);
  });

  it('les caractères spéciaux d’un motif se lisent à la lettre', () => {
    expect(couvre('Bash(npm run a.b)', 'npm run a.b')).toBe(true);
    expect(couvre('Bash(npm run a.b)', 'npm run axb')).toBe(false);
  });
});
