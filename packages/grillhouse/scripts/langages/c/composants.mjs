// The components of a project of C, as CMake finds a project: the packages the module c answers the
// join with (scripts/jointure.d.ts, `composants`, `composantDe`, `matieres`, `joueDesTests`,
// `lecteurs`, `estUnTest`, `manifestes`, `entreesDeLIndex`).
//
// - A component is a folder whose CMakeLists.txt calls `project(<nom>`, found under the root, the
//   folders whose name begins with a dot (`.build-cmake` included) and those of LAISSES left out,
//   and a CMakeLists.txt git ignores (the local clone of another repository) left out too:
//   its folder, its name and its package the name `project()` gives. The CMakeLists.txt of
//   `tests/`, which calls no `project(`, is the package's matter, never a component. `project(` is
//   read in any case, after the comments (`#`) are cut, a space before the parenthesis allowed,
//   its name on the same line or the next. The language of a package is declared in the
//   architecture; its CMakeLists.txt is there because CMake asks it.
// - The component of a file is the one of the longest folder that holds it.
// - No shared test material: a package of C shares its helpers with its tests under `tests/`.
// - A test file is a `tests/test_*.c` of the package: one executable and one CTest test, played. A
//   component plays tests when it holds one.
// - What the testwriter writes: a `tests/test_*.c`, played (`joue`), and any other file under
//   `tests/`, his helpers and his data (`matiere`, not played). The CMakeLists.txt of the package's
//   root is the code's, which a change of his is refused, named (`manifestes`); no lock file.
// - The readers of a package: none read by the module; a name no component bears is without
//   provider.
// - The entries of the index of the interfaces: one per component that holds a
//   `docs/INTERFACE.md`, and the root's, as the module python's.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ignoresParGit } from '../../paquets.mjs';
import { luUneFois } from '../../services-du-noyau.mjs';

export const MANIFESTE = 'CMakeLists.txt';
// The folders the search of the components leaves out, beside those that begin with a dot.
const LAISSES = new Set(['node_modules', 'target', 'dist']);
/** The folder of the tests of a package. */
export const TESTS = 'tests';

/** Whether <nom>, a file's name, is a test file CTest plays: `test_*.c`. */
export const estUnFichierDeTest = nom => /^test_.+\.c$/.test(nom);

/**
 * The name the text of a CMakeLists.txt gives its project: the first argument of its `project(`,
 * its comments cut; null for none.
 * @param {string} texte
 */
export function nomDuManifeste(texte) {
  const sans = texte
    .split('\n')
    .map(l => l.replace(/#.*$/, ''))
    .join('\n');
  const m = /(?:^|[^\w])project\s*\(\s*([^\s)]+)/i.exec(sans);
  return m ? m[1].replace(/^"|"$/g, '') : null;
}

// The folders under <dossier> that hold a CMakeLists.txt with a project(, <dossier> included.
function dossiersAvecProjet(dossier) {
  const f = path.join(dossier, MANIFESTE);
  const nom = existsSync(f) ? nomDuManifeste(readFileSync(f, 'utf8')) : null;
  const out = nom === null ? [] : [{ dossier, nom }];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.') && !LAISSES.has(e.name)) {
      out.push(...dossiersAvecProjet(path.join(dossier, e.name)));
    }
  }
  return out;
}

/** The components of the project at <racine>, sorted by folder; read once in a scope of the core
 * (`luUneFois`): a sweep asks it of every file of a folder. */
export function composants(racine) {
  return luUneFois(`c composants ${path.resolve(racine)}`, () => {
    const trouves = dossiersAvecProjet(racine);
    const ignores = ignoresParGit(
      racine,
      trouves.map(t => path.join(t.dossier, MANIFESTE))
    );
    return trouves
      .filter(t => !ignores.has(path.join(t.dossier, MANIFESTE)))
      .sort((a, b) => (a.dossier < b.dossier ? -1 : a.dossier > b.dossier ? 1 : 0))
      .map(({ dossier, nom }) => ({ dossier, nom, paquet: nom }));
  });
}

/** The component of <liste> that holds <fichier> (absolute, or from <racine>), the longest folder. */
export function composantDans(liste, racine, fichier) {
  const abs = path.resolve(racine, fichier);
  const tenants = liste.filter(c => abs === c.dossier || abs.startsWith(`${c.dossier}${path.sep}`));
  return tenants.sort((a, b) => b.dossier.length - a.dossier.length)[0] ?? null;
}

/** The test files of the package at <dossier> (absolute): its `tests/test_*.c`, sorted. */
export function fichiersDeTest(dossier) {
  const tests = path.join(dossier, TESTS);
  return existsSync(tests)
    ? readdirSync(tests, { withFileTypes: true })
        .filter(e => e.isFile() && estUnFichierDeTest(e.name))
        .map(e => path.join(tests, e.name))
        .sort()
    : [];
}

/** Whether the component <composant> plays tests: it holds a `tests/test_*.c`. */
export const joueDesTests = (_racine, composant) => fichiersDeTest(composant.dossier).length > 0;

/**
 * What the testwriter writes in <chemin>, absolute or from <racine>: `{ joue, test, matiere }`, or
 * null for a file he does not write.
 */
export function estUnTest(chemin, racine) {
  const abs = path.resolve(racine, chemin);
  const c = composantDans(composants(racine), racine, abs);
  if (!c) {
    return null;
  }
  const parts = path.relative(c.dossier, abs).split(path.sep);
  if (parts[0] !== TESTS || parts.length < 2) {
    return null;
  }
  if (parts.length === 2 && estUnFichierDeTest(parts[1])) {
    return { joue: true, test: true, matiere: false };
  }
  return { joue: false, test: true, matiere: false };
}

/**
 * The parts of the CMakeLists.txt of a package's root that change from <avant> to <apres>: the
 * file whole, which is the code's, never the testwriter's. Null for any other file.
 */
function horsDesTests(chemin, racine, avant, apres) {
  const abs = path.resolve(racine, chemin);
  const c = composants(racine).find(x => x.dossier === path.dirname(abs));
  if (!c || path.basename(abs) !== MANIFESTE) {
    return null;
  }
  return (avant ?? '') === (apres ?? '') ? [] : [`${MANIFESTE} de ${c.nom}, le fichier entier`];
}

/** What the testwriter writes of the manifests (scripts/jointure.d.ts, `manifestes`): no lock
 * file, and a root CMakeLists.txt refused. */
export const manifestes = { verrous: [], horsDesTests };

/** The internal dependencies of a CMakeLists.txt: none read by the module. */
export const liensDuManifeste = () => ({ noms: [], table: MANIFESTE, outil: 'cmake' });

/** The readers of the packages <noms>: none; a name no component bears, without provider. */
export function lecteurs(_racine, { composants: liste, noms }) {
  const elements = [];
  const sansFournisseur = [];
  for (const nom of noms) {
    const fournisseur = liste.find(c => c.paquet === nom || c.nom === nom);
    if (fournisseur) {
      elements.push({ nom, fournisseur, lecteurs: [] });
    } else {
      sansFournisseur.push(nom);
    }
  }
  return {
    elements,
    sansFournisseur,
    types: { etat: 'fait', raison: null, elements: [] },
    lit: new Map(liste.map(c => [c, new Set()])),
    parLesTests: new Map(liste.map(c => [c, new Set()])),
  };
}

const premierePhrase = lignes => {
  const texte = lignes.join(' ').replace(/\s+/g, ' ').trim();
  return /^(.+?[.!?])(\s|$)/.exec(texte)?.[1] ?? texte;
};

// The interface of the root.
const RACINE = 'docs/INTERFACE.md';

/**
 * The entries of the index of the interfaces of <racine> (`entreesDeLIndex`): `{ rel, lignes }`
 * for each `<composant>/docs/INTERFACE.md`, and for the root's `docs/INTERFACE.md`, by path; the
 * heading the title alone when it begins with the component's name, else `<composant> — <titre>`,
 * the root's `(racine)` when no package lies at the root, as the module python's.
 */
export function entreesDeLIndex(racine) {
  const parRel = new Map();
  for (const c of composants(racine)) {
    const rel = path.relative(racine, path.join(c.dossier, 'docs', 'INTERFACE.md'));
    if (existsSync(path.join(racine, rel))) {
      parRel.set(rel.split(path.sep).join('/'), c.nom);
    }
  }
  if (existsSync(path.join(racine, RACINE)) && !parRel.has(RACINE)) {
    parRel.set(RACINE, '(racine)');
  }
  return [...parRel]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([rel, nom]) => {
      const lignes = readFileSync(path.join(racine, rel), 'utf8').split('\n');
      const t = lignes.findIndex(l => l.startsWith('# '));
      const titre = t >= 0 ? lignes[t].slice(2).trim() : nom;
      const paragraphe = [];
      for (const l of lignes.slice(t + 1)) {
        if (/^#{1,6} /.test(l) || (!l.trim() && paragraphe.length)) {
          break;
        }
        if (l.trim()) {
          paragraphe.push(l.trim());
        }
      }
      const parSonNom =
        nom !== '(racine)' &&
        titre.startsWith(nom) &&
        (titre.length === nom.length || /\s/.test(titre[nom.length]));
      return {
        rel,
        lignes: [
          `## ${parSonNom ? titre : `${nom} — ${titre}`}`,
          '',
          `${premierePhrase(paragraphe)} (\`${rel}\`)`,
          '',
        ],
      };
    });
}
