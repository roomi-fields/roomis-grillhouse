// The rule of a test file of the module typescript, the fourth demand of the join
// (scripts/jointure.d.ts, `estUnTest`): what the testwriter writes, as Pants tells `python_tests`
// from `python_test_utils`. A file the testwriter writes is, one or several of:
//
// - `joue`: a test Vitest plays, its name `*.test.*` or `*.spec.*` of a module (`NOM_DE_TEST` of
//   scripts/langages/typescript/consommateurs.mjs), wherever it lies;
// - `test`: a test file, or any file of a folder of tests (`test`, `tests`, `__tests__`), a helper
//   the tests import (`isTestFile`);
// - `matiere`: a file of a package of the shared test material, a component of the repository
//   whose package exports `./test-fixtures` (`matieres` of scripts/langages/typescript/consommateurs.mjs).
//
// Any other file is none of them: null.
//
// What the testwriter writes of the manifests (`manifestes`): the field that declares what the
// tests of a package depend on, `devDependencies` of its package.json (npm's docs,
// « devDependencies »), as the author of a test of Bazel declares the deps of its target; and
// package-lock.json at the root, which npm brings in line with it. A change of any other field is
// named by it; the root package.json is no package's.
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { dossiers } from './composants.mjs';
import { matieres, NOM_DE_TEST } from './consommateurs.mjs';

const DOSSIERS = new Set(['test', 'tests', '__tests__']);

// Whether <file> (a path from the repository root) is a test file or a file of a folder of tests,
// read from the path alone.
export function isTestFile(file) {
  const parts = file.split(/[\\/]/);
  return parts.slice(0, -1).some(d => DOSSIERS.has(d)) || NOM_DE_TEST.test(parts.at(-1));
}

// True when <file> lies strictly under the directory <dir>.
function isInside(file, dir) {
  const rel = path.relative(path.resolve(dir), file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// What the testwriter writes in <chemin>, absolute or from the repository root <racine>:
// `{ joue, test, matiere }`, or null for a file it does not write.
export function estUnTest(chemin, racine) {
  const abs = path.resolve(racine, chemin);
  const joue = NOM_DE_TEST.test(path.basename(abs));
  const test = isTestFile(path.relative(path.resolve(racine), abs));
  const matiere = matieres(racine).some(m => isInside(abs, m.dir));
  return joue || test || matiere ? { joue, test, matiere } : null;
}

// The field of a manifest that declares what its tests depend on.
const DES_TESTS = 'devDependencies';

// The fields of the package.json of a package at <chemin>, absolute or from <racine>, that change
// from <avant> (null: no file) to <apres> out of the field of its tests; null when <chemin> is the
// manifest of no package.
function horsDesTests(chemin, racine, avant, apres) {
  const abs = path.resolve(racine, chemin);
  if (!dossiers(racine).some(d => path.join(d.dir, 'package.json') === abs)) return null;
  const lire = texte => {
    try {
      const v = texte === null ? {} : JSON.parse(texte);
      return v !== null && typeof v === 'object' && !Array.isArray(v)
        ? { valeur: v }
        : { faute: 'le manifeste entier, qui n’est pas un objet' };
    } catch (e) {
      return { faute: `le manifeste entier, illisible (${e.message})` };
    }
  };
  const [a, b] = [lire(avant), lire(apres)];
  if (a.faute || b.faute) return [a.faute ?? b.faute];
  return [...new Set([...Object.keys(a.valeur), ...Object.keys(b.valeur)])]
    .filter(k => k !== DES_TESTS && !isDeepStrictEqual(a.valeur[k], b.valeur[k]))
    .sort();
}

// What the testwriter writes of the manifests (scripts/jointure.d.ts, `manifestes`).
export const manifestes = { verrous: ['package-lock.json'], horsDesTests };
