// The store of the suites and of the builds: the verdict of each suite and the `dist/` of each build
// kept under the fingerprint of the content of what produces it. The suites command
// (scripts/integration/suites-vitest.mjs) and the replay (scripts/integration/rejeu.mjs) read the
// traces; the one entry point that builds (scripts/integration/constructions.mjs) stores, restores
// and purges the builds, and purges the traces with them.
//
// `ouvrirTraces(racine, options)` reads the project at <racine> and returns:
// - the components (`dossiers`: the directories under `packages/` and `src/`, plus the directories
//   given in `extra`), `proprietaire(fichier)` (a component's directory, '' outside every one) and
//   `fichiersDeTest` (the root suite: the files outside every component that are test files or lie
//   in a test folder, helpers and test material included);
// - `statutComposant(dir)` and `statutRacine()`: what a suite owes (see below);
// - `aJouer(dirs)`: true when a suite of the call would play;
// - `lire` and `ecrire`: the store of the traces, `<git common dir>/grillhouse/suites/`, shared by
//   every copy; a trace is written whole (a temporary file of its own, then a rename). Outside a git
//   repository there is no store and every suite plays;
// - `empreinteConstruction(dir)`, `ordreDeConstruction(dirs)`, `dossierConstructions` and
//   `empreintesVivantes()`: the builds (see below).
// With the option `fichiers` (the list of the files of the content, relative to <racine>) the
// content is that list, read on the disk at <racine>, and there is no store: the content of a
// commit extracted aside.
//
// A fingerprint hashes the content of the files git lists (tracked or not, not ignored), each by its
// path and content, never by date; a submodule enters by its files. Component: its files and those
// of the components it consumes, transitively (`utilise` of scripts/consommateurs.mjs; a cycle
// ends), the lock file `package-lock.json` and the root paths the project declares read
// (`grillhouse.lusParLesSuites` of package.json, files or folders). Root suite: the lock file, the
// declared paths, its test files and the files of every component.
// - A component's trace is `{ code, rouges }` (exit code, failing tests by name). A component stale
//   only by what it consumes, whose own files are those of its last full suite, green and
//   measured, owes the quick set: that suite without the test files measured at SEUIL seconds or
//   more (a file never measured is never left out), under a trace of its own. Any other owes its
//   full suite.
// - The root suite stale only by components owes the tests that import them; stale otherwise, it
//   owes all its tests.
// - A trace that does not read as `{ code, rouges }` is none. FORCER=1 reads no trace.
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
// start. It removes any other trace `t-…`, `r-…` and any other build, an entry in one move (set
// aside, then erased), no size cap. The last-suite records (`d-…`, `racine-dernier`), which bear no
// content fingerprint, stay. Temporary files and folders of the two stores left for more than an
// hour by an interrupted process go too.
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
import { composants as lesComposants, utilise } from '../consommateurs.mjs';
import { isTestFile } from '../verrous/verrou.mjs';
import { dossierCommun } from './file-attente.mjs';

const SEUIL = 10;
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
      const trace = /^[tr]-([0-9a-f]{64})\.json$/.exec(nom);
      if (trace) {
        if (!vivantes.has(trace[1]) && date(p) <= debut) rmSync(p, { force: true });
      } else if (nom.endsWith('.tmp') && date(p) < limite) {
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
  t.rouges.every(n => typeof n === 'string');
const estDernier = t =>
  t !== null && typeof t === 'object' && typeof t.propre === 'string' && Number.isInteger(t.code);
const estDerniereRacine = t =>
  estTrace(t) &&
  typeof t.racine === 'string' &&
  typeof t.tests === 'string' &&
  t.composants !== null &&
  typeof t.composants === 'object';
const dureesDe = d =>
  d && typeof d.durees === 'object' && d.durees !== null && !Array.isArray(d.durees)
    ? d.durees
    : {};
const lents = d =>
  Object.entries(dureesDe(d))
    .filter(([, s]) => typeof s === 'number' && s >= SEUIL)
    .map(([f]) => f)
    .sort();

export function ouvrirTraces(racine, { forcer = false, extra = [], fichiers = null } = {}) {
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

  // The components and what each consumes.
  const connus = lesComposants(racine);
  const relDe = new Map(connus.map(c => [c.nom, posix(path.relative(racine, c.dir))]));
  const dossiers = [...new Set([...relDe.values(), ...extra])];
  const proprietaire = f => dossiers.find(d => dedans(f, d)) ?? '';
  const fournisseursDe = new Map(dossiers.map(d => [d, new Set()]));
  for (const [fournisseur, parConsommateur] of utilise(racine, connus)) {
    for (const consommateur of parConsommateur.keys()) {
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
  const fichiersDeTest = tousLesFichiers.filter(f => proprietaire(f) === '' && isTestFile(f));
  const empreinteDesTests = empreinteDes(fichiersDeTest);
  const empreinteComposant = dir =>
    sha([
      'complet',
      dir,
      ...fermeture(dir).map(d => `${d}:${propre.get(d) ?? ''}`),
      empreinteRacine,
    ]);
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
  // The directories <dirs> in the order of the consumptions: a provider before its consumers.
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
  const empreinteDeLaRacine = () =>
    sha([
      'racine',
      empreinteRacine,
      empreinteDesTests,
      ...dossiers.map(d => `${d}:${propre.get(d)}`),
    ]);

  // The store.
  const commun = listeGit === null ? '' : dossierCommun(racine);
  const magasin = commun ? path.join(commun, 'grillhouse', 'suites') : null;
  const dossierConstructions = commun ? path.join(commun, 'grillhouse', 'constructions') : null;
  const lire = (nom, valide = estTrace) => {
    if (!magasin) return null;
    try {
      const t = JSON.parse(readFileSync(path.join(magasin, `${nom}.json`), 'utf8'));
      return valide(t) ? t : null;
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

  // What the suite of the component <dir> owes: { gardee, jeu, ecartes, empreinte, nomDernier }.
  // `gardee` is the trace to reuse, or null when the suite plays; `jeu` is 'rapide' when it plays
  // without `ecartes`, the test files left out.
  function statutComposant(dir) {
    const empreinte = empreinteComposant(dir);
    const nomDernier = `d-${sha([dir])}`;
    const vide = { gardee: null, jeu: 'complet', ecartes: [], empreinte, nomDernier };
    if (!magasin || forcer) return vide;
    const complete = lire(`t-${empreinte}`);
    if (complete) return { ...vide, gardee: complete };
    const dernier = lire(nomDernier, estDernier);
    const ecartes = dernier ? lents(dernier) : [];
    const rapide =
      dernier !== null &&
      dernier.code === 0 &&
      dernier.propre === propre.get(dir) &&
      dernier.racine === empreinteRacine &&
      ecartes.length > 0;
    if (!rapide) return vide;
    return { ...vide, jeu: 'rapide', ecartes, gardee: lire(`r-${empreinte}`) };
  }

  // What the root suite owes: { gardee, partielle, changes, dernier, empreinte }. `partielle` is
  // true when it is stale by components alone, `changes` those components.
  function statutRacine() {
    const empreinte = empreinteDeLaRacine();
    const vide = { gardee: null, partielle: false, changes: [], dernier: null, empreinte };
    if (!magasin || forcer) return vide;
    const gardee = lire(`t-${empreinte}`);
    if (gardee) return { ...vide, gardee };
    const dernier = lire('racine-dernier', estDerniereRacine);
    if (!dernier) return vide;
    const changes = dossiers.filter(d => dernier.composants[d] !== propre.get(d));
    const partielle =
      dernier.racine === empreinteRacine &&
      dernier.tests === empreinteDesTests &&
      Object.keys(dernier.composants).every(d => propre.has(d)) &&
      changes.length > 0;
    return { ...vide, partielle, changes: partielle ? changes : [], dernier };
  }

  // True when a suite of the call would play: one of the components <dirs>, or the root suite
  // when <avecRacine>.
  const aJouer = (dirs, avecRacine = true) =>
    dirs.some(d => statutComposant(d).gardee === null) ||
    (avecRacine && fichiersDeTest.length > 0 && statutRacine().gardee === null);

  // Every fingerprint of this content, of a suite or of a build: the names the purge keeps.
  const empreintesVivantes = () =>
    new Set([
      empreinteDeLaRacine(),
      empreinteConstruction(''),
      ...dossiers.flatMap(d => [empreinteComposant(d), empreinteConstruction(d)]),
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
    propre,
    empreinteRacine,
    empreinteDesTests,
    statutComposant,
    statutRacine,
    aJouer,
    lire,
    ecrire,
  };
}
