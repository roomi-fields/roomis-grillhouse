// The references of a ticket's elements found through the types, as « find all references » of
// rust-analyzer and of TypeScript's language service: an element is resolved as a symbol of the
// repository's code (a declaration of a package, a member of a type, a function internal to a
// package), and its references are those the language service resolves to that symbol, never a
// text that happens to bear its name. scripts/composants-affectes.mjs runs it beside its survey
// by the names.
//
// - The code read is the files of each component's `tsconfig.json` (its `include`), in one
//   language service, so that a reference crosses packages. A workspace package's import resolves
//   to its sources: the target of its `exports` (`.`), read back through its `tsconfig*.json` when
//   it names a built file (`sorties` of scripts/frontieres.mjs), else `src/index.ts`.
// - An element (`A`, `A.b`, `f()`, `a().b`) resolves, from its last two names, to the member `b`
//   of a type, interface or class `A` declared in a component; else, from its first name, to a
//   declaration of that name at the top of a component's source, else to the members of that
//   name. The test files declare nothing.
// - A declaration is published when its package's entry exports it (a member, when its type is);
//   its readers are the other components that hold a reference to it, in their production code
//   or their tests: « appel de » for a call, « référence à » otherwise.
// - An internal declaration has no readers out of its package, as « find all references » starts
//   from a symbol the published interface exports: a word of the ticket that only names it (a word
//   of the language homonym of a private function) leads to no reader.
// - An element that resolves to several declarations keeps those of the files and the components
//   the ticket names, when it has some, else those of its components. A bare name that only the
//   members of types out of these components bear resolves to none: it names no type.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { lireSiPresent, NOM_DE_TEST } from './consommateurs.mjs';
import { sorties } from './frontieres.mjs';

const requis = createRequire(import.meta.url);
const DOSSIERS_DE_TEST = new Set(['test', 'tests', '__tests__']);
const SOURCE_TS = /\.[cm]?tsx?$/;
const DECLARATION = /\.d\.[cm]?ts$/;

// The elements <texte> names between backquotes: [{ ecrit, noms }], `ecrit` its first name,
// `noms` its names without their calls, in their order, once each.
export function elementsEcrits(texte) {
  const vus = new Map();
  for (const [, brut] of texte.matchAll(/`([^`\n]+)`/g)) {
    const m = /^([A-Za-z_$][\w$]*)((?:\.[A-Za-z_$][\w$]*|\([^)]*\))*)$/.exec(brut.trim());
    if (!m) {
      continue;
    }
    const noms = [
      m[1],
      ...[...m[2].replace(/\([^)]*\)/g, '').matchAll(/\.([\w$]+)/g)].map(x => x[1]),
    ];
    const cle = noms.join('.');
    if (!vus.has(cle)) {
      vus.set(cle, { ecrit: m[1], noms });
    }
  }
  return [...vus.values()];
}

// The cible strings of an `exports` value, `types` first.
function cibles(valeur) {
  if (typeof valeur === 'string') {
    return [valeur];
  }
  if (!valeur || typeof valeur !== 'object') {
    return [];
  }
  const cles = Object.keys(valeur).sort((a, b) => (b === 'types') - (a === 'types'));
  return cles.flatMap(k => cibles(valeur[k]));
}

// The source of the subpath <sous> (`.`, `./x`) of the component <c>, or null.
function entreeDe(c, sous = '.') {
  const pj = JSON.parse(lireSiPresent(path.join(c.dir, 'package.json')) ?? '{}');
  let v = pj.exports;
  const parChemin = v && typeof v === 'object' && Object.keys(v).some(k => k.startsWith('.'));
  if (parChemin) {
    v = v[sous];
  } else if (sous !== '.') {
    v = undefined;
  }
  if (v === undefined && sous === '.') {
    v = pj.types ?? pj.main;
  }
  let emis = null;
  for (const cible of cibles(v)) {
    const abs = path.resolve(c.dir, cible);
    if (SOURCE_TS.test(abs) && !DECLARATION.test(abs) && existsSync(abs)) {
      return abs;
    }
    emis ??= sorties(c.dir);
    const source = [...(emis.get(abs) ?? [])][0];
    if (source) {
      return source;
    }
  }
  if (sous !== '.') {
    return null;
  }
  return (
    ['src/index.ts', 'src/index.tsx', 'index.ts'].map(f => path.join(c.dir, f)).find(existsSync) ??
    null
  );
}

const estTest = (c, f) =>
  NOM_DE_TEST.test(path.basename(f)) ||
  path
    .relative(c.dir, f)
    .split(path.sep)
    .some(d => DOSSIERS_DE_TEST.has(d));

// The language service over the components <tous> of <racine>: { ts, ls, programme, composantDe }
// or { raison } when it cannot run.
function service(ts, racine, tous) {
  const hote = { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} };
  const configs = [];
  for (const c of tous) {
    const f = path.join(c.dir, 'tsconfig.json');
    if (!existsSync(f)) {
      continue;
    }
    const a = ts.getParsedCommandLineOfConfigFile(f, {}, hote);
    if (a) {
      configs.push(a);
    }
  }
  if (configs.length === 0) {
    return { raison: 'aucun tsconfig.json dans les composants' };
  }
  const fichiers = [...new Set(configs.flatMap(a => a.fileNames.map(f => path.resolve(f))))];
  const options = {
    ...configs[0].options,
    noEmit: true,
    allowJs: true,
    allowImportingTsExtensions: true,
    skipLibCheck: true,
    types: [],
    composite: false,
    incremental: false,
  };
  const entrees = new Map();
  const espace = nom => {
    if (entrees.has(nom)) {
      return entrees.get(nom);
    }
    let r = null;
    for (const c of tous) {
      if (!c.paquet) {
        continue;
      }
      if (nom === c.paquet) {
        r = entreeDe(c);
      } else if (nom.startsWith(`${c.paquet}/`)) {
        r = entreeDe(c, `.${nom.slice(c.paquet.length)}`);
      }
      if (r) {
        break;
      }
    }
    entrees.set(nom, r);
    return r;
  };
  const resolution = {
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
  };
  const ls = ts.createLanguageService(
    {
      ...resolution,
      getScriptFileNames: () => fichiers,
      getScriptVersion: () => '1',
      getScriptSnapshot: f => {
        const t = lireSiPresent(f);
        return t === null ? undefined : ts.ScriptSnapshot.fromString(t);
      },
      getCurrentDirectory: () => racine,
      getCompilationSettings: () => options,
      getDefaultLibFileName: o => ts.getDefaultLibFilePath(o),
      readDirectory: ts.sys.readDirectory,
      resolveModuleNameLiterals: (litteraux, depuis, _redirige, opts) =>
        litteraux.map(l => {
          const source = espace(l.text);
          if (source) {
            return {
              resolvedModule: {
                resolvedFileName: source,
                extension: ts.extensionFromPath(source),
                isExternalLibraryImport: false,
              },
            };
          }
          return ts.resolveModuleName(l.text, depuis, opts, resolution);
        }),
    },
    ts.createDocumentRegistry()
  );
  const programme = ls.getProgram();
  const dirs = tous
    .map(c => ({ c, prefixe: c.dir + path.sep }))
    .sort((a, b) => b.prefixe.length - a.prefixe.length);
  const composantDe = f => {
    const abs = path.resolve(f);
    if (abs.split(path.sep).includes('node_modules')) {
      return null;
    }
    return dirs.find(d => abs.startsWith(d.prefixe))?.c ?? null;
  };
  return { ls, programme, composantDe };
}

// The survey by the types of the elements <ecrits> (`elementsEcrits`) in the components <tous> of
// <racine>, an element that resolves to several declarations kept to those of the files and the
// components the ticket names (<contexte>: `{ fichiers, composants }`, Sets of file names and of
// components), when it has some: `{ etat: 'fait', raison: null, elements: [{ nom, ecrit,
// declarations: [{ c, publie }], lecteurs: Map component → Set of « par » }] }`, or
// `{ etat: 'impossible', raison, elements: [] }` when it cannot run.
export function parLesTypes(racine, tous, ecrits, contexte = {}) {
  try {
    return releveParLesTypes(racine, tous, ecrits, contexte);
  } catch (e) {
    return { etat: 'impossible', raison: `erreur : ${e.message.split('\n')[0]}`, elements: [] };
  }
}

function releveParLesTypes(racine, tous, ecrits, { fichiers = new Set(), composants = new Set() }) {
  const ts = requis('typescript');
  const s = service(ts, racine, tous);
  if (s.raison) {
    return { etat: 'impossible', raison: s.raison, elements: [] };
  }
  const { ls, programme, composantDe } = s;
  const checker = programme.getTypeChecker();

  // The declarations of the components' sources, at their top and as members of their types.
  const hauts = [];
  const membres = [];
  const nomDe = n => (n?.name && ts.isIdentifier(n.name) ? n.name.text : null);
  const ajouterMembres = (haut, liste) => {
    for (const m of liste ?? []) {
      const nom = nomDe(m);
      if (nom) {
        membres.push({ nom, conteneur: haut.nom, noeud: m.name, haut, c: haut.c });
      }
    }
  };
  for (const sf of programme.getSourceFiles()) {
    const c = composantDe(sf.fileName);
    if (!c || estTest(c, sf.fileName) || DECLARATION.test(sf.fileName)) {
      continue;
    }
    for (const st of sf.statements) {
      const decls = ts.isVariableStatement(st)
        ? st.declarationList.declarations.filter(d => ts.isIdentifier(d.name))
        : [st];
      for (const d of decls) {
        const nom = nomDe(d);
        if (!nom) {
          continue;
        }
        const haut = { nom, conteneur: null, noeud: d.name, c };
        hauts.push(haut);
        if (ts.isClassDeclaration(d) || ts.isInterfaceDeclaration(d)) {
          ajouterMembres(haut, d.members);
        }
        if (ts.isTypeAliasDeclaration(d) && ts.isTypeLiteralNode(d.type)) {
          ajouterMembres(haut, d.type.members);
        }
      }
    }
  }

  // The symbols each component's entry exports.
  const exportes = new Map();
  const reel = sym => {
    let x = sym;
    if (x && x.flags & ts.SymbolFlags.Alias) {
      x = checker.getAliasedSymbol(x);
    }
    return x ? checker.getExportSymbolOfSymbol(x) : x;
  };
  const exportsDe = c => {
    if (!exportes.has(c)) {
      const f = entreeDe(c);
      const sf = f ? programme.getSourceFile(f) : undefined;
      const mod = sf ? checker.getSymbolAtLocation(sf) : undefined;
      exportes.set(
        c,
        mod ? checker.getExportsOfModule(mod).map(x => ({ nom: x.name, sym: reel(x) })) : []
      );
    }
    return exportes.get(c);
  };
  const symDe = d => reel(checker.getSymbolAtLocation(d.noeud));
  const publie = d => {
    const h = d.haut ?? d;
    const sym = symDe(h);
    return Boolean(sym) && exportsDe(h.c).some(x => x.sym === sym);
  };

  // The references of the declaration <d>: [{ c, appel }], its own declarations left out.
  const noeudA = (sf, pos) => {
    let trouve = null;
    const visiter = n => {
      if (trouve || pos < n.getStart(sf) || pos >= n.getEnd()) {
        return;
      }
      if (ts.isIdentifier(n) && n.getStart(sf) === pos) {
        trouve = n;
      } else {
        ts.forEachChild(n, visiter);
      }
    };
    visiter(sf);
    return trouve;
  };
  const estAppel = n => {
    const p = n?.parent;
    if (!p) {
      return false;
    }
    if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression === n) {
      return true;
    }
    return ts.isPropertyAccessExpression(p) && p.name === n && estAppel(p);
  };
  const references = d => {
    const sf = d.noeud.getSourceFile();
    const out = [];
    for (const r of ls.findReferences(sf.fileName, d.noeud.getStart(sf)) ?? []) {
      for (const ref of r.references) {
        if (ref.isDefinition) {
          continue;
        }
        const c = composantDe(ref.fileName);
        if (!c) {
          continue;
        }
        const rsf = programme.getSourceFile(ref.fileName);
        const n = rsf ? noeudA(rsf, ref.textSpan.start) : null;
        out.push({ c, appel: estAppel(n) });
      }
    }
    return out;
  };
  // The declarations an element resolves to: in the files and the components the ticket names,
  // else in its components, else anywhere; at the top before the members. <hors>: for each list,
  // the level at which its declarations resolve to none.
  const dansUnComposant = d => composants.has(d.c);
  const partout = () => true;
  const dansLeFichier = d =>
    composants.has(d.c) && fichiers.has(path.basename(d.noeud.getSourceFile().fileName));
  const choisir = (hors, ...listes) => {
    for (const garder of [dansLeFichier, dansUnComposant, partout]) {
      for (const [i, l] of listes.entries()) {
        const g = l.filter(garder);
        if (g.length) {
          return garder === hors[i] ? [] : g;
        }
      }
    }
    return [];
  };

  const resoudre = ({ noms }) => {
    if (noms.length >= 2) {
      const [conteneur, nom] = noms.slice(-2);
      const m = choisir(
        [],
        membres.filter(x => x.nom === nom && x.conteneur === conteneur)
      );
      if (m.length) {
        return { nom: `${conteneur}.${nom}`, decls: m };
      }
    }
    // A bare member name, out of the components the ticket names, names no member of a known type.
    const decls = choisir(
      [null, partout],
      hauts.filter(x => x.nom === noms[0]),
      membres.filter(x => x.nom === noms[0])
    );
    return { nom: noms[0], decls };
  };

  const elements = [];
  const vus = new Set();
  for (const e of ecrits) {
    const { nom, decls } = resoudre(e);
    if (decls.length === 0 || vus.has(nom)) {
      continue;
    }
    vus.add(nom);
    const lecteurs = new Map();
    const lire = (c, par) => {
      if (!lecteurs.has(c)) {
        lecteurs.set(c, new Set());
      }
      lecteurs.get(c).add(par);
    };
    const declarations = [];
    for (const d of decls) {
      const estPublie = publie(d);
      declarations.push({ c: d.c, publie: estPublie });
      if (!estPublie) {
        continue;
      }
      const parComposant = new Map();
      for (const r of references(d)) {
        if (r.c !== d.c) {
          parComposant.set(r.c, parComposant.get(r.c) || r.appel);
        }
      }
      for (const [c, appel] of parComposant) {
        lire(c, `${appel ? 'appel de' : 'référence à'} ${nom}`);
      }
    }
    elements.push({ nom, ecrit: e.ecrit, declarations, lecteurs });
  }
  return { etat: 'fait', raison: null, elements };
}
