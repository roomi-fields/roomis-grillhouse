#!/usr/bin/env node
// The written interface of each component against its code.
//
// - The public API of a component is reported by API Extractor from its built declarations:
//   `docs/INTERFACE.api.md`, kept in the repository. The check refuses an API that changed
//   without its report. The interface is compared to the built API (the documentation model
//   API Extractor builds from the code), not to the recorded report. A package's entry is its main
//   entry (`types`, or `exports["."].types`); its other entries (test material) are not its API. A
//   module of `src/` has `<types directory>/<module>/index.d.ts`. Types of a neighbour stay
//   references to it.
// - The contract of each export lives in its TSDoc comment, in the code: a summary, one `@param`
//   per parameter (a destructured parameter by its position, under any name), `@returns` for a
//   function that returns a value (not void, undefined, never or Promise<void>), and one
//   `@faute CODE` per fault it returns, the code being one of the « ## Les fautes » catalogue. The
//   frame's `tsdoc.json` (repository root) declares `@faute` and is read for every component; an
//   unknown or malformed TSDoc tag is refused. Every export is judged on its own rubrics, each
//   overload signature included; the members of a class or interface are not.
// - `docs/INTERFACE.md` has two parts: the hand-written one, never touched, and the generated one
//   between the marks `<!-- généré: début -->` and `<!-- généré: fin -->`, one entry per export
//   (title, signature, summary, parameters, return, faults; an interface or a class lists its
//   members). The check refuses a generated part that differs from what `--ecrire` writes, and
//   marks that are missing, alone, doubled or out of order. `--ecrire` adds the marks at the end
//   of an interface that has none, writes the part even when a rubric is missing, and then
//   returns the refusals of the check.
// - The root interface `docs/INTERFACE.md` is not a component's: it needs no marks.
// - A package whose `exports` has subpaths only (`./test-fixtures`, the shared test material) and
//   no `.` entry has no public API, nor has a package without `exports`, `main`, `types` or
//   `typings` (a package of tools, its commands in `bin`): no built entry, no report, no generated
//   part nor marks are asked of it, and nothing is reported; its « ## Les fautes », if any, is
//   checked against its code.
// - When the interface has a « ## Les fautes » section, its codes (`PARSE_EXPECTED`…) are exactly
//   the codes with the same prefixes found in the component's production code, and each is named
//   by an `@faute` of the component.
//
//   node scripts/interfaces-contre-code.mjs   checks every component (run after the build)
//   npm run api                               writes the API reports and the generated parts
//                                             (`--ecrire`; run after the build)
//
// A missing report, or an API changed without its report, is refused with `npm run api`, the
// command that writes it; API Extractor's own warning on that report is not relayed (the refusal
// says what to do).
//
// A refusal inscribed in the project's debt (`grillhouse-dette.json`, see `dette.mjs`) passes, keyed
// by the component's interface and the rubric (`resume`, `param`, `param-orphelin`, `returns`,
// `faute-mal-formee`, `faute-hors-catalogue`, `faute-non-nommee`, `faute-non-produite`,
// `faute-non-listee`), or by the declaration file and TSDoc's message id for a TSDoc message.
//
// In the envelope of a component (`GRILLHOUSE_ENVELOPPE`, scripts/enveloppe/composant.mjs), the
// check and `npm run api` read and write that component alone: its neighbours' source is hidden,
// their published parts read-only, and the integration checks every component on the whole
// repository. The component's build comes first, as outside (`npm test -- <its files>` builds it).
//
// A component without `docs/INTERFACE.md` is reported and skipped. A project that prefers a
// bench per component calls `verifierComposant(racine, composant)` from its test.
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { composants, lireSiPresent, parcourir } from './consommateurs.mjs';
import { composantDeLEnveloppe } from './enveloppe/composant.mjs';
import { trancher } from './dette.mjs';

const require = createRequire(import.meta.url);
const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|svelte|vue)$/;
const isTest = rel =>
  /(^|\/)(test|tests|__tests__)\//.test(rel) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);
const CODE = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]*[A-Z0-9]\b/g;

const lireJson = p => JSON.parse(readFileSync(p, 'utf8'));

// Whether a component has no public API: its package exports subpaths only (`./test-fixtures`…),
// no `.` entry, or it declares no entry at all, neither `exports`, `main`, `types` nor `typings`
// (a package of tools, its commands in `bin`). API Extractor reads one entry point; such a package
// has none.
export function sansApi(c) {
  const pj = path.join(c.dir, 'package.json');
  if (!existsSync(pj)) return false;
  const p = lireJson(pj);
  const exp = p.exports;
  if (exp === undefined) return [p.main, p.types, p.typings].every(e => e === undefined);
  if (!exp || typeof exp !== 'object' || Array.isArray(exp)) return false;
  const cles = Object.keys(exp);
  return cles.length > 0 && cles.every(k => k.startsWith('.')) && !cles.includes('.');
}

// The built entry of a component's public API, or null.
export function entree(racine, c) {
  const pj = path.join(c.dir, 'package.json');
  if (existsSync(pj)) {
    const p = lireJson(pj);
    const point = p.exports?.['.'];
    const types =
      (typeof point === 'object' && (point.types ?? point.import?.types)) || p.types || p.typings;
    return types ? path.join(c.dir, types) : null;
  }
  const racinePj = path.join(racine, 'package.json');
  const types = existsSync(racinePj) ? lireJson(racinePj).types : null;
  if (!types) return null;
  return path.join(racine, path.dirname(types), path.basename(c.dir), 'index.d.ts');
}

// The fault codes an interface text declares in « ## Les fautes » of its hand-written part (null
// without the section); the generated part and code blocks are not read.
export function declare(texte) {
  let fautes = null;
  let section = null;
  let bloc = false;
  for (const l of ecrite(texte)) {
    if (/^\s*(```|~~~)/.test(l)) bloc = !bloc;
    const titre = !bloc && /^(#{2,3}) (.+)$/.exec(l);
    if (titre) {
      section = titre[1] === '##' ? titre[2].trim() : section;
      if (section === 'Les fautes' && fautes === null) fautes = new Set();
      continue;
    }
    if (section === 'Les fautes') for (const m of l.matchAll(CODE)) fautes.add(m[0]);
  }
  return { fautes };
}

// The codes with one of <prefixes> found in the production code under <dir>, as `parcourir`
// walks it.
function codesDuCode(dir, racine, prefixes) {
  const trouves = new Set();
  const nom = p => path.basename(p);
  const sources = parcourir(
    dir,
    p => ['node_modules', 'dist', 'docs'].includes(nom(p)) || nom(p).startsWith('.')
  ).filter(p => SOURCE.test(nom(p)) && !isTest(path.relative(racine, p)));
  for (const p of sources) {
    for (const m of (lireSiPresent(p) ?? '').matchAll(CODE)) {
      if (prefixes.some(pr => m[0].startsWith(pr))) trouves.add(m[0]);
    }
  }
  return trouves;
}

// Runs API Extractor on one component: whether the repository's report is up to date, the exports
// of the documentation model built from the code (whether or not the report exists) and the TSDoc
// messages of its comments.
function rapportApi(racine, c, entreeDts, ecrire, tsdocConfigFile) {
  const { Extractor, ExtractorConfig } = require('@microsoft/api-extractor');
  const { ApiModel } = require('@microsoft/api-extractor-model');
  const pj = existsSync(path.join(c.dir, 'package.json'))
    ? path.join(c.dir, 'package.json')
    : path.join(racine, 'package.json');
  const tsconfig = [path.join(c.dir, 'tsconfig.json'), path.join(racine, 'tsconfig.json')].find(
    existsSync
  );
  const tmp = mkdtempSync(path.join(tmpdir(), 'api-'));
  const messages = [];
  const tsdoc = new Map();
  try {
    const modele = path.join(tmp, 'modele.api.json');
    const config = ExtractorConfig.prepare({
      configObject: {
        projectFolder: path.dirname(pj),
        mainEntryPointFilePath: entreeDts,
        compiler: tsconfig ? { tsconfigFilePath: tsconfig } : undefined,
        apiReport: {
          enabled: true,
          reportFolder: path.join(c.dir, 'docs'),
          reportTempFolder: tmp,
          reportFileName: 'INTERFACE',
        },
        docModel: { enabled: true, apiJsonFilePath: modele },
        dtsRollup: { enabled: false },
        tsdocMetadata: { enabled: false },
        messages: {
          extractorMessageReporting: { 'ae-missing-release-tag': { logLevel: 'none' } },
          tsdocMessageReporting: { default: { logLevel: 'warning' } },
        },
      },
      packageJsonFullPath: pj,
      tsdocConfigFile,
    });
    const resultat = Extractor.invoke(config, {
      localBuild: ecrire,
      messageCallback: m => {
        const duRapport = String(m.messageId).startsWith('console-api-report');
        if (m.category === 'TSDoc') {
          const fichier = m.sourceFilePath ? path.relative(racine, m.sourceFilePath) : null;
          const lieu = fichier ? `${fichier}:${m.sourceFileLine ?? 1}: ` : '';
          tsdoc.set(`${lieu}${m.text}`, {
            fichier,
            ...(fichier ? { ligne: m.sourceFileLine ?? 1 } : {}),
            regle: m.messageId,
          });
          m.logLevel = 'none';
        } else if ((m.logLevel === 'error' || m.logLevel === 'warning') && (ecrire || !duRapport)) {
          messages.push(m.text);
        }
        m.handled = true;
      },
    });
    const paquet = new ApiModel().loadPackage(modele);
    return {
      ajour: resultat.succeeded && !resultat.apiReportChanged,
      messages,
      tsdoc: [...tsdoc].map(([texte, lieu]) => ({ texte, ...lieu })),
      exports: paquet.entryPoints.flatMap(e => [...e.members]),
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- The TSDoc contract of an export ----

const RETOUR_VIDE = new Set(['void', 'undefined', 'never', 'Promise<void>']);
const CODE_SEUL = new RegExp(`^${CODE.source}$`);

// The text of a TSDoc node, its paragraphs apart by a blank line, each on one line.
function texteDoc(noeud) {
  if (!noeud) return '';
  const feuilles = n =>
    n.kind === 'Excerpt' ? n.content.toString() : n.getChildNodes().map(feuilles).join('');
  const paragraphes = noeud.kind === 'Section' ? noeud.getChildNodes() : [noeud];
  return paragraphes
    .map(p => feuilles(p).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

// The parameters of a function as the model gives them. API Extractor lists a destructuring pattern
// (`{ a }`, `[a]`) as a parameter without type, then the parameter itself under the name `input`,
// `input2`…; the pattern entry is dropped and the parameter that follows it is marked destructured
// (documented by its position, under any name). A parameter named `input` after no pattern is a
// named parameter.
function parametresDe(item) {
  const sortie = [];
  let motif = false;
  for (const p of item.parameters) {
    if (p.parameterTypeExcerpt.isEmpty && /^[{[]/.test(p.name)) {
      motif = true;
      continue;
    }
    sortie.push({ name: p.name, destructure: motif });
    motif = false;
  }
  return sortie;
}

// A function declared with `function` (API Extractor also models a function-typed constant as a
// function; a constant is a variable and takes its summary only).
const estFonction = item =>
  item.kind === 'Function' &&
  /^(?:(?:export|declare|default|async)\s+)*function\b/.test(item.getExcerptWithModifiers().trim());

// The rubrics of an export: its summary, its parameters, its return and its faults.
function contratDe(item) {
  const doc = item.tsdocComment;
  const blocs = doc?.params.blocks ?? [];
  return {
    resume: texteDoc(doc?.summarySection),
    params: blocs.map(b => ({ nom: b.parameterName, texte: texteDoc(b.content) })),
    retour: doc?.returnsBlock ? texteDoc(doc.returnsBlock.content) : null,
    fautes: (doc?.customBlocks ?? [])
      .filter(b => b.blockTag.tagName === '@faute')
      .map(b => texteDoc(b.content)),
    parametres: estFonction(item) ? parametresDe(item) : [],
    rendUneValeur:
      item.kind === 'Function' && !RETOUR_VIDE.has(item.returnTypeExcerpt.text.replace(/\s+/g, '')),
  };
}

// The code an `@faute` text starts with, or null when its first word is not a code.
const codeDeFaute = texte => {
  const mot = texte.split(/\s+/)[0];
  return CODE_SEUL.test(mot) ? mot : null;
};

// The `@faute` texts <textes> of one element judged against the catalogue <fautes>: refusals
// (`{ regle, texte }`) are pushed on <refus>, the codes named on <codes>.
function fautesJugees(nom, textes, fautes, refus, codes) {
  for (const f of textes) {
    const code = codeDeFaute(f);
    if (!code) {
      refus.push({
        regle: 'faute-mal-formee',
        texte: `${nom} : un @faute est mal formé (il commence par un code, ex. @faute CODE).`,
      });
    } else if (!fautes?.has(code)) {
      refus.push({
        regle: 'faute-hors-catalogue',
        texte: `${nom} : le @faute ${code} n'est pas au catalogue « ## Les fautes ».`,
      });
    } else codes.add(code);
  }
}

// The refusals for one export against its contract (`{ regle, texte }`), with the fault codes it
// and its members name.
function jugerExport(item, fautes) {
  const refus = [];
  const nom = `\`${item.displayName}\``;
  const k = contratDe(item);
  if (!k.resume) refus.push({ regle: 'resume', texte: `${nom} n'a pas de résumé TSDoc.` });
  const codes = new Set();
  if (estFonction(item)) {
    const noms = new Set(k.parametres.filter(p => !p.destructure).map(p => p.name));
    const prises = new Set();
    k.parametres.forEach((p, i) => {
      const parNom = p.destructure ? -1 : k.params.findIndex(b => b.nom === p.name);
      if (parNom >= 0) prises.add(parNom);
      else if (!p.destructure)
        refus.push({
          regle: 'param',
          texte: `${nom} : le paramètre « ${p.name} » n'a pas de @param.`,
        });
      else if (!k.params[i] || noms.has(k.params[i].nom))
        refus.push({
          regle: 'param',
          texte: `${nom} : le paramètre déstructuré en position ${i + 1} n'a pas son @param à cette position.`,
        });
      else prises.add(i);
    });
    k.params.forEach((b, i) => {
      if (!prises.has(i))
        refus.push({
          regle: 'param-orphelin',
          texte: `${nom} : le @param « ${b.nom} » ne nomme aucun paramètre.`,
        });
    });
    if (k.rendUneValeur && k.retour === null)
      refus.push({ regle: 'returns', texte: `${nom} rend une valeur mais n'a pas de @returns.` });
  }
  fautesJugees(nom, k.fautes, fautes, refus, codes);
  for (const m of item.members ?? []) {
    const km = contratDe(m);
    fautesJugees(`\`${m.displayName}\``, km.fautes, fautes, refus, codes);
  }
  return { refus, codes };
}

// ---- The generated part of docs/INTERFACE.md ----

export const DEBUT = '<!-- généré: début -->';
export const FIN = '<!-- généré: fin -->';

// The positions of the two marks in an interface text: { etat: 'ok' | 'absentes' | 'invalides', … }.
// A mark written in a code block is an example, not a mark.
export function marques(texte) {
  const lignes = texte.split('\n');
  const debuts = [];
  const fins = [];
  let cloture = null;
  lignes.forEach((l, i) => {
    const f = /^\s*(```|~~~)/.exec(l);
    if (cloture) {
      if (f && f[1] === cloture) cloture = null;
      return;
    }
    if (f) {
      cloture = f[1];
      return;
    }
    if (l.trim() === DEBUT) debuts.push(i);
    if (l.trim() === FIN) fins.push(i);
  });
  if (!debuts.length && !fins.length) return { etat: 'absentes', lignes };
  if (debuts.length === 1 && fins.length === 1 && debuts[0] < fins[0])
    return { etat: 'ok', lignes, debut: debuts[0], fin: fins[0] };
  return { etat: 'invalides', lignes };
}

// The lines of an interface text outside its generated part.
function ecrite(texte) {
  const m = marques(texte);
  return m.etat === 'ok' ? [...m.lignes.slice(0, m.debut), ...m.lignes.slice(m.fin + 1)] : m.lignes;
}

// The signature of an element on one line; a constant keeps its declaration (`const`, `let`).
const signature = item => {
  const texte = item.getExcerptWithModifiers().replace(/\s+/g, ' ').replace(/;$/, '').trim();
  if (
    /^(?:(?:export|declare|default|async)\s+)*(?:function|class|interface|type|enum|namespace|const|let|var)\b/.test(
      texte
    )
  )
    return texte;
  if (item.kind === 'Variable')
    return `export declare ${item.isReadonly ? 'const' : 'let'} ${texte}`;
  return item.kind === 'Function' ? `const ${texte}` : texte;
};

// The generated entry of one export: title, summary, signature, parameters, return, faults and,
// for an interface or a class, its members.
function entreeDe(item) {
  const k = contratDe(item);
  const out = [`### \`${item.displayName}\``, ''];
  if (k.resume) out.push(k.resume, '');
  out.push('```ts', `${signature(item)};`, '```');
  const params = k.params.filter(b => b.texte);
  if (params.length)
    out.push('', '**Paramètres**', '', ...params.map(b => `- \`${b.nom}\` — ${b.texte}`));
  if (k.retour) out.push('', `**Retour** — ${k.retour}`);
  const codes = [...new Set(k.fautes.map(f => f.replace(/\s+/g, ' ')))];
  if (codes.length)
    out.push('', '**Fautes**', '', ...codes.map(f => `- ${f.replace(/^(\S+)/, '`$1`')}`));
  const membres = [...(item.members ?? [])];
  if (membres.length) {
    out.push('', '**Membres**', '');
    for (const m of membres) {
      const resume = texteDoc(m.tsdocComment?.summarySection);
      out.push(`- \`${signature(m)}\`${resume ? ` — ${resume}` : ''}`);
    }
  }
  return out.join('\n');
}

// The text between the marks for <exports>: empty without export.
const partieGeneree = exports =>
  exports.length ? `\n${exports.map(entreeDe).join('\n\n')}\n\n` : '\n';

// The text of an interface with its generated part replaced; the marks are added at the end of a
// text that has none.
function avecPartie(m, texte, partie) {
  if (m.etat === 'absentes')
    return `${texte}${texte.endsWith('\n') ? '' : '\n'}\n${DEBUT}${partie}${FIN}\n`;
  const avant = m.lignes.slice(0, m.debut).join('\n');
  const apres = m.lignes.slice(m.fin + 1).join('\n');
  return `${avant}${m.debut ? '\n' : ''}${DEBUT}${partie}${FIN}\n${apres}`;
}

// The refusals and reports for one component. A refusal is a finding `{ fichier, regle, message }`
// the debt (`dette.mjs`) judges, keyed by the component's interface (by the declaration file for a
// TSDoc message, its rule TSDoc's message id); a refusal that a command or a build repairs (a
// generated part, an API report, a built entry, the marks, the TSDoc configuration) has no key and
// is never inscribed.
export function verifierComposant(racine, c, { ecrire = false } = {}) {
  const refus = [];
  const signaux = [];
  const rel = path.relative(racine, c.dir);
  const iface = path.join(c.dir, 'docs', 'INTERFACE.md');
  const relIface = path.relative(racine, iface);
  // A refusal of the component: inscribable when <regle> is given, keyed by <fichier>.
  const refuser = (texte, regle = null, fichier = relIface, ligne = null) =>
    refus.push(
      regle
        ? { fichier, ...(ligne ? { ligne } : {}), regle, message: `${rel} : ${texte}` }
        : { message: `${rel} : ${texte}` }
    );
  if (!existsSync(iface)) {
    signaux.push(`${rel} n'a pas d'interface (docs/INTERFACE.md) : rien n'est vérifié.`);
    return { refus, signaux };
  }
  const texte = readFileSync(iface, 'utf8');
  const { fautes } = declare(texte);
  const m = marques(texte);
  if (sansApi(c)) {
    if (fautes) codesContreCatalogue(c, racine, fautes, refuser);
    return { refus, signaux };
  }
  if (m.etat === 'invalides') {
    refuser(
      `docs/INTERFACE.md doit porter la marque « ${DEBUT} » puis la marque « ${FIN} », chacune une fois ; corrige les marques à la main (npm run api n'écrit rien).`
    );
  }
  const fichierTsdoc = path.join(racine, 'tsdoc.json');
  const dts = entree(racine, c);
  if (!existsSync(fichierTsdoc)) {
    refuser('la configuration TSDoc du cadre (tsdoc.json à la racine) manque.');
  } else if (!dts || !existsSync(dts)) {
    refuser(`son entrée construite (${dts ?? 'types absent'}) manque ; construis d'abord.`);
  } else {
    const { TSDocConfigFile } = require('@microsoft/tsdoc-config');
    const config = TSDocConfigFile.loadFile(fichierTsdoc);
    const api = rapportApi(racine, c, dts, ecrire, config);
    for (const msg of api.messages) signaux.push(`${rel} : ${msg}`);
    for (const t of api.tsdoc) {
      refuser(`TSDoc : ${t.texte}`, t.regle, t.fichier ?? relIface, t.ligne);
    }
    const manque = !ecrire && !existsSync(path.join(c.dir, 'docs', 'INTERFACE.api.md'));
    if (manque) {
      refuser(
        "son rapport docs/INTERFACE.api.md manque ; npm run api l'écrit, après la construction."
      );
    } else if (!api.ajour && !ecrire) {
      refuser(
        "l'API a changé sans son rapport docs/INTERFACE.api.md ; npm run api le régénère, après la construction."
      );
    }
    const nommees = new Set();
    for (const item of api.exports) {
      const j = jugerExport(item, fautes);
      for (const r of j.refus) refuser(r.texte, r.regle);
      for (const code of j.codes) nommees.add(code);
    }
    for (const f of fautes ?? []) {
      if (!nommees.has(f))
        refuser(`la faute ${f} du catalogue n'est nommée par aucun @faute.`, 'faute-non-nommee');
    }
    if (m.etat !== 'invalides') {
      const attendu = avecPartie(m, texte, partieGeneree(api.exports));
      if (ecrire) {
        if (attendu !== texte) writeFileSync(iface, attendu);
      } else if (attendu !== texte) {
        refuser(
          `la part générée de docs/INTERFACE.md (entre ${DEBUT} et ${FIN}) n'est pas celle du code ; npm run api la refait.`
        );
      }
    }
  }
  if (fautes) codesContreCatalogue(c, racine, fautes, refuser);
  return { refus, signaux };
}

// The catalogue <fautes> against the codes of the component's production code, refused through
// <refuser>.
function codesContreCatalogue(c, racine, fautes, refuser) {
  const prefixes = [...new Set([...fautes].map(f => f.slice(0, f.indexOf('_') + 1)))];
  const dansLeCode = codesDuCode(c.dir, racine, prefixes);
  for (const f of fautes) {
    if (!dansLeCode.has(f))
      refuser(`la faute ${f} est listée, mais le code ne la produit pas.`, 'faute-non-produite');
  }
  for (const f of dansLeCode) {
    if (!fautes.has(f))
      refuser(`le code produit ${f}, que « Les fautes » ne liste pas.`, 'faute-non-listee');
  }
}

// The components a run reads: every one of <racine>; in the envelope of a component, that one
// alone, its neighbours read by their published form and never written.
export function aVerifier(racine, env = process.env) {
  const tous = composants(racine);
  const propre = composantDeLEnveloppe(env);
  const sien = propre && tous.filter(c => path.resolve(c.dir) === path.resolve(racine, propre));
  return sien?.length ? sien : tous;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = process.cwd();
  const ecrire = process.argv.includes('--ecrire');
  const constats = [];
  for (const c of aVerifier(racine)) {
    const { refus, signaux } = verifierComposant(racine, c, { ecrire });
    for (const s of signaux) process.stderr.write(`⚠️  ${s}\n`);
    constats.push(...refus);
  }
  const { refus, lignes } = trancher(racine, 'interfaces-contre-code', constats);
  for (const r of refus) process.stderr.write(`⛔ ${r.message}\n`);
  for (const l of lignes) process.stderr.write(`${l}\n`);
  process.exitCode = refus.length ? 1 : 0;
}
