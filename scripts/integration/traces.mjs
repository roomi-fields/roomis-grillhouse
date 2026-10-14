// The store of the traces of the test files and of the builds: the verdict of each test file and
// the `dist/` of each build kept under the fingerprint of the content of what produces it. The
// launcher of the tests (scripts/integration/suites-vitest.mjs) reads and writes the traces of the
// test files; the one entry point that builds (scripts/integration/constructions.mjs) stores,
// restores and purges the builds, and purges the traces with them.
//
// `ouvrirTraces(racine, options)` reads the project at <racine> and returns:
// - the components (`dossiers`: the directories under `packages/` and `src/`, plus the directories
//   given in `extra`) and `proprietaire(fichier)` (a component's directory, '' outside every one);
// - `fichiersDeTest`: the files git lists whose name is a test file's (`x.test.ts`, `x.spec.mjs`);
// - `analyserTests(fichiers)`: for each of these test files, its fingerprint and the directories of
//   the components its imports reach (see below), computed with dependency-cruiser;
// - `lire` and `ecrire`: the store of the traces, `<git common dir>/grillhouse/suites/`, shared by
//   every copy; a trace is written whole (a temporary file of its own, then a rename). Outside a git
//   repository there is no store and every test file plays;
// - `empreinteConstruction(dir)`, `ordreDeConstruction(dirs)`, `dossierConstructions` and
//   `empreintesVivantes()`: the builds (see below) and the live fingerprints.
// With the option `fichiers` (the list of the files of the content, relative to <racine>) the
// content is that list, read on the disk at <racine>, and there is no store: the content of a
// commit extracted aside.
//
// A fingerprint hashes the content of the files git lists (tracked or not, not ignored), each by its
// path and content, never by date; a submodule enters by its files. Test file: its path, the
// content of the files its imports reach, directly or by ricochet (dependency-cruiser; a cycle
// ends), the files of its component that are not modules (data, captures,
// documents), the files that configure Vitest (`vitest.config.*`, `vitest.workspace.*`,
// `vite.config.*`) and what they import, the lock file `package-lock.json` and the root paths the
// project declares read (`grillhouse.lusParLesSuites` of package.json, files or folders). An
// import of a component by its package name, and an import of a file git does not list (a
// `dist/`), enter by the files of that component and of the components it depends on
// (`dependances` of scripts/consommateurs.mjs), so that the fingerprint does not depend on what
// `node_modules` links.
// - A trace is `{ code, rouges, sortie }`: the exit code of the file (0 or 1), its failing tests by
//   name, and the whole output of Vitest for that file. A trace that does not read as that is none.
//   FORCER=1 reads no trace.
//
// The builds. A build is the `dist/` of a component (of the root for a project without a component
// that builds). Its fingerprint (`empreinteConstruction`) hashes the same inputs as the full suite
// of the component, under a label of its own; the root's hashes every file git lists, the lock file
// and the declared paths. Its entry is the tree of the `dist/`, `<git common dir>/grillhouse/
// constructions/<fingerprint>/`, copied as it is (links and empty folders included, no hard link),
// written in a folder of its own named after the process then renamed: an entry is never read half
// written. `restaurerConstruction` empties the `dist/`, then copies the entry; an entry that cannot
// be read, or that goes meanwhile, fails and the build is made. `rangerConstruction` keeps an
// entry already there, unless it is forced or cannot be read, when it replaces it (the old one set
// aside, then erased).
//
// The purge (`purgerMagasin`) keeps the traces and the builds whose fingerprint belongs to a live
// content (`empreintesVivantes()` of each: the copies git knows, main, main's previous commit, the
// branches of the queue; the reachability of git's garbage collector) and those written since its
// start. It removes any other trace and any other build, an entry in one move (set aside, then
// erased), no size cap. Temporary files and folders of the two stores left for more than an hour by
// an interrupted process go too.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  chmodSync,
  constants,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { composants as lesComposants, NOM_DE_TEST, dependances } from '../consommateurs.mjs';
import { dossierCommun } from './file-attente.mjs';

const VERROU = 'package-lock.json';
export const posix = p => p.split(path.sep).join('/');
export const dossierNu = d => posix(path.normalize(d)).replace(/\/$/, '');
const sha = lignes => createHash('sha256').update(lignes.join('\n')).digest('hex');
const dedans = (f, dir) => f === dir || f.startsWith(`${dir}/`);
const HEX = /^[0-9a-f]{64}$/;
const UNE_HEURE = 3_600_000;

// <p> erased, the rights given back first to every folder under it.
function effacer(p) {
  const rendre = d => {
    try {
      if (lstatSync(d).isDirectory()) {
        chmodSync(d, 0o700);
        for (const e of readdirSync(d)) rendre(path.join(d, e));
      }
    } catch {
      // a path gone meanwhile
    }
  };
  rendre(p);
  rmSync(p, { recursive: true, force: true });
}

// True when <dir> is a folder whose every folder lists and every file reads (a link is not followed).
function arbreLisible(dir) {
  try {
    if (!lstatSync(dir).isDirectory()) return false;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!arbreLisible(p)) return false;
      } else if (e.isFile()) {
        accessSync(p, constants.R_OK);
      }
    }
    return true;
  } catch {
    return false;
  }
}

const COPIE = { recursive: true, verbatimSymlinks: true };

// Empties <dist>, then copies the entry <entree> into it. False when the entry cannot be read (or
// goes during the copy): the caller builds.
export function restaurerConstruction(entree, dist) {
  if (!arbreLisible(entree)) return false;
  try {
    rmSync(dist, { recursive: true, force: true });
    mkdirSync(path.dirname(dist), { recursive: true });
    cpSync(entree, dist, COPIE);
    return true;
  } catch {
    return false;
  }
}

// Stores <dist> as the entry <entree>: copied aside, then renamed. An entry already there that
// reads stays, unless <forcer>; any other is replaced (set aside, then erased).
export function rangerConstruction(entree, dist, forcer) {
  const tmp = `${entree}.${process.pid}.tmp`;
  try {
    mkdirSync(path.dirname(entree), { recursive: true });
    effacer(tmp);
    cpSync(dist, tmp, COPIE);
    if (!existsSync(entree)) {
      renameSync(tmp, entree);
    } else if (!forcer && arbreLisible(entree)) {
      effacer(tmp);
    } else {
      const ancien = `${entree}.${process.pid}.ancien`;
      effacer(ancien);
      renameSync(entree, ancien);
      renameSync(tmp, entree);
      effacer(ancien);
    }
  } catch (e) {
    try {
      effacer(tmp);
    } catch {
      // left for the purge
    }
    if (!arbreLisible(entree)) process.stderr.write(`⚠ construction non rangée : ${e.message}\n`);
  }
}

// The purge of the store at <commun> (the git common directory): see the head of this file.
// `vivantes` is the set of the fingerprints of the live contents; `debut` the start of the purge.
export function purgerMagasin(commun, vivantes, debut = Date.now()) {
  const limite = debut - UNE_HEURE;
  const dans = dossier => {
    try {
      return readdirSync(dossier).map(nom => [nom, path.join(dossier, nom)]);
    } catch {
      return [];
    }
  };
  const date = p => {
    try {
      return lstatSync(p).mtimeMs;
    } catch {
      return Infinity;
    }
  };
  const sous = (...x) => path.join(commun, 'grillhouse', ...x);
  for (const [nom, p] of dans(sous('constructions'))) {
    try {
      if (HEX.test(nom)) {
        if (vivantes.has(nom) || date(p) > debut) continue;
        const ecartee = `${p}.${process.pid}.suppr`;
        renameSync(p, ecartee);
        effacer(ecartee);
      } else if (date(p) < limite) {
        effacer(p);
      }
    } catch {
      // an entry another passage removes at the same time
    }
  }
  for (const [nom, p] of dans(sous('suites'))) {
    try {
      const trace = /^([0-9a-f]{64})\.json$/.exec(nom);
      if (trace) {
        if (!vivantes.has(trace[1]) && date(p) <= debut) rmSync(p, { force: true });
      } else if (nom.endsWith('.tmp') && date(p) < limite) {
        rmSync(p, { force: true });
      } else if (nom.endsWith('.json') && date(p) <= debut) {
        rmSync(p, { force: true });
      }
    } catch {
      // a trace another passage removes at the same time
    }
  }
}

// The files git lists under <dir>, tracked or not, not ignored, relative to it; a submodule or a
// nested repository enters by its files; so does a submodule shared as a link to the main
// repository's (`grillhouse.partage`), followed to its target. Null outside a git repository.
function listerFichiers(dir) {
  const r = spawnSync(
    'git',
    ['-C', dir, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8', maxBuffer: 1 << 28 }
  );
  if (r.status !== 0) return null;
  const out = [];
  for (const p of r.stdout.split('\0').filter(Boolean)) {
    let st;
    try {
      st = statSync(path.join(dir, p));
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      for (const s of listerFichiers(path.join(dir, p)) ?? []) out.push(`${p}/${s}`);
    } else {
      out.push(p);
    }
  }
  return out;
}

// Every file under <dir> but node_modules, dist and .git, where no git repository lists them.
function parcourir(dir, rel = '') {
  const out = [];
  for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(e.name)) continue;
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...parcourir(dir, p));
    else out.push(p);
  }
  return out;
}

const estTrace = t =>
  t !== null &&
  typeof t === 'object' &&
  Number.isInteger(t.code) &&
  Array.isArray(t.rouges) &&
  t.rouges.every(n => typeof n === 'string') &&
  typeof t.sortie === 'string';
// A module: a file the import graph reads. The other files of a component are its data.
const MODULE = /\.(?:[cm]?[jt]sx?|d\.[cm]?ts)$/;
const CONFIGURATION =
  /^(vitest|vite)(\.workspace)?\.config\.[cm]?[jt]s$|^vitest\.workspace\.[cm]?[jt]s$/;

export function ouvrirTraces(racine, { extra = [], fichiers = null } = {}) {
  const listeGit = fichiers ? null : listerFichiers(racine);
  const tousLesFichiers = (fichiers ?? listeGit ?? parcourir(racine)).sort();

  const empreinteDuFichier = new Map();
  const contenu = rel => {
    if (!empreinteDuFichier.has(rel)) {
      let h = 'absent';
      try {
        h = createHash('sha256')
          .update(readFileSync(path.join(racine, rel)))
          .digest('hex');
      } catch {
        // a file listed and gone, or unreadable, hashes as absent
      }
      empreinteDuFichier.set(rel, h);
    }
    return empreinteDuFichier.get(rel);
  };
  const empreinteDes = fichiers => sha([...fichiers].sort().map(f => `${f}\0${contenu(f)}`));

  // The components and the providers each depends on (the graph of the dependencies).
  const connus = lesComposants(racine);
  const relDe = new Map(connus.map(c => [c.nom, posix(path.relative(racine, c.dir))]));
  const dossiers = [...new Set([...relDe.values(), ...extra])];
  const proprietaire = f => dossiers.find(d => dedans(f, d)) ?? '';
  const fournisseursDe = new Map(dossiers.map(d => [d, new Set()]));
  for (const [consommateur, fournisseurs] of dependances(racine)) {
    for (const fournisseur of fournisseurs) {
      fournisseursDe.get(relDe.get(consommateur))?.add(relDe.get(fournisseur));
    }
  }
  const fermeture = dir => {
    const vus = new Set([dir]);
    const file = [dir];
    while (file.length) {
      for (const f of fournisseursDe.get(file.pop()) ?? []) {
        if (!vus.has(f)) {
          vus.add(f);
          file.push(f);
        }
      }
    }
    return [...vus].sort();
  };

  // The fingerprints.
  const declares = (() => {
    try {
      const l = JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8')).grillhouse
        ?.lusParLesSuites;
      return Array.isArray(l)
        ? l
            .filter(x => typeof x === 'string')
            .map(dossierNu)
            .sort()
        : [];
    } catch {
      return [];
    }
  })();
  const propre = new Map(
    dossiers.map(d => [d, empreinteDes(tousLesFichiers.filter(f => dedans(f, d)))])
  );
  const empreinteRacine = sha([
    contenu(VERROU),
    ...declares,
    empreinteDes(tousLesFichiers.filter(f => declares.some(d => dedans(f, d)))),
  ]);
  const fichiersDeTest = tousLesFichiers.filter(f => NOM_DE_TEST.test(path.basename(f)));
  // The hash of a component and of the components it depends on.
  const fermetureDe = dir => sha(fermeture(dir).map(d => `${d}:${propre.get(d) ?? ''}`));
  // The build of <dir>, a component's directory or '' for the root's single build.
  const empreinteConstruction = dir =>
    dir === ''
      ? sha(['construction', '', empreinteRacine, empreinteDes(tousLesFichiers)])
      : sha([
          'construction',
          dir,
          ...fermeture(dir).map(d => `${d}:${propre.get(d) ?? ''}`),
          empreinteRacine,
        ]);
  // The directories <dirs> in the order of the graph of the dependencies: a provider before its dependents.
  const ordreDeConstruction = dirs => {
    const voulus = new Set(dirs);
    const vus = new Set();
    const ordre = [];
    const visiter = d => {
      if (vus.has(d)) return;
      vus.add(d);
      for (const f of [...(fournisseursDe.get(d) ?? [])].sort()) visiter(f);
      if (voulus.has(d)) ordre.push(d);
    };
    [...dirs].sort().forEach(visiter);
    return ordre;
  };
  // The store.
  const commun = listeGit === null ? '' : dossierCommun(racine);
  const magasin = commun ? path.join(commun, 'grillhouse', 'suites') : null;
  const dossierConstructions = commun ? path.join(commun, 'grillhouse', 'constructions') : null;
  const lire = nom => {
    if (!magasin) return null;
    try {
      const t = JSON.parse(readFileSync(path.join(magasin, `${nom}.json`), 'utf8'));
      return estTrace(t) ? t : null;
    } catch {
      return null;
    }
  };
  const ecrire = (nom, valeur) => {
    if (!magasin) return;
    try {
      mkdirSync(magasin, { recursive: true });
      const tmp = path.join(magasin, `${nom}.${process.pid}.tmp`);
      writeFileSync(tmp, `${JSON.stringify({ ...valeur, quand: new Date().toISOString() })}\n`);
      renameSync(tmp, path.join(magasin, `${nom}.json`));
    } catch (e) {
      process.stderr.write(`⚠ trace non écrite : ${e.message}\n`);
    }
  };

  // The graph of the imports of <entrees> (files relative to the root), by dependency-cruiser: the
  // map from a file to the files and the packages it imports. Core modules and what lies in
  // node_modules are left out; an import of a package that is a component of the project keeps the
  // component's name, whatever `node_modules` links. An import that does not resolve stays by its
  // specifier when it is a path.
  async function graphe(entrees) {
    const { cruise } = await import('dependency-cruiser');
    const options = {
      baseDir: racine,
      exclude: { path: 'node_modules' },
      doNotFollow: { path: 'node_modules' },
    };
    const tsconfig = path.join(racine, 'tsconfig.json');
    let sortie;
    try {
      sortie = await cruise(
        entrees,
        existsSync(tsconfig) ? { ...options, tsConfig: tsconfig } : options
      );
    } catch {
      sortie = await cruise(entrees, options);
    }
    const noms = connus.map(c => c.nom);
    const duComposant = module => noms.find(n => module === n || module.startsWith(`${n}/`));
    const modules = new Map();
    for (const m of sortie.output.modules) {
      const fichiersImportes = [];
      const paquets = [];
      for (const d of m.dependencies ?? []) {
        const nom = duComposant(d.module);
        if (nom !== undefined) paquets.push(nom);
        else if (d.coreModule) continue;
        else if (d.couldNotResolve) {
          if (/^[./]/.test(d.module))
            fichiersImportes.push(
              `manque:${path.posix.join(path.posix.dirname(m.source), d.module)}`
            );
        } else if (!/(^|\/)node_modules\//.test(d.resolved)) fichiersImportes.push(d.resolved);
      }
      modules.set(m.source, { fichiersImportes, paquets });
    }
    return modules;
  }

  // The fingerprint of each test file of <fichiersAnalyses> and the components its imports reach:
  // Map from the file to { empreinte, dirs } (`dirs`: the directories of the components holding a
  // file of its closure, or named by an import). See the head of this file.
  async function analyserTests(fichiersAnalyses) {
    if (fichiersAnalyses.length === 0) return new Map();
    const configs = tousLesFichiers.filter(f => !f.includes('/') && CONFIGURATION.test(f));
    const modules = await graphe([...fichiersAnalyses, ...configs]);
    const fermer = entree => {
      const fichiersVus = new Set();
      const paquets = new Set();
      const file = [entree];
      while (file.length) {
        const f = file.pop();
        if (fichiersVus.has(f)) continue;
        fichiersVus.add(f);
        const m = modules.get(f);
        for (const p of m?.paquets ?? []) paquets.add(p);
        for (const i of m?.fichiersImportes ?? []) file.push(i);
      }
      return { fichiersVus, paquets };
    };
    const listes = new Set(tousLesFichiers);
    const dirDuPaquet = nom => relDe.get(nom);
    const contenuDe = f =>
      f.startsWith('manque:') ? f : `${f}\0${listes.has(f) ? contenu(f) : 'non listé'}`;
    const configuration = sha(
      configs.flatMap(c => [...fermer(c).fichiersVus].sort().map(contenuDe))
    );
    const resultat = new Map();
    for (const f of fichiersAnalyses) {
      const { fichiersVus, paquets } = fermer(f);
      const dirs = new Set();
      const composantsAtteints = new Set([...paquets].map(dirDuPaquet).filter(Boolean));
      for (const v of fichiersVus) {
        const d = proprietaire(v);
        if (d !== '') dirs.add(d);
        // A file git does not list (a build) stands for the sources of its component.
        if (!listes.has(v) && !v.startsWith('manque:') && d !== '') composantsAtteints.add(d);
      }
      for (const d of composantsAtteints) dirs.add(d);
      // The data of its component (every listed file that is not a module) count too.
      const proprio = proprietaire(f);
      const donnees =
        proprio === ''
          ? []
          : tousLesFichiers
              .filter(x => dedans(x, proprio) && !MODULE.test(x) && !fichiersVus.has(x))
              .map(contenuDe);
      const empreinte = sha([
        'test',
        f,
        ...[...fichiersVus].sort().map(contenuDe),
        'donnees',
        ...donnees,
        ...[...composantsAtteints].sort().map(d => `${d}:${fermetureDe(d)}`),
        empreinteRacine,
        configuration,
      ]);
      resultat.set(f, { empreinte, dirs });
    }
    return resultat;
  }

  // Every fingerprint of this content, of a test file or of a build: the names the purge keeps.
  const empreintesVivantes = async () =>
    new Set([
      ...[...(await analyserTests(fichiersDeTest)).values()].map(a => a.empreinte),
      empreinteConstruction(''),
      ...dossiers.map(empreinteConstruction),
    ]);

  return {
    dossiers,
    commun,
    dossierConstructions,
    empreinteConstruction,
    ordreDeConstruction,
    empreintesVivantes,
    proprietaire,
    fichiersDeTest,
    analyserTests,
    lire,
    ecrire,
  };
}
