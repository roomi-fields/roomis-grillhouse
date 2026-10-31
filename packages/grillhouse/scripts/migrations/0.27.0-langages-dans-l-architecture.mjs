// From 0.27.0 the language of each package is declared at the design, in the column « Langage »
// of the table of the components of docs/ARCHITECTURE.md (decision D8 of grillhouse-1zu, as the
// BUILD file of Bazel names the rule of each target): the architecture is the one source of the
// languages, and the key `grillhouse.langages` of the package.json, which named them before,
// disappears.
//
// - A project whose package.json holds the key: the declaration is written in the column when it
//   lacks, then the key is removed (the section `grillhouse` with it, when it held nothing else).
//   A table whose column holds a language already: the key alone is removed.
// - The table: the first table of docs/ARCHITECTURE.md where a cell names a component of the
//   modules of the key (./tableau-des-composants.mjs), as the project wrote it (BPScript's names
//   the phase before the package, SyntHub's the crates of other repositories). The column is added
//   at the end of its header, of its separator, in their style, and of each row: the language of
//   the component the row names, empty for a row that names none. A package of the modules (its
//   manifest in its folder) that no row names goes to a section « Les paquets » that ends the
//   document (written when absent), a table `Paquet | Langage`, one row each: a table that says
//   « each stage does a step » (BPScript's) receives no row without its step. A language of the
//   key that no package carries has a row naming the root, `.`, there. The text of the document is
//   kept otherwise.
// - `aReporter`: whether a project holds the former declaration, which the session start names
//   with `npx grillhouse maj`, which reports it.
// - A key that names a language the frame lacks, or whose modules claim one folder twice, is left
//   to the project (`aFaire`), nothing written.
// - A project without the key, or already migrated, is not written: a second pass changes nothing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { composantsRanges } from '../composition-des-langages.mjs';
import { LANGAGES, langage } from '../langages.mjs';
import {
  ARCHITECTURE,
  COLONNE,
  colonneDesNoms,
  nomme,
  nomsDe,
  tableauxDesComposants,
  tableaux,
} from '../tableau-des-composants.mjs';

export const version = '0.27.0';
export const nom = 'langages dans l’architecture';

const lireJson = f => JSON.parse(readFileSync(f, 'utf8'));
const ecrireJson = (f, v) => writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`);

// A row of Markdown of <cellules>, an empty cell a single space.
const ligne = cellules => `|${cellules.map(c => (c ? ` ${c} ` : ' ')).join('|')}|`;

// <texte> of a line of a table, <ajout> cells added at its end (each a text, empty for none),
// padded first to <largeur> cells; a separator <sep> takes its own style.
function prolonger(texte, nombre, largeur, ajout, sep = null) {
  const base = texte.replace(/\s+$/, '');
  const ferme = base.endsWith('|') ? base : `${base} |`;
  const vides = Array.from({ length: Math.max(0, largeur - nombre) }, () => '');
  const cellules = [...vides, ...ajout];
  if (sep !== null) {
    return ferme + cellules.map(() => `${sep}|`).join('');
  }
  return ferme + cellules.map(c => (c ? ` ${c} |` : ' |')).join('');
}

// Removes the key from the package.json <f>, its read <p>.
function retirerLaCle(f, p) {
  const { langages: _, ...reste } = p.grillhouse;
  const out = { ...p };
  if (Object.keys(reste).length) {
    out.grillhouse = reste;
  } else {
    delete out.grillhouse;
  }
  ecrireJson(f, out);
}

// The former declaration of the project at <projet>, the list of its package.json; null without.
function cleDe(projet) {
  const f = path.join(projet, 'package.json');
  if (!existsSync(f)) {
    return null;
  }
  const cle = lireJson(f).grillhouse?.langages;
  return Array.isArray(cle) ? cle : null;
}

/** Whether the project at <projet> holds the former declaration, which `maj` reports. */
export const aReporter = projet => cleDe(projet) !== null;

export function migrer(projet) {
  const cle = cleDe(projet);
  if (cle === null) {
    return [];
  }
  const f = path.join(projet, 'package.json');
  const p = lireJson(f);
  const ecrites = tableauxDesComposants(projet).some(x =>
    x.lignes.some(l => (l.cellules[x.colonne] ?? '').trim())
  );
  if (ecrites) {
    retirerLaCle(f, p);
    return [
      `grillhouse.langages retiré du package.json : ${ARCHITECTURE} déclare les langages (colonne « ${COLONNE} »).`,
    ];
  }
  const inconnus = cle.filter(n => !Object.hasOwn(LANGAGES, n));
  if (inconnus.length) {
    return [
      {
        aFaire: `grillhouse.langages nomme ${inconnus.join(', ')}, que le cadre n'a pas (ses langages : ${Object.keys(LANGAGES).join(', ')}) ; écrire le langage de chaque paquet dans la colonne « ${COLONNE} » de ${ARCHITECTURE}, puis retirer la clé.`,
      },
    ];
  }
  let ranges;
  try {
    ranges = composantsRanges(cle.map(langage), projet);
  } catch (e) {
    return [{ aFaire: e.message.replace(/^⛔ /, '') }];
  }
  const doc = path.join(projet, ARCHITECTURE);
  const texte = existsSync(doc) ? readFileSync(doc, 'utf8') : '# Architecture\n';
  const composants = ranges.map(r => r.composant);
  const paquets = ranges.filter(r =>
    existsSync(path.join(r.composant.dossier, r.module.manifeste))
  );
  const nommes = new Set();
  const lignes = texte.split('\n');
  const table = tableaux(texte).find(x => colonneDesNoms(x.lignes, composants, projet) >= 0);
  const nomDe = c => `\`${c.nom}\``;
  if (table) {
    const colonne = colonneDesNoms(table.lignes, composants, projet);
    const largeur = Math.max(table.entete.length, ...table.lignes.map(l => l.cellules.length));
    const sep = lignes[table.ligneEntete + 1].includes(' -') ? ' --- ' : '---';
    lignes[table.ligneEntete] = prolonger(lignes[table.ligneEntete], table.entete.length, largeur, [
      COLONNE,
    ]);
    lignes[table.ligneEntete + 1] = prolonger(
      lignes[table.ligneEntete + 1],
      table.entete.length,
      largeur,
      [''],
      sep
    );
    for (const l of table.lignes) {
      const r = ranges.find(x => nomme(nomsDe(l.cellules[colonne]), x.composant, projet));
      if (r) {
        nommes.add(r);
      }
      lignes[l.index] = prolonger(lignes[l.index], l.cellules.length, largeur, [
        r ? r.module.nom : '',
      ]);
    }
  }
  const ajout = [
    ...paquets
      .filter(r => !nommes.has(r))
      .map(r => ({ nom: nomDe(r.composant), langage: r.module.nom })),
    ...racines(cle, [...nommes, ...paquets]),
  ];
  if (ajout.length) {
    while (lignes.length && lignes.at(-1).trim() === '') {
      lignes.pop();
    }
    lignes.push(
      '',
      '## Les paquets',
      '',
      `Les paquets qu’aucun tableau ne nomme, et leur langage (colonne « ${COLONNE} »).`,
      '',
      ligne(['Paquet', COLONNE]),
      ligne(['---', '---']),
      ...ajout.map(r => ligne([r.nom, r.langage])),
      ''
    );
  }
  mkdirSync(path.dirname(doc), { recursive: true });
  writeFileSync(doc, lignes.join('\n'));
  retirerLaCle(f, p);
  return [
    `${ARCHITECTURE} : la colonne « ${COLONNE} » déclare le langage de chaque paquet (${cle.join(', ')}), grillhouse.langages retiré du package.json.`,
  ];
}

// The rows naming the root, `.`, for each language of <cle> that none of <portes> carries.
const racines = (cle, portes) =>
  cle.filter(n => !portes.some(r => r.module.nom === n)).map(n => ({ nom: '`.`', langage: n }));
