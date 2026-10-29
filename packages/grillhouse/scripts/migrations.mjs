// The migrations of a project from one version of the frame to the next, as the transforms of
// `npx @turbo/codemod migrate`: one module per change of form, written once, in
// scripts/migrations/<version>-<nom>.mjs, which `grillhouse maj` plays (scripts/grillhouse-maj.mjs).
//
// - A migration exports `version` (the version of the package that brings the change of form),
//   `nom` and `migrer(projet)`, which brings the project at <projet> to the new form and returns
//   the lines of what it changed: none when the project already has it. A line `{ aFaire }` is
//   what it leaves to the project (a copy of the frame the project modified), which the update
//   writes on its error stream, its exit code non-zero, as `@turbo/codemod` fails on a file it
//   could not transform. It is replayable without effect: a second pass changes no byte and
//   returns no line.
// - MIGRATIONS lists the core's, each imported by its module, and a module of language carries
//   the ones that replay one of its guards (`migrations`, scripts/jointure.d.ts), as each plugin
//   of Nx carries its own (`migrationsDe`); the update plays those newer than the
//   version the project recorded (`grillhouse.version` of its package.json), in the order of their
//   versions; a project that recorded none plays them all. The package carries no migration newer
//   than itself once released, so the range ends with the package.
// - A migration may also export `restes(projet)`: the lines of what stays to the project once the
//   update is done, which the update plays after its own update and its regeneration, for each
//   migration it played, and reports (« reste au projet ») without holding back the version, as a
//   codemod reports what it leaves without failing (restesAuProjet).
// - Each migration has its test, tests/unit/migration.<nom>.spec.ts (a module's, under its
//   folder of tests, tests/unit/langages/<nom>/).
import semver from 'semver';
import { langageDe } from './langages.mjs';
import * as charteImportee from './migrations/0.23.0-charte-importee.mjs';
import * as configVitest from './migrations/0.23.0-config-vitest.mjs';
import * as crochetsDeSeance from './migrations/0.23.0-crochets-de-seance.mjs';
import * as marcheDuProjet from './migrations/0.23.0-marche-du-projet.mjs';
import * as copiesDuCadre from './migrations/0.23.2-copies-du-cadre.mjs';
import * as circuitSimplifie from './migrations/0.24.0-circuit-simplifie.mjs';
import * as apiExtractorDuPaquet from './migrations/0.24.2-api-extractor-du-paquet.mjs';
import * as triDesDecouvertes from './migrations/0.24.12-tri-des-decouvertes.mjs';
import * as scriptDesTests from './migrations/0.25.0-script-des-tests.mjs';

/** The migrations of the core. */
export const MIGRATIONS = [
  crochetsDeSeance,
  configVitest,
  marcheDuProjet,
  charteImportee,
  copiesDuCadre,
  circuitSimplifie,
  apiExtractorDuPaquet,
  triDesDecouvertes,
  scriptDesTests,
];

/**
 * The migrations of the project at <projet>: the core's, and the ones of the module of its
 * language (`migrations`, scripts/jointure.d.ts), as `nx migrate` gathers each plugin's.
 */
export const migrationsDe = projet => [...MIGRATIONS, ...langageDe(projet).migrations];

/**
 * The migrations of <liste> newer than <depuis> (all of them when it is null), in the order of
 * their versions; two of one version keep their order in the list.
 */
export function migrationsAJouer(depuis, liste = MIGRATIONS) {
  return liste
    .map((m, rang) => ({ m, rang }))
    .filter(({ m }) => depuis === null || semver.gt(m.version, depuis))
    .sort((a, b) => semver.compare(a.m.version, b.m.version) || a.rang - b.rang)
    .map(({ m }) => m);
}

/**
 * What stays to the project at <projet> after the update, for each migration newer than <depuis>
 * that exports `restes` and names something: `{ version, nom, lignes }`.
 */
export function restesAuProjet(projet, depuis, liste = migrationsDe(projet)) {
  return migrationsAJouer(depuis, liste)
    .filter(m => typeof m.restes === 'function')
    .map(m => ({ version: m.version, nom: m.nom, lignes: m.restes(projet) }))
    .filter(r => r.lignes.length > 0);
}

/**
 * Plays on the project at <projet> each migration newer than <depuis>; returns, for each one that
 * changed something or left something to do, `{ version, nom, lignes, aFaire }`.
 */
export function migrer(projet, depuis, liste = migrationsDe(projet)) {
  return migrationsAJouer(depuis, liste)
    .map(m => {
      const tout = m.migrer(projet);
      return {
        version: m.version,
        nom: m.nom,
        lignes: tout.filter(l => typeof l === 'string'),
        aFaire: tout.filter(l => typeof l !== 'string').map(l => l.aFaire),
      };
    })
    .filter(r => r.lignes.length > 0 || r.aFaire.length > 0);
}
