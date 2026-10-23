#!/usr/bin/env node
// The first sentence of the summary of each published element holds in 80 characters, as Debian's
// lintian holds a package's synopsis (`synopsis-too-long`) and clippy a doc's first paragraph
// (`too_long_first_doc_paragraph`). The index of the interfaces (`docs/agents/index-des-interfaces.md`)
// and the section « Ce que les composants d'avant publient » of a role agent's instruction carry
// that sentence for every element (scripts/index-interfaces.mjs).
//
//   npx grillhouse resumes   run from the repository root (a guard of grillhouse:gardes)
//
// - An element is an entry of the generated part of a component's `docs/INTERFACE.md`; its
//   sentence is the one the index keeps (`lire` of scripts/index-interfaces.mjs), measured in
//   characters. The generated part is the TSDoc summary of the export, which
//   scripts/interfaces-contre-code.mjs keeps equal to the code.
// - A refusal names the element at its interface (`<INTERFACE.md> § <element>`): the sentence is
//   written in the documentation comment of the export, and `npm run api` carries it over.
// - A refusal inscribed in the project's debt (`grillhouse-dette.json`, see `dette.mjs`) passes,
//   keyed by the interface and `resume-trop-long`.
// - In an envelope (`GRILLHOUSE_ENVELOPPE`), the components of its plan alone are judged.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { trancher } from './dette.mjs';
import { lire } from './index-interfaces.mjs';
import { aVerifier } from './interfaces-contre-code.mjs';

// The longest first sentence of a summary, in characters.
export const LONGUEUR_MAX = 80;

// The findings of the components <racine> judges under <env>: one `{ fichier, regle, message }`
// per element whose first sentence is longer than LONGUEUR_MAX, in the debt's form (`dette.mjs`).
export function verifier(racine, env = process.env) {
  const constats = [];
  for (const c of aVerifier(racine, env)) {
    const iface = path.join(c.dir, 'docs', 'INTERFACE.md');
    if (!existsSync(iface)) continue;
    const relIface = path.relative(racine, iface);
    const longs = lire(relIface, readFileSync(iface, 'utf8')).parties.filter(
      p => p.titre && [...p.phrase].length > LONGUEUR_MAX
    );
    for (const p of longs) {
      constats.push({
        fichier: relIface,
        regle: 'resume-trop-long',
        message: `${relIface} § ${p.titre} : la première phrase du résumé fait ${[...p.phrase].length} caractères, pour ${LONGUEUR_MAX} au plus ; raccourcis la première phrase dans le commentaire de documentation de l’export, le détail va dans les phrases suivantes, puis npm run api.`,
      });
    }
  }
  return constats;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = process.cwd();
  const { refus, lignes } = trancher(racine, 'resumes', verifier(racine));
  for (const r of refus) process.stderr.write(`⛔ ${r.message}\n`);
  for (const l of lignes) process.stderr.write(`${l}\n`);
  process.exitCode = refus.length ? 1 : 0;
}
