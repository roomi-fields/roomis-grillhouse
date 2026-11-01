// The skeleton of a new crate of the module cargo, the demand `squelette` of the join
// (scripts/jointure.d.ts), which `grillhouse paquet` writes (scripts/paquet.mjs), as `cargo new
// --lib` writes one and adds it to the members of the workspace: no behaviour, no test.
//
// - Its files: its Cargo.toml (its name, the folder's; each field of `[workspace.package]` the
//   workspace holds inherited, `<champ>.workspace = true`, as `cargo new` inherits them in a
//   workspace, else its version 0.1.0 and its edition 2021; `[lints] workspace = true` when the
//   workspace has `[workspace.lints]`); `src/lib.rs`, a library without code; `tests/.gitkeep`, its
//   folder of tests by the interface. Cargo needs no configuration of its own for the tests
//   (nextest, the frame's profile) nor for the typing (`cargo check`, clippy).
// - The workspace: the root Cargo.toml receives the crate's path in `members` of `[workspace]`,
//   written in its text, the rest of the file as it was; a root without `members` receives the
//   key, a root package without `[workspace]` the table, and a project without a root Cargo.toml a
//   virtual workspace. A member or a pattern that covers the path leaves it as it is.
// - The lock of the versions: `cargo update --workspace`, at the root, which brings Cargo.lock in
//   line with the members alone.
// - The manifest is read with smol-toml, the tool of this module (`outils`), loaded at the call.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

// The fields of a package cargo inherits from `[workspace.package]`, in the order `cargo new`
// writes them.
const HERITES = [
  'version',
  'edition',
  'rust-version',
  'authors',
  'description',
  'documentation',
  'readme',
  'homepage',
  'repository',
  'license',
  'license-file',
  'keywords',
  'categories',
  'publish',
];

// The text <texte> of a root Cargo.toml with <chemin> added to `members` of `[workspace]`.
function ajouterLeMembre(texte, chemin) {
  const entree = JSON.stringify(chemin);
  const lignes = texte.split('\n');
  const debut = lignes.findIndex(l => /^\s*\[workspace\]\s*(#.*)?$/.test(l));
  if (debut < 0) {
    const fin = texte.endsWith('\n') ? '' : '\n';
    return `${texte}${fin}\n[workspace]\nmembers = [${entree}]\n`;
  }
  let fin = lignes.findIndex((l, i) => i > debut && /^\s*\[/.test(l));
  if (fin < 0) {
    fin = lignes.length;
  }
  const section = lignes.slice(debut + 1, fin).join('\n');
  const m = /^(\s*members\s*=\s*\[)([\s\S]*?)(\])/m.exec(section);
  let nouvelle;
  if (!m) {
    nouvelle = `members = [${entree}]\n${section}`;
  } else if (m[2].includes('\n')) {
    const corps = m[2].replace(/\s*$/, '');
    const virgule = corps.trim() === '' || corps.trim().endsWith(',') ? '' : ',';
    nouvelle = section.replace(m[0], `${m[1]}${corps}${virgule}\n    ${entree},\n${m[3]}`);
  } else {
    const corps = m[2].trim().replace(/,$/, '');
    nouvelle = section.replace(m[0], `${m[1]}${corps ? `${corps}, ` : ''}${entree}${m[3]}`);
  }
  return [...lignes.slice(0, debut + 1), nouvelle, ...lignes.slice(fin)].join('\n');
}

/** @type {import('../../jointure.js').Langage['squelette']} */
export function squelette(racine, { chemin }) {
  const nom = path.posix.basename(chemin);
  const f = path.join(racine, 'Cargo.toml');
  const texte = existsSync(f) ? readFileSync(f, 'utf8') : null;
  const espace = texte === null ? null : (require('smol-toml').parse(texte).workspace ?? null);
  const herites = HERITES.filter(c => espace?.package?.[c] !== undefined);
  const paquet = [
    '[package]',
    `name = ${JSON.stringify(nom)}`,
    ...(herites.includes('version') ? [] : ['version = "0.1.0"']),
    ...(herites.includes('edition') ? [] : ['edition = "2021"']),
    ...herites.map(c => `${c}.workspace = true`),
    ...(espace?.lints ? ['', '[lints]', 'workspace = true'] : []),
    '',
    '[dependencies]',
    '',
  ].join('\n');
  const fichiers = {
    [`${chemin}/Cargo.toml`]: paquet,
    [`${chemin}/src/lib.rs`]: `//! The crate ${nom}: its interface, docs/INTERFACE.md, says what it offers.\n`,
    [`${chemin}/tests/.gitkeep`]: '',
  };
  const membres = Array.isArray(espace?.members) ? espace.members : [];
  const couvert = membres.some(m => typeof m === 'string' && path.matchesGlob(chemin, m));
  let entree = null;
  if (texte === null) {
    entree = {
      fichier: 'Cargo.toml',
      texte: `[workspace]\nmembers = [${JSON.stringify(chemin)}]\nresolver = "2"\n`,
    };
  } else if (!couvert) {
    entree = { fichier: 'Cargo.toml', texte: ajouterLeMembre(texte, chemin) };
  }
  return {
    fichiers,
    espace: entree,
    verrouiller: { commande: 'cargo', args: ['update', '--workspace'], dossier: '.' },
  };
}
