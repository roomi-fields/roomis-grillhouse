#!/usr/bin/env node
// The lock of the dependencies (package-lock.json) against the package.json it locks, on the model
// of `npm ci`, which refuses a lock out of step with its package.json: the lock is written by the
// frame at the integration (`fichiersEngendres` of ./index.mjs), and this guard refuses a copy
// whose lock is late.
//
//   npx grillhouse verrou-des-dependances   run from the repository root (a guard of grillhouse:gardes)
//
// - For each package.json of the repository (the root's, and each workspace's), its `dependencies`,
//   `devDependencies`, `optionalDependencies` and `peerDependencies` are compared with the entry of
//   its package in the `packages` key of the lock (`""` for the root), without the registry and
//   whatever the version of npm: a declared dependency absent from the lock, a dependency removed
//   from the package.json still in the lock's entry, a range that differs from the entry's, a
//   resolved version of the lock that no longer satisfies the declared range.
// - A finding is `{ fichier, message }`, one per package and dependency, the message naming the
//   command that writes the lock again (COMMANDE). A repository without a lock is not judged, nor
//   one whose project declares package-lock.json in `grillhouse.engendres` (its command is its own).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import semver from 'semver';
import { ecrireSarif } from '../../resultats.mjs';

export const GARDE = 'verrou-des-dependances';
export const COMMANDE = 'npm install --package-lock-only --no-audit --no-fund';

const SORTES = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const LOCK = 'package-lock.json';

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// The directories (from <racine>) the workspaces of the root package.json name: a literal path, or
// `<dossier>/*`.
function espaces(racine, manifeste) {
  const motifs = Array.isArray(manifeste?.workspaces)
    ? manifeste.workspaces
    : (manifeste?.workspaces?.packages ?? []);
  const dossiers = [];
  for (const m of motifs.filter(x => typeof x === 'string')) {
    const motif = m.replace(/^\.\//, '').replace(/\/+$/, '');
    if (motif.endsWith('/*')) {
      const parent = motif.slice(0, -2);
      const lus = existsSync(path.join(racine, parent))
        ? readdirSync(path.join(racine, parent), { withFileTypes: true })
        : [];
      dossiers.push(...lus.filter(e => e.isDirectory()).map(e => `${parent}/${e.name}`));
    } else if (!motif.includes('*')) {
      dossiers.push(motif);
    }
  }
  return dossiers.filter(d => existsSync(path.join(racine, d, 'package.json')));
}

// The version the lock resolves <nom> to for the entry <cle>: the nearest `node_modules/<nom>`,
// following the link of a package of the repository; null when the lock holds none.
function resolue(packages, cle, nom) {
  const candidats = [];
  let c = cle;
  for (;;) {
    candidats.push(c ? `${c}/node_modules/${nom}` : `node_modules/${nom}`);
    if (!c) {
      break;
    }
    const i = c.lastIndexOf('/node_modules/');
    c = i === -1 ? '' : c.slice(0, i);
  }
  const trouve = candidats.map(c => packages[c]).find(Boolean);
  if (!trouve) {
    return null;
  }
  const cible = trouve.link && trouve.resolved ? packages[trouve.resolved] : trouve;
  return typeof cible?.version === 'string' ? cible.version : null;
}

/**
 * The findings of the repository at <racine>: `[{ fichier, message }]`, one per package and
 * dependency whose lock entry is out of step with its package.json.
 * @param {string} racine
 * @returns {{ fichier: string, message: string }[]}
 */
export function verifierLesConstats(racine) {
  const verrou = lireJson(path.join(racine, LOCK));
  const racineManifeste = lireJson(path.join(racine, 'package.json'));
  if (!verrou || typeof verrou.packages !== 'object' || !racineManifeste) {
    return [];
  }
  const packages = verrou.packages;
  const cles = ['', ...espaces(racine, racineManifeste)];
  const constats = [];
  for (const cle of cles) {
    const fichier = cle ? `${cle}/package.json` : 'package.json';
    const manifeste = cle ? lireJson(path.join(racine, fichier)) : racineManifeste;
    const entree = packages[cle] ?? {};
    const dit = (nom, raison) =>
      constats.push({
        fichier,
        message: `${cle || 'package.json'} : la dépendance ${nom} ${raison} ; \`${COMMANDE}\` réécrit le verrou.`,
      });
    for (const sorte of SORTES) {
      const declare = manifeste?.[sorte] ?? {};
      const verrouille = entree[sorte] ?? {};
      for (const [nom, plage] of Object.entries(declare)) {
        if (!(nom in verrouille)) {
          dit(nom, `(${sorte}, ${plage}) est absente de l'entrée du verrou`);
        } else if (verrouille[nom] !== plage) {
          dit(
            nom,
            `(${sorte}) déclare ${plage} dans le package.json et ${verrouille[nom]} dans le verrou`
          );
        } else {
          const version = resolue(packages, cle, nom);
          if (version && semver.validRange(plage) && !semver.satisfies(version, plage)) {
            dit(
              nom,
              `(${sorte}) déclare ${plage}, que la version ${version} du verrou ne satisfait pas`
            );
          }
        }
      }
      for (const nom of Object.keys(verrouille)) {
        if (!(nom in declare)) {
          dit(nom, `(${sorte}) est retirée du package.json et reste dans l'entrée du verrou`);
        }
      }
    }
  }
  return constats;
}

/**
 * The refusals of the repository at <racine>, one line per package and dependency.
 * @param {string} racine
 * @returns {string[]}
 */
export const verifier = racine => verifierLesConstats(racine).map(c => c.message);

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = process.cwd();
  // A project that declares the lock a generated file (`grillhouse.engendres`) keeps its command,
  // and its own judgement of it: the guard does not play for it.
  const duProjet = Object.values(
    lireJson(path.join(racine, 'package.json'))?.grillhouse?.engendres ?? {}
  ).some(e => Array.isArray(e?.fichiers) && e.fichiers.includes(LOCK));
  const constats = duProjet ? [] : verifierLesConstats(racine);
  for (const c of constats) {
    process.stderr.write(`⛔ ${c.message}\n`);
  }
  ecrireSarif({ garde: GARDE, racine, constats });
  process.exitCode = constats.length ? 1 : 0;
}
