#!/usr/bin/env node
// The guard of the languages of the packages: each package follows the language the architecture
// declares for it, as Bazel builds each target by the rule its BUILD file names, and refuses a
// source the rule does not take.
//
//   npx grillhouse langages-des-paquets      (one of the frame's guards, scripts/gardes-du-cadre.mjs)
//
// - The packages are the folders the module of every language of the frame finds (`LANGAGES`),
//   not of the declared languages alone: a crate in a project whose table names typescript alone
//   is a package to judge. Each manifest is read to refuse a gap, never to declare: the
//   declaration stays the tables of the components of docs/ARCHITECTURE.md
//   (./tableau-des-composants.mjs), their rows with a language, each table read by its own column
//   of the names.
// - Refused, each finding named with its package: a package that holds the manifest of its module
//   (`manifeste`: a package.json, a Cargo.toml) and that no row names, « que l'architecture ne
//   déclare pas »; a package a row declares of a language whose module does not find it there,
//   named with the manifest it holds; a package a row declares without the manifest of that
//   language; a docs/INTERFACE.md of the package, or of
//   the root for the row that names it (`.`), whose line `**Langage** : <nom>` names another
//   language. A folder of a module without its manifest and without row (a folder of `src/` of a
//   project of one package) is no package; a row that names no component (a package not yet
//   created, a crate of another repository) is not judged.
// - Each finding is written in SARIF under the guard's name, and on the error stream after ⛔; the
//   exit code is 1 when there is one, 0 otherwise.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LANGAGES, langage, langagesDe } from './langages.mjs';
import { ecrireSarif } from './resultats.mjs';
import {
  ARCHITECTURE,
  colonneDesNoms,
  COLONNE,
  langageDeLaCellule,
  nomme,
  nomsDe,
  tableauxDesComposants,
} from './tableau-des-composants.mjs';

/** This script. */
export const SCRIPT = fileURLToPath(import.meta.url);
/** The name its findings carry. */
export const GARDE = 'langages-des-paquets';

// The language the docs/INTERFACE.md under <dossier> names (`**Langage** : <nom>`), null for none.
function langageDeLInterface(dossier) {
  const f = path.join(dossier, 'docs', 'INTERFACE.md');
  if (!existsSync(f)) {
    return null;
  }
  const m = readFileSync(f, 'utf8').match(/^\*\*Langage\*\*\s*:\s*(.+)$/m);
  return m ? langageDeLaCellule(m[1]) || null : null;
}

/**
 * The findings of the guard on the project at <racine>: `{ fichier, ligne?, message }`, none when
 * each package follows the architecture.
 * @param {string} racine the root of the project
 */
export function constats(racine) {
  langagesDe(racine);
  // Each folder a module of the frame finds, with the components and the modules that find it.
  const dossiers = new Map();
  for (const nom of Object.keys(LANGAGES)) {
    const m = langage(nom);
    for (const c of m.composants(racine)) {
      const d = dossiers.get(c.dossier) ?? { composants: [], modules: [] };
      d.composants.push(c);
      d.modules.push(m);
      dossiers.set(c.dossier, d);
    }
  }
  // The root, which a row names `.` when no module makes a component of it.
  const laRacine = { dossier: racine, nom: '.', paquet: null };
  const tous = [...[...dossiers.values()].flatMap(d => d.composants), laRacine];
  // The rows that declare a package, each table read by its own column of the names.
  const declarees = tableauxDesComposants(racine).flatMap(t => {
    const lignes = t.lignes.filter(l => langageDeLaCellule(l.cellules[t.colonne]));
    const colonne = colonneDesNoms(lignes, tous, racine, t.colonne);
    return colonne < 0
      ? []
      : lignes.map(l => ({
          index: l.index,
          langage: langageDeLaCellule(l.cellules[t.colonne]),
          noms: nomsDe(l.cellules[colonne]),
        }));
  });
  const ligneDe = composants =>
    declarees.find(l => composants.some(c => nomme(l.noms, c, racine))) ?? null;
  const rel = d => path.relative(racine, d).split(path.sep).join('/') || '.';
  const ou = l => `${ARCHITECTURE}:${l.index + 1}`;
  const out = [];
  const interface_ = (dossier, l) => {
    const lu = langageDeLInterface(dossier);
    if (lu !== null && lu !== l.langage) {
      const f = rel(path.join(dossier, 'docs', 'INTERFACE.md'));
      out.push({
        fichier: f,
        message: `${f} : langage ${lu}, quand ${ou(l)} déclare ${l.langage} ; l'interface reprend le langage de l'architecture.`,
      });
    }
  };
  const vus = new Set();
  for (const [dossier, { composants, modules }] of dossiers) {
    const avec = modules.filter(m => existsSync(path.join(dossier, m.manifeste)));
    const l = ligneDe(composants);
    if (!l) {
      if (avec.length) {
        out.push({
          fichier: ARCHITECTURE,
          message: `${rel(dossier)} : paquet ${avec[0].nom} (son ${avec[0].manifeste}) que ${ARCHITECTURE} ne déclare pas ; sa ligne d'un tableau des composants nomme son langage (colonne « ${COLONNE} »).`,
        });
      }
      continue;
    }
    vus.add(l);
    const declare = langage(l.langage);
    const autre = avec.find(m => m !== declare);
    if (modules.includes(declare) && existsSync(path.join(dossier, declare.manifeste))) {
      // The package follows its row.
    } else if (autre) {
      out.push({
        fichier: ARCHITECTURE,
        ligne: l.index + 1,
        message: `${rel(dossier)} : déclaré ${l.langage} (${ou(l)}), mais son manifeste est celui de ${autre.nom} (${autre.manifeste}) ; un paquet ${l.langage} porte son ${declare.manifeste}.`,
      });
    } else {
      out.push({
        fichier: ARCHITECTURE,
        ligne: l.index + 1,
        message: `${rel(dossier)} : déclaré ${l.langage} (${ou(l)}), sans son ${declare.manifeste}.`,
      });
    }
    interface_(dossier, l);
  }
  const l = ligneDe([laRacine]);
  if (l && !vus.has(l)) {
    interface_(racine, l);
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
