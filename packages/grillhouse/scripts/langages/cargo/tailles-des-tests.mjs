#!/usr/bin/env node
// The size of each test of Rust, on the model of the test pyramid of Google and of Bazel's `size`,
// as the modules typescript's and python's guards (../typescript/tailles-des-tests.mjs,
// ../python/tailles-des-tests.mjs): a large test of the day is refused, as it belongs to the night.
//
//   npx grillhouse tailles-des-tests   run from the repository root (a guard of grillhouse:gardes)
//
// - The test files are those of each crate of the workspace (./composants.mjs, `crates`): each
//   test target cargo describes (`tests/<nom>.rs`, `tests/<dossier>/main.rs`), and each unit test
//   file under `src/` (a `tests.rs`, a file of a folder `tests/`, `unitaire`). A test target whose
//   name ends with `_nuit` is a night test, with `_budget` a time budget bench (`horsDuJour`,
//   ./commandes.mjs); a unit test file is of the day. A target `tests/<dossier>/main.rs` (the
//   crate's one executable, `tests/it/main.rs`, ./executables-de-tests.mjs) gives each module of
//   tests it declares as a test file of its own, and its root when it holds a test itself
//   (`fichiersDeLaCible`): one large module is refused by its name, never the whole executable.
// - A test is classed by a static reading of its text, of the modules it declares (`mod common;`,
//   `#[path = "…"] mod x;`), followed from file to file as rustc finds them, and of each crate of
//   the shared test material (`matiere`) whose name it writes (`ws_essai::`, `use ws_essai`), its
//   files under `src/`; a crate of the product it uses is not read: what it starts is its own.
//   - large (`grand`): it starts a process (`std::process`, `tokio::process`, `assert_cmd`, `duct`,
//     `xshell`), mounts a trial repository (git's `init`, `clone` or `worktree add`, as an
//     argument or a command, or git2's `Repository::init` and `Repository::clone`) and starts
//     there something else than git (`Command::new` of a binary of the product, `cargo_bin`,
//     `cmd!` of another program);
//   - medium (`moyen`): it starts a process;
//   - small (`petit`): it starts none.
// - A large test of the day is a finding, `{ fichier, regle: 'grand-de-jour', message }`; a night
//   test or a bench never is one. A finding inscribed in the project's debt
//   (`grillhouse-dette.json`, ../../dette.mjs) passes: the large tests of the day a project holds
//   when the rule arrives are inscribed there by the update
//   (./migrations/0.28.4-tailles-des-tests.mjs), the count never rises, and a new one is refused.
// - The guard writes on its error stream the count of each size, the night's included.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MODE, trancher } from '../../dette.mjs';
import { horsDuJour } from './commandes.mjs';
import { crates, unitaire } from './composants.mjs';

// The name of its findings and of its debt, apart from the module typescript's guard of the same
// command, whose section of the debt it never writes.
export const GARDE = 'tailles-des-tests-cargo';
export const GRAND_DE_JOUR = 'grand-de-jour';

// The use of a way to start a process.
const PROCESSUS = /\b(?:std|tokio|async_std)::process\b|\b(?:assert_cmd|duct|xshell)\b/;
// A trial repository mounted: git's `init`, `clone` or `worktree add`, as an argument or a command;
// git2's `Repository::init` or `Repository::clone`.
const DEPOT_D_ESSAI =
  /"(?:init|clone)"|\bgit\s+(?:-C\s+\S+\s+)?(?:init|clone)\b|"worktree"\s*,\s*"add"|\bworktree\s+add\b|\bRepository::(?:init|clone)\w*\s*\(/;
// A call that starts a process, its program captured: `Command::new(<programme>`, assert_cmd's
// `cargo_bin(<binaire>`, the macro `cmd!` of duct (`cmd!("git", …)`) and of xshell (`cmd!(sh,
// "git …")`).
const APPEL =
  /\bCommand::new\s*\(\s*([^,)\n]*)|\bcargo_bin\s*\(\s*([^,)\n]*)|\bcmd!\s*\(\s*(?:[A-Za-z_]\w*\s*,\s*)?([^,)\n]*)/g;
// A program that names git.
const GIT = /^r?#*"git(?:"|\s)/;
// The declaration of a module in its own file, `mod <nom>;`, with its attribute `#[path = "…"]`.
const MODULE =
  /^[ \t]*(?:#\[path\s*=\s*"([^"]+)"\]\s*)?(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*;/gm;

// The text of the file <f>, null when it does not read.
const lireLeDisque = f => {
  try {
    return readFileSync(f, 'utf8');
  } catch {
    return null;
  }
};

// Whether <f> owns its directory as rustc reads it, its modules beside it: a crate root (a test
// target `tests/<nom>.rs` or `tests/<dossier>/main.rs`, `lib.rs`, `main.rs`) or a `mod.rs`.
function racineDeModules(f) {
  const base = path.basename(f);
  if (['mod.rs', 'lib.rs', 'main.rs'].includes(base)) {
    return true;
  }
  return path.basename(path.dirname(f)) === 'tests';
}

// The file of the module <nom> that <f> declares (with <chemin>, its attribute `#[path]`), read by
// <lire>: the first that reads, rustc's place first; null for none.
function fichierDuModule(f, nom, chemin, lire) {
  const dir = path.dirname(f);
  if (chemin) {
    return path.resolve(dir, chemin);
  }
  const propre = path.join(dir, path.basename(f, '.rs'));
  const cote = [path.join(dir, `${nom}.rs`), path.join(dir, nom, 'mod.rs')];
  const dessous = [path.join(propre, `${nom}.rs`), path.join(propre, nom, 'mod.rs')];
  const ordre = racineDeModules(f) ? [...cote, ...dessous] : [...dessous, ...cote];
  return ordre.find(c => lire(c) !== null) ?? null;
}

/**
 * The size of the test file <fichier> (absolute), read by <lire> (a path → its text, null when it
 * does not read), the crates of the shared test material <matieres> (`[{ nom, fichiers }]`, `nom`
 * the crate as Rust names it, `fichiers` its files, absolute): `petit`, `moyen` or `grand`.
 */
export function classer(fichier, lire = lireLeDisque, matieres = []) {
  const textes = [];
  const vus = new Set();
  const suivre = f => {
    if (vus.has(f)) {
      return;
    }
    vus.add(f);
    const texte = lire(f);
    if (texte === null) {
      return;
    }
    textes.push(texte);
    for (const m of texte.matchAll(MODULE)) {
      const cible = fichierDuModule(f, m[2], m[1], lire);
      if (cible) {
        suivre(cible);
      }
    }
  };
  suivre(fichier);
  const propre = textes.join('\n');
  for (const m of matieres) {
    if (new RegExp(`\\b${m.nom}::|\\buse\\s+${m.nom}\\b`).test(propre)) {
      m.fichiers.forEach(suivre);
    }
  }
  const tout = textes.join('\n');
  const processus = PROCESSUS.test(tout);
  const autreQueGit = [...tout.matchAll(APPEL)].some(m => !GIT.test((m[1] ?? m[2] ?? m[3]).trim()));
  if (processus && autreQueGit && DEPOT_D_ESSAI.test(tout)) {
    return 'grand';
  }
  return processus ? 'moyen' : 'petit';
}

// The files of Rust under <dossier>, absolute; none when it does not exist.
const rust = dossier =>
  existsSync(dossier)
    ? readdirSync(dossier, { recursive: true, withFileTypes: true })
        .filter(e => e.isFile() && e.name.endsWith('.rs'))
        .map(e => path.join(e.parentPath, e.name))
    : [];

// Whether <f> is the root of a test target `tests/<dossier>/main.rs`, whose test files are its
// modules (`tests/it/main.rs`, ./executables-de-tests.mjs).
const racineDeDossier = f =>
  path.basename(f) === 'main.rs' && path.basename(path.dirname(path.dirname(f))) === 'tests';

// An attribute of a test, `#[test]` or `#[<chemin>::test]`.
const ATTRIBUT_DE_TEST = /#\[\s*(?:\w+\s*::\s*)*test\s*\]/;

// The modules <f> declares, each `{ nom, fichier }`, its file as rustc finds it; none unread.
const modulesDe = f =>
  [...(lireLeDisque(f) ?? '').matchAll(MODULE)]
    .map(m => ({ nom: m[2], fichier: fichierDuModule(f, m[2], m[1], lireLeDisque) }))
    .filter(m => m.fichier !== null);

// The files of <f> and of the modules it declares, followed from file to file.
function arbreDe(f, vus = new Set()) {
  if (!vus.has(f)) {
    vus.add(f);
    modulesDe(f).forEach(m => arbreDe(m.fichier, vus));
  }
  return [...vus];
}

/**
 * The test files of the target rooted at <main> (`tests/<dossier>/main.rs`), each classed apart,
 * as Cargo's testsuite holds one test file per module: each module it declares that holds a test,
 * its text and its submodules, reading the other modules of the root, its helpers (`mod common;`),
 * only when it writes their name (`common::`), as a crate of the shared test material; and the
 * root when it holds a test of its own, its helpers read, its modules of tests left out.
 * `[{ abs, masques, appuis }]`: `masques` the files a reading leaves out, `appuis` the helpers as
 * `classer` takes the material.
 */
function fichiersDeLaCible(main) {
  const modules = modulesDe(main).map(m => ({ ...m, arbre: arbreDe(m.fichier) }));
  const appuis = modules.map(m => ({ nom: m.nom, fichiers: m.arbre }));
  const deTests = modules.filter(m =>
    m.arbre.some(f => ATTRIBUT_DE_TEST.test(lireLeDisque(f) ?? ''))
  );
  const racine = ATTRIBUT_DE_TEST.test(lireLeDisque(main) ?? '')
    ? [{ abs: main, masques: new Set(deTests.flatMap(m => m.arbre)), appuis: [] }]
    : [];
  return [
    ...racine,
    ...deTests.map(m => ({
      abs: m.fichier,
      masques: new Set(),
      appuis: appuis.filter(a => a.nom !== m.nom),
    })),
  ];
}

/** Each test file of the workspace at <racine> and its size: `[{ fichier, taille, nuit }]`. */
export function tailles(racine) {
  const tous = crates(racine);
  const matieres = tous
    .filter(c => c.matiere)
    .map(c => ({
      nom: c.composant.nom.replace(/-/g, '_'),
      fichiers: rust(path.join(c.composant.dossier, 'src')),
    }));
  const tests = tous.flatMap(c => {
    const src = path.join(c.composant.dossier, 'src');
    const unitaires = rust(src)
      .filter(f => unitaire(['src', ...path.relative(src, f).split(path.sep)]))
      .map(f => ({ abs: f, nuit: false }));
    const cibles = c.cibles
      .filter(t => t.kind.includes('test'))
      .flatMap(t => {
        const nuit = horsDuJour(t) !== null;
        return racineDeDossier(t.src)
          ? fichiersDeLaCible(t.src).map(m => ({ ...m, nuit }))
          : [{ abs: t.src, nuit, masques: new Set(), appuis: [] }];
      });
    return [...cibles, ...unitaires.map(u => ({ ...u, masques: new Set(), appuis: [] }))];
  });
  return tests
    .map(({ abs, nuit, masques, appuis }) => ({
      fichier: path.relative(racine, abs).split(path.sep).join('/'),
      taille: classer(abs, f => (masques.has(f) ? null : lireLeDisque(f)), [
        ...matieres,
        ...appuis,
      ]),
      nuit,
    }))
    .sort((a, b) => a.fichier.localeCompare(b.fichier, 'en'));
}

/** The findings of the workspace at <racine>: one per large test of the day. */
export function verifier(racine) {
  return tailles(racine)
    .filter(t => t.taille === 'grand' && !t.nuit)
    .map(({ fichier }) => ({
      fichier,
      regle: GRAND_DE_JOUR,
      message: `${fichier} : un grand test (il monte un dépôt d'essai et y lance le produit ou le cadre) est un test de nuit, jamais joué au fil du travail ; il passe en test de nuit, un module de tests/it_nuit/, ou il se réduit à la plus petite taille qui prouve son critère.`,
    }));
}

// The report of the check at <racine>: `lignes`, what the command writes on stderr (each refusal
// prefixed with `⛔`, then the debt's lines, then the count of each size), and `code`, its exit code
// (1 on a refusal). The functional core of the command: it reads the repository and the project's
// debt and writes nothing to the standard streams; the command below is its shell. The refusals
// reach SARIF through `trancher` under the results directory <env> names (scripts/resultats.mjs);
// without it none is written, and the debt's mode is <env>'s `GRILLHOUSE_DETTE`.
export function rapport(racine, env = process.env) {
  const toutes = tailles(racine);
  const compte = t => toutes.filter(x => x.taille === t).length;
  const { refus, lignes } = trancher(racine, GARDE, verifier(racine), env[MODE] || undefined, env);
  const resume = `ℹ️  ${GARDE} : ${toutes.length} fichier(s) de tests, ${compte('petit')} petit(s), ${compte('moyen')} moyen(s), ${compte('grand')} grand(s) ; ${toutes.filter(x => x.nuit).length} de nuit ou de banc.`;
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
