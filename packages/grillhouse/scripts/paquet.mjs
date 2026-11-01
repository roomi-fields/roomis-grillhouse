#!/usr/bin/env node
// The creation of a package, out of the circuit: the third of the four times of a package's birth
// (the common charter, « La naissance d'un paquet »: the grill, the writing of its row and its
// documents, this command, then a ticket of code), as the generators of Nx (`nx g @nx/js:lib`,
// after `nx add` installs the tools of its plugin), `turbo gen workspace` and `cargo new --lib`
// added to the members of the workspace write one. A skeleton has neither behaviour nor test: it
// does not pass by the circuit, which works on a package that exists.
//
//   npx grillhouse paquet <chemin>      from the root of the project, <chemin> from it
//
// - The row first: a row of a table of the components of docs/ARCHITECTURE.md
//   (./tableau-des-composants.mjs) names <chemin> when one name of its cell of the names is the
//   path, or else the folder's name, as the guard of the languages reads a component; a row that
//   names the path itself comes first. Refused, by its name, and nothing written: a path no row
//   names; a row whose cell of the column « Langage » is empty; a language out of the frame's
//   list; a folder that already holds the manifest of its language (`manifeste` of its module). A
//   folder that holds docs/ alone, the documents of the second time, is accepted, as `cargo init`
//   takes a folder without its Cargo.toml.
// - The skeleton: the module of the row's language gives the files of the package and the entry
//   of the workspace (`squelette`, scripts/jointure.d.ts), the versions of its tools from its
//   template (`miseAJour.gabarit`); the documents of the package, docs/CADRE.md and
//   docs/INTERFACE.md, come from the frame's template of a package (`templates/paquet/`), its name
//   and its language written in. Each file absent is written, a file present stays; the manifest
//   of the workspace receives the entry. The command commits nothing: the second and the third
//   times enter one commit, after a green verification.
// - The tools of the language, as `nx add` installs them before the first generator: the share
//   of the update of each declared language (`mettreAJour` of ./grillhouse-maj.mjs: its tools at
//   its template's versions, its scripts, its files, `turbo.json` for typescript), then `npm
//   install` when the update asks it, the module's command that locks the versions of the new
//   package (`verrouiller`), the binaries of the declared languages (`installerBinaires`), and the
//   generators (`regenerer`), those of the package's language whatever files the project holds:
//   the first package of a language receives its boundaries' configuration and its index.
// - The report: each file written, then the lines of the update; on the error stream, each
//   command that fails, named with its output. The exit code: 0; 1 for a refusal (⛔ and its
//   reason) or a command that fails; 2 for the usage.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CADRE } from './cadre.mjs';
import {
  aInstaller,
  installerBinaires,
  mettreAJour,
  rapport,
  regenerer,
} from './grillhouse-maj.mjs';
import { LANGAGES, langage } from './langages.mjs';
import {
  ARCHITECTURE,
  colonneDesNoms,
  COLONNE,
  langageDeLaCellule,
  nomme,
  nomsDe,
  tableauxDesComposants,
} from './tableau-des-composants.mjs';

/** The frame's template of the documents of a package, from the frame's files. */
export const GABARIT_DU_PAQUET = 'templates/paquet';
const DOCUMENTS = ['docs/CADRE.md', 'docs/INTERFACE.md'];

/** A refusal of the command, its message the reason. */
export class Refus extends Error {}

// <chemin> from the root of the project at <racine>, `/` its separator, without `./` nor a
// trailing `/`; refused out of the project or at its root.
function normaliser(racine, chemin) {
  const rel = path.relative(racine, path.resolve(racine, chemin)).split(path.sep).join('/');
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Refus(`${chemin} : un paquet vit dans un dossier du projet, sous sa racine.`);
  }
  return rel;
}

/**
 * The row of the tables of the components of the project at <racine> that names the package at
 * <rel> (from the root): `{ ligne, langage }`, `ligne` its number in docs/ARCHITECTURE.md, `langage`
 * its cell of the column « Langage » (empty for none); null when no row names it.
 * @param {string} racine
 * @param {string} rel
 */
export function ligneDuPaquet(racine, rel) {
  const virtuel = { dossier: path.join(racine, rel), nom: path.posix.basename(rel), paquet: null };
  const trouvees = tableauxDesComposants(racine).flatMap(t => {
    const colonne = colonneDesNoms(t.lignes, [virtuel], racine, t.colonne);
    return colonne < 0
      ? []
      : t.lignes
          .filter(l => nomme(nomsDe(l.cellules[colonne]), virtuel, racine))
          .map(l => ({
            exacte: nomsDe(l.cellules[colonne]).includes(rel),
            ligne: l.index + 1,
            langage: langageDeLaCellule(l.cellules[t.colonne]),
          }));
  });
  const l = trouvees.find(x => x.exacte) ?? trouvees[0];
  return l ? { ligne: l.ligne, langage: l.langage } : null;
}

const lireJson = f => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {});

/**
 * The plan of the package at <chemin> of the project at <racine>, nothing written: `{ chemin,
 * langage, fichiers, espace, verrouiller }`, `fichiers` the skeleton of its language and its
 * documents (path from the root → text), `espace` the manifest of the workspace with its entry
 * (null when it holds it), `verrouiller` the command that locks its versions. Throws a Refus, by
 * its name, for a path no row names, a row without language, a language out of the frame's list,
 * or a folder that holds the manifest of its language.
 * @param {string} racine the root of the project
 * @param {string} chemin the package's folder, from the root
 * @param {{ source?: string }} [o] the frame's files (CADRE)
 */
export function planDuPaquet(racine, chemin, { source = CADRE } = {}) {
  const rel = normaliser(racine, chemin);
  const l = ligneDuPaquet(racine, rel);
  if (!l) {
    throw new Refus(
      `${rel} : aucune ligne d'un tableau des composants de ${ARCHITECTURE} ne le nomme ; le grill tranche le paquet, puis sa ligne s'y écrit avec son langage (colonne « ${COLONNE} »), avant la commande.`
    );
  }
  const ou = `${ARCHITECTURE}:${l.ligne}`;
  if (!l.langage) {
    throw new Refus(
      `${rel} : sa ligne (${ou}) ne nomme pas son langage ; la colonne « ${COLONNE} » le déclare (les langages du cadre : ${Object.keys(LANGAGES).join(', ')}).`
    );
  }
  if (!Object.hasOwn(LANGAGES, l.langage)) {
    throw new Refus(
      `${rel} : langage inconnu du cadre, ${l.langage} (${ou}) ; les langages du cadre : ${Object.keys(LANGAGES).join(', ')}.`
    );
  }
  const m = langage(l.langage);
  if (existsSync(path.join(racine, rel, m.manifeste))) {
    throw new Refus(
      `${rel} : le dossier porte déjà son ${m.manifeste} ; le paquet existe, un ticket de code le travaille par le circuit.`
    );
  }
  const modele = lireJson(path.join(source, m.miseAJour.gabarit, 'package.json'));
  let s;
  try {
    s = m.squelette(racine, { chemin: rel, modele });
  } catch (e) {
    throw new Refus(e.message);
  }
  const nom = path.posix.basename(rel);
  const documents = Object.fromEntries(
    DOCUMENTS.map(d => [
      `${rel}/${d}`,
      readFileSync(path.join(source, GABARIT_DU_PAQUET, d), 'utf8')
        .replaceAll('<nom>', nom)
        .replaceAll('<langage>', l.langage),
    ])
  );
  return {
    chemin: rel,
    langage: m,
    fichiers: { ...s.fichiers, ...documents },
    espace: s.espace,
    verrouiller: s.verrouiller,
  };
}

/**
 * Writes the plan <plan> (`planDuPaquet`) in the project at <racine>: each file absent, then the
 * manifest of the workspace. Returns the files written, from the root.
 * @param {string} racine
 * @param {ReturnType<typeof planDuPaquet>} plan
 */
export function ecrireLePaquet(racine, plan) {
  const ecrits = [];
  for (const [f, texte] of Object.entries(plan.fichiers)) {
    const abs = path.join(racine, f);
    if (existsSync(abs)) {
      continue;
    }
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, texte);
    ecrits.push(f);
  }
  if (plan.espace) {
    writeFileSync(path.join(racine, plan.espace.fichier), plan.espace.texte);
    ecrits.push(plan.espace.fichier);
  }
  return ecrits;
}

// Runs <commande> <args> in <dossier>, its output this process's error stream; its code.
const lancer = (commande, args, dossier) =>
  spawnSync(commande, args, { cwd: dossier, stdio: ['ignore', 2, 2] }).status ?? 1;

/**
 * Creates the package at <chemin> of the project at <racine>: its plan written, then the tools of
 * its language (see the header). Returns `{ ecrits, lignes, echecs }`: the files written, the
 * lines of the report, the lines of each command that fails. Throws a Refus as `planDuPaquet`.
 * @param {string} racine
 * @param {string} chemin
 * @param {{ source?: string, executer?: (commande: string, args: string[], dossier: string) => number }} [o]
 */
export function creerPaquet(racine, chemin, { source = CADRE, executer = lancer } = {}) {
  const plan = planDuPaquet(racine, chemin, { source });
  const ecrits = ecrireLePaquet(racine, plan);
  const b = mettreAJour(racine, source);
  const echecs = [];
  const vus = new Set();
  const jouer = (commande, args, dossier) => {
    const cle = JSON.stringify([commande, ...args, dossier]);
    if (vus.has(cle)) {
      return;
    }
    vus.add(cle);
    const code = executer(commande, args, path.join(racine, dossier));
    if (code !== 0) {
      echecs.push(
        `\`${[commande, ...args].join(' ')}\` (${dossier}) échoue, code ${code} ; lance-le, puis \`npx grillhouse maj\`.`
      );
    }
  };
  if (aInstaller(b)) {
    jouer('npm', ['install'], '.');
  }
  const v = plan.verrouiller;
  jouer(v.commande, v.args, v.dossier);
  const binaires = installerBinaires(racine);
  echecs.push(...binaires.lignes, ...regenerer(racine, { langage: plan.langage.nom }));
  const lignes = rapport(b)
    .split('\n')
    .filter(Boolean)
    .concat(
      binaires.installes.length ? [`Binaires installés : ${binaires.installes.join(', ')}.`] : []
    );
  return { ecrits, lignes, echecs };
}

const USAGE =
  'Usage : npx grillhouse paquet <chemin>   crée le paquet que sa ligne de docs/ARCHITECTURE.md déclare\n';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith('-')) {
    process.stderr.write(USAGE);
    process.exitCode = 2;
  } else {
    try {
      const { ecrits, lignes, echecs } = creerPaquet(process.cwd(), args[0]);
      process.stdout.write(
        `Paquet ${args[0]} : ${ecrits.join(', ') || 'aucun fichier'} écrits ; rien n'est commité.\n${lignes.map(l => `${l}\n`).join('')}`
      );
      for (const l of echecs) {
        process.stderr.write(`${l}\n`);
      }
      process.exitCode = echecs.length ? 1 : 0;
    } catch (e) {
      if (!(e instanceof Refus)) {
        throw e;
      }
      process.stderr.write(`⛔ ${e.message}\n`);
      process.exitCode = 1;
    }
  }
}
