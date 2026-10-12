#!/usr/bin/env node
// The one entry point that builds: the replay of a lot (scripts/integration/rejeu.mjs, so the
// integration and the queue), the night (scripts/nuit.sh, under FORCER=1) and the launcher of the
// envelope (scripts/enveloppe/lancer.sh) call it, and so does the
// `build` script of the root of a project with packages. An unchanged build is not done again: the
// `dist/` of each component is kept under the fingerprint of the content of its inputs and restored
// (scripts/integration/traces.mjs holds the fingerprint, the store and the purge).
//
//   node scripts/integration/constructions.mjs        run from the root of the project
//
// A passage, in order:
//  1. it refuses (one line, exit 1) a call made by a build it started: the root's build of a project
//     without a component that builds must not call it again;
//  2. it purges the store (see traces.mjs; the purge starts when the passage does, before the live
//     contents are computed, so an entry written meanwhile stays): the live contents are the copies git knows for the
//     repository (a copy whose folder is gone holds nothing), main, main's previous commit, and the
//     branches of the queue (scripts/integration/file-attente.mjs), read in git, their submodules
//     included; a commit that cannot be read keeps nothing;
//  3. a component has a build when its package.json has a `build` script, its output is its `dist/`.
//     When at least one has, each is built in the order of the consumptions (`utilise` of
//     scripts/consommateurs.mjs, devDependencies out) and the root's build never runs. When none has,
//     the root's `build` script is the single build, its output the `dist/` of the root; none, no build;
//  4. for each build: its `dist/` is restored when its fingerprint is in the store, else emptied, built,
//     and stored. A build that leaves no `dist/` stores nothing and says so in one line. A red build
//     stops the passage (exit 1): none is built after it.
// FORCER=1 reads no entry and writes again what it builds. Outside a git repository there is no store:
// every passage builds.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composants as lesComposants } from '../consommateurs.mjs';
import { lireEntrees } from './file-attente.mjs';
import { lireJsonSiPresent } from './rejeu.mjs';
import {
  ouvrirTraces,
  posix,
  purgerMagasin,
  rangerConstruction,
  restaurerConstruction,
} from './traces.mjs';

const MARQUE = 'GRILLHOUSE_CONSTRUCTION_EN_COURS';
const git = (opts, ...args) =>
  spawnSync('git', [...opts, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });

// The repository holding a submodule of a commit: its git options, its working folder (or null) and
// its git directory.
const depotDe = (dossier, gitdir) => ({ opts: ['-C', dossier], travail: dossier, gitdir });

// The submodule `chemin` at the commit `oid` of the repository <depot>: where its repository lies
// (its working folder, else the repository's `modules/<name>`) and holds `oid`, else null.
function sousDepot(depot, nom, chemin, oid) {
  const candidats = [];
  if (depot.travail && existsSync(path.join(depot.travail, chemin, '.git'))) {
    const sous = path.join(depot.travail, chemin);
    const gd = git(['-C', sous], 'rev-parse', '--absolute-git-dir').stdout.trim();
    candidats.push({ opts: ['-C', sous], travail: sous, gitdir: gd });
  }
  if (nom) {
    const gd = path.join(depot.gitdir, 'modules', nom);
    if (existsSync(gd)) candidats.push({ opts: ['--git-dir', gd], travail: null, gitdir: gd });
  }
  return candidats.find(c => git(c.opts, 'cat-file', '-e', `${oid}^{commit}`).status === 0) ?? null;
}

// The commit <commit> of <depot> extracted into <dest>, its submodules (at the commits it names,
// read in the repositories of the main repository) in their folders. False when one cannot be found.
function extraire(depot, commit, dest) {
  const archive = spawnSync(
    'bash',
    [
      '-c',
      'set -o pipefail; git "$1" "$2" archive --format=tar "$3" | tar -x -C "$4"',
      '_',
      ...depot.opts,
      commit,
      dest,
    ],
    { encoding: 'utf8' }
  );
  if (archive.status !== 0) return false;
  const arbre = git(depot.opts, 'ls-tree', '-r', '-z', commit).stdout;
  const liens = arbre
    .split('\0')
    .map(l => /^160000 commit ([0-9a-f]+)\t(.*)$/.exec(l))
    .filter(Boolean);
  if (liens.length === 0) return true;
  const noms = new Map();
  const declares = git(
    depot.opts,
    'config',
    '--blob',
    `${commit}:.gitmodules`,
    '--get-regexp',
    String.raw`^submodule\..*\.path$`
  );
  for (const l of declares.stdout.split('\n')) {
    const m = /^submodule\.(.*)\.path (.*)$/.exec(l);
    if (m) noms.set(m[2], m[1]);
  }
  for (const [, oid, chemin] of liens) {
    const sous = sousDepot(depot, noms.get(chemin), chemin, oid);
    if (!sous) return false;
    const cible = path.join(dest, chemin);
    mkdirSync(cible, { recursive: true });
    if (!extraire(sous, oid, cible)) return false;
  }
  return true;
}

// Every file under <dossier>, relative to it; a link that points nowhere is not one.
function fichiersDe(dossier, rel = '') {
  const out = [];
  for (const e of readdirSync(path.join(dossier, rel), { withFileTypes: true })) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push(...fichiersDe(dossier, p));
    } else {
      try {
        if (!statSync(path.join(dossier, p)).isDirectory()) out.push(p);
      } catch {
        // a link to nothing
      }
    }
  }
  return out;
}

// The fingerprints of every live content, given the project's traces <actuelles> (the copy of this
// passage, not read twice).
function empreintesVivantes(racine, actuelles) {
  const vivantes = new Set();
  const ajouter = traces => {
    for (const e of traces.empreintesVivantes()) vivantes.add(e);
  };
  const ici = path.resolve(racine);
  const liste = git(['-C', racine], 'worktree', 'list', '--porcelain').stdout;
  for (const bloc of liste.split('\n\n')) {
    const lignes = bloc.split('\n');
    const dir = lignes.find(l => l.startsWith('worktree '))?.slice('worktree '.length);
    if (!dir || lignes.some(l => l.startsWith('prunable')) || !existsSync(dir)) continue;
    try {
      ajouter(path.resolve(dir) === ici ? actuelles : ouvrirTraces(dir));
    } catch {
      // a copy that does not read keeps nothing
    }
  }
  const refs = ['main', 'main^'];
  for (const entree of lireEntrees(racine)) refs.push(`refs/heads/${entree.branche}`);
  const commits = new Set();
  for (const ref of refs) {
    const r = git(['-C', racine], 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
    if (r.status === 0) commits.add(r.stdout.trim());
  }
  const commun = actuelles.commun;
  const depot = depotDe(racine, commun);
  for (const commit of commits) {
    const dest = mkdtempSync(path.join(tmpdir(), 'constructions-'));
    try {
      if (extraire(depot, commit, dest))
        ajouter(ouvrirTraces(dest, { fichiers: fichiersDe(dest) }));
    } catch {
      // a commit that does not read keeps nothing
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  }
  return vivantes;
}

const aUneConstruction = dir => {
  const build = lireJsonSiPresent(path.join(dir, 'package.json'))?.scripts?.build;
  return typeof build === 'string' && build.trim() !== '';
};

// Builds <dir> (a component's directory relative to <racine>, '' for the root): its `dist/` emptied,
// `npm run build` in <dir>, whose output is shown. True when green.
function construire(racine, dir) {
  const cwd = path.join(racine, dir);
  const r = spawnSync('npm', ['run', '--silent', 'build'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    env: { ...process.env, [MARQUE]: '1' },
  });
  process.stdout.write(r.stdout ?? '');
  process.stderr.write(r.stderr ?? '');
  if (r.status !== 0 && !(r.stdout || r.stderr)) {
    process.stderr.write(
      `✗ la construction de ${dir || 'la racine'} sort en ${r.status ?? 'erreur'}.\n`
    );
  }
  return r.status === 0;
}

// One passage over the project at <racine>; the exit code.
function passer(racine, forcer) {
  if (process.env[MARQUE]) {
    process.stderr.write('⛔ un build lancé par ce point d’entrée le rappelle : refusé.\n');
    return 1;
  }
  const debut = Date.now();
  const traces = ouvrirTraces(racine, { forcer });
  const magasin = traces.dossierConstructions;
  if (magasin) {
    try {
      purgerMagasin(traces.commun, empreintesVivantes(racine, traces), debut);
    } catch (e) {
      process.stderr.write(`⚠ purge du magasin non faite : ${e.message}\n`);
    }
  }
  const avecBuild = lesComposants(racine)
    .map(c => posix(path.relative(racine, c.dir)))
    .filter(d => aUneConstruction(path.join(racine, d)));
  const cibles = avecBuild.length > 0 ? traces.ordreDeConstruction(avecBuild) : [''];
  if (avecBuild.length === 0 && !aUneConstruction(racine)) return 0;
  for (const dir of cibles) {
    const nom = dir || '(racine)';
    const dist = path.join(racine, dir, 'dist');
    const entree = magasin ? path.join(magasin, traces.empreinteConstruction(dir)) : null;
    if (entree && !forcer && restaurerConstruction(entree, dist)) {
      process.stdout.write(`✓ ${nom} restaurée\n`);
      continue;
    }
    rmSync(dist, { recursive: true, force: true });
    if (!construire(racine, dir)) return 1;
    const vide = !existsSync(dist) || readdirSync(dist).length === 0;
    if (vide) {
      process.stdout.write(`✓ ${nom} construite, sans dist/ : rien n’est rangé\n`);
    } else {
      if (entree) rangerConstruction(entree, dist, forcer);
      process.stdout.write(`✓ ${nom} construite\n`);
    }
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(passer(process.cwd(), process.env.FORCER === '1'));
}
