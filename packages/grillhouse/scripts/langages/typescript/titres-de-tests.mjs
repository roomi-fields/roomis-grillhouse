#!/usr/bin/env node
// The title of a test, on the model of Software Engineering at Google (ch. 12: « write a test for
// each behavior »): a test bears the name of the behavior it proves, never a ticket's or a
// « critère N »; a test whose title does not say its behavior ends deleted. The ticket goes to the
// commit message.
//
//   npx grillhouse titres-de-tests   run from the repository root (a guard of grillhouse:gardes)
//
// - The count is a union: a title counts once if it names a ticket of the project (its prefix, read
//   from Beads as the hook of the commits reads it (`bd config get issue_prefix`), followed by an
//   identifier: `grillhouse-44b.10.8`) or a « critère N » (or « critères N »), or both.
// - The guard reads the Vitest tests of the project (the files `*.test.*` and `*.spec.*` of every
//   component, the night tests included, as ./tailles-des-tests.mjs lists them): the calls
//   `describe`, `it` and `test` and their variants (`skip`, `only`, `each`, `todo`...). It sees the
//   static text of a title: a literal, the fixed parts of a template, the format of an `each`. A
//   title carried by a variable is not seen, nor a title in a comment.
// - The Rust and Python tests are out of the count: their titles are function names, without
//   `describe` or `it` (a deviation written here and in each refusal).
// - A finding is `{ fichier, ligne, regle: 'titre-nommant-un-ticket', message }`. The debt
//   (`grillhouse-dette.json`, ../../dette.mjs) counts them file by file: a file whose count rises
//   above its debt, or absent from the debt with a title counted, is refused by its name; a debt
//   above the real count is refused too, so that the lot lowers it by `npm run
//   grillhouse:dette:elaguer`. A test file moved or renamed by the lot, its content kept (or
//   nearly), takes the debt of its former name (`renommesDuLot`).
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FICHIER, lire as lireDette, trancher } from '../../dette.mjs';
import { A_ELAGUER, ecrireSarif } from '../../resultats.mjs';
import { testsDuDepot } from './tailles-des-tests.mjs';
import { TEST } from './vitest-config/lances.mjs';

export const GARDE = 'titres-de-tests';
export const REGLE = 'titre-nommant-un-ticket';

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CRITERE = /(?<!\p{L})crit[èe]res?\s+\d/iu;
// The calls that carry a title: describe, it, test, a chain of variants, the arguments of an `each`
// when there are some, then the opening quote of the title.
const APPEL =
  /(?<![\w$.])(?:describe|it|test)(?:\s*\.\s*(?:skip|only|todo|concurrent|sequential|fails|runIf|skipIf|each|for))*\s*(?:\([^()]*(?:\([^()]*\)[^()]*)*\)\s*)?\(\s*(['"`])/g;

// <texte> with its comments blanked (the newlines kept), the strings left as they are.
function sansCommentaires(texte) {
  let out = '';
  let i = 0;
  while (i < texte.length) {
    const c = texte[i];
    const d = texte[i + 1];
    if (c === '/' && d === '/') {
      while (i < texte.length && texte[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (c === '/' && d === '*') {
      const fin = texte.indexOf('*/', i + 2);
      const stop = fin === -1 ? texte.length : fin + 2;
      out += texte.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < texte.length && texte[j] !== c && !(c !== '`' && texte[j] === '\n')) {
        j += texte[j] === '\\' ? 2 : 1;
      }
      out += texte.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// The static text of the literal opened by the quote at <debut> of <texte>: the fixed parts of a
// template, its `${…}` left out.
function litteral(texte, debut) {
  const guillemet = texte[debut];
  let titre = '';
  let i = debut + 1;
  while (i < texte.length && texte[i] !== guillemet) {
    if (texte[i] === '\\') {
      titre += texte[i + 1] ?? '';
      i += 2;
    } else if (guillemet === '`' && texte[i] === '$' && texte[i + 1] === '{') {
      let profondeur = 0;
      do {
        if (texte[i] === '{') profondeur++;
        else if (texte[i] === '}') profondeur--;
        i++;
      } while (i < texte.length && profondeur > 0);
      titre += ' ';
    } else {
      titre += texte[i++];
    }
  }
  return titre;
}

/**
 * The titles of <texte> (a Vitest file) that name a ticket of the prefix <prefixe> or a
 * « critère N »: `[{ titre, ligne }]`, each title once, `ligne` 1-based.
 */
export function titresNommantUnTicket(texte, prefixe) {
  const ticket = prefixe
    ? new RegExp(`(?<![\\w.-])${escape(prefixe)}-[a-z0-9]+(?:\\.[0-9]+)*(?![\\w-])`, 'i')
    : null;
  const propre = sansCommentaires(texte);
  const out = [];
  for (const m of propre.matchAll(APPEL)) {
    const debut = m.index + m[0].length - 1;
    const titre = litteral(propre, debut);
    if (CRITERE.test(titre) || ticket?.test(titre)) {
      out.push({ titre, ligne: propre.slice(0, debut).split('\n').length });
    }
  }
  return out;
}

const MESSAGE_FIN =
  "nomme le test par le comportement qu'il prouve, jamais par un ticket ni un « critère N » : le ticket va au message du commit. Les tests Rust et Python sont hors du compte (leurs titres sont des noms de fonction, sans describe ni it).";

/**
 * The findings of the repository at <racine>, the prefix of the tickets <prefixe>: one
 * `{ fichier, ligne, regle, message }` per title of a Vitest file that names a ticket or a
 * « critère N ».
 */
export function verifier(racine, prefixe) {
  return testsDuDepot(racine).flatMap(fichier => {
    let texte;
    try {
      texte = readFileSync(path.join(racine, fichier), 'utf8');
    } catch {
      return [];
    }
    return titresNommantUnTicket(texte, prefixe).map(({ titre, ligne }) => ({
      fichier,
      ligne,
      regle: REGLE,
      message: `${fichier}:${ligne} : le titre « ${titre.trim()} » nomme un ticket ou un « critère N » ; ${MESSAGE_FIN}`,
    }));
  });
}

const git = (racine, args) =>
  spawnSync('git', ['-C', racine, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

// The share of the lines of <a> that <b> keeps, over the lines of both (0 to 1).
function ressemblance(a, b) {
  const la = new Set(a.split('\n'));
  const lb = new Set(b.split('\n'));
  let commun = 0;
  for (const l of la) if (lb.has(l)) commun++;
  return commun / (la.size + lb.size - commun || 1);
}

/**
 * The test files the lot of the working copy at <racine> moves or renames, against HEAD:
 * `{ nouveau: ancien }`. The index is not read: a file deleted and a file added, of the same
 * content (or nearly, at least half of the lines kept), are one rename.
 */
export function renommesDuLot(racine) {
  const supprimes = git(racine, ['diff', 'HEAD', '--name-only', '--diff-filter=D', '-z']);
  const connus = git(racine, ['ls-tree', '-r', '--name-only', 'HEAD', '-z']);
  if (supprimes.status !== 0 || connus.status !== 0) return {};
  const anciens = supprimes.stdout.split('\0').filter(f => f && TEST.test(f));
  const avant = new Set(connus.stdout.split('\0'));
  const nouveaux = testsDuDepot(racine).filter(f => !avant.has(f));
  const textesAnciens = new Map(
    anciens.map(f => [f, git(racine, ['show', `HEAD:${f}`]).stdout ?? ''])
  );
  const out = {};
  const pris = new Set();
  const paires = nouveaux.flatMap(n => {
    let texte;
    try {
      texte = readFileSync(path.join(racine, n), 'utf8');
    } catch {
      return [];
    }
    return anciens.map(a => ({ n, a, s: ressemblance(texte, textesAnciens.get(a)) }));
  });
  for (const { n, a, s } of paires.filter(p => p.s >= 0.5).sort((x, y) => y.s - x.s)) {
    if (out[n] || pris.has(a)) continue;
    out[n] = a;
    pris.add(a);
  }
  return out;
}

/**
 * The refusals of the findings <constats> against the <dette> read from the file: one
 * `{ fichier, message }` per file whose count rises above its debt (a file absent from the debt
 * has none) and per file whose debt stays above its count. <renommes> (`{ nouveau: ancien }`)
 * gives a file moved or renamed the debt of its former name.
 */
export function jugerLesTitres(dette, constats, renommes = {}) {
  const inscrite = dette?.[GARDE] ?? {};
  const permis = f => inscrite[f]?.[REGLE]?.count ?? 0;
  const comptes = new Map();
  for (const c of constats) comptes.set(c.fichier, (comptes.get(c.fichier) ?? 0) + 1);
  const reprises = new Set(Object.values(renommes));
  const refus = [];
  for (const [fichier, trouve] of comptes) {
    const droit = permis(fichier) + (renommes[fichier] ? permis(renommes[fichier]) : 0);
    if (trouve > droit) {
      refus.push({
        fichier,
        regle: REGLE,
        message: `${fichier} : ${trouve} titre(s) nomment un ticket ou un « critère N » pour ${droit} inscrit(s) dans ${FICHIER} : ${MESSAGE_FIN}`,
      });
    } else if (trouve < droit) {
      refus.push({
        fichier,
        regle: REGLE,
        aElaguer: true,
        trouve,
        message: `${fichier} : ${trouve} titre(s) pour ${droit} inscrit(s) dans ${FICHIER} : la dette s'abaisse (npm run grillhouse:dette:elaguer), jamais à la main. ${MESSAGE_FIN}`,
      });
    }
  }
  for (const fichier of Object.keys(inscrite)) {
    if (comptes.has(fichier) || reprises.has(fichier) || !permis(fichier)) continue;
    refus.push({
      fichier,
      regle: REGLE,
      aElaguer: true,
      trouve: 0,
      message: `${fichier} : aucun titre ne nomme plus un ticket ou un « critère N », pour ${permis(fichier)} inscrit(s) dans ${FICHIER} : la dette s'abaisse (npm run grillhouse:dette:elaguer), jamais à la main. ${MESSAGE_FIN}`,
    });
  }
  return refus.sort((a, b) => (a.fichier < b.fichier ? -1 : a.fichier > b.fichier ? 1 : 0));
}

// The prefix of the tickets, read from Beads as the hook of the commits reads it; empty without.
function prefixe() {
  try {
    return execFileSync('bd', ['config', 'get', 'issue_prefix'], {
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 256 * 1024 * 1024,
    }).trim();
  } catch {
    return '';
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = process.cwd();
  const constats = verifier(racine, prefixe());
  const renommes = renommesDuLot(racine);
  let refus;
  let lignes = [];
  if (process.env.GRILLHOUSE_DETTE) {
    // A write of the debt (`inscrire`, `elaguer`): a file moved takes the debt of its former name
    // first, so that the write keeps it.
    const dette = lireDette(racine);
    const section = dette[GARDE];
    if (section) {
      for (const [nouveau, ancien] of Object.entries(renommes)) {
        if (section[ancien] && !section[nouveau]) section[nouveau] = section[ancien];
        delete section[ancien];
      }
      writeFileSync(path.join(racine, FICHIER), `${JSON.stringify(dette, null, 2)}\n`);
    }
    const r = trancher(racine, GARDE, constats);
    refus = r.refus;
    lignes = r.lignes;
  } else {
    refus = jugerLesTitres(lireDette(racine), constats, renommes);
    // Each refusal is a finding in SARIF; a debt above the count is also a note `a-elaguer`, by
    // which the circuit lowers the debt d'office.
    ecrireSarif({
      garde: GARDE,
      racine,
      constats: [
        ...refus.map(r => ({ fichier: r.fichier, regle: r.regle, message: r.message })),
        ...refus
          .filter(r => r.aElaguer)
          .map(r => ({
            fichier: r.fichier,
            regle: r.regle,
            niveau: 'note',
            genre: A_ELAGUER,
            trouve: r.trouve,
            message: `${r.trouve} constat(s) pour une dette plus haute : la dette s'abaisse.`,
          })),
      ],
    });
  }
  for (const r of refus) process.stderr.write(`⛔ ${r.message}\n`);
  for (const l of lignes) process.stderr.write(`${l}\n`);
  process.stderr.write(
    `ℹ️  ${GARDE} : ${constats.length} titre(s) nommant un ticket ou un « critère N » ; les tests Rust et Python sont hors du compte.\n`
  );
  process.exitCode = refus.length ? 1 : 0;
}
