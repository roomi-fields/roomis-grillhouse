// The night tests a night test plays by their name: a night test that names another night test of
// the repository carries its tags, as Bazel's tags reach the target that runs the tagged one
// (scripts/langages/typescript/tests-du-poste.mjs). The guard refuses the one that names a test of
// the poste without the tag `@poste`, or an equipped one without `@equipee`; the frame's own
// night test that plays the envelope's night tests is left to the poste.
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  rapport,
  REGLE,
  REGLE_EQUIPEE,
  testsDeNuitDuDepot,
  verifier,
} from '../../../../scripts/langages/typescript/tests-du-poste.mjs';
import { testsDuPoste } from '../../../../scripts/langages/typescript/vitest-config/cibles.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tests-nommes-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A project of trial holding <fichiers>, out of git: the guard lists its files under its root.
function projet(fichiers: Record<string, string>) {
  const r = mkdtempSync(path.join(ESSAIS, 'projet-'));
  for (const [f, t] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  }
  return r;
}

const SIMPLE = "import { it } from 'vitest';\nit('a', () => {});\n";
const POSTE = "// @poste: la session de l'utilisateur\n";
const EQUIPEE = "// @equipee: l'enveloppe bwrap\n";
// A night test that plays the night tests <noms> by their name, in a run of its own.
const joue = (...noms: string[]) =>
  `const JOUES = [${noms.map(n => `'${n}'`).join(', ')}];\nspawn(process.execPath, [VITEST, 'run', ...JOUES]);\n`;

describe('a night test that plays night tests by their name carries their tags', () => {
  it('refuses the one that names a test of the poste without the tag @poste, naming the test played', () => {
    const r = projet({
      'tests/du-poste.nuit.spec.ts': `${POSTE}${SIMPLE}`,
      'tests/lanceur.nuit.test.ts': joue('tests/du-poste.nuit.spec.ts'),
    });
    const constats = verifier(r);
    expect(constats).toEqual([
      expect.objectContaining({ fichier: 'tests/lanceur.nuit.test.ts', regle: REGLE }),
    ]);
    expect(constats[0]?.message).toContain('tests/du-poste.nuit.spec.ts');
    expect(constats[0]?.message).toContain('@poste');
    expect(rapport(r, {}).code).toBe(1);
  });

  it('passes it once it bears the tag', () => {
    const r = projet({
      'tests/du-poste.nuit.spec.ts': `${POSTE}${SIMPLE}`,
      'tests/lanceur.nuit.test.ts': `${POSTE}${joue('tests/du-poste.nuit.spec.ts')}`,
    });
    expect(verifier(r)).toEqual([]);
    expect(rapport(r, {}).code).toBe(0);
  });

  it('refuses the one that names an equipped test without the tag @equipee', () => {
    const r = projet({
      'tests/equipe.nuit.spec.ts': `${EQUIPEE}${SIMPLE}`,
      'tests/lanceur.nuit.test.ts': joue('tests/equipe.nuit.spec.ts'),
    });
    expect(verifier(r)).toEqual([
      expect.objectContaining({ fichier: 'tests/lanceur.nuit.test.ts', regle: REGLE_EQUIPEE }),
    ]);
    expect(verifier(r)[0]?.message).toContain('tests/equipe.nuit.spec.ts');
  });

  it('asks for both tags when the tests named bear one each', () => {
    const r = projet({
      'tests/du-poste.nuit.spec.ts': `${POSTE}${SIMPLE}`,
      'tests/equipe.nuit.spec.ts': `${EQUIPEE}${SIMPLE}`,
      'tests/lanceur.nuit.test.ts': `${EQUIPEE}${joue('tests/du-poste.nuit.spec.ts', 'tests/equipe.nuit.spec.ts')}`,
    });
    expect(verifier(r).map(c => `${c.fichier} ${c.regle}`)).toEqual([
      `tests/lanceur.nuit.test.ts ${REGLE}`,
    ]);
  });

  it('reads a test named from a directory of another package, by the end of its path', () => {
    const r = projet({
      'packages/essais/tests/du-poste.nuit.spec.ts': `${POSTE}${SIMPLE}`,
      'packages/cadre/tests/lanceur.nuit.test.ts': joue('tests/du-poste.nuit.spec.ts'),
    });
    expect(verifier(r)).toEqual([
      expect.objectContaining({
        fichier: 'packages/cadre/tests/lanceur.nuit.test.ts',
        regle: REGLE,
      }),
    ]);
  });

  it('carries the marks a test named shows without its tag, beside that test’s own finding', () => {
    const r = projet({
      'tests/bd.nuit.spec.ts': "it.runIf(hasBd)('b', () => {});\n",
      'tests/lanceur.nuit.test.ts': joue('tests/bd.nuit.spec.ts'),
    });
    expect(verifier(r).map(c => `${c.fichier} ${c.regle}`)).toEqual([
      `tests/bd.nuit.spec.ts ${REGLE}`,
      `tests/lanceur.nuit.test.ts ${REGLE}`,
    ]);
  });

  it('asks nothing for a test named without tag nor mark, a name in a comment, its own name, or a name of no test of the repository', () => {
    const r = projet({
      'tests/du-poste.nuit.spec.ts': `${POSTE}${SIMPLE}`,
      'tests/libre.nuit.spec.ts': SIMPLE,
      'tests/a.nuit.test.ts': joue('tests/libre.nuit.spec.ts'),
      'tests/b.nuit.test.ts': `// beside tests/du-poste.nuit.spec.ts\n${SIMPLE}`,
      'tests/c.nuit.test.ts': joue('tests/c.nuit.test.ts'),
      'tests/d.nuit.test.ts': joue('tests/absent.nuit.spec.ts', 'autre-du-poste.nuit.spec.ts'),
    });
    expect(verifier(r)).toEqual([]);
  });

  it('does not read a day test that names a test of the poste', () => {
    const r = projet({
      'tests/du-poste.nuit.spec.ts': `${POSTE}${SIMPLE}`,
      'tests/jour.spec.ts': joue('tests/du-poste.nuit.spec.ts'),
    });
    expect(verifier(r)).toEqual([]);
  });
});

describe('the frame’s night test that plays the night tests of the envelope by their name', () => {
  const DEPOT = path.resolve(__dirname, '../../../../../..');
  const FICHIER = 'packages/grillhouse/tests/unit/dossiers-d-essai.nuit.test.ts';

  it('names tests of the poste, which the guard reads, and is left to the poste', () => {
    const lu = testsDeNuitDuDepot(DEPOT).find(t => t.fichier === FICHIER);
    expect(lu?.marques.filter(m => m.classe === 'poste').map(m => m.nom)).toEqual([
      expect.stringContaining('packages/grillhouse-essais/tests/enveloppe.maison.nuit.spec.ts'),
      expect.stringContaining('packages/grillhouse-essais/tests/enveloppe.nuit.spec.ts'),
    ]);
    expect(lu?.etiquete).toBe(true);
    expect(lu?.equipee).toBe(true);
    expect(testsDuPoste(DEPOT)).toContain(FICHIER);
  });
});
