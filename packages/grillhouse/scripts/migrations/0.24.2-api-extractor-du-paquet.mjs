// API Extractor is the package's dependency, not the project's: the root `tsdoc.json` extends the
// package's own base (`tsdoc-base.json`). Mechanism: installation.md §5.4
// (packages/grillhouse/docs/architecture/).
//
// - A root `tsdoc.json` whose `extends` names API Extractor's base (ANCIENNE_BASE) extends the
//   package's (BASE), the rest of the file kept byte for byte; another base is not written.
// - `restes`: a root `package.json` declaring `@microsoft/api-extractor` while no source imports it
//   (scripts/sources.mjs) hears the line of `dependanceDuPaquet`, with `npm uninstall`; named,
//   never removed (DU_PAQUET, named once).
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
