#!/usr/bin/env node
// The guard of the internal dependencies of the packages of a language other than TypeScript: the
// package.json of a crate or of a project of Python names the same internal packages as its
// manifest, because Turborepo orders the tasks by the graph of the package.json
// (node_modules/turbo/docs/guides/multi-language.mdx:191) while cargo and uv build by the graph of
// the manifest, as Turborepo's own example of Rust keeps the two by hand.
//
//   npx grillhouse dependances-internes      (one of the frame's guards, scripts/gardes-du-cadre.mjs)
//
// - The packages are those the architecture declares of a language without package.json of its own
//   (`paquetsSansPackageJson`, ./paquet-npm.mjs) that hold a package.json; one without it is the
//   migration's (./migrations/0.31.0-paquets-dans-le-graphe.mjs).
// - The internal dependencies of the manifest: of a Cargo.toml, each dependency with a `path`
//   (`[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, and the same under
//   `[target.*]`; a `workspace = true` one takes the `path` of `[workspace.dependencies]` of the
//   root), named by the `name` of the manifest at that path; of a pyproject.toml, each entry of
//   `[tool.uv.sources]` with a `path` (named by the manifest there) or `workspace = true`.
// - The internal dependencies of the package.json: the names of its `dependencies`,
//   `devDependencies`, `optionalDependencies` and `peerDependencies` that are the name of a package
//   of the project (the ones above and the workspaces'). An external dependency, on either side,
//   is no gap.
// - Refused, one finding per package, named with the dependencies in gap in each sense: the
//   package.json that lacks a dependency its manifest links, or names an internal package its
//   manifest does not link. Written in SARIF under the guard's name, and on the error stream after
//   ⛔; the exit code is 1 when there is one, 0 otherwise.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { langage } from './langages.mjs';
import { nomDuManifeste, paquetsSansPackageJson, sansPackageJson } from './paquet-npm.mjs';
import { paquets } from './paquets.mjs';
import { ecrireSarif } from './resultats.mjs';

/** This script. */
export const SCRIPT = fileURLToPath(import.meta.url);
/** The name its findings carry. */
export const GARDE = 'dependances-internes';

// The fields of a package.json that name the packages it depends on.
const CHAMPS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

const lire = f => (existsSync(f) ? readFileSync(f, 'utf8') : null);

// The name of the package whose manifest lies in <dossier>, the one of <langageNom> first (a crate
// may link a project of Python), null for none.
function nomA(langageNom, dossier) {
  for (const l of [langageNom, ...sansPackageJson()]) {
    const texte = lire(path.join(dossier, langage(l).manifeste));
    const nom = texte === null ? null : nomDuManifeste(l, texte);
    if (nom !== null) {
      return nom;
    }
  }
  return null;
}

/**
 * The findings of the guard on the project at <racine>: `{ fichier, message }`, none when each
 * package.json and its manifest agree.
 * @param {string} racine the root of the project
 */
export function constats(racine) {
  const sans = paquetsSansPackageJson(racine);
  const internes = new Set([...sans.map(p => p.nom), ...paquets(racine).map(p => p.pkg.name)]);
  const out = [];
  for (const p of sans) {
    const f = `${p.chemin}/package.json`;
    const texte = lire(path.join(racine, f));
    if (texte === null) {
      continue;
    }
    let pkg;
    try {
      pkg = JSON.parse(texte);
    } catch {
      continue;
    }
    const manifeste = langage(p.langage).manifeste;
    const liens = langage(p.langage).liensDuManifeste(racine, p.chemin, d => nomA(p.langage, d));
    const duManifeste = new Set(liens.noms);
    duManifeste.delete(p.nom);
    const duPackage = new Set(
      CHAMPS.flatMap(c => Object.keys(pkg[c] ?? {})).filter(n => internes.has(n) && n !== p.nom)
    );
    const manquantes = [...duManifeste].filter(n => !duPackage.has(n)).sort();
    const enTrop = [...duPackage].filter(n => !duManifeste.has(n)).sort();
    if (!manquantes.length && !enTrop.length) {
      continue;
    }
    const dits = [
      ...(manquantes.length
        ? [
            `${manifeste} lie ${manquantes.join(', ')} (${liens.table}), que le package.json ne nomme pas`,
          ]
        : []),
      ...(enTrop.length
        ? [`le package.json nomme ${enTrop.join(', ')}, que ${manifeste} ne lie pas`]
        : []),
    ];
    out.push({
      fichier: f,
      message: `${f} : le paquet ${p.nom} diffère de son manifeste dans ses dépendances internes : ${dits.join(' ; ')} ; le graphe des tâches suit le package.json, ${liens.outil} par ${manifeste} : les deux nomment les mêmes paquets.`,
    });
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = process.cwd();
  let refus;
  try {
    refus = constats(racine);
  } catch (e) {
    refus = [{ message: e.message.replace(/^⛔ /, '') }];
  }
  for (const r of refus) {
    process.stderr.write(`⛔ ${r.message}\n`);
  }
  ecrireSarif({ garde: GARDE, racine, constats: refus });
  process.exitCode = refus.length ? 1 : 0;
}
