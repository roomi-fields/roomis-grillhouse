#!/usr/bin/env node
// The envelope of a role agent: runs a command (the agent's `claude` session) inside a bwrap
// sandbox that shows the agent its own component, and of every other component only what it
// publishes. `npx grillhouse enveloppe <copie> <composant> <rôle> -- <commande…>`
//
// - The root `/` is read-only. Only these are written: the agent's copy (for a component that is a
//   package, that package alone, below); a `/tmp` empty and
//   proper to the session, where only the scratchpad directory of the copy comes back, the
//   session's working directory inside it (`dossierDeTravail`; Claude Code's scratchpads root,
//   `CLAUDE_CODE_TMPDIR` else the launch's temporary directory, so that under a pass it lies in
//   the base of the pass and goes with it); the npm
//   cache; the Claude session state (`~/.claude` and the copy's project directory), whose
//   configuration, skills, plugins and other projects stay read-only. `~/.claude.json` is a
//   throwaway copy: the session writes it, the real file does not change. The tickets base (the
//   main tree's `.beads/`) is written: the agent claims, plans, hands over and files what it
//   finds. Every `.git`, the
//   copy's included, stays read-only: the agent reads the git state and delivers a patch
//   (`git diff`, and `git diff --no-index /dev/null <file>` for a new file); it never commits.
//   The cache of Turborepo (`<main tree>/.turbo/cache`, shared by every copy) is written: the
//   agent's runs of `npm test` keep their tasks there, as every copy's runs do.
// - The home and the session directories (`$XDG_RUNTIME_DIR`, `/run/user/<uid>`) show only what
//   the envelope declares: each starts empty and sealed read-only, and the home gets back
//   `~/.claude`, `~/.claude.json`, the npm cache, the paths of `MAISON_EN_LECTURE` (claude, node,
//   git and the session's tools) and the repository. No socket of the session comes back. Of
//   the machine's credentials, only claude's own are in sight.
// - The session gets only the environment the envelope declares (`environnementDeLaSeance`), as
//   sudo's env_reset and bwrap's --clearenv give it: the base of a login session, claude's own
//   configuration and credentials (`ANTHROPIC_*`, `CLAUDE_CODE_OAUTH_TOKEN`), the author of its
//   comments at the ticket (`BEADS_ACTOR`, which bd reads), the npm cache it
//   mounts, `npm_config_ignore_scripts=true`, and `TMPDIR`, the session's working directory, where
//   `mktemp` and `os.tmpdir()` write. With it npm runs no lifecycle script (`npm install` leaves the
//   `prepare` that writes under the read-only `.git`; the launcher installs outside the session),
//   while `npm test` and `npm run <script>` still run their script, without its `pre` or `post`
//   (npm's `ignore-scripts`, docs/content/using-npm/config.md); no script of the frame has one. bwrap
//   starts with that environment alone, so no other variable of the machine (`GH_TOKEN`,
//   `NPM_TOKEN`…) enters, by name or by argument. The session also gets `GRILLHOUSE_ENVELOPPE`, the
//   component's path (`composant.mjs`): the frame's commands build and write that component only. A declared variable that names a path
//   (`VARIABLES_DE_CHEMIN`) enters only when its path is in sight inside the envelope, tested there
//   before the command runs. The session has its own process space: it reads the environment of
//   no process of the machine.
// - No index of the repository is in sight: neither codegraph nor rtfm comes back in the home,
//   and every index directory (`INDEX`) of every worktree, the copy's included, is an empty
//   directory sealed read-only; the worktree around it keeps its mount, the copy in writing.
// - A declared path that is a symbolic link comes back as that link, and its target with it
//   (`avecLiens`).
// - A worktree of the repository under an emptied directory (the home, `/tmp`) comes back
//   read-only, `.git` included; the copy and the tickets base are then written as above.
// - An envelope on the main tree is refused, and so is a component that does not exist; when it is
//   the name of a package of the copy, the refusal gives its path.
// - <copie> is the agent's git worktree; <composant> is the component's path inside it
//   (`packages/a`, or `src/parser` in a one-package project); <rôle> is the agent's role
//   (`testwriter`, `developpeur`…).
// - In every worktree of the repository, the component's parent directory (`packages/`, `src/`)
//   is emptied. In <copie>, the component is mounted back in writing; every sibling component
//   gets back, read-only, its published parts: `package.json`, `docs/INTERFACE.md`, `dist/`, its
//   package configuration of Turborepo (`turbo.json`, `turbo.jsonc`), by which Turborepo reads in
//   the envelope the task graph it reads outside, the paths that the `files` field of its
//   `package.json` names, and the directory each trace it declares writes (`grillhouse.traces`,
//   which the launcher produces before the session), when they exist inside it.
//   The parent's own files (`src/index.ts`) come back read-only, and the emptied directories are
//   then sealed read-only.
// - What the component's tests declare they read comes back read-only, as Bazel gives a test the
//   `data` it declares: each path of `grillhouse.lit` of its `package.json`, and of the `lit` of
//   each trace it declares (`cheminsLus`, each path from the root of <copie>), that lies in a
//   sibling component and exists, a directory or a file. A path the envelope already shows (the
//   root, the component itself, the shared test material, whose mount the role decides) adds no
//   mount.
// - For a component that is a package of the copy (`paquets` of `scripts/paquets.mjs`), the agent
//   writes that package and nothing else of the copy, as a sandbox of Bazel or of Nix opens in
//   writing only what the action declares: the copy is read-only, the folders of its root that no
//   package holds (`libraries/`, `spec/`) included, and a write there fails on « Read-only file
//   system », which the agent sees. Such a folder is written by the component that owns it, never
//   by a right the envelope adds: what the tests declare they read stays read-only. The package
//   of the shared test material, for the `testwriter`, the session's files and the mounts outside
//   the copy keep their rights; where a run of Turborepo writes at the root of the copy
//   (`sortiesDeLaRacine`, its `.turbo`) is an empty directory proper to the session, created on
//   disk before it.
// - A component that is no package (a folder of the root, `scripts`; `src/parser` in a one-package
//   project) writes the package that holds it, the root: the copy stays written. A folder of the
//   root hides nothing: its scripts work on the whole repository. The rest holds: the root
//   read-only, the copy written, its `.git` read-only.
// - The package of the shared test material is every component of <copie> whose `package.json`
//   exports `./test-fixtures` (`matieres` of `scripts/consommateurs.mjs`). It comes back whole, after the agent's own component:
//   written for the `testwriter`, read-only for every other role, its own component included. For
//   such a role, where a run of its tests writes in it (`sortiesDeTest`: Turborepo's task logs,
//   Vite's cache) is an empty directory proper to the session, as Bazel writes a test's logs out
//   of its source: what is written there leaves no trace. The envelope creates each of them on
//   disk, empty, before the session, so that bwrap mounts over it inside the read-only package.
// - The traversal guard refuses to launch when a symbolic link inside the component, or inside a
//   package of the shared test material, points into a hidden directory: such a link would cross
//   the envelope.
// - The exit codes are named in `codes.mjs`.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { matieres as lesMatieres } from '../consommateurs.mjs';
import { paquets as lesPaquets } from '../paquets.mjs';
import { CODE_REFUS, CODE_USAGE } from './codes.mjs';
import { VARIABLE } from './composant.mjs';
import { ouvrirBase } from '../vitest-config/base-de-passe.mjs';

const PUBLISHED = ['package.json', 'docs/INTERFACE.md', 'dist', 'turbo.json', 'turbo.jsonc'];
// The role that writes the package of the shared test material.
const ROLE_MATIERE = 'testwriter';
// What a run of a package's tests writes in that package, relative to it: the logs of its tasks,
// which Turborepo writes on every run, a task replayed from its cache included
// (`.turbo/turbo-<task>.log`), and no option of Turborepo sends elsewhere; the cache of Vite, where
// Vitest writes the results of the run (`node_modules/.vite/vitest/`), and whose failure fails it.
const SORTIES_DE_TEST = ['.turbo', 'node_modules/.vite'];
// The directories of <dir> where a run of its tests writes.
const sortiesDeTest = dir => SORTIES_DE_TEST.map(s => path.join(dir, s));
// What a run of Turborepo writes at the root of the repository, relative to it: its run summaries
// and the state of its daemon (`.turbo`), its cache living in the main tree (`magasins`).
const SORTIES_DE_LA_RACINE = ['.turbo'];
// The directories of the copy <copie> where a run of Turborepo writes.
const sortiesDeLaRacine = copie => SORTIES_DE_LA_RACINE.map(s => path.join(copie, s));
// True when <composant> of <copie> is a package of the copy (`paquets`, the directory of each
// relative to it): its envelope then writes that package alone.
const estUnPaquet = (copie, composant, paquets) =>
  paquets.some(p => path.resolve(copie, p.dossier) === path.resolve(copie, composant));
// The directories where codegraph and rtfm keep the index of a tree they index: the source of
// every component, which the envelope hides.
const INDEX = ['.codegraph', '.rtfm'];
// The machine's temporary directory: an empty one, proper to the session, replaces it.
const TEMPORAIRE = '/tmp';
// What stays read-only inside `~/.claude`: the configuration and what it loads.
const CLAUDE_EN_LECTURE = [
  'settings.json',
  'settings.local.json',
  'CLAUDE.md',
  'keybindings.json',
  'agents',
  'commands',
  'hooks',
  'plugins',
  'skills',
  'projects',
];
// What the home shows read-only besides `~/.claude`, as paths relative to it: claude's launcher
// and versions, node and its global tools (bd), the state of bd and of its dolt database, and the
// git configuration. The home shows nothing else: neither codegraph nor rtfm, whose index is for
// the roles that see the whole repository.
const MAISON_EN_LECTURE = [
  '.local/bin/claude',
  '.local/share/claude',
  '.nvm',
  '.config/bd',
  '.beads',
  '.dolt',
  '.gitconfig',
  '.config/git/config',
  '.config/git/ignore',
  '.config/git/attributes',
];

// The variables of a login session that the envelope passes on, as sudo's env_reset keeps them,
// claude's OAuth credential, the author of the session's comments at the ticket (`BEADS_ACTOR`,
// which the circuit sets to the session's role), and the prefixes of the families it passes on:
// the locale, and the configuration and credentials of claude's API. The state of a launching claude session
// (`CLAUDE_CODE_SESSION_ID`, its messaging socket and token…) stays out.
const ENVIRONNEMENT_DECLARE = [
  'HOME',
  'PATH',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LANGUAGE',
  'TZ',
  'TERM',
  'COLORTERM',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'BEADS_ACTOR',
];
const FAMILLES_DECLAREES = ['LC_', 'ANTHROPIC_'];
// The declared variables that name a path: each enters only when its path is in sight inside the
// envelope, so a tool never reads a path the envelope hides.
const VARIABLES_DE_CHEMIN = [
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NVM_DIR',
  'XDG_RUNTIME_DIR',
];
// Run inside the envelope before the command: unsets each named variable whose path does not
// exist there, then runs the command. `sh -c EPREUVE sh <variables…> -- <commande…>`.
const EPREUVE =
  'while [ "$1" != -- ]; do eval "p=\\${$1-}"; ' +
  'if [ -n "$p" ] && [ ! -e "$p" ]; then unset "$1"; fi; shift; done; shift; exec "$@"';

// The directory of the scratchpads of <copie> under the environment <env> of the launch: Claude
// Code keeps them under `<temporary>/claude-<uid>/<working directory in dashes>/`, every sign
// outside [A-Za-z0-9] a dash, <temporary> its `CLAUDE_CODE_TMPDIR`, else the system's temporary
// directory as `os.tmpdir()` reads it (TMPDIR, TMP, TEMP, else /tmp): under a pass, the base of
// the pass (scripts/vitest-config/base-de-passe.mjs), removed with it.
function scratchpadsDe(copie, env = process.env) {
  const enTirets = path.resolve(copie).replace(/[^A-Za-z0-9]/g, '-');
  const temporaire = env.CLAUDE_CODE_TMPDIR || env.TMPDIR || env.TMP || env.TEMP || TEMPORAIRE;
  return path.join(path.resolve(temporaire), `claude-${process.getuid()}`, enTirets);
}

// The working directory of a session in <copie> under the environment <env> of the launch:
// `travail` in the copy's scratchpads, which the envelope mounts in writing. The envelope creates
// it and names it in `TMPDIR`; the launcher names it in the instruction.
export function dossierDeTravail(copie, env = process.env) {
  return path.join(scratchpadsDe(copie, env), 'travail');
}

// The environment of the session, from the environment <env> of the launch: the declared
// variables and families that <env> holds, `npm_config_cache` set to the npm cache that the
// envelope mounts in writing, `npm_config_ignore_scripts` set to `true` (npm runs no lifecycle
// script: a `prepare` that writes under the read-only `.git` would fail `npm install`; the
// launcher installs outside the session), `TMPDIR` set to the session's working directory
// <travail>, and `GRILLHOUSE_ENVELOPPE` set to <composant>. Nothing else of <env> enters.
function environnementDeLaSeance(env, { cacheNpm, composant, travail }) {
  const declare = nom =>
    ENVIRONNEMENT_DECLARE.includes(nom) ||
    VARIABLES_DE_CHEMIN.includes(nom) ||
    FAMILLES_DECLAREES.some(f => nom.startsWith(f));
  const garde = Object.entries(env).filter(([nom, v]) => v !== undefined && declare(nom));
  return {
    ...Object.fromEntries(garde),
    npm_config_cache: cacheNpm,
    npm_config_ignore_scripts: 'true',
    TMPDIR: travail,
    [VARIABLE]: composant,
  };
}

// The command run inside the envelope: <commande>, behind the test of the variables that name a
// path.
function commandeEprouvee(commande) {
  return ['/bin/sh', '-c', EPREUVE, 'sh', ...VARIABLES_DE_CHEMIN, '--', ...commande];
}

// The mounts outside the copy, in bwrap's order: an empty `/tmp`; the home that holds
// `~/.claude` and the session directories, empty and sealed; the copy's scratchpads, the npm
// cache and `~/.claude` in writing; the throwaway `~/.claude.json`; over them, what the session
// reads without writing; the copy's project directory, in writing; last, the declared paths of
// the home, read-only.
export function montagesDeLaSeance({
  cacheNpm,
  claude,
  projet,
  etatJetable,
  scratchpads,
  sessions = [],
}) {
  const maison = path.dirname(claude);
  return [
    { chemin: TEMPORAIRE, vide: true },
    ...[maison, ...sessions].map(chemin => ({ chemin, vide: true, scelle: true })),
    ...[scratchpads, cacheNpm, claude].map(chemin => ({ chemin, ecriture: true })),
    { chemin: `${claude}.json`, source: etatJetable, ecriture: true },
    ...CLAUDE_EN_LECTURE.map(nom => ({ chemin: path.join(claude, nom), ecriture: false })),
    { chemin: projet, ecriture: true },
    ...MAISON_EN_LECTURE.map(rel => ({ chemin: path.join(maison, rel), ecriture: false })),
  ];
}

// The mounts with every declared path that is a symbolic link on disk turned into that same link,
// followed by what it leads to, as Flatpak exposes a link: link by link, each target that lies in
// an emptied directory and under no other declared path comes back with the link's rights, so a
// launcher finds its package beside its real path. A target the root shows needs no mount.
// `lien(path)` gives the text of the link at <path>, or null when <path> is not a link.
function avecLiens(montages, lien) {
  const videes = montages.filter(m => m.vide).map(m => m.chemin);
  const declares = montages.filter(m => !m.vide && !m.lien).map(m => m.chemin);
  return montages.flatMap(m => {
    if (m.vide || m.lien || (m.source ?? m.chemin) !== m.chemin) return [m];
    const suite = [];
    const vus = new Set();
    let chemin = m.chemin;
    let texte = lien(chemin);
    if (texte === null) return [m];
    while (texte !== null && !vus.has(chemin)) {
      vus.add(chemin);
      suite.push({ chemin, lien: texte });
      chemin = path.resolve(path.dirname(chemin), texte);
      const cachee = videes.some(v => inside(chemin, v));
      const tenue = declares.some(d => d !== m.chemin && inside(chemin, d));
      if (!cachee || tenue) return suite;
      texte = lien(chemin);
    }
    return vus.has(chemin) ? suite : [...suite, { chemin, ecriture: m.ecriture }];
  });
}

const lienSurDisque = p => {
  try {
    return lstatSync(p).isSymbolicLink() ? readlinkSync(p) : null;
  } catch {
    return null;
  }
};

// The worktrees of the repository that holds <copie>, main tree first.
function worktrees(copie) {
  const out = execFileSync('git', ['-C', copie, 'worktree', 'list', '--porcelain'], {
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .filter(l => l.startsWith('worktree '))
    .map(l => l.slice('worktree '.length));
}

// What a directory of the real disk holds, as { name, dir } entries.
function lister(dir) {
  return readdirSync(dir, { withFileTypes: true }).map(e => ({
    name: e.name,
    dir: e.isDirectory(),
  }));
}

// The symbolic links under <dir> whose resolved target lies outside <dir>.
function liensSortants(dir) {
  const found = [];
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) {
        const target = path.resolve(d, readlinkSync(p));
        const rel = path.relative(dir, target);
        if (rel.startsWith('..') || path.isAbsolute(rel)) found.push({ lien: p, cible: target });
      } else if (e.isDirectory() && e.name !== 'node_modules') {
        walk(p);
      }
    }
  };
  walk(dir);
  return found;
}

// The paths, relative to <dir>, a package of <copie>, that its `package.json` publishes beyond the
// parts every package publishes: what its `files` field names, and the directory each trace it
// declares writes (`grillhouse.traces`, its `ecrit` from the root of <copie>); none without them.
function fichiersPublies(dir, copie) {
  const manifeste = path.join(dir, 'package.json');
  if (!existsSync(manifeste)) return [];
  const { files, grillhouse } = JSON.parse(readFileSync(manifeste, 'utf8'));
  const traces = Object.values(grillhouse?.traces ?? {})
    .filter(t => typeof t?.ecrit === 'string')
    .map(t => path.relative(dir, path.join(copie, t.ecrit)));
  return [...(Array.isArray(files) ? files : []), ...traces];
}

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

const inside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// The refusal of <composant> in the repository at <depot>, or null when it is the path of a
// directory there (`.`, the whole repository, included). A <composant> that is the name of a
// package of `paquets` (`paquets` of `scripts/paquets.mjs`), or the name of its folder, is told
// its path, as git says « did you mean ». `fs` gives `existe(path)`. The launcher judges the
// component with it before preparing the copy, in the ticket's copy when it exists, else in the
// main tree or in the tree of the ticket's branch, its `existe` accepting either; `plan` judges it
// in the copy.
export function jugerComposant({ depot, composant, paquets = [] }, fs) {
  const propre = path.join(depot, composant);
  if (fs.existe(propre)) return null;
  const nomme =
    paquets.find(p => p.pkg?.name === composant) ??
    paquets.find(p => path.basename(p.dossier) === composant);
  return nomme
    ? `\`${composant}\` n'est pas le chemin d'un composant ; écris \`${nomme.dossier}\`.`
    : `Le composant ${propre} n'existe pas.`;
}

// The bwrap arguments for this agent, or the refusal that stops its launch. `montages` lists, in
// order, the paths outside the copy that are emptied, written, read back or made a symbolic link
// (`lien`, its text) (`montagesDeLaSeance`); an emptied one marked `scelle` is sealed read-only
// once every mount inside it is made.
// `matieres` lists the packages of the shared test material, relative to the copy
// (`matieres` of `scripts/consommateurs.mjs`); `role` is the agent's role, and only the `testwriter` writes them.
// `magasins` lists the task caches written by every run, the agent's included (Turborepo's
// `<main tree>/.turbo/cache`); one that does not exist is not mounted.
// `paquets` lists the packages of the copy, which `jugerComposant` reads to judge <composant>;
// a <composant> among them writes itself alone of the copy.
// `fs` gives `lister(dir)`, `existe(path)`, `liens(dir)`, `publies(dir, copie)` and `lus(dir)`
// (what the tests of the package at <dir> declare they read, `cheminsLus`), so the plan is testable
// without disk.
export function plan(
  { trees, copie, composant, role, matieres = [], montages = [], magasins = [], paquets = [] },
  fs
) {
  // The worktrees start with the main tree: an envelope on it would let the agent write its root.
  if (trees.length > 0 && path.resolve(trees[0]) === path.resolve(copie)) {
    return {
      refus: `La copie ${copie} est l'arbre principal : un agent travaille dans sa propre copie.`,
    };
  }
  const parentRel = path.dirname(composant);
  const nom = path.basename(composant);
  // A folder of the root (`scripts`) works on the whole repository: no neighbour to hide.
  const racine = parentRel === '.' || parentRel === '';
  const propre = path.join(copie, composant);
  const refusDuComposant = jugerComposant({ depot: copie, composant, paquets }, fs);
  if (refusDuComposant) return { refus: refusDuComposant };

  const caches = racine ? [] : trees.map(t => path.join(t, parentRel));
  const matiere = matieres.map(m => path.join(copie, m));
  for (const { lien, cible } of [propre, ...matiere].flatMap(d => fs.liens(d))) {
    if (caches.some(c => inside(cible, c))) {
      return {
        refus: `Le lien ${lien} vise ${cible}, que l'enveloppe masque : il traverserait l'enveloppe.`,
      };
    }
  }

  // /dev/shm, which /dev brings in writing, becomes an empty directory proper to the session.
  const args = [
    '--ro-bind',
    '/',
    '/',
    '--dev-bind',
    '/dev',
    '/dev',
    '--tmpfs',
    '/dev/shm',
    '--unshare-pid',
    '--proc',
    '/proc',
  ];
  for (const { chemin, source = chemin, ecriture, vide, lien } of montages) {
    if (vide) args.push('--tmpfs', chemin);
    else if (lien !== undefined) args.push('--symlink', lien, chemin);
    else if (fs.existe(source)) args.push(ecriture ? '--bind' : '--ro-bind', source, chemin);
  }
  // A worktree that an emptied directory covers comes back read-only, before the copy is written.
  const videes = montages.filter(m => m.vide).map(m => m.chemin);
  for (const t of trees) {
    if (videes.some(v => inside(t, v)) && fs.existe(t)) args.push('--ro-bind', t, t);
  }
  // The copy is mounted after them: an emptied /tmp does not hide it. Its .git stays read-only.
  // For a component that is a package, the copy is read-only and its package alone comes back in
  // writing below, as a sandbox of Bazel opens only what the action declares; where a run of
  // Turborepo writes at the root is an empty directory proper to the session.
  const paquet = !racine && estUnPaquet(copie, composant, paquets);
  args.push(paquet ? '--ro-bind' : '--bind', copie, copie);
  if (paquet) for (const s of sortiesDeLaRacine(copie)) if (fs.existe(s)) args.push('--tmpfs', s);
  const gitDeLaCopie = path.join(copie, '.git');
  if (fs.existe(gitDeLaCopie)) args.push('--ro-bind', gitDeLaCopie, gitDeLaCopie);
  // The task cache (Turborepo's) is written by the agent's runs, as by every copy's.
  for (const m of magasins) if (fs.existe(m)) args.push('--bind', m, m);
  const tickets = trees.length > 0 ? path.join(trees[0], '.beads') : null;
  if (tickets && fs.existe(tickets)) args.push('--bind', tickets, tickets);
  // Every index directory of every worktree, the copy's included, becomes an empty directory in
  // its place; the worktree around it keeps its mount.
  const index = [...new Set([...trees, copie])]
    .flatMap(t => INDEX.map(i => path.join(t, i)))
    .filter(i => fs.existe(i));
  for (const i of index) args.push('--tmpfs', i);
  for (const c of caches) if (fs.existe(c)) args.push('--tmpfs', c);
  const parent = path.join(copie, parentRel);
  for (const e of racine ? [] : fs.lister(parent)) {
    const p = path.join(parent, e.name);
    if (!e.dir) {
      args.push('--ro-bind', p, p);
    } else if (e.name !== nom && !matiere.includes(p)) {
      for (const part of new Set([...PUBLISHED, ...fs.publies(p, copie)])) {
        const q = path.join(p, part);
        if (inside(q, p) && fs.existe(q)) args.push('--ro-bind', q, q);
      }
    }
  }
  // What the component's tests declare they read, in a sibling the envelope hides.
  if (!racine) {
    for (const l of new Set(fs.lus?.(propre) ?? [])) {
      const q = path.join(copie, l);
      const visible = inside(q, propre) || matiere.some(m => inside(q, m));
      if (inside(q, parent) && q !== parent && !visible && fs.existe(q)) {
        args.push('--ro-bind', q, q);
      }
    }
  }
  args.push('--bind', propre, propre);
  for (const m of matiere) {
    args.push(role === ROLE_MATIERE ? '--bind' : '--ro-bind', m, m);
    // What a run of its tests writes goes, for a role that does not write it, to an empty
    // directory proper to the session, as Bazel writes a test's logs out of its source.
    if (role === ROLE_MATIERE) continue;
    for (const s of sortiesDeTest(m)) if (fs.existe(s)) args.push('--tmpfs', s);
  }
  // The emptied directories close behind the mounts: nothing new is written there.
  for (const c of caches) if (fs.existe(c)) args.push('--remount-ro', c);
  for (const { chemin } of montages.filter(m => m.scelle)) args.push('--remount-ro', chemin);
  for (const i of index) args.push('--remount-ro', i);
  args.push('--chdir', copie);
  return { args };
}

const disque = {
  lister,
  existe: existsSync,
  liens: d => (existsSync(d) && statSync(d).isDirectory() ? liensSortants(d) : []),
  publies: fichiersPublies,
  lus: cheminsLus,
};

// The command: the session of <commande> in the envelope of <composant> in <copie>; its exit code.
function envelopper(argv) {
  const sep = argv.indexOf('--');
  const [copieArg, composant, role] = argv.slice(0, sep < 0 ? undefined : sep);
  const commande = sep < 0 ? [] : argv.slice(sep + 1);
  if (!copieArg || !composant || !role || commande.length === 0) {
    process.stderr.write('usage: enveloppe.mjs <copie> <composant> <rôle> -- <commande…>\n');
    return CODE_USAGE;
  }
  const copie = path.resolve(copieArg);
  // A launch from a package of a repository of workspaces sets npm's `workspace`, which
  // `npm config` refuses: the cache is the user's, whatever the workspace.
  const cacheNpm = execFileSync('npm', ['config', 'get', 'cache', '--workspaces=false'], {
    encoding: 'utf8',
  }).trim();
  const claude = path.join(os.homedir(), '.claude');
  // A session's project directory carries its working directory, every sign outside
  // [A-Za-z0-9] turned into a dash; it is created here so that bwrap mounts it in writing.
  const enTirets = copie.replace(/[^A-Za-z0-9]/g, '-');
  const projet = path.join(claude, 'projects', enTirets);
  mkdirSync(projet, { recursive: true });
  const scratchpads = scratchpadsDe(copie);
  // The session's working directory, created here inside the scratchpads that bwrap mounts.
  const travail = dossierDeTravail(copie);
  mkdirSync(travail, { recursive: true });
  // `~/.claude.json` holds the permissions and servers of every project: it enters the session
  // as a throwaway copy, in a base of its own removed on exit and swept when the envelope is
  // killed (../vitest-config/base-de-passe.mjs).
  const temporaire = ouvrirBase('enveloppe');
  const etatJetable = path.join(temporaire.dossier, 'claude.json');
  if (existsSync(`${claude}.json`)) copyFileSync(`${claude}.json`, etatJetable);
  // The session directories of this user that exist: the XDG one and the systemd one.
  const sessions = [
    ...new Set(
      [process.env.XDG_RUNTIME_DIR, `/run/user/${process.getuid()}`]
        .filter(d => d && existsSync(d))
        .map(d => path.resolve(d))
    ),
  ];
  const montages = avecLiens(
    montagesDeLaSeance({ cacheNpm, claude, projet, etatJetable, scratchpads, sessions }),
    lienSurDisque
  );
  const matieres = lesMatieres(copie).map(m => path.relative(copie, m.dir));
  // For a role that does not write it, the directories where a run of the material's tests writes
  // are created here, so that bwrap mounts an empty one over each inside the read-only package.
  if (role !== ROLE_MATIERE) {
    for (const m of matieres) {
      for (const s of sortiesDeTest(path.join(copie, m))) mkdirSync(s, { recursive: true });
    }
  }
  // For a component that is a package, where a run of Turborepo writes at the root of the copy is
  // created here, so that bwrap mounts an empty one over it inside the read-only copy.
  const paquets = lesPaquets(copie);
  if (estUnPaquet(copie, composant, paquets)) {
    for (const s of sortiesDeLaRacine(copie)) mkdirSync(s, { recursive: true });
  }
  // The cache of Turborepo, in the main tree (the folder of git's common directory), created here
  // so that bwrap mounts it in writing.
  const commun = execFileSync(
    'git',
    ['-C', copie, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    { encoding: 'utf8' }
  ).trim();
  const magasins = [path.join(path.dirname(commun), '.turbo', 'cache')];
  for (const m of magasins) mkdirSync(m, { recursive: true });
  const { args, refus } = plan(
    {
      trees: worktrees(copie),
      copie,
      composant,
      role,
      matieres,
      montages,
      magasins,
      paquets,
    },
    disque
  );
  let code;
  if (refus) {
    process.stderr.write(`⛔ ENVELOPPE REFUSÉE — ${refus}\n`);
    code = CODE_REFUS;
  } else {
    const r = spawnSync('bwrap', [...args, ...commandeEprouvee(commande)], {
      stdio: 'inherit',
      env: environnementDeLaSeance(process.env, { cacheNpm, composant, travail }),
    });
    if (r.error) process.stderr.write(`⛔ ENVELOPPE IMPOSSIBLE — ${r.error.message}\n`);
    code = r.error ? CODE_REFUS : (r.status ?? 1);
  }
  temporaire.fermer();
  return code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = envelopper(process.argv.slice(2));
}
