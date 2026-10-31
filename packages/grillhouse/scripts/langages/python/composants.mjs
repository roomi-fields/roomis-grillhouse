// The components of a project of Python, as uv finds a project (PEP 621, `pyproject.toml`): the
// packages the module python answers the join with (scripts/jointure.d.ts, `composants`,
// `composantDe`, `matieres`, `joueDesTests`, `lecteurs`, `estUnTest`, `manifestes`,
// `entreesDeLIndex`).
//
// - A component is a folder that holds a pyproject.toml, found under the root, the folders whose
//   name begins with a dot and those of LAISSES left out: its folder, its name the folder's, its
//   package the `name` of its table `[project]`, null without one. The language of a package is
//   declared in the architecture (decision D2 of grillhouse-1zu); its pyproject.toml, its group
//   `test` and its uv.lock are there because uv asks them.
// - The component of a file is the one of the longest folder that holds it, as uv finds the
//   project of a file by climbing its directories.
// - No shared test material: a package of Python shares its helpers with its tests by its
//   `conftest.py`, pytest's own.
// - A test file is one pytest collects by default (`python_files`): `test_*.py`, `*_test.py`; a
//   night test, `*_nuit_test.py`, is one too, played at night (./commandes.mjs). A component plays
//   tests when it holds a test file out of the night.
// - What the testwriter writes: a test file, its runner plays it (`joue`); a `conftest.py`, and
//   any file under a folder `tests/` of a component, his helpers and his data. Of the manifests
//   (`manifestes`): the group `test` of the table `[dependency-groups]` of a pyproject.toml (PEP
//   735), what the tests depend on, and the uv.lock of a component, which uv brings in line with
//   it; a change of any other part of a pyproject.toml is named by it. The pyproject.toml is read
//   with smol-toml, a tool of this module (`outils`), an optional peer of the package loaded when a
//   manifest is judged.
// - The readers of a package: none read by the module (a dependency between two packages of
//   Python is no part of this ticket); a name no component bears is without provider.
// - The entries of the index of the interfaces: one per component that holds a
//   `docs/INTERFACE.md`, and the root's, its title and the first sentence under it, as the module
//   cargo's.
// - A manifest (pyproject.toml, uv.lock) is never a test file, even under `tests/`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const require = createRequire(import.meta.url);

export const MANIFESTE = 'pyproject.toml';
export const VERROU = 'uv.lock';
/** The group of `[dependency-groups]` that holds what the tests depend on. */
export const GROUPE = 'test';
// The folders the search of the components leaves out, beside those that begin with a dot.
const LAISSES = new Set(['node_modules', 'target', 'dist', '__pycache__']);

/** Whether <nom>, a file's name, is a test file pytest collects. */
export const estUnFichierDeTest = nom => /^test_.*\.py$|_test\.py$/.test(nom);
/** Whether <nom>, a file's name, is a night test. */
export const estDeNuit = nom => nom.endsWith('_nuit_test.py');

// The name of the table `[project]` of the manifest <texte>, null for none.
function nomDuProjet(texte) {
  let section = null;
  for (const l of texte.split('\n')) {
    const s = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/.exec(l);
    if (s) {
      section = s[1].trim();
    }
    const n = /^\s*name\s*=\s*["']([^"']+)["']/.exec(l);
    if (section === 'project' && n) {
      return n[1];
    }
  }
  return null;
}

// The folders under <dossier> that hold a pyproject.toml, <dossier> included.
function dossiersAvecManifeste(dossier) {
  const out = existsSync(path.join(dossier, MANIFESTE)) ? [dossier] : [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.') && !LAISSES.has(e.name)) {
      out.push(...dossiersAvecManifeste(path.join(dossier, e.name)));
    }
  }
  return out;
}

/** The components of the project at <racine>, sorted by folder. */
export function composants(racine) {
  return dossiersAvecManifeste(racine)
    .sort()
    .map(dossier => ({
      dossier,
      nom: path.basename(dossier),
      paquet: nomDuProjet(readFileSync(path.join(dossier, MANIFESTE), 'utf8')),
    }));
}

/** The component of <liste> that holds <fichier> (absolute, or from <racine>), the longest folder. */
export function composantDans(liste, racine, fichier) {
  const abs = path.resolve(racine, fichier);
  const tenants = liste.filter(c => abs === c.dossier || abs.startsWith(`${c.dossier}${path.sep}`));
  return tenants.sort((a, b) => b.dossier.length - a.dossier.length)[0] ?? null;
}

/** The test files of <dossier> (absolute), its .venv and the folders of LAISSES left out. */
export function fichiersDeTest(dossier) {
  const out = [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const f = path.join(dossier, e.name);
    if (e.isDirectory() && !e.name.startsWith('.') && !LAISSES.has(e.name)) {
      if (!existsSync(path.join(f, MANIFESTE))) {
        out.push(...fichiersDeTest(f));
      }
    } else if (e.isFile() && estUnFichierDeTest(e.name)) {
      out.push(f);
    }
  }
  return out.sort();
}

/** Whether the component <composant> plays tests: a test file out of the night. */
export const joueDesTests = (_racine, composant) =>
  fichiersDeTest(composant.dossier).some(f => !estDeNuit(path.basename(f)));

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
  const nom = parts.at(-1);
  if (estUnFichierDeTest(nom)) {
    return { joue: true, test: true, matiere: false };
  }
  // A manifest is never a test file: under `tests/`, it would make a package of its own.
  if ([MANIFESTE, VERROU].includes(nom)) {
    return null;
  }
  if (nom === 'conftest.py' || parts.slice(0, -1).includes('tests')) {
    return { joue: false, test: true, matiere: false };
  }
  return null;
}

// The parts of the parsed manifests <a> and <b> that differ, out of the group of the tests: each
// `[<table>]`, a group of `[dependency-groups]` as `[dependency-groups].<groupe>`, a key out of
// every table bare.
function partiesHors(a, b) {
  const cles = (x, y) => [...new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})])].sort();
  const out = [];
  for (const k of cles(a, b)) {
    if (isDeepStrictEqual(a[k], b[k])) {
      continue;
    }
    if (k === 'dependency-groups') {
      for (const g of cles(a[k], b[k])) {
        if (g !== GROUPE && !isDeepStrictEqual(a[k]?.[g], b[k]?.[g])) {
          out.push(`[dependency-groups].${g}`);
        }
      }
      continue;
    }
    const tableau = [a[k], b[k]].some(v => v !== null && typeof v === 'object');
    out.push(tableau ? `[${k}]` : k);
  }
  return out;
}

/**
 * The parts of a file of a component at <chemin> (absolute, or from <racine>) that change from
 * <avant> (null: no file) to <apres> out of the part of its tests: of its pyproject.toml, every
 * part but the group `test` of `[dependency-groups]`; of its uv.lock, none. Null for any other file.
 */
function horsDesTests(chemin, racine, avant, apres) {
  const abs = path.resolve(racine, chemin);
  const c = composants(racine).find(x => x.dossier === path.dirname(abs));
  const nom = path.basename(abs);
  if (!c || ![MANIFESTE, VERROU].includes(nom)) {
    return null;
  }
  if (nom === VERROU) {
    return [];
  }
  const { parse } = require('smol-toml');
  const lire = texte => {
    try {
      return { valeur: parse(texte ?? '') };
    } catch (e) {
      return { faute: `le manifeste entier, illisible (${e.message.split('\n')[0]})` };
    }
  };
  const [x, y] = [lire(avant), lire(apres)];
  if (x.faute || y.faute) {
    return [x.faute ?? y.faute];
  }
  return partiesHors(x.valeur, y.valeur);
}

/** What the testwriter writes of the manifests (scripts/jointure.d.ts, `manifestes`). */
export const manifestes = { verrous: [VERROU], horsDesTests };

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
 * the root's `(racine)` when no package lies at the root, as the module cargo's.
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
