#!/usr/bin/env node
// The envelope of a role agent: runs a command (the agent's `claude` session) inside a bwrap
// sandbox that shows the agent the whole copy and opens in writing only the packages of its plan,
// as the visibility of Bazel and the module boundaries of Nx refuse a dependency while the code
// stays readable. `npx grillhouse enveloppe <copie> <paquets> <rôle> -- <commande…>`
//
// - The root `/` is read-only, the copy included, its indexes (`.codegraph`, `.rtfm`) and every
//   package outside the plan in sight. Only these are written: the packages of the plan, below; a
//   `/tmp` empty and proper to the session, where only the scratchpad directory of the copy comes
//   back, the session's working directory inside it (`dossierDeTravail`; Claude Code's
//   scratchpads root, `CLAUDE_CODE_TMPDIR` else the launch's temporary directory, so that under a
//   pass it lies in the base of the pass and goes with it); the npm cache; the Claude session
//   state (`~/.claude` and the copy's project directory), whose configuration, skills, plugins and
//   other projects stay read-only. `~/.claude.json` is a throwaway copy: the session writes it,
//   the real file does not change. The tickets base (the main tree's `.beads/`) is written: the
//   agent claims, plans, hands over and files what it finds. Every `.git`, the copy's included,
//   stays read-only: the agent reads the git state and delivers a patch (`git diff`, and
//   `git diff --no-index /dev/null <file>` for a new file); it never commits. The cache of
//   Turborepo (`<main tree>/.turbo/cache`, shared by every copy) is written: the agent's runs of
//   `npm test` keep their tasks there, as every copy's runs do.
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
//   packages of the plan (`paquets-du-plan.mjs`): the frame's commands build, judge and write those
//   packages only, and its lock refuses a write out of them. A declared variable that names a path
//   (`VARIABLES_DE_CHEMIN`) enters only when its path is in sight inside the envelope, tested there
//   before the command runs. The session has its own process space: it reads the environment of
//   no process of the machine.
// - A declared path that is a symbolic link comes back as that link, and its target with it
//   (`avecLiens`).
// - A worktree of the repository under an emptied directory (the home, `/tmp`) comes back
//   read-only, `.git` included; the copy's packages of the plan and the tickets base are then
//   written as above.
// - An envelope on the main tree is refused, so is a plan that names no package, and so is a path
//   of the plan that does not exist; when it is the name of a package of the copy, the refusal
//   gives its path.
// - <copie> is the agent's git worktree; <paquets> is the plan, the paths it names inside it
//   (`packages/a`, or `src/parser` in a one-package project), in the variable's form
//   (`ecrireLaListe` of paquets-du-plan.mjs); <rôle> is the agent's role (`testwriter`,
//   `developpeur`…).
// - The plan writes, for each of its paths, the package of the copy that holds it (`ecritsDuPlan`,
//   `paquets` of `scripts/paquets.mjs`), as a sandbox of Bazel or of Nix opens in writing only
//   what the action declares: the rest of the copy is read-only, the folders of its root that no
//   package holds (`libraries/`, `spec/`) included, and a write there fails on « Read-only file
//   system », which the agent sees. Where a run of Turborepo writes at the root of the copy
//   (`sortiesDeLaRacine`, its `.turbo`) is then an empty directory proper to the session, created
//   on disk before it. A path that no package holds (a folder of the root, `scripts`; `src/parser`
//   in a one-package project) writes the package that holds it, the root: the copy stays written,
//   its `.git` read-only.
// - The package of the shared test material is every component of <copie> whose `package.json`
//   exports `./test-fixtures` (`matieres` of `scripts/langages/typescript/consommateurs.mjs`). It is mounted after the
//   packages of the plan: written for the `testwriter`, read-only for every other role, in the
//   plan or not. For such a role, where a run of its tests writes in it (`sortiesDeTest`:
//   Turborepo's task logs, Vite's cache) is an empty directory proper to the session, as Bazel
//   writes a test's logs out of its source: what is written there leaves no trace. The envelope
//   creates each of them on disk, empty, before the session, so that bwrap mounts over it inside
//   the read-only package.
// - The exit codes are named in `codes.mjs`.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, lstatSync, readlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { langageDe } from '../langages.mjs';
import { paquets as lesPaquets } from '../paquets.mjs';
import { CODE_REFUS, CODE_USAGE } from './codes.mjs';
import { ecritsDuPlan, ecrireLaListe, lireLaListe, VARIABLE } from './paquets-du-plan.mjs';
import { ouvrirBase } from '../mesure/base-de-passe.mjs';

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
// git configuration. The home shows nothing else: neither codegraph nor rtfm, whose servers the
// roles of the envelope do not receive (scripts/droits.mjs); the indexes of the repository are in
// sight with it.
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
// the pass (scripts/mesure/base-de-passe.mjs), removed with it.
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
// <travail>, and `GRILLHOUSE_ENVELOPPE` set to the plan <paquets>. Nothing else of <env> enters.
function environnementDeLaSeance(env, { cacheNpm, paquets, travail }) {
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
    [VARIABLE]: ecrireLaListe(paquets),
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

// The bwrap arguments for this agent, or the refusal that stops its launch. `paquets` is the plan,
// the paths it names relative to the copy; `paquetsDeLaCopie` lists the packages of the copy
// (`paquets` of `scripts/paquets.mjs`), which `jugerComposant` reads to judge each path and
// `ecritsDuPlan` to find the package that holds it. `montages` lists, in order, the paths outside
// the copy that are emptied, written, read back or made a symbolic link (`lien`, its text)
// (`montagesDeLaSeance`); an emptied one marked `scelle` is sealed read-only once every mount
// inside it is made. `matieres` lists the packages of the shared test material, relative to the
// copy (`matieres` of `scripts/langages/typescript/consommateurs.mjs`); `role` is the agent's role, and only the
// `testwriter` writes them. `magasins` lists the task caches written by every run, the agent's
// included (Turborepo's `<main tree>/.turbo/cache`); one that does not exist is not mounted.
// `fs` gives `existe(path)`, so the plan is testable without disk.
export function plan(
  {
    trees,
    copie,
    paquets = [],
    role,
    matieres = [],
    montages = [],
    magasins = [],
    paquetsDeLaCopie = [],
  },
  fs
) {
  // The worktrees start with the main tree: an envelope on it would let the agent write its root.
  if (trees.length > 0 && path.resolve(trees[0]) === path.resolve(copie)) {
    return {
      refus: `La copie ${copie} est l'arbre principal : un agent travaille dans sa propre copie.`,
    };
  }
  if (paquets.length === 0) {
    return { refus: "Le plan ne nomme aucun paquet : l'enveloppe n'ouvre rien en écriture." };
  }
  for (const p of paquets) {
    const refus = jugerComposant({ depot: copie, composant: p, paquets: paquetsDeLaCopie }, fs);
    if (refus) return { refus };
  }
  const ecrits = ecritsDuPlan(paquets, paquetsDeLaCopie);
  const toute = ecrits.includes('.');

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
  // The copy is mounted after them: an emptied /tmp does not hide it. It is read-only, and the
  // packages of the plan come back in writing below, as a sandbox of Bazel opens only what the
  // action declares; where a run of Turborepo writes at the root is an empty directory proper to
  // the session. A plan that writes the root writes the whole copy. Its .git stays read-only.
  args.push(toute ? '--bind' : '--ro-bind', copie, copie);
  if (!toute) for (const s of sortiesDeLaRacine(copie)) if (fs.existe(s)) args.push('--tmpfs', s);
  const gitDeLaCopie = path.join(copie, '.git');
  if (fs.existe(gitDeLaCopie)) args.push('--ro-bind', gitDeLaCopie, gitDeLaCopie);
  // The task cache (Turborepo's) is written by the agent's runs, as by every copy's.
  for (const m of magasins) if (fs.existe(m)) args.push('--bind', m, m);
  const tickets = trees.length > 0 ? path.join(trees[0], '.beads') : null;
  if (tickets && fs.existe(tickets)) args.push('--bind', tickets, tickets);
  if (!toute) {
    for (const e of ecrits) {
      const d = path.join(copie, e);
      args.push('--bind', d, d);
    }
  }
  for (const m of matieres.map(m => path.join(copie, m))) {
    args.push(role === ROLE_MATIERE ? '--bind' : '--ro-bind', m, m);
    // What a run of its tests writes goes, for a role that does not write it, to an empty
    // directory proper to the session, as Bazel writes a test's logs out of its source.
    if (role === ROLE_MATIERE) continue;
    for (const s of sortiesDeTest(m)) if (fs.existe(s)) args.push('--tmpfs', s);
  }
  // The emptied directories close behind the mounts: nothing new is written there.
  for (const { chemin } of montages.filter(m => m.scelle)) args.push('--remount-ro', chemin);
  args.push('--chdir', copie);
  return { args };
}

const disque = { existe: existsSync };

// The command: the session of <commande> in the envelope of the plan <paquets> in <copie>; its
// exit code.
function envelopper(argv) {
  const sep = argv.indexOf('--');
  const [copieArg, liste, role] = argv.slice(0, sep < 0 ? undefined : sep);
  const commande = sep < 0 ? [] : argv.slice(sep + 1);
  if (!copieArg || !liste || !role || commande.length === 0) {
    process.stderr.write('usage: enveloppe.mjs <copie> <paquets> <rôle> -- <commande…>\n');
    return CODE_USAGE;
  }
  const copie = path.resolve(copieArg);
  const paquets = lireLaListe(liste);
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
  // killed (../mesure/base-de-passe.mjs).
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
  const matieres = langageDe(copie)
    .matieres(copie)
    .map(m => path.relative(copie, m.dossier));
  // For a role that does not write it, the directories where a run of the material's tests writes
  // are created here, so that bwrap mounts an empty one over each inside the read-only package.
  if (role !== ROLE_MATIERE) {
    for (const m of matieres) {
      for (const s of sortiesDeTest(path.join(copie, m))) mkdirSync(s, { recursive: true });
    }
  }
  // For a plan that leaves the root read-only, where a run of Turborepo writes at the root of the
  // copy is created here, so that bwrap mounts an empty one over it inside the read-only copy.
  const paquetsDeLaCopie = lesPaquets(copie);
  if (!ecritsDuPlan(paquets, paquetsDeLaCopie).includes('.')) {
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
      paquets,
      role,
      matieres,
      montages,
      magasins,
      paquetsDeLaCopie,
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
      env: environnementDeLaSeance(process.env, { cacheNpm, paquets, travail }),
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
