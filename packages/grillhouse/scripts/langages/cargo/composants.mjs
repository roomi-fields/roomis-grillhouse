// The components of a workspace of cargo, as cargo itself describes them (`cargo metadata
// --format-version 1 --no-deps --offline`): the crates the module cargo answers the join with
// (scripts/jointure.d.ts, `composants`, `composantDe`, `matieres`, `joueDesTests`, `lecteurs`,
// `estUnTest`).
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
// - A crate plays tests when it has a folder `tests/`, where cargo finds its integration tests:
//   the tests of the project live there (decision 5 of the epic grillhouse-pkl).
// - The readers of a crate: the members that depend on it by its path, of any kind (`normal`,
//   `dev`, `build`), the kind in `par`; a name no member bears is without provider. The types
//   give no survey of their own: `etat` done, no element.
// - What the testwriter writes: a file of `<crate>/tests/` is a test file; the runner plays the
//   ones cargo makes a test target of, `tests/<nom>.rs` and `tests/<dossier>/main.rs`, and the
//   others are their helpers and data (`tests/fixtures/`, as OSC Bridge's devices); a file of
//   `<crate>/tests/common/`, the helpers cargo's book puts there, is test material too; a file of
//   a crate of the shared test material is material; any other file of a crate (`src/` included)
//   is none of them.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

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
  const r = spawnSync('cargo', ['metadata', '--format-version', '1', '--no-deps', '--offline'], {
    cwd: racine,
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

/** Whether the crate <composant> has a folder `tests/`, its integration tests. */
export function joueDesTests(_racine, composant) {
  const d = path.join(composant.dossier, 'tests');
  return existsSync(d) && statSync(d).isDirectory();
}

/**
 * The readers, by their manifests, of the crates <noms> among <composants> of <racine>: each a
 * reader `{ composant, par }`, `par` the kinds of its dependencies on it.
 */
export function lecteurs(racine, { composants: liste, noms }) {
  const tous = crates(racine);
  const parDossier = new Map(liste.map(c => [c.dossier, c]));
  const lit = new Map(liste.map(c => [c, new Set()]));
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
  return matiere ? { joue: false, test: false, matiere: true } : null;
}
