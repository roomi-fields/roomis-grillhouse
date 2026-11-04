// The components of a workspace of cargo, as cargo itself describes them (`cargo metadata
// --format-version 1 --no-deps --offline`): the crates the module cargo answers the join with
// (scripts/jointure.d.ts, `composants`, `composantDe`, `matieres`, `joueDesTests`, `lecteurs`,
// `estUnTest`, `arbreDAvant`, `testsDeHead`).
//
// - A component is a member of the workspace (`workspace_members`): its folder, the manifest's;
//   its name and its package, the crate's name. A directory without a Cargo.toml at its root holds
//   none, and cargo is not asked. Cargo's paths are read from its `workspace_root`, so that the
//   folders lie under the root the core gives, whatever link leads to it.
// - The component of a file is the crate of the longest folder that holds it, as cargo finds the
//   manifest of a file by climbing its directories; a file out of every crate (the workspace's own
//   Cargo.toml and Cargo.lock of a virtual workspace, its docs) is out of every component, which
//   ./touches.mjs reads as the whole workspace.
// - The shared test material: the crates whose manifest says `[package.metadata.grillhouse]
//   matiere = true`.
// - A test lives in a file of its own, never in a file of code (decision 5 of the epic
//   grillhouse-pkl, amended by grillhouse-agr): the tests by the interface under `tests/` of each
//   crate, where cargo finds its integration tests; the unit tests near their module, under
//   `src/`, in a file `tests.rs` or a folder `tests/`, as rustc's tidy check wants them
//   (src/tools/tidy/src/unit_tests.rs), declared in the module by `#[cfg(test)] mod tests;`, a line
//   the testwriter writes with his test. A crate plays tests when it has either.
// - The readers of a crate: the members that depend on it by its path, of any kind (`normal`,
//   `dev`, `build`), the kind in `par`; a name no member bears is without provider. The types
//   give no survey of their own: `etat` done, no element.
// - What the testwriter writes: a file of `<crate>/tests/` is a test file; the runner plays the
//   ones cargo makes a test target of, `tests/<nom>.rs` and `tests/<dossier>/main.rs`, and the
//   others are their helpers and data (`tests/fixtures/`, as OSC Bridge's devices); a file of
//   `<crate>/tests/common/`, the helpers cargo's book puts there, is test material too; a file
//   `tests.rs` under `src/`, and any file of a folder `tests/` under `src/`, is a unit test file,
//   played with its crate when it is Rust; a file of a crate of the shared test material is
//   material; any other file of a crate (the code of `src/`) is none of them.
// - HEAD's version of a test file plays in a tree of its own (`arbreDAvant`), never beside the
//   file: a target `tests/<nom>.rs`, a target cargo finds by itself, its tree the copy's with that
//   file replaced, built in the cargo target directory of the copy (`envDArbre`); none for
//   `tests/<dossier>/main.rs` nor a unit test of `src/`, whose names of tests HEAD's version holds
//   are read without playing them (`testsDeHead`, ./tests-de-head.mjs), the proof holding each for
//   a green HEAD holds; those of a target `tests/<nom>.rs` too, when its tree no longer compiles
//   (grillhouse-3e2.2).
// - What the testwriter writes of the manifests (`manifestes`): the tables that declare what the
//   tests of a crate depend on, `[dev-dependencies]` and `[target.<cible>.dev-dependencies]` of
//   its Cargo.toml (cargo's book, « Development dependencies »), as the author of a test of Bazel
//   declares the deps of its target; and Cargo.lock at the root, which cargo brings in line with
//   them. A change of any other table is named by it; the Cargo.toml of a virtual workspace is
//   no crate's. Of a file of code of `src/` of a crate, the testwriter writes its test module
//   alone (grillhouse-agr): the declaration `#[cfg(test)] mod tests;` added or removed, without
//   which a new tests.rs is never compiled, and an inline `#[cfg(test)] mod tests { … }` removed,
//   which he moves into tests.rs; any other change is named by its first line. The manifests are
//   read with smol-toml, a tool of this module (`outils`), an optional peer of the package loaded
//   when a manifest is judged, so that a project of another language, which loads this module
//   without it, never needs it.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { luUneFois } from '../../services-du-noyau.mjs';
import { cibleDeCompilation } from './sccache.mjs';
import { nomsDeHead } from './tests-de-head.mjs';

// The loader of the optional peers this module reads when it needs them (smol-toml), under the
// name by which knip reads a dependency.
const require = createRequire(import.meta.url);

// The genre of a dependency as cargo names its kind, null for a normal one.
const genre = kind => kind ?? 'normal';

/**
 * What cargo describes of the workspace at <racine>, its dependencies left out; null without a
 * Cargo.toml at its root. Throws, named, when cargo cannot answer.
 * @param {string} racine the root of the workspace
 */
export function metadonnees(racine) {
  if (!existsSync(path.join(racine, 'Cargo.toml'))) {
    return null;
  }
  // Read once in a scope of the core (`luUneFois`): a sweep asks it of every file of a folder.
  return luUneFois(`cargo metadata ${path.resolve(racine)}`, () => lireLesMetadonnees(racine));
}

// What `cargo metadata` says of the workspace at <racine>, read at each call.
function lireLesMetadonnees(racine) {
  // The target directory cargo reports is the one the compilations use (./sccache.mjs), named
  // without being made: a reading writes nothing in the home.
  const r = spawnSync('cargo', ['metadata', '--format-version', '1', '--no-deps', '--offline'], {
    cwd: racine,
    env: { ...process.env, ...cibleDeCompilation(racine, process.env, { creer: false }) },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error) {
    throw new Error(`⛔ cargo metadata dans ${racine} : ${r.error.message}`);
  }
  if (r.status !== 0) {
    const fin = r.stderr.trim().split('\n').at(-1) ?? '';
    throw new Error(`⛔ cargo metadata dans ${racine} (code ${r.status}) : ${fin}`);
  }
  return JSON.parse(r.stdout);
}

/**
 * The crates of the workspace at <racine>, sorted by name: `{ composant, deps, cibles, matiere }`,
 * `deps` each `{ dossier, genre }` of a dependency by its path, `cibles` each `{ kind, name, src }`
 * of a target of the crate, the paths under <racine>.
 * @param {string} racine the root of the workspace
 */
export function crates(racine) {
  const m = metadonnees(racine);
  if (!m) {
    return [];
  }
  const sous = p => path.join(racine, path.relative(m.workspace_root, p));
  const membres = new Set(m.workspace_members);
  return m.packages
    .filter(p => membres.has(p.id))
    .map(p => ({
      composant: { dossier: sous(path.dirname(p.manifest_path)), nom: p.name, paquet: p.name },
      deps: (p.dependencies ?? [])
        .filter(d => typeof d.path === 'string')
        .map(d => ({ dossier: sous(d.path), genre: genre(d.kind) })),
      cibles: (p.targets ?? []).map(t => ({ kind: t.kind, name: t.name, src: sous(t.src_path) })),
      matiere: p.metadata?.grillhouse?.matiere === true,
    }))
    .sort((a, b) => a.composant.nom.localeCompare(b.composant.nom));
}

/** The components of the workspace at <racine>: its members. */
export const composants = racine => crates(racine).map(c => c.composant);

/**
 * The component of <liste> that holds <fichier> (absolute, or from <racine>), the longest folder;
 * null for none.
 */
export function composantDans(liste, racine, fichier) {
  const abs = path.resolve(racine, fichier);
  const tenants = liste.filter(c => abs === c.dossier || abs.startsWith(`${c.dossier}${path.sep}`));
  return tenants.sort((a, b) => b.dossier.length - a.dossier.length)[0] ?? null;
}

/** The crates of the shared test material of the workspace at <racine>. */
export const matieres = racine =>
  crates(racine)
    .filter(c => c.matiere)
    .map(c => c.composant);

// Whether <parts>, a path from the folder of a crate split, is a unit test file under its `src/`:
// a file `tests.rs`, or a file of a folder `tests/`.
// `src/bin/tests.rs` and `src/bin/tests/` are a binary target for cargo, its code.
export const unitaire = parts =>
  parts[0] === 'src' &&
  parts.length > 1 &&
  !(parts[1] === 'bin' && ['tests.rs', 'tests'].includes(parts[2])) &&
  (parts.at(-1) === 'tests.rs' || parts.slice(1, -1).includes('tests'));

/**
 * Whether the crate <composant> plays tests: a folder `tests/`, its integration tests, or a unit
 * test file under `src/`.
 */
export function joueDesTests(_racine, composant) {
  const d = path.join(composant.dossier, 'tests');
  if (existsSync(d) && statSync(d).isDirectory()) {
    return true;
  }
  const src = path.join(composant.dossier, 'src');
  if (!existsSync(src)) {
    return false;
  }
  return readdirSync(src, { recursive: true, withFileTypes: true }).some(
    e =>
      e.isFile() &&
      unitaire(['src', ...path.relative(src, path.join(e.parentPath, e.name)).split(path.sep)])
  );
}

/**
 * The readers, by their manifests, of the crates <noms> among <composants> of <racine>: each a
 * reader `{ composant, par }`, `par` the kinds of its dependencies on it; what each crate reads
 * (`lit`), every kind; what its tests read (`parLesTests`), its dependencies of development.
 */
export function lecteurs(racine, { composants: liste, noms }) {
  const tous = crates(racine);
  const parDossier = new Map(liste.map(c => [c.dossier, c]));
  const lit = new Map(liste.map(c => [c, new Set()]));
  const parLesTests = new Map(liste.map(c => [c, new Set()]));
  const genres = new Map(liste.map(c => [c, new Map()]));
  for (const c of tous) {
    const lecteur = parDossier.get(c.composant.dossier);
    if (!lecteur) {
      continue;
    }
    for (const d of c.deps) {
      const lu = parDossier.get(d.dossier);
      if (!lu || lu === lecteur) {
        continue;
      }
      lit.get(lecteur).add(lu);
      if (d.genre === 'dev') {
        parLesTests.get(lecteur).add(lu);
      }
      const g = genres.get(lu);
      if (!g.has(lecteur)) {
        g.set(lecteur, new Set());
      }
      g.get(lecteur).add(d.genre);
    }
  }
  const elements = [];
  const sansFournisseur = [];
  for (const nom of noms) {
    const fournisseur = liste.find(c => c.paquet === nom || c.nom === nom);
    if (!fournisseur) {
      sansFournisseur.push(nom);
      continue;
    }
    const lus = [...genres.get(fournisseur)]
      .sort(([a], [b]) => a.nom.localeCompare(b.nom))
      .map(([composant, par]) => ({ composant, par: [...par].sort() }));
    elements.push({ nom, fournisseur, lecteurs: lus });
  }
  return {
    elements,
    sansFournisseur,
    types: { etat: 'fait', raison: null, elements: [] },
    lit,
    parLesTests,
  };
}

// True when <fichier> lies strictly under the directory <dir>.
const sous = (fichier, dir) => {
  const rel = path.relative(dir, fichier);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/**
 * What the testwriter writes in <chemin>, absolute or from the root <racine>: `{ joue, test,
 * matiere }`, or null for a file he does not write.
 */
export function estUnTest(chemin, racine) {
  const abs = path.resolve(racine, chemin);
  const tous = crates(racine);
  const c = composantDans(
    tous.map(x => x.composant),
    racine,
    abs
  );
  if (!c) {
    return null;
  }
  const matiere = tous.find(x => x.composant === c).matiere;
  const parts = path.relative(c.dossier, abs).split(path.sep);
  if (parts[0] === 'tests' && sous(abs, path.join(c.dossier, 'tests'))) {
    if (parts[1] === 'common' && parts.length > 2) {
      return { joue: false, test: true, matiere: true };
    }
    // The test targets cargo finds: `tests/<nom>.rs`, `tests/<dossier>/main.rs`.
    const joue =
      (parts.length === 2 && parts[1].endsWith('.rs')) ||
      (parts.length === 3 && parts[2] === 'main.rs');
    return { joue, test: true, matiere };
  }
  // The unit tests near their module, compiled with it: `tests.rs`, the files of `tests/`.
  if (unitaire(parts)) {
    return { joue: parts.at(-1).endsWith('.rs'), test: true, matiere };
  }
  return matiere ? { joue: false, test: false, matiere: true } : null;
}

/** The end of the name of a night test target, and of a time budget bench's (./commandes.mjs,
 * `horsDuJour`). */
export const DE_NUIT = '_nuit';
export const BANC = '_budget';

/**
 * Whether HEAD's version of the test file <chemin> (from the root <racine>) plays in a tree of its
 * own, in the same proof as the lot's: a test target `tests/<nom>.rs`, a target cargo finds by
 * itself (`autotests`), its `mod` of the same folder read as the file's; false for any other
 * file: a target `tests/<dossier>/main.rs` holds its modules beside it, and a unit test of
 * `src/` is compiled in its crate's module (`testsDeHead` reads their names).
 * @param {string} chemin
 * @param {string} racine
 */
export function arbreDAvant(chemin, racine) {
  const abs = path.resolve(racine, chemin);
  const c = composantDans(
    crates(racine).map(x => x.composant),
    racine,
    abs
  );
  const parts = c ? path.relative(c.dossier, abs).split(path.sep) : [];
  return parts.length === 2 && parts[0] === 'tests' && parts[1].endsWith('.rs');
}

/** The variable that names, to the launcher, the copy whose git tracks the `Cargo.lock` of a tree. */
export const COPIE_DE_L_ARBRE = 'GRILLHOUSE_COPIE_DE_L_ARBRE';

/**
 * The environment a tree of HEAD's version plays under: the target directory of the copy's
 * compilations, so that the tree builds there, whatever its place (`cibleDeCompilation`
 * (./sccache.mjs) for a copy in the temporary directory, its `target/` otherwise; the caller's
 * own `CARGO_TARGET_DIR` stays), and the copy itself (`COPIE_DE_L_ARBRE`), where git tracks the
 * `Cargo.lock` the tree, which has no `.git`, carries.
 * @param {string} _chemin
 * @param {string} racine
 * @returns {NodeJS.ProcessEnv}
 */
export function envDArbre(_chemin, racine) {
  const cible = cibleDeCompilation(racine, process.env, { creer: false });
  return {
    ...(process.env.CARGO_TARGET_DIR || cible.CARGO_TARGET_DIR
      ? cible
      : { CARGO_TARGET_DIR: path.join(racine, 'target') }),
    [COPIE_DE_L_ARBRE]: racine,
  };
}

/**
 * The names of the tests of HEAD's version of the test file <chemin> (from the root <racine>),
 * read without playing them, for a file whose tree the proof does not play: a unit test file of
 * `src/` (`tests.rs`, a file of a folder `tests/` under `src/`, out of `src/bin/`) and a target
 * `tests/<dossier>/main.rs` (./tests-de-head.mjs), and a target `tests/<nom>.rs`, whose tree the
 * proof plays unless it no longer compiles (grillhouse-3e2.2): its names as nextest gives them,
 * without the target, its out-of-line modules read (`mod common;`, `common::<fn>`). <lire> gives
 * HEAD's text of a file from the root. Null for any other file, or one HEAD does not hold.
 * @param {string} chemin
 * @param {string} racine
 * @param {(f: string) => string | null} lire
 */
export function testsDeHead(chemin, racine, lire) {
  const abs = path.resolve(racine, chemin);
  const c = composantDans(
    crates(racine).map(x => x.composant),
    racine,
    abs
  );
  if (!c || !chemin.endsWith('.rs')) {
    return null;
  }
  const parts = path.relative(c.dossier, abs).split(path.sep);
  if (parts.length === 3 && parts[0] === 'tests' && parts[2] === 'main.rs') {
    return nomsDeHead(chemin, null, lire);
  }
  if (arbreDAvant(chemin, racine)) {
    return nomsDeHead(chemin, null, lire);
  }
  if (!unitaire(parts) || parts[1] === 'bin') {
    return null;
  }
  const module = parts.slice(1);
  module[module.length - 1] = module[module.length - 1].replace(/\.rs$/, '');
  if (module.at(-1) === 'mod') {
    module.pop();
  }
  return nomsDeHead(chemin, module, lire);
}

// The tables of a manifest that declare what its tests depend on.
const DES_TESTS = 'dev-dependencies';

// The table <t> of a parsed manifest, an object; {} for any other value.
const table = t => (t !== null && typeof t === 'object' && !Array.isArray(t) ? t : {});

// The parts of the parsed manifests <a> and <b> that differ, out of the tables of the tests: each
// `[<table>]` (`[target.<cible>.<table>]` under `target`), a key out of every table bare.
function partiesHors(a, b) {
  const cles = (x, y) => [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
  const out = [];
  for (const k of cles(a, b)) {
    if (k === DES_TESTS || isDeepStrictEqual(a[k], b[k])) continue;
    if (k !== 'target') {
      const tableau = [a[k], b[k]].some(v => v !== null && typeof v === 'object');
      out.push(tableau ? `[${k}]` : k);
      continue;
    }
    const [ta, tb] = [table(a.target), table(b.target)];
    for (const c of cles(ta, tb)) {
      const [ca, cb] = [table(ta[c]), table(tb[c])];
      for (const s of cles(ca, cb)) {
        if (s !== DES_TESTS && !isDeepStrictEqual(ca[s], cb[s])) out.push(`[target.${c}.${s}]`);
      }
    }
  }
  return out;
}

// The head of the test module, `#[cfg(test)]`, other attributes after it, then `mod tests`.
const TETE = String.raw`#\[cfg\(test\)\](?:\s*#\[[^\]\n]*\])*\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+tests\s*`;

// The declaration of the test module in a file of code, `#[cfg(test)] mod tests;`, its lines and
// the blank line before them.
const DECLARATION = new RegExp(String.raw`(?:^\r?\n)?^[ \t]*${TETE};[ \t]*(?:\r?\n|$)`, 'gm');

// The head of an inline test module, `#[cfg(test)] mod tests {`.
const EN_LIGNE = new RegExp(String.raw`^[ \t]*${TETE}\{`, 'm');

// The lexemes of Rust whose braces and quotes are no code, each a sticky expression from its
// start: a raw string (`r#"…"#`, `br`, `cr`, its hashes captured), a string (`"…"`, `b"`, `c"`),
// a character or a byte (`'{'`, `b'{'`, `'\''`, `'\u{7B}'`); a lifetime (`'a`) is none.
const BRUTE = /(?<![\w])[bc]?r(#*)"/y;
const CHAINE = /(?<![\w])[bc]?"(?:\\[\s\S]|[^\\"])*"/y;
const CARACTERE = /(?<![\w])b?'(?:\\u\{[0-9a-fA-F]{1,6}\}|\\x[0-9a-fA-F]{2}|\\[\s\S]|[^\\'\n])'/y;

// The end of the lexeme of <texte> that starts at <i> and holds no code (a comment, nested ones
// included, a string, a character), its index past it; null when code starts at <i>. A lexeme
// left open ends with the text.
function finDuLexeme(texte, i) {
  if (texte.startsWith('//', i)) {
    const fin = texte.indexOf('\n', i);
    return fin < 0 ? texte.length : fin;
  }
  if (texte.startsWith('/*', i)) {
    let profondeur = 0;
    for (let j = i; j < texte.length; j++) {
      if (texte.startsWith('/*', j)) {
        profondeur++;
        j++;
      } else if (texte.startsWith('*/', j)) {
        j++;
        if (--profondeur === 0) return j + 1;
      }
    }
    return texte.length;
  }
  for (const re of [BRUTE, CHAINE, CARACTERE]) {
    re.lastIndex = i;
    const m = re.exec(texte);
    if (!m) continue;
    if (re !== BRUTE) return m.index + m[0].length;
    const fin = texte.indexOf(`"${m[1]}`, i + m[0].length);
    return fin < 0 ? texte.length : fin + 1 + m[1].length;
  }
  return null;
}

// The inline test module of the Rust text <texte>, from its attribute to its closing brace and the
// end of that line, with the blank line before it; null for none, or for one never closed. The
// braces of a comment, a string or a character do not count.
function moduleEnLigne(texte) {
  const m = EN_LIGNE.exec(texte);
  if (!m) {
    return null;
  }
  let profondeur = 0;
  let i = m.index + m[0].length - 1;
  while (i < texte.length) {
    const fin = finDuLexeme(texte, i);
    if (fin !== null) {
      i = fin;
      continue;
    }
    if (texte[i] === '{') {
      profondeur++;
    } else if (texte[i] === '}' && --profondeur === 0) {
      const ligne = texte.indexOf('\n', i);
      const debut = /\n\r?\n$/.test(texte.slice(0, m.index))
        ? texte.lastIndexOf('\n', m.index - 2) + 1
        : m.index;
      return texte.slice(debut, ligne < 0 ? texte.length : ligne + 1);
    }
    i++;
  }
  return null;
}

/**
 * The parts of a file of code of a crate that change from <avant> (null: no file) to <apres> out
 * of its test module: the declaration `#[cfg(test)] mod tests;` added or removed, an inline
 * `#[cfg(test)] mod tests { … }` removed, as the testwriter moves it into tests.rs. The lines
 * compare as they are, the module's blank line before it apart.
 */
function codeHorsDuModuleDeTest(avant, apres) {
  const [a, b] = [(avant ?? '').replace(DECLARATION, ''), apres.replace(DECLARATION, '')];
  const [ma, mb] = [moduleEnLigne(a), moduleEnLigne(b)];
  if (mb !== null && mb !== ma) {
    return ['le module de test en ligne, qui va dans tests.rs'];
  }
  const lignes = (texte, m) => (m === null ? texte : texte.replace(m, '')).split('\n');
  const [la, lb] = [lignes(a, ma), lignes(b, mb)];
  const n = Array.from({ length: Math.max(la.length, lb.length) }, (_, k) => k).find(
    k => la[k] !== lb[k]
  );
  if (n === undefined) {
    return [];
  }
  const ligne = (lb[n] ?? la[n]).trim();
  return [`le code hors du module de test (« ${ligne || 'une ligne vide'} »)`];
}

/**
 * The parts of a file of a crate at <chemin> (absolute, or from <racine>) that change from
 * <avant> (null: no file) to <apres> out of the part of its tests: of its Cargo.toml, the tables
 * of its tests; of a file of code of its `src/`, its test module. Null for any other file.
 * @param {string} chemin
 * @param {string} racine
 * @param {string | null} avant
 * @param {string} apres
 */
function horsDesTests(chemin, racine, avant, apres) {
  const abs = path.resolve(racine, chemin);
  const tous = crates(racine);
  if (abs.endsWith('.rs')) {
    const c = composantDans(
      tous.map(x => x.composant),
      racine,
      abs
    );
    const parts = c ? path.relative(c.dossier, abs).split(path.sep) : [];
    return parts[0] === 'src' && !unitaire(parts) ? codeHorsDuModuleDeTest(avant, apres) : null;
  }
  if (path.basename(abs) !== 'Cargo.toml') return null;
  if (!tous.some(c => path.join(c.composant.dossier, 'Cargo.toml') === abs)) return null;
  const { parse } = require('smol-toml');
  const lire = texte => {
    try {
      return { valeur: parse(texte ?? '') };
    } catch (e) {
      return { faute: `le manifeste entier, illisible (${e.message.split('\n')[0]})` };
    }
  };
  const [a, b] = [lire(avant), lire(apres)];
  if (a.faute || b.faute) return [a.faute ?? b.faute];
  return partiesHors(a.valeur, b.valeur);
}

/** What the testwriter writes of the manifests (scripts/jointure.d.ts, `manifestes`). */
export const manifestes = { verrous: ['Cargo.lock'], horsDesTests };

/**
 * The name a Cargo.toml <texte> gives its package: the `name` of its `[package]`; null for none.
 * @param {string} texte
 */
export function nomDuManifeste(texte) {
  let section = null;
  for (const l of texte.split('\n')) {
    const s = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/.exec(l);
    if (s) {
      section = s[1].trim();
      continue;
    }
    const n = /^\s*name\s*=\s*["']([^"']+)["']/.exec(l);
    if (section === 'package' && n) {
      return n[1];
    }
  }
  return null;
}

const TABLES = ['dependencies', 'dev-dependencies', 'build-dependencies'];

/**
 * The internal dependencies of the crate at <chemin> (from <racine>): each dependency with a
 * `path` (in `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]` and the same under
 * `[target.*]`; a `workspace = true` one takes the `path` of `[workspace.dependencies]` of the
 * root Cargo.toml), named by <nomA> of the folder at that path, else by its key.
 * @param {string} racine
 * @param {string} chemin
 * @param {(dossier: string) => string | null} nomA
 */
export function liensDuManifeste(racine, chemin, nomA) {
  const { parse } = require('smol-toml');
  const lire = f => (existsSync(f) ? parse(readFileSync(f, 'utf8')) : null);
  const dossier = path.join(racine, chemin);
  const m = lire(path.join(dossier, 'Cargo.toml')) ?? {};
  const communes = lire(path.join(racine, 'Cargo.toml'))?.workspace?.dependencies ?? {};
  const noms = new Set();
  const tables = [
    ...TABLES.map(t => m[t]),
    ...Object.values(m.target ?? {}).flatMap(c => TABLES.map(t => c?.[t])),
  ];
  for (const table of tables) {
    for (const [cle, spec] of Object.entries(table ?? {})) {
      const commune = spec?.workspace === true;
      const lien = commune ? communes[cle]?.path : spec?.path;
      if (typeof lien === 'string') {
        noms.add(nomA(path.resolve(commune ? racine : dossier, lien)) ?? cle);
      }
    }
  }
  return { noms: [...noms], table: 'path', outil: 'cargo' };
}
