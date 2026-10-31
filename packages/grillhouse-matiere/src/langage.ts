import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The languages of a project of trial (grillhouse-ca7): the core reads them in the column
// « Langage » of the table of the components of its docs/ARCHITECTURE.md, and refuses a project
// that declares none; and the trial directories of the tests of the envelope. This material
// mounts nothing, so that a test importing it keeps its size.

/** The document where a project declares the language of each package, from its root. */
export const ARCHITECTURE = 'docs/ARCHITECTURE.md';

/**
 * The docs/ARCHITECTURE.md of a project of trial: its table of the components, one row per
 * package of <paquets> (its name → its language), or, given a list of languages, one row naming
 * the root per language.
 */
export function architecture(paquets: string[] | Record<string, string> = ['typescript']) {
  const lignes = Array.isArray(paquets)
    ? paquets.map(l => `| \`.\` | ${l} |`)
    : Object.entries(paquets).map(([nom, l]) => `| \`${nom}\` | ${l} |`);
  return `# Architecture\n\n| Composant | Langage |\n| --- | --- |\n${lignes.join('\n')}\n`;
}

/** Writes at <repo> the docs/ARCHITECTURE.md of <paquets> (as `architecture` reads them). */
export function declarerLesLangages(
  repo: string,
  paquets: string[] | Record<string, string> = ['typescript']
) {
  mkdirSync(path.join(repo, 'docs'), { recursive: true });
  writeFileSync(path.join(repo, ARCHITECTURE), architecture(paquets));
}

// Writes at <repo> the package.json of a project of TypeScript without workspaces, and its
// declaration of language.
export function declarerLeLangage(repo: string) {
  writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'essai', private: true }));
  declarerLesLangages(repo);
}

// The repositories of trial of one test file of the envelope, under <ESSAIS>.
export function enveloppeEssai(ESSAIS: string) {
  const essai = (nom: string) => mkdtempSync(path.join(ESSAIS, nom));
  return { essai };
}
