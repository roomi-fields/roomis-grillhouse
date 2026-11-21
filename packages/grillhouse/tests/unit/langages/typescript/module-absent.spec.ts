// Le module typescript nomme le module absent qu'un échec de chargement de Vitest désigne : le
// test écrit avant son code importe le module que le ticket crée, et cet échec est son rouge.
import { describe, expect, it } from 'vitest';
import { moduleAbsent } from '../../../../scripts/langages/typescript/module-absent.mjs';

const TEST = '/depot/packages/a/tests/unit/fermeture.spec.ts';

describe('le module absent qu’un échec de chargement nomme', () => {
  it('rend le chemin absolu d’un import relatif que Vitest ne trouve pas', () => {
    const message =
      'Failed to load url ../../scripts/fermeture.mjs (resolved id: ../../scripts/fermeture.mjs) in /depot/packages/a/tests/unit/fermeture.spec.ts. Does the file exist?';
    expect(moduleAbsent(message, TEST)).toBe('/depot/packages/a/scripts/fermeture.mjs');
  });

  it('rend le chemin absolu que Node nomme', () => {
    const message =
      "Cannot find module '/depot/packages/a/scripts/fermeture.mjs' imported from /depot/packages/a/tests/unit/fermeture.spec.ts";
    expect(moduleAbsent(message, TEST)).toBe('/depot/packages/a/scripts/fermeture.mjs');
  });

  it('ne rend rien pour un paquet introuvable, qui n’est pas un module du projet', () => {
    expect(
      moduleAbsent('Failed to load url vitest-absent (resolved id: vitest-absent) in /x.ts.', TEST)
    ).toBe(null);
    expect(moduleAbsent("Cannot find module 'yaml' imported from /x.ts", TEST)).toBe(null);
  });

  it('ne rend rien pour une erreur de syntaxe ou un autre échec', () => {
    expect(moduleAbsent('SyntaxError: Unexpected token (3:4)', TEST)).toBe(null);
    expect(moduleAbsent('', TEST)).toBe(null);
  });
});
