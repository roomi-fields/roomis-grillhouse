#!/usr/bin/env node
// One executable of integration tests per crate and per moment, on the model of Cargo's own
// testsuite (`tests/testsuite/main.rs`, each test file a module) and of matklad's « Delete Cargo
// Integration Tests »: each file of `tests/` is an executable cargo links apart, with every
// dependency (62 of about 90 MB in a copy of SyntHub, grillhouse-pkl.9); one entry point links one.
//
//   npx grillhouse executables-de-tests   run from the repository root (a guard of grillhouse:gardes)
//
// - The executables are the test targets of each crate of the workspace (./composants.mjs,
//   `crates`), each one cargo describes (`tests/<nom>.rs`, `tests/<dossier>/main.rs`, a `[[test]]`
//   of the manifest), counted per moment: the day, the night (a target whose name ends with
//   `_nuit`), the time budget benches (`_budget`) (`horsDuJour`, ./commandes.mjs). The unit tests
//   of `src/` are compiled into the library's own test executable, and never counted.
// - A crate with more than one executable of a moment gives one finding per executable of that
//   moment, `{ fichier, regle: 'executable-de-trop', message }`, the source of its target from the
//   root, except the one of the frame's address (`ADRESSES`: `tests/it/main.rs`, the target `it`;
//   `it_nuit` for the night, `it_budget` for the benches), each test file a module of it. A crate
//   with a single executable of a moment, whatever its name, gives none.
// - A finding inscribed in the project's debt (`grillhouse-dette.json`, ../../dette.mjs) passes:
//   the executables a project holds when the rule arrives are inscribed there by the update
//   (./migrations/0.34.0-executables-de-tests.mjs), the count never rises, and a new one is
//   refused.
// - The guard writes on its error stream the count of the crates and of their executables.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MODE, trancher } from '../../dette.mjs';
import { horsDuJour } from './commandes.mjs';
import { crates } from './composants.mjs';

// The name of its findings and of its debt.
export const GARDE = 'executables-de-tests';
export const DE_TROP = 'executable-de-trop';

/** The target of each moment at the frame's address, `tests/<cible>/main.rs`. */
export const ADRESSES = { jour: 'it', nuit: 'it_nuit', banc: 'it_budget' };

// The words of each moment in a message.
const MOMENTS = { jour: 'de jour', nuit: 'de nuit', banc: 'de banc' };

/**
 * @typedef {{ nom: string, fichier: string }} Executable
 * @typedef {{ crate: string, jour: Executable[], nuit: Executable[], banc: Executable[] }} DuCrate
 * @typedef {{ fichier: string, regle: string, message: string }} Constat
 */

/**
 * The executables of integration tests of each crate of the workspace at <racine>, per moment:
 * `[{ crate, jour, nuit, banc }]`, each executable its target's name and its source from the root.
 * @param {string} racine
 * @returns {DuCrate[]}
 */
export function executables(racine) {
  return crates(racine).map(c => {
    /** @type {{ jour: Executable[], nuit: Executable[], banc: Executable[] }} */
    const parMoment = { jour: [], nuit: [], banc: [] };
    for (const t of c.cibles.filter(x => x.kind.includes('test'))) {
      parMoment[horsDuJour(t) ?? 'jour'].push({
        nom: t.name,
        fichier: path.relative(racine, t.src).split(path.sep).join('/'),
      });
    }
    return { crate: c.composant.nom, ...parMoment };
  });
}

/**
 * The findings of the workspace at <racine>: one per executable of a moment beyond the one.
 * @param {string} racine
 * @returns {Constat[]}
 */
export function verifier(racine) {
  return executables(racine).flatMap(e =>
    /** @type {('jour' | 'nuit' | 'banc')[]} */ (['jour', 'nuit', 'banc']).flatMap(moment => {
      const liste = e[moment];
      if (liste.length < 2) {
        return [];
      }
      const adresse = ADRESSES[moment];
      return liste
        .filter(x => x.nom !== adresse)
        .map(({ fichier }) => ({
          fichier,
          regle: DE_TROP,
          message: `${fichier} : ${e.crate} a ${liste.length} exécutables de tests ${MOMENTS[moment]}, chacun lié à part avec toutes ses dépendances ; un crate en a un seul, tests/${adresse}/main.rs, chaque fichier de tests un module de tests/${adresse}/ (mod <fichier>;).`,
        }));
    })
  );
}

// The report of the check at <racine>: `lignes`, what the command writes on stderr (each refusal
// prefixed with `⛔`, then the debt's lines, then the count), and `code`, its exit code (1 on a
// refusal). The functional core of the command: it reads the repository and the project's debt
// and writes nothing to the standard streams; the command below is its shell. The refusals reach
// SARIF through `trancher` under the results directory <env> names (scripts/resultats.mjs);
// without it none is written, and the debt's mode is <env>'s `GRILLHOUSE_DETTE`.
/**
 * @param {string} racine
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ lignes: string[], code: number }}
 */
export function rapport(racine, env = process.env) {
  const tous = executables(racine);
  const total = tous.reduce((n, e) => n + e.jour.length + e.nuit.length + e.banc.length, 0);
  const { refus, lignes } = trancher(racine, GARDE, verifier(racine), env[MODE] || undefined, env);
  const resume = `ℹ️  ${GARDE} : ${tous.length} crate(s), ${total} exécutable(s) de tests d'intégration.`;
  return {
    lignes: [...refus.map(r => `⛔ ${r.message}`), ...lignes, resume],
    code: refus.length ? 1 : 0,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { lignes, code } = rapport(process.cwd());
  for (const l of lignes) {
    process.stderr.write(`${l}\n`);
  }
  process.exitCode = code;
}
