// API Extractor is the package's dependency, not the project's: the package imports it as a library
// (scripts/interfaces-contre-code.mjs) and declares it in its own `dependencies`, and no command of
// a project runs it, as npm leaves to a package what it imports. The update of 0.23.0 to 0.24.1
// added it to the devDependencies of a project's root as a tool the project runs, and
// `grillhouse code-mort` then refused it as a development dependency without use. The project's
// `tsdoc.json` extended its TSDoc base, resolved only when npm hoists API Extractor to the root:
// the package now publishes its own base (`tsdoc-base.json`, which extends API Extractor's), as a
// rig of Rushstack carries the base configuration beside the dependency it names.
//
// - The `tsdoc.json` of the project's root whose `extends` names the base of API Extractor
//   (ANCIENNE_BASE) extends the package's (BASE): that name is rewritten in place, the rest of the
//   file kept byte for byte. A `tsdoc.json` that extends another base, or none, is not written.
// - What stays to the project (`restes`, which the update plays after its own update, so after the
//   rewrite above): a root `package.json` that declares `@microsoft/api-extractor`
//   (`dependencies`, `devDependencies` or `optionalDependencies`), while no source of the project
//   imports it (scripts/sources.mjs), hears the line of the other dependencies only the package
//   imports (`dependanceDuPaquet`), with `npm uninstall`. The dependency is named, never removed:
//   the project decides. The migration of the copies (0.23.2-copies-du-cadre.mjs) leaves it to this
//   one (DU_PAQUET), so that it is named once.
// - A project already in the new form is not written, and a second pass returns no line.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { importe, sources } from '../sources.mjs';

export const version = '0.24.2';
export const nom = 'API Extractor du paquet';

/** The dependency this migration names, which the migration of the copies leaves to it. */
export const DU_PAQUET = '@microsoft/api-extractor';
const CHAMPS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const TSDOC = 'tsdoc.json';
const ANCIENNE_BASE = `${DU_PAQUET}/extends/tsdoc-base.json`;
const BASE = '@roomi-fields/grillhouse/tsdoc-base.json';

/** The line that names <dep>, a dependency of a project only the package imports. */
export const dependanceDuPaquet = dep =>
  `package.json : la dépendance ${dep} n'est plus importée que par le paquet, qui la déclare lui-même ; \`npm uninstall ${dep}\` la retire si le projet n'en a pas l'usage`;

/** The line naming API Extractor when the project at <projet> declares it without importing it. */
export function restes(projet) {
  const f = path.join(projet, 'package.json');
  if (!existsSync(f)) {
    return [];
  }
  const pkg = JSON.parse(readFileSync(f, 'utf8'));
  if (!CHAMPS.some(c => pkg[c]?.[DU_PAQUET] !== undefined)) {
    return [];
  }
  const importee = sources(projet).some(s =>
    importe(readFileSync(path.join(projet, s), 'utf8'), DU_PAQUET)
  );
  return importee ? [] : [dependanceDuPaquet(DU_PAQUET)];
}

/** Brings the `extends` of the project's tsdoc.json at <projet> to the package's base. */
export function migrer(projet) {
  const f = path.join(projet, TSDOC);
  if (!existsSync(f)) {
    return [];
  }
  const texte = readFileSync(f, 'utf8');
  const { extends: bases } = JSON.parse(texte);
  if (!Array.isArray(bases) || !bases.includes(ANCIENNE_BASE)) {
    return [];
  }
  writeFileSync(f, texte.replace(`"${ANCIENNE_BASE}"`, `"${BASE}"`));
  return [`${TSDOC} : hérite de ${BASE}, la base TSDoc du paquet, au lieu de ${ANCIENNE_BASE}`];
}
