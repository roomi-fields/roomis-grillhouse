// The tags of the night tests of a crate, read as the module typescript reads them
// (the one rule of every language, ../typescript/vitest-config/cibles.mjs): `// @poste: <reason>`
// and `// @equipee: <reason>` in the comment at the head of a test file. In a crate, a night test
// is the target `tests/<nom>_nuit.rs` (the tag is read in that file) or a module of the target
// `tests/<nom>_nuit/main.rs` (the tag is read in the module's file, `tests/<nom>_nuit/<module>.rs`).
// `tests-de-nuit --hors-du-poste` leaves out the tagged `@poste`, with `--sans-equipement` the
// tagged `@equipee` too (./commandes.mjs).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Whether the text <texte> bears the line `// <etiquette>` in the comment at its head, before its
// first line of code (the rule of ../typescript/vitest-config/cibles.mjs, which a module of
// language cannot import).
function porteLEtiquette(texte, etiquette) {
  const re = new RegExp(`^//\\s*${etiquette}\\b`);
  for (const ligne of texte.split('\n')) {
    const l = ligne.trim();
    if (re.test(l)) {
      return true;
    }
    if (l !== '' && !l.startsWith('//')) {
      return false;
    }
  }
  return false;
}

/**
 * Whether the text <texte> of a test file bears a tag the night <nuit> leaves out:
 * `{ horsDuPoste, sansEquipement }`.
 * @param {string} texte
 * @param {{ horsDuPoste?: boolean, sansEquipement?: boolean }} [nuit]
 */
export function ecarteeDeLaNuit(texte, { horsDuPoste = false, sansEquipement = false } = {}) {
  return (
    (horsDuPoste && porteLEtiquette(texte, '@poste')) ||
    (horsDuPoste && sansEquipement && porteLEtiquette(texte, '@equipee'))
  );
}

// The `.rs` files under <dossier>, absolute, in order.
function fichiersRs(dossier) {
  return readdirSync(dossier, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(e => {
      const f = path.join(dossier, e.name);
      if (e.isDirectory()) {
        return fichiersRs(f);
      }
      return e.isFile() && e.name.endsWith('.rs') ? [f] : [];
    });
}

/**
 * What the night <nuit> leaves out of the test target at <src> (the file of its root): `null`
 * when the whole target is left out (its root file bears the tag), else the module paths of its
 * executable that are (`tests/it_nuit/foo.rs` → `foo`, `foo/mod.rs` → `foo`,
 * `foo/sous.rs` → `foo::sous`), empty when none.
 * @param {string} src
 * @param {{ horsDuPoste?: boolean, sansEquipement?: boolean }} nuit
 * @returns {string[] | null}
 */
export function ecartsDeLaCible(src, nuit) {
  const ecartee = f => ecarteeDeLaNuit(readFileSync(f, 'utf8'), nuit);
  if (ecartee(src)) {
    return null;
  }
  if (path.basename(src) !== 'main.rs' || path.basename(path.dirname(src)) === 'tests') {
    return [];
  }
  const dossier = path.dirname(src);
  const modules = [];
  for (const f of fichiersRs(dossier)) {
    if (f === src || !ecartee(f)) {
      continue;
    }
    const parts = path.relative(dossier, f).split(path.sep);
    parts[parts.length - 1] = parts[parts.length - 1].replace(/\.rs$/, '');
    if (parts.at(-1) === 'mod') {
      parts.pop();
    }
    if (parts.length) {
      modules.push(parts.join('::'));
    }
  }
  return modules;
}
