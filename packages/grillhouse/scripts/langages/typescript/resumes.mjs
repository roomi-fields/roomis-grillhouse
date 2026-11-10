#!/usr/bin/env node
// The first sentence of the summary of each published element holds in 80 characters, as Debian's
// lintian holds a package's synopsis (`synopsis-too-long`) and clippy a doc's first paragraph
// (`too_long_first_doc_paragraph`). The index of the interfaces (`docs/agents/index-des-interfaces.md`)
// and the section « Ce que les composants d'avant publient » of a role agent's instruction carry
// that sentence for every element (scripts/langages/typescript/index-interfaces.mjs).
//
//   npx grillhouse resumes   run from the repository root (a guard of grillhouse:gardes)
//
// - An element is an entry of the generated part of a component's `docs/INTERFACE.md`; its
//   sentence is the one the index keeps (`lire` of scripts/langages/typescript/index-interfaces.mjs), measured in
//   characters. The generated part is the TSDoc summary of the export, which
//   scripts/langages/typescript/interfaces-contre-code.mjs keeps equal to the code.
// - A refusal names the element at its interface (`<INTERFACE.md> § <element>`): the sentence is
//   written in the documentation comment of the export, and `npm run api` carries it over.
// - A refusal inscribed in the project's debt (`grillhouse-dette.json`, see `dette.mjs`) passes,
//   keyed by the interface and `resume-trop-long`.
// - In an envelope (`GRILLHOUSE_ENVELOPPE`), the components of its plan alone are judged.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MODE, trancher } from '../../dette.mjs';
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
    if (!existsSync(iface)) {
      continue;
    }
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

// The report of the check at <racine>: `lignes`, what the command writes on stderr (each refusal
// prefixed with `⛔`, then the debt's lines), and `code`, its exit code (1 on a refusal). The
// functional core of the command: it reads the repository and the project's debt and writes nothing
// to the standard streams; the command below is its shell. The refusals reach SARIF through
// `trancher` under the results directory <env> names (scripts/resultats.mjs); without it none is
// written, and the debt's mode is <env>'s `GRILLHOUSE_DETTE`.
export function rapport(racine, env = process.env) {
  const { refus, lignes } = trancher(racine, 'resumes', verifier(racine, env), env[MODE] || undefined, env);
  return {
    lignes: [...refus.map(r => `⛔ ${r.message}`), ...lignes],
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
