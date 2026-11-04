#!/usr/bin/env node
// The guard of the flows of the CI: each flow declares the packages it exercises, and the reviewer
// reads it when a lot touches one of them, as a CODEOWNERS file names who reads a path.
//
//   npx grillhouse flux-des-paquets      (one of the frame's guards, scripts/gardes-du-cadre.mjs)
//
// - The key `grillhouse.flux` of the root package.json declares them, read from the main tree of
//   the repository (`fluxDe`), as `grillhouse.engendres` and `grillhouse.outils` are:
//   `{ ".github/workflows/<flux>.yml": ["<paquet>", …] }`, each package named by its name in the
//   graph (the `name` of its package.json, whatever its language: a crate and a project of Python
//   have one, scripts/paquets.mjs).
// - The key is absent, null or an object; each key is a path under .github/workflows, each value a
//   list of strings. Every fault is named with its key; a faulty key gives no flow.
// - Refused, each finding named: a file of .github/workflows (.yml, .yaml) the key does not
//   declare, a declared flow whose file does not exist, a package name the graph does not carry.
//   A project without .github/workflows and without the key has nothing to say.
// - A lot touches a package when one of its files changes under the folder of the package; neither
//   its dependents nor its dependencies count, the flow declares each package it exercises.
//   `consigneDesFlux` gives the reviewer's line per flow the lot touches (the flow itself, or a
//   package it declares), « aucun » for none.
// - Each finding is written in SARIF under the guard's name, and on the error stream after ⛔; the
//   exit code is 1 when there is one, 0 otherwise.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { arbrePrincipal } from './outils-cles.mjs';
import { paquets } from './paquets.mjs';
import { ecrireSarif } from './resultats.mjs';

/** This script. */
export const SCRIPT = fileURLToPath(import.meta.url);
/** The name its findings carry. */
export const GARDE = 'flux-des-paquets';

const DOSSIER = '.github/workflows';
const CLE = 'grillhouse.flux';

/**
 * The flows that the package.json <pkg> declares (`grillhouse.flux`): `flux`, each `{ fichier,
 * paquets }`, and `fautes`, each fault named with its key (no flow with a fault).
 * @param {Record<string, any> | null | undefined} pkg
 * @returns {{ flux: { fichier: string, paquets: string[] }[], fautes: string[] }}
 */
export function lireFlux(pkg) {
  const f = pkg?.grillhouse?.flux;
  if (f === undefined || f === null) return { flux: [], fautes: [] };
  if (typeof f !== 'object' || Array.isArray(f)) {
    return {
      flux: [],
      fautes: [
        `la clé ${CLE} vaut ${JSON.stringify(f)}, pas un objet { "${DOSSIER}/<flux>.yml": ["<paquet>", …] }.`,
      ],
    };
  }
  const fautes = [];
  const flux = [];
  for (const [fichier, liste] of Object.entries(f)) {
    const cle = `${CLE}.${fichier}`;
    const sain = fichier.startsWith(`${DOSSIER}/`) && !fichier.split('/').includes('..');
    if (!sain) {
      fautes.push(`${cle} : la clé n'est pas un fichier sous ${DOSSIER}/.`);
      continue;
    }
    if (!Array.isArray(liste) || liste.some(p => typeof p !== 'string')) {
      fautes.push(`${cle} vaut ${JSON.stringify(liste)}, pas une liste de noms de paquets.`);
      continue;
    }
    flux.push({ fichier, paquets: liste });
  }
  return { flux: fautes.length ? [] : flux, fautes };
}

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * The flows of the project that holds <dir>, from the package.json of its main tree, never of a
 * copy; none without one.
 * @param {string} dir a directory of the project: its main tree or a copy
 * @throws {Error} the faults of the key, one per line
 */
export function fluxDe(dir) {
  const f = path.join(arbrePrincipal(dir), 'package.json');
  if (!existsSync(f)) return [];
  const { flux, fautes } = lireFlux(lireJson(f));
  if (fautes.length) throw new Error(fautes.join('\n'));
  return flux;
}

// The workflow files of <racine>: the .yml and .yaml under .github/workflows, from the root.
function fichiersDeFlux(racine) {
  const d = path.join(racine, DOSSIER);
  if (!existsSync(d)) return [];
  return readdirSync(d, { withFileTypes: true })
    .filter(e => e.isFile() && /\.ya?ml$/.test(e.name))
    .map(e => `${DOSSIER}/${e.name}`)
    .sort();
}

/**
 * The findings of the guard on the project at <racine>: `{ fichier, message }`, none when each
 * workflow is declared with packages the graph carries.
 * @param {string} racine the root of the project
 */
export function constats(racine) {
  const pkg = lireJson(path.join(racine, 'package.json'));
  const { flux, fautes } = lireFlux(pkg);
  const out = fautes.map(message => ({ fichier: 'package.json', message }));
  if (fautes.length) return out;
  const connus = new Set(paquets(racine).map(p => p.pkg.name));
  const declares = new Set(flux.map(f => f.fichier));
  for (const f of fichiersDeFlux(racine)) {
    if (!declares.has(f)) {
      out.push({
        fichier: f,
        message: `${f} : flux de la CI sans entrée dans ${CLE} du package.json ; chaque flux déclare les paquets qu'il exerce, le relecteur le lit.`,
      });
    }
  }
  for (const { fichier, paquets: noms } of flux) {
    if (!existsSync(path.join(racine, fichier))) {
      out.push({
        fichier: 'package.json',
        message: `${fichier} : déclaré dans ${CLE}, mais le fichier n'existe pas.`,
      });
    }
    for (const n of noms.filter(x => !connus.has(x))) {
      out.push({
        fichier: 'package.json',
        message: `${fichier} : le paquet ${n} que ${CLE} déclare est inconnu du graphe ; un paquet s'écrit par son nom (le « name » de son package.json), non par son dossier.`,
      });
    }
  }
  return out;
}

/**
 * The reviewer's lines for the lot of <fichiers> (from the root): one `- lis <flux> : <raison>` per
 * flow it touches, « aucun … » for none.
 * @param {string} racine the root of the project
 * @param {string[]} fichiers
 */
export function consigneDesFlux(racine, fichiers) {
  let flux;
  try {
    flux = fluxDe(racine);
  } catch (e) {
    return `aucun : la clé ${CLE} est refusée (${e.message.split('\n')[0]}).`;
  }
  const dossiers = new Map(
    paquets(racine).map(p => [p.pkg.name, p.dossier.split(path.sep).join('/')])
  );
  const sous = (f, d) => d === '.' || f.startsWith(`${d}/`);
  const lignes = [];
  for (const { fichier, paquets: noms } of flux) {
    const raisons = [];
    if (fichiers.includes(fichier)) raisons.push('le lot change le flux');
    for (const n of noms) {
      const d = dossiers.get(n);
      if (d !== undefined && fichiers.some(f => sous(f, d))) {
        raisons.push(`le lot touche le paquet ${n}`);
      }
    }
    if (raisons.length) lignes.push(`- lis ${fichier} : ${raisons.join(' ; ')}`);
  }
  return lignes.length ? lignes.join('\n') : 'aucun : le lot ne touche aucun flux de la CI.';
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
