// The traces of the suites: the verdict of each suite kept under the fingerprint of the content of
// what produces it, read by the suites command (scripts/integration/suites-vitest.mjs) and by the
// replay (scripts/integration/rejeu.mjs), which builds the project once after the lots as soon as a suite or a guard reads the build, and
// builds main only when one of its suites plays.
//
// `ouvrirTraces(racine, options)` reads the project at <racine> and returns:
// - the components (`dossiers`: the directories under `packages/` and `src/`, plus the directories
//   given in `extra`), `proprietaire(fichier)` (a component's directory, '' outside every one) and
//   `fichiersDeTest` (the root suite: the files outside every component that are test files or lie
//   in a test folder, helpers and test material included);
// - `statutComposant(dir)` and `statutRacine()`: what a suite owes (see below);
// - `aJouer(dirs)`: true when a suite of the call would play;
// - `lire` and `ecrire`: the store, `<git common dir>/grillhouse/suites/`, shared by every copy; a
//   trace is written whole (a temporary file of its own, then a rename). Outside a git
//   repository there is no store and every suite plays.
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
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
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

export function ouvrirTraces(racine, { forcer = false, extra = [] } = {}) {
  const listeGit = listerFichiers(racine);
  const tousLesFichiers = (listeGit ?? parcourir(racine)).sort();

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
  const empreinteDeLaRacine = () =>
    sha([
      'racine',
      empreinteRacine,
      empreinteDesTests,
      ...dossiers.map(d => `${d}:${propre.get(d)}`),
    ]);

  // The store.
  const magasin = (() => {
    if (listeGit === null) return null;
    const commun = dossierCommun(racine);
    return commun ? path.join(commun, 'grillhouse', 'suites') : null;
  })();
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

  return {
    dossiers,
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
