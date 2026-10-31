#!/usr/bin/env node
// The size of each test of Python, on the model of the test pyramid of Google and of Bazel's
// `size`, as the module typescript's guard (../typescript/tailles-des-tests.mjs): a large test of
// the day is refused, as it belongs to the night.
//
//   npx grillhouse tailles-des-tests   run from the repository root (a guard of grillhouse:gardes)
//
// - The test files are those of each package (./composants.mjs, `fichiersDeTest`): `test_*.py`
//   and `*_test.py`, a night test `*_nuit_test.py`.
// - A test is classed by a static reading of its text and of its package's `conftest.py` files on
//   its path, which pytest loads with it:
//   - large (`grand`): it starts a process (it imports `subprocess`), mounts a trial repository
//     (git's `init`, `clone` or `worktree add`) and starts there something else than git;
//   - medium (`moyen`): it starts a process;
//   - small (`petit`): it starts none.
// - A large test of the day is a finding, `{ fichier, regle: 'grand-de-jour', message }`; a night
//   test never is one. A finding inscribed in the project's debt (`grillhouse-dette.json`,
//   ../../dette.mjs) passes, and a new one is refused.
// - The guard writes on its error stream the count of each size, the night's included.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { trancher } from '../../dette.mjs';
import { composants, estDeNuit, fichiersDeTest } from './composants.mjs';

// The name of its findings and of its debt, apart from the module typescript's guard of the same
// command, whose section of the debt it never writes.
export const GARDE = 'tailles-des-tests-python';
export const GRAND_DE_JOUR = 'grand-de-jour';

// The import of the module that starts a process.
const PROCESSUS = /^\s*(?:import\s+subprocess\b|from\s+subprocess\s+import\b)/m;
// A trial repository mounted: git's `init`, `clone` or `worktree add`, as an argument or a command.
const DEPOT_D_ESSAI =
  /['"](?:init|clone)['"]|\bgit\s+(?:-C\s+\S+\s+)?(?:init|clone)\b|['"]worktree['"]\s*,\s*['"]add['"]|\bworktree\s+add\b/;
// A call of subprocess, its first argument captured.
const APPEL = /\bsubprocess\.(?:run|Popen|call|check_call|check_output)\s*\(\s*\[?\s*([^,\])\n]*)/g;
// A first argument that names git.
const GIT = /^['"]git(?:['"]|\s)/;

/**
 * The size of the test file <fichier> (absolute) of the package at <dossier>: `petit`, `moyen` or
 * `grand`.
 */
export function classer(fichier, dossier) {
  const textes = [readFileSync(fichier, 'utf8')];
  for (let d = path.dirname(fichier); ; d = path.dirname(d)) {
    const conftest = path.join(d, 'conftest.py');
    if (existsSync(conftest)) {
      textes.push(readFileSync(conftest, 'utf8'));
    }
    if (d === dossier || path.dirname(d) === d) {
      break;
    }
  }
  const tout = textes.join('\n');
  const processus = PROCESSUS.test(tout);
  const autreQueGit = [...tout.matchAll(APPEL)].some(m => !GIT.test(m[1].trim()));
  if (processus && autreQueGit && DEPOT_D_ESSAI.test(tout)) {
    return 'grand';
  }
  return processus ? 'moyen' : 'petit';
}

/** Each test file of the project at <racine> and its size: `[{ fichier, taille, nuit }]`. */
export function tailles(racine) {
  return composants(racine).flatMap(c =>
    fichiersDeTest(c.dossier).map(f => ({
      fichier: path.relative(racine, f).split(path.sep).join('/'),
      taille: classer(f, c.dossier),
      nuit: estDeNuit(path.basename(f)),
    }))
  );
}

/** The findings of the project at <racine>: one per large test of the day. */
export function verifier(racine) {
  return tailles(racine)
    .filter(t => t.taille === 'grand' && !t.nuit)
    .map(({ fichier }) => ({
      fichier,
      regle: GRAND_DE_JOUR,
      message: `${fichier} : un grand test (il monte un dépôt d'essai et y lance le produit ou le cadre) est un test de nuit, jamais joué au fil du travail ; il se renomme en *_nuit_test.py, ou il se réduit à la plus petite taille qui prouve son critère.`,
    }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = process.cwd();
  const toutes = tailles(racine);
  const compte = t => toutes.filter(x => x.taille === t).length;
  const { refus, lignes } = trancher(racine, GARDE, verifier(racine));
  for (const r of refus) {
    process.stderr.write(`⛔ ${r.message}\n`);
  }
  for (const l of lignes) {
    process.stderr.write(`${l}\n`);
  }
  process.stderr.write(
    `ℹ️  ${GARDE} : ${toutes.length} fichier(s) de tests, ${compte('petit')} petit(s), ${compte('moyen')} moyen(s), ${compte('grand')} grand(s) ; ${toutes.filter(x => x.nuit).length} de nuit.\n`
  );
  process.exitCode = refus.length ? 1 : 0;
}
