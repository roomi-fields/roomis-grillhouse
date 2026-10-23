#!/usr/bin/env node
// The components a realisation ticket touches, surveyed from its text, as the « affected
// components » of a design document (an RFC of Rust, a design doc of Chromium) and the dependents
// of a package in Turborepo (`--filter=...<paquet>`). The explorateur runs it on the draft of a
// ticket, whose title then names these components and whose section « Architecture » says the
// survey; the circuit (scripts/circuit.mjs) runs it again before the testwriter of the first
// component, and stops on a component the title does not name.
//
//   npx grillhouse composants-affectes <ticket>                 the ticket `bd show` gives
//   npx grillhouse composants-affectes --description <fichier>  a draft of its description
//   npx grillhouse composants-affectes <ticket> --admettre <composant> --raison <texte>
//
// prints the survey (`texteDuReleve`), from the repository root; for a ticket, then the components
// its title misses, exit 1 when there is one. `--admettre` admits out of the title a component the
// survey finds and the ticket does not change (the explorateur at the creation of the ticket, or
// the supervisor): kept in the ticket's record, its reason written at the ticket
// (`Composants · <composant> admis hors du titre : <raison>`); a component the repository does not
// hold, or no reason, is refused, exit 2.
//
// - The text read is the ticket's section « Architecture » and its section of criteria (a `##`
//   heading that begins with « Critères »), each up to the next `##` heading; the rest of the
//   description (its provenance, its notes) names nothing.
// - A component is named by its package name, as a whole word, or by a path in it
//   (`packages/<x>`, `src/<x>`, its files included), the components being those of `composants`
//   (scripts/consommateurs.mjs).
// - An element is a name between backquotes that begins with an identifier: a call (`f()`) or a
//   member (`A.b`) is read by its head. Its provider is the component whose interface
//   (`docs/INTERFACE.md`) publishes it: a heading of its generated part
//   (scripts/index-interfaces.mjs). A name no interface publishes, that names a symbol of the
//   repository (a declaration at the top of a component's source) or a path of it, is set apart
//   (`sansFournisseur`); a word that names neither (an example of the ticket, a fault to create)
//   is left out.
// - A reader is a component that reads, never one that carries a type, as in a graph of declared
//   dependencies (the `deps` and `data` of Bazel, the `implicitDependencies` of Nx).
// - The readers of an element are the other components that: its provider's `## Consommateurs`
//   declares for it, or for `*` (`consommateurs`); import it, or the whole provider, in their
//   production code (`import`, the uses of scripts/consommateurs.mjs); hold a test file that names
//   it, as a whole word, and imports the provider (the test file's path).
// - By the types (scripts/references-par-les-types.mjs): each element, a member of a type
//   included, resolved by TypeScript's language service over the components' `tsconfig.json`;
//   the components whose entry exports it, and the readers its references reach (`types`). An
//   element that only names a symbol internal to a package leads to no component, its package
//   included, as « find all references » starts from a published symbol: the ticket names the
//   package it changes. A survey by the types that cannot run says why, and the survey stands on
//   the names; a name the types resolve is no longer set apart.
// - By the paths read (`lit`): each component whose tests declare they read a path
//   (`grillhouse.lit` of its package.json and the `lit` of its traces, `cheminsLus`) that a
//   path the ticket changes holds or lies in: a path of the repository the sections write (its
//   `:<line>` left out), or the folder of a component they name.
// - By the architecture: the items of the « Rend » of the `docs/CADRE.md` of each component that
//   publishes an element (by its interface or by the types), each component they name
//   (`architecture`), the readers of what it returns; its « Reçoit » names its producers, which
//   read nothing of it.
// - The components of the survey go in the title's order, the provider first: each one after
//   every component it reads among them (its imports, the providers of the elements it reads), in
//   the order of their names otherwise.
// - The record of a ticket's survey, beside its copy (`.claude/worktrees/<ticket>.composants.json`
//   under the main tree), holds the missing components of the circuit's last check and the
//   components admitted out of the title by `--admettre`: an admitted component is no longer
//   missing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  composants as lesComposants,
  declares,
  imports,
  lireSiPresent,
  NOM_DE_TEST,
  parcourir,
  utilise,
} from './consommateurs.mjs';
import { lire } from './index-interfaces.mjs';
import { elementsEcrits, parLesTypes } from './references-par-les-types.mjs';

const DOSSIERS_DE_TEST = new Set(['test', 'tests', '__tests__']);

/**
 * The paths that the tests of the package at <dir> declare they read: its `grillhouse.lit`, then
 * the `lit` of each trace it declares (`grillhouse.traces`), each path from the root; none without
 * a package.json or a declaration.
 * @param {string} dir the directory of the package
 * @returns {string[]}
 */
export function cheminsLus(dir) {
  const manifeste = path.join(dir, 'package.json');
  if (!existsSync(manifeste)) return [];
  const { grillhouse } = JSON.parse(readFileSync(manifeste, 'utf8'));
  const liste = v => (Array.isArray(v) ? v.filter(l => typeof l === 'string') : []);
  return [
    ...liste(grillhouse?.lit),
    ...Object.values(grillhouse?.traces ?? {}).flatMap(t => liste(t?.lit)),
  ];
}
const SAUTES = new Set(['node_modules', 'dist', 'build', 'coverage']);
const SOURCE = /\.[cm]?[jt]sx?$/;

// The sections the survey reads in <description>: « Architecture » and the criteria, as one text.
function lesSections(description) {
  const out = [];
  let dedans = false;
  for (const l of String(description ?? '').split('\n')) {
    const m = /^## (.+)$/.exec(l);
    if (m) dedans = /^(Architecture|Critères)\b/.test(m[1].trim());
    else if (dedans) out.push(l);
  }
  return out.join('\n');
}

const echapper = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A package name as a whole word of a text; an identifier as a whole word of a source.
const motEntier = nom => new RegExp(`(?<![\\w@/.-])${echapper(nom)}(?![\\w-])`);
const identifiant = nom => new RegExp(`(?<![\\w$])${echapper(nom)}(?![\\w$])`);

// The title's name of the component <c>: its package name, else its path.
const nomAuTitre = (racine, c) => c.paquet ?? path.relative(racine, c.dir);

// The components <texte> names, by their package name or a path in them.
function nommes(racine, tous, texte) {
  return tous.filter(c => {
    const rel = path.relative(racine, c.dir).split(path.sep).join('/');
    return (
      (c.paquet && motEntier(c.paquet).test(texte)) ||
      new RegExp(`(?<![\\w/.-])${echapper(rel)}(?![\\w-])`).test(texte)
    );
  });
}

// The elements <texte> names between backquotes, each by its head, in their order, once each.
function elementsNommes(texte) {
  const vus = new Set();
  for (const [, brut] of texte.matchAll(/`([^`\n]+)`/g)) {
    const m = /^([A-Za-z_$][\w$]*)((?:\.[A-Za-z_$][\w$]*|\([^)]*\))*)$/.exec(brut.trim());
    if (m) vus.add(m[1]);
  }
  return [...vus];
}

// The paths of the repository at <racine> that <texte> writes, each once, from the root, its
// `:<line>` left out: a word with a `/` or an extension that names a file or a folder there.
function cheminsEcrits(racine, texte) {
  const out = new Set();
  for (const [brut] of texte.matchAll(/[\w.@-]+(?:\/[\w.@-]+)*/g)) {
    const p = brut.replace(/\.+$/, '');
    if (!p.includes('/') && !/\.\w+$/.test(p)) continue;
    const net = path.normalize(p);
    if (net.startsWith('..') || path.isAbsolute(net)) continue;
    if (existsSync(path.join(racine, net))) out.add(net.split(path.sep).join('/'));
  }
  return [...out];
}

// Whether the path <a> holds the path <b> or lies in it, both from the root.
const recouvre = (a, b) => a === b || b.startsWith(`${a}/`) || a.startsWith(`${b}/`);

// The components of <tous> whose tests declare they read a path that one of <changes> holds or
// lies in, out of their own folder: Map component → Set of « lit <path read> (<paths changed>) ».
function lecteursDesChemins(racine, tous, changes) {
  const out = new Map();
  for (const c of tous) {
    const propre = path.relative(racine, c.dir).split(path.sep).join('/');
    const par = new Set();
    for (const brut of new Set(cheminsLus(c.dir))) {
      const lu = brut.replace(/^\.\//, '').replace(/\/+$/, '');
      const atteints = changes.filter(ch => !recouvre(propre, ch) && recouvre(lu, ch)).sort();
      if (atteints.length) par.add(`lit ${lu} (${atteints.join(', ')})`);
    }
    if (par.size) out.set(c, par);
  }
  return out;
}

// A declaration of <nom> at the top of a source, exported or not.
const DECLARATION_EN_TETE = nom =>
  new RegExp(
    `^(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?(?:abstract\\s+)?(?:async\\s+)?(?:function\\*?|class|interface|type|enum|const|let|var)\\s+${echapper(nom)}(?![\\w$])`,
    'm'
  );
// The texts of the production sources of the components <tous>, their tests left out.
function sourcesDe(tous) {
  return tous.flatMap(c =>
    parcourir(c.dir, p => SAUTES.has(path.basename(p)))
      .filter(f => {
        if (!SOURCE.test(f) || NOM_DE_TEST.test(path.basename(f))) return false;
        return !path
          .relative(c.dir, f)
          .split(path.sep)
          .some(d => DOSSIERS_DE_TEST.has(d));
      })
      .map(f => lireSiPresent(f) ?? '')
  );
}

// Each component's published elements and declared consumers, read in its interface.
function interfacesDe(racine, tous) {
  const out = new Map();
  for (const c of tous) {
    const f = path.join(c.dir, 'docs', 'INTERFACE.md');
    if (!existsSync(f)) continue;
    const i = lire(path.relative(racine, f).split(path.sep).join('/'), readFileSync(f, 'utf8'));
    const publies = new Set(
      i.parties.filter(p => !p.consommateurs).map(p => p.titre.replace(/`/g, '').trim())
    );
    const consommateurs = i.parties.find(p => p.consommateurs)?.consommateurs ?? declares('');
    out.set(c, { publies, consommateurs });
  }
  return out;
}

// The test sources of the component <c>: test files, and the sources of its test folders, built
// files left out.
function testsDe(c) {
  return parcourir(c.dir, p => SAUTES.has(path.basename(p))).filter(f => {
    if (!SOURCE.test(f)) return false;
    const rel = path.relative(c.dir, f).split(path.sep);
    return NOM_DE_TEST.test(path.basename(f)) || rel.some(d => DOSSIERS_DE_TEST.has(d));
  });
}

// Whether the source <texte> of the file <fichier> imports the component <p>.
function importe(texte, fichier, p) {
  return imports(texte).some(({ spec }) => {
    if (spec.startsWith('.')) {
      const cible = path.resolve(path.dirname(fichier), spec);
      return cible === p.dir || cible.startsWith(p.dir + path.sep);
    }
    return Boolean(p.paquet) && (spec === p.paquet || spec.startsWith(`${p.paquet}/`));
  });
}

// The components <liste> in the title's order: each one after those it reads among them
// (<lit>: Map component → Set of its providers), in the order of <nom> otherwise.
function ordonner(liste, lit, nom) {
  const restants = [...liste].sort((a, b) => nom(a).localeCompare(nom(b)));
  const out = [];
  while (restants.length) {
    const i = restants.findIndex(
      c => ![...(lit.get(c) ?? [])].some(f => f !== c && restants.includes(f))
    );
    out.push(...restants.splice(i < 0 ? 0 : i, 1));
  }
  return out;
}

// The survey of the description <description> in the repository at <racine>:
// `{ nommes, elements: [{ nom, fournisseur, lecteurs: [{ composant, par }] }], sansFournisseur,
// types: { etat, raison, elements: [{ nom, declarations: [{ composant, publie }], lecteurs }] },
// lit: [{ composant, par }], architecture: [{ composant, par }], composants }`, each component by
// its title's name, `composants` in the title's order.
export function releve(racine, description) {
  const texte = lesSections(description);
  const tous = lesComposants(racine);
  const reel = utilise(racine, tous);
  const ifaces = interfacesDe(racine, tous);
  const tests = new Map();
  const testsDuComposant = c => {
    if (!tests.has(c))
      tests.set(
        c,
        testsDe(c).map(f => ({ f, texte: lireSiPresent(f) ?? '' }))
      );
    return tests.get(c);
  };
  const trouves = new Set(nommes(racine, tous, texte));
  const elements = [];
  const sansFournisseur = [];
  for (const nom of elementsNommes(texte)) {
    const fournisseurs = tous.filter(c => ifaces.get(c)?.publies.has(nom));
    if (fournisseurs.length === 0) {
      if (!tous.some(c => c.paquet === nom)) sansFournisseur.push(nom);
      continue;
    }
    for (const p of fournisseurs) {
      trouves.add(p);
      const lecteurs = [];
      for (const c of tous) {
        if (c === p) continue;
        const par = [];
        const declare =
          ifaces.get(p).consommateurs.get(c.nom) ?? ifaces.get(p).consommateurs.get(c.paquet);
        if (declare && (declare.has(nom) || declare.has('*'))) par.push('consommateurs');
        const noms = reel.get(p.nom)?.get(c.nom);
        if (noms && (noms.has(nom) || noms.has('*'))) par.push('import');
        for (const t of testsDuComposant(c)) {
          if (identifiant(nom).test(t.texte) && importe(t.texte, t.f, p)) {
            par.push(path.relative(racine, t.f).split(path.sep).join('/'));
          }
        }
        if (par.length) {
          lecteurs.push({ c, par });
          trouves.add(c);
        }
      }
      elements.push({ nom, p, lecteurs });
    }
  }
  // By the types: each element resolved by the language service, the components that publish it
  // and their readers.
  const types = parLesTypes(racine, tous, elementsEcrits(texte), {
    fichiers: new Set(
      [...texte.matchAll(/[\w.-]+\.[cm]?[jt]sx?\b/g)].map(m => path.basename(m[0]))
    ),
    composants: new Set(nommes(racine, tous, texte)),
  });
  const resolus = new Set(types.elements.map(e => e.ecrit));
  for (const e of types.elements) {
    for (const d of e.declarations) if (d.publie) trouves.add(d.c);
    for (const c of e.lecteurs.keys()) trouves.add(c);
  }
  // By the paths read: the components whose tests declare they read a path the ticket changes.
  const parChemins = lecteursDesChemins(racine, tous, [
    ...cheminsEcrits(racine, texte),
    ...nommes(racine, tous, texte).map(c => path.relative(racine, c.dir).split(path.sep).join('/')),
  ]);
  for (const c of parChemins.keys()) trouves.add(c);
  // By the architecture: the Rend of the CADRE.md of each component that publishes an element.
  const declarants = new Set([
    ...elements.map(e => e.p),
    ...types.elements.flatMap(e => e.declarations.filter(d => d.publie).map(d => d.c)),
  ]);
  const architecture = new Map();
  for (const p of declarants) {
    for (const { regle, texte: ligne } of rendus(p)) {
      for (const c of nommes(racine, tous, ligne)) {
        if (c === p) continue;
        if (!architecture.has(c)) architecture.set(c, new Set());
        architecture.get(c).add(`CADRE de ${nomAuTitre(racine, p)}, Rend ${regle}`);
        trouves.add(c);
      }
    }
  }
  // What each component reads: its imports, and the providers of the elements it reads.
  const lit = new Map(tous.map(c => [c, new Set()]));
  for (const p of tous) {
    for (const nomLecteur of reel.get(p.nom)?.keys() ?? []) {
      for (const c of tous) if (c.nom === nomLecteur) lit.get(c).add(p);
    }
  }
  for (const e of elements) for (const l of e.lecteurs) lit.get(l.c).add(e.p);
  const titre = c => nomAuTitre(racine, c);
  const parNom = (a, b) => titre(a).localeCompare(titre(b));
  let sources = null;
  const lecteursDe = m =>
    [...m]
      .sort(([a], [b]) => parNom(a, b))
      .map(([c, par]) => ({ composant: titre(c), par: [...par] }));
  return {
    nommes: [...nommes(racine, tous, texte)].sort(parNom).map(titre),
    elements: elements.map(e => ({
      nom: e.nom,
      fournisseur: titre(e.p),
      lecteurs: e.lecteurs
        .sort((a, b) => parNom(a.c, b.c))
        .map(l => ({ composant: titre(l.c), par: l.par })),
    })),
    sansFournisseur: sansFournisseur.filter(
      n =>
        !resolus.has(n) &&
        (existsSync(path.join(racine, n)) ||
          (sources ??= sourcesDe(tous)).some(s => DECLARATION_EN_TETE(n).test(s)))
    ),
    types: {
      etat: types.etat,
      raison: types.raison,
      elements: types.elements.map(e => ({
        nom: e.nom,
        declarations: e.declarations.map(d => ({
          composant: titre(d.c),
          publie: d.publie,
        })),
        lecteurs: lecteursDe(e.lecteurs),
      })),
    },
    lit: lecteursDe(parChemins),
    architecture: lecteursDe(architecture),
    composants: ordonner([...trouves], lit, titre).map(titre),
  };
}

// What the CADRE.md of the component <c> says it returns: each item of its rubric « Rend » (a
// `##` heading that ends with that word), its rule (`**R4.**`, else its line), its continuation
// lines included.
function rendus(c) {
  const texte = lireSiPresent(path.join(c.dir, 'docs', 'CADRE.md'));
  if (!texte) return [];
  const out = [];
  let dedans = false;
  for (const [i, l] of texte.split('\n').entries()) {
    const h = /^## (.+)$/.exec(l);
    if (h) {
      dedans = /Rend\s*$/.test(h[1].trim());
      continue;
    }
    if (!dedans) continue;
    if (/^[-*] /.test(l)) {
      const regle = /^[-*] \*\*(R\d+)\.?\*\*/.exec(l)?.[1] ?? `l.${i + 1}`;
      out.push({ regle, texte: l });
    } else if (/^\s+\S/.test(l) && out.length) out.at(-1).texte += ` ${l.trim()}`;
  }
  return out;
}

// The record of a ticket's survey beside its copy (<fichier>): `{ manquants, admis, reponses }`,
// the components the last survey found missing, those the supervisor answered for, and his
// answers; empty without it.
function lireGarde(fichier) {
  try {
    const g = JSON.parse(readFileSync(fichier, 'utf8'));
    return { manquants: g.manquants ?? [], admis: g.admis ?? [], reponses: g.reponses ?? [] };
  } catch {
    return { manquants: [], admis: [], reponses: [] };
  }
}
function ecrireGarde(fichier, g) {
  mkdirSync(path.dirname(fichier), { recursive: true });
  writeFileSync(fichier, `${JSON.stringify(g, null, 2)}\n`);
}

// The components the supervisor answered for, kept in <fichier>.
const admis = fichier => lireGarde(fichier).admis;

// Keeps in <fichier> the components <liste> the supervisor answered for, with his answer.
export function admettre(fichier, liste, reponse) {
  const g = lireGarde(fichier);
  ecrireGarde(fichier, {
    ...g,
    manquants: g.manquants.filter(c => !liste.includes(c)),
    admis: [...new Set([...g.admis, ...liste])],
    reponses: [...g.reponses, { date: new Date().toISOString(), composants: liste, reponse }],
  });
}

// The components of the survey <r> the title <titre> does not name (its components as written,
// package names or paths, or `.`), nor the answers kept in <fichier>, in the survey's order.
export function manquants(racine, r, titre, fichier = null) {
  if (titre.includes('.')) return [];
  const tous = lesComposants(racine);
  const garde = new Set(fichier ? admis(fichier) : []);
  const couvre = c => {
    const rel = path.relative(racine, c.dir).split(path.sep).join('/');
    return titre.some(t => {
      const n = path.normalize(t).replace(/\/$/, '');
      return t === c.paquet || rel === n || rel.startsWith(`${n}/`);
    });
  };
  return r.composants.filter(nom => {
    if (garde.has(nom)) return false;
    const c = tous.find(x => nomAuTitre(racine, x) === nom);
    return !c || !couvre(c);
  });
}

// The check of the circuit before the testwriter of the first component: the survey of
// <description> in <racine> against the title's components <titre>, the missing ones kept in
// <fichier>. `{ manquants, rapport, releve }`, the report opening on the missing components (null
// without one), the survey as the section « Architecture » says it, which the questionneur reads.
export function verifierLeTitre({ racine, ticket, description, titre, fichier }) {
  const r = releve(racine, description);
  const liste = manquants(racine, r, titre, fichier);
  ecrireGarde(fichier, { ...lireGarde(fichier), manquants: liste });
  if (!liste.length) return { manquants: [], rapport: null, releve: texteDuReleve(r) };
  const rapport = [
    `Composants manquants au titre : ${liste.join(', ')}.`,
    '',
    texteDuReleve(r),
    '',
    `Le superviseur étend le plan à chacun (\`npx grillhouse circuit ${ticket} --etendre <composant>\`), ou l'admet hors du titre (\`npx grillhouse composants-affectes ${ticket} --admettre <composant> --raison "<texte>"\`), puis \`--reprendre\`.`,
  ].join('\n');
  return { manquants: liste, rapport, releve: texteDuReleve(r) };
}

// The survey <r> as the section « Architecture » says it, in Markdown.
export function texteDuReleve(r) {
  const out = [
    `**Composants relevés** : ${r.composants.length ? r.composants.join(', ') : 'aucun'}.`,
  ];
  for (const e of r.elements) {
    const lus = e.lecteurs.map(l => `${l.composant} (${l.par.join(', ')})`).join(', ');
    out.push(`- \`${e.nom}\` : fourni par ${e.fournisseur} ; lu par ${lus || 'aucun autre'}.`);
  }
  if (r.types.etat !== 'fait') {
    out.push(`- Par les types : impossible (${r.types.raison}) ; le relevé s'en tient aux noms.`);
  } else if (!r.types.elements.length) {
    out.push('- Par les types : aucun élément résolu.');
  } else {
    out.push('- Par les types (service de langage de TypeScript) :');
    // The elements of one provenance and the same readers on one line; each reader by its first
    // reason, the count of the others after it.
    const lignes = new Map();
    for (const e of r.types.elements) {
      const ou = [
        ...new Set(
          e.declarations.map(d =>
            d.publie ? `publié par ${d.composant}` : `interne à ${d.composant}`
          )
        ),
      ].join(' ; ');
      const lus = e.lecteurs
        .map(
          l =>
            `${l.composant} (${l.par[0]}${l.par.length > 1 ? ` ; ${l.par.length - 1} de plus` : ''})`
        )
        .join(', ');
      const cle = `${ou} ; lu par ${lus || 'aucun autre'}.`;
      lignes.set(cle, [...(lignes.get(cle) ?? []), `\`${e.nom}\``]);
    }
    for (const [cle, noms] of lignes) out.push(`  - ${noms.join(', ')} : ${cle}`);
  }
  if (r.lit.length) {
    const lus = r.lit.map(l => `${l.composant} (${l.par.join(' ; ')})`).join(', ');
    out.push(`- Par les chemins lus (\`grillhouse.lit\`) : ${lus}.`);
  }
  if (r.architecture.length) {
    const lus = r.architecture.map(l => `${l.composant} (${l.par.join(' ; ')})`).join(', ');
    out.push(`- Par l'architecture : ${lus}.`);
  }
  if (r.nommes.length) out.push(`- Nommés au ticket : ${r.nommes.join(', ')}.`);
  if (r.sansFournisseur.length) {
    out.push(
      `- Sans interface qui les publie : ${r.sansFournisseur.map(n => `\`${n}\``).join(', ')}.`
    );
  }
  return out.join('\n');
}

// The admission of <nom> out of the title of <ticket>, its reason after `--raison` in <args>: its
// exit code.
function admettreAuTicket(racine, ticket, nom, args) {
  const r = args.indexOf('--raison');
  const raison = r >= 0 ? args[r + 1]?.trim() : '';
  const c = lesComposants(racine).find(
    x => x.paquet === nom || path.relative(racine, x.dir) === path.normalize(nom ?? '')
  );
  if (!c || !raison) {
    process.stderr.write(
      `⛔ ${!c ? `${nom ?? '(aucun)'} : aucun composant de ce nom` : '--raison manque'}.\n` +
        'usage: npx grillhouse composants-affectes <ticket> --admettre <composant> --raison <texte>\n'
    );
    return 2;
  }
  const titre = nomAuTitre(racine, c);
  admettre(path.join(racine, '.claude', 'worktrees', `${ticket}.composants.json`), [titre], raison);
  const texte = `Composants · ${titre} admis hors du titre : ${raison}`;
  const bd = spawnSync('bd', ['comments', 'add', ticket, texte], {
    cwd: racine,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (bd.status !== 0) process.stderr.write(`⚠️  ligne non écrite au ticket : ${bd.stderr}\n`);
  process.stdout.write(`${texte}\n`);
  return 0;
}

// The command: its exit code.
function commande(racine, args) {
  const i = args.indexOf('--description');
  if (i >= 0) {
    if (!args[i + 1]) {
      process.stderr.write('usage: npx grillhouse composants-affectes --description <fichier>\n');
      return 2;
    }
    const r = releve(racine, readFileSync(path.resolve(racine, args[i + 1]), 'utf8'));
    process.stdout.write(`${texteDuReleve(r)}\n`);
    return 0;
  }
  const [ticket] = args;
  const a = args.indexOf('--admettre');
  if (ticket && a >= 0) return admettreAuTicket(racine, ticket, args[a + 1], args);
  if (!ticket) {
    process.stderr.write(
      'usage: npx grillhouse composants-affectes <ticket> | --description <fichier>\n'
    );
    return 2;
  }
  const show = spawnSync('bd', ['show', ticket, '--json'], {
    cwd: racine,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (show.status !== 0) {
    process.stderr.write(`⛔ ticket ${ticket} illisible : ${show.stderr}\n`);
    return 2;
  }
  const t = JSON.parse(show.stdout)[0] ?? {};
  const r = releve(racine, t.description);
  process.stdout.write(`${texteDuReleve(r)}\n`);
  const parts = String(t.title ?? '').split(' — ');
  const titre =
    parts.length < 2
      ? []
      : parts
          .at(-1)
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
  const manque = manquants(racine, r, titre);
  if (manque.length) {
    process.stdout.write(`Composants manquants au titre : ${manque.join(', ')}.\n`);
    return 1;
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = commande(process.cwd(), process.argv.slice(2));
}
