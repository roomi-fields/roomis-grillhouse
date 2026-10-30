#!/usr/bin/env node
// The paths the tests launch or read, on the model of Bazel's sandbox, which fails a test that
// reads an input its target does not declare: a test's run that the frame cannot relate to a
// changed file would keep a stale green, so the guard refuses the path the frame cannot read.
//
//   npx grillhouse chemins-des-tests   run from the repository root (a guard of grillhouse:gardes)
//
// - A pass measured against the last green plays, in each package, the tests Vitest relates to the
//   files changed, and the tests that read a changed file by its path (the scripts they launch,
//   the data they read: ./vitest-config/lances.mjs, `testsQuiLancent`), or every test when a
//   change lies in a path its package's tests declare they read (`grillhouse.lit`,
//   ./vitest-config/changements.mjs).
// - A finding, `{ fichier, regle: 'chemin-non-declare', message }`, is a string of a test's code
//   (or of the test material it imports) that ends the path of a module of its package, out of a
//   directory of tests, which the frame does not find in what the test reads nor under the
//   package's `grillhouse.lit` (`nonDeclares`): a script launched by a path built at run time
//   (`path.join(SCRIPTS, nom)`). The test writes the path whole (`path.resolve(__dirname,
//   '../scripts/verrous/verrou.mjs')`), or its package declares it in its `grillhouse.lit`.
// - The packages are those of the workspace, out of `docs/agents/hors-cadre.txt` (../../paquets.mjs);
//   a repository without one is its own package. A finding inscribed in the project's debt
//   (`grillhouse-dette.json`, ../../dette.mjs) passes: those that exist when the guard arrives are
//   inscribed there by the update (./migrations/0.25.0-chemins-des-tests.mjs).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { trancher } from '../../dette.mjs';
import { paquets } from '../../paquets.mjs';
import { nonDeclares } from './vitest-config/lances.mjs';

export const GARDE = 'chemins-des-tests';
export const CHEMIN_NON_DECLARE = 'chemin-non-declare';

// The paths <dossier>'s package.json declares its tests read (`grillhouse.lit`), from the top.
function lit(dossier) {
  try {
    const l = JSON.parse(readFileSync(path.join(dossier, 'package.json'), 'utf8'))?.grillhouse?.lit;
    return (Array.isArray(l) ? l : [])
      .filter(x => typeof x === 'string')
      .map(x => x.replace(/^\.\//, '').replace(/\/+$/, ''));
  } catch {
    return [];
  }
}

/**
 * The findings of the repository at <racine>: one `{ fichier, regle, message }` per module of its
 * package a test names without the frame reading it, in the debt's form (../../dette.mjs).
 */
export function verifier(racine) {
  const liste = paquets(racine).filter(p => !p.hors);
  const dossiers = liste.length ? liste.map(p => path.join(racine, p.dossier)) : [racine];
  const memo = new Map();
  return dossiers.flatMap(d =>
    nonDeclares(d, racine, lit(d), memo).map(({ test, fichier, chaine }) => ({
      fichier: test,
      regle: CHEMIN_NON_DECLARE,
      message: `${test} : la chaîne ${JSON.stringify(chaine)} nomme ${fichier}, que le cadre ne trouve ni dans ce que le test importe ou nomme, ni dans le grillhouse.lit de son paquet ; un changement de ${fichier} ne rejouerait pas ce test. Le test écrit le chemin entier (path.resolve(__dirname, '<chemin>')), ou son paquet le déclare dans son grillhouse.lit.`,
    }))
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = process.cwd();
  const { refus, lignes } = trancher(racine, GARDE, verifier(racine));
  for (const r of refus) process.stderr.write(`⛔ ${r.message}\n`);
  for (const l of lignes) process.stderr.write(`${l}\n`);
  process.exitCode = refus.length ? 1 : 0;
}
