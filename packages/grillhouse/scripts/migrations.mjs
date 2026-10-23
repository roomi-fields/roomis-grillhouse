// The migrations of a project from one version of the frame to the next, as the transforms of
// `npx @turbo/codemod migrate`: one module per change of form, written once, in
// scripts/migrations/<version>-<nom>.mjs, which `grillhouse maj` plays (scripts/grillhouse-maj.mjs).
//
// - A migration exports `version` (the version of the package that brings the change of form),
//   `nom` and `migrer(projet)`, which brings the project at <projet> to the new form and returns
//   the lines of what it changed: none when the project already has it. It is replayable without
//   effect: a second pass changes no byte and returns no line.
// - MIGRATIONS lists them, each imported by its module; the update plays those newer than the
//   version the project recorded (`grillhouse.version` of its package.json), in the order of their
//   versions; a project that recorded none plays them all. The package carries no migration newer
//   than itself once released, so the range ends with the package.
// - Each migration has its test, tests/unit/migration.<nom>.spec.ts.
import semver from 'semver';
import * as charteImportee from './migrations/0.23.0-charte-importee.mjs';
import * as configVitest from './migrations/0.23.0-config-vitest.mjs';
import * as crochetsDeSeance from './migrations/0.23.0-crochets-de-seance.mjs';
import * as marcheDuProjet from './migrations/0.23.0-marche-du-projet.mjs';

/** The migrations of the package. */
export const MIGRATIONS = [crochetsDeSeance, configVitest, marcheDuProjet, charteImportee];

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
 * Plays on the project at <projet> each migration newer than <depuis>; returns, for each one that
 * changed something, `{ version, nom, lignes }`.
 */
export function migrer(projet, depuis, liste = MIGRATIONS) {
  return migrationsAJouer(depuis, liste)
    .map(m => ({ version: m.version, nom: m.nom, lignes: m.migrer(projet) }))
    .filter(r => r.lignes.length > 0);
}
