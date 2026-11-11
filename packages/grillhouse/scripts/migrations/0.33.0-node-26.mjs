// From 0.33.0 the frame runs on Node 24 and 26, the supported long-term releases, Node 26 at the
// poste (grillhouse-3uv.99): the template's package.json declares `engines.node` `>=24.0.0` and
// the npm Node 26 ships as its `packageManager`.
//
// - A project's package.json that still holds the value of the template before (`engines.node`
//   `>=22.0.0`, `packageManager` `npm@10.9.8`) receives the template's; a value the project chose
//   stays, unsaid.
// - Only those values change in the text: the rest of the file keeps its bytes.
// - A project already migrated, or without package.json, is not written: a second pass changes
//   nothing and returns no line.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CADRE } from '../cadre.mjs';

export const version = '0.33.0';
export const nom = 'node 26';

// The values of the template before this version.
const MOTEUR_AVANT = '>=22.0.0';
const GESTIONNAIRE_AVANT = 'npm@10.9.8';

// The template's package.json.
const gabarit = () =>
  JSON.parse(readFileSync(path.join(CADRE, 'templates', 'projet', 'package.json'), 'utf8'));

// A text as a pattern that matches it alone.
const litteral = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// <texte> with the first string value <avant> of the key <cle> replaced by <apres>.
const remplacer = (texte, cle, avant, apres) =>
  texte.replace(
    new RegExp(`("${litteral(cle)}"\\s*:\\s*)${litteral(JSON.stringify(avant))}`),
    (_, debut) => `${debut}${JSON.stringify(apres)}`
  );

/** Gives the project the template's engines and npm when it holds the former ones. */
export function migrer(projet) {
  const f = path.join(projet, 'package.json');
  if (!existsSync(f)) {
    return [];
  }
  let texte = readFileSync(f, 'utf8');
  const pkg = JSON.parse(texte);
  const neuf = gabarit();
  const lignes = [];
  if (pkg.engines?.node === MOTEUR_AVANT && neuf.engines?.node !== MOTEUR_AVANT) {
    texte = remplacer(texte, 'node', MOTEUR_AVANT, neuf.engines.node);
    lignes.push(`package.json : engines.node passe à ${neuf.engines.node}`);
  }
  if (pkg.packageManager === GESTIONNAIRE_AVANT && neuf.packageManager !== GESTIONNAIRE_AVANT) {
    texte = remplacer(texte, 'packageManager', GESTIONNAIRE_AVANT, neuf.packageManager);
    lignes.push(`package.json : packageManager passe à ${neuf.packageManager}`);
  }
  if (lignes.length) {
    writeFileSync(f, texte);
  }
  return lignes;
}
