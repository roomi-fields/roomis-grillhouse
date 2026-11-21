// La preuve du rouge reprise sur un rouge ne joue que des tests (scripts/activites.mjs,
// `testsDeLaReprise`) : le rouge d'une garde nomme ce qu'elle a trouvé, un document parmi (la ligne
// « Consommateurs » d'un INTERFACE.md), et la séance qui le corrige ne change aucun test. La preuve
// ne prend pas ce document pour un fichier de test qui « ne se charge pas » : il ne reste rien à
// jouer, et elle passe. Cas réel : BPScript, bp-mono-vbwf.320.7.2, le 2026-11-21.
import { describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';

type Classe = { joue: boolean; test: boolean; matiere: boolean } | null;
const testsDeLaReprise = activites.testsDeLaReprise as (
  ctx: { copie: string },
  nommes: string[],
  langage: (copie: string) => { estUnTest: (f: string, copie: string) => Classe }
) => string[];

// Un langage d'essai : un fichier `*.spec.ts` se joue, un fichier d'un dossier `tests` est du test
// sans se jouer, tout autre fichier n'est rien.
const langage = () => ({
  estUnTest: (f: string): Classe =>
    f.endsWith('.spec.ts')
      ? { joue: true, test: true, matiere: false }
      : f.includes('/tests/')
        ? { joue: false, test: true, matiere: false }
        : null,
});
const ctx = { copie: '/copie' };

describe('la preuve reprise sur un rouge joue les tests que ce rouge nomme, eux seuls', () => {
  it('un document que la garde des consommateurs a refusé n’est pas joué', () => {
    expect(testsDeLaReprise(ctx, ['packages/990-corpus/docs/INTERFACE.md'], langage)).toEqual([]);
  });

  it('un test que le rouge nomme est joué, le document à côté de lui laissé', () => {
    expect(
      testsDeLaReprise(
        ctx,
        ['packages/a/docs/INTERFACE.md', 'packages/a/tests/x.spec.ts', 'packages/a/src/x.ts'],
        langage
      )
    ).toEqual(['packages/a/tests/x.spec.ts']);
  });

  it('une aide de test que le lanceur ne joue pas n’est pas jouée seule', () => {
    expect(testsDeLaReprise(ctx, ['packages/a/tests/aide.ts'], langage)).toEqual([]);
  });

  it('sans fichier nommé, rien à jouer, et le langage n’est pas lu', () => {
    const interdit = () => {
      throw new Error('le langage ne se lit pas pour une liste vide');
    };
    expect(testsDeLaReprise(ctx, [], interdit)).toEqual([]);
  });
});
