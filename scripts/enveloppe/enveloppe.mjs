#!/usr/bin/env node
// The envelope of a role agent: runs a command (the agent's `claude` session) inside a bwrap
// sandbox that shows the agent its own component, and of every other component only what it
// publishes. `node scripts/enveloppe/enveloppe.mjs <copie> <composant> -- <commande…>`
//
// - The root `/` is read-only. Only these are written: the agent's copy; a `/tmp` empty and
//   proper to the session, where only the scratchpad directory of the copy comes back; the npm
//   cache; the Claude session state (`~/.claude` and the copy's project directory), whose
//   configuration, skills, plugins and other projects stay read-only. `~/.claude.json` is a
//   throwaway copy: the session writes it, the real file does not change. The tickets base (the
//   main tree's `.beads/`) is written: the agent claims, plans, hands over and files what it
//   finds. Every `.git`, the
//   copy's included, stays read-only: the agent reads the git state and delivers a patch
//   (`git diff`, and `git diff --no-index /dev/null <file>` for a new file); it never commits.
// - The home and the session directories (`$XDG_RUNTIME_DIR`, `/run/user/<uid>`) show only what
//   the envelope declares: each starts empty and sealed read-only, and the home gets back
//   `~/.claude`, `~/.claude.json`, the npm cache, the paths of `MAISON_EN_LECTURE` (claude, node,
//   git and the session's tools) and the repository. No socket of the session comes back. Of
//   the machine's credentials, only claude's own are in sight.
// - The session gets only the environment the envelope declares (`environnementDeLaSeance`), as
//   sudo's env_reset and bwrap's --clearenv give it: the base of a login session, claude's own
//   configuration and credentials (`ANTHROPIC_*`, `CLAUDE_CODE_OAUTH_TOKEN`) and the npm cache it mounts. bwrap
//   starts with that environment alone, so no other variable of the machine (`GH_TOKEN`,
//   `NPM_TOKEN`…) enters, by name or by argument. A declared variable that names a path
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
// - An envelope on the main tree is refused.
// - <copie> is the agent's git worktree; <composant> is the component's path inside it
//   (`packages/a`, or `src/parser` in a one-package project).
// - In every worktree of the repository, the component's parent directory (`packages/`, `src/`)
//   is emptied. In <copie>, the component is mounted back in writing; every sibling component
//   gets back, read-only, its published parts: `package.json`, `docs/INTERFACE.md`, `dist/`, and
//   the paths that the `files` field of its `package.json` names, when they exist inside it.
//   The parent's own files (`src/index.ts`) come back read-only, and the emptied directories are
//   then sealed read-only.
// - A folder of the root (`scripts`) hides nothing: its scripts work on the whole repository. The
//   rest holds: the root read-only, the copy written, its `.git` read-only.
// - The traversal guard refuses to launch when a symbolic link inside the component points into
//   a hidden directory: such a link would cross the envelope.
// - The exit codes are named in `codes.mjs`.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CODE_REFUS, CODE_USAGE } from './codes.mjs';

const PUBLISHED = ['package.json', 'docs/INTERFACE.md', 'dist'];
// The directories where codegraph and rtfm keep the index of a tree they index: the source of
// every component, which the envelope hides.
const INDEX = ['.codegraph', '.rtfm'];
// The machine's temporary directory: an empty one, proper to the session, replaces it. Claude
// keeps its scratchpads there, under `claude-<uid>/<working directory in dashes>/`.
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
// claude's OAuth credential, and the prefixes of the families it passes on: the locale, and the
// configuration and credentials of claude's API. The state of a launching claude session
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

// The environment of the session, from the environment <env> of the launch: the declared
// variables and families that <env> holds, and `npm_config_cache` set to the npm cache that the
// envelope mounts in writing. Nothing else of <env> enters.
function environnementDeLaSeance(env, { cacheNpm }) {
  const declare = nom =>
    ENVIRONNEMENT_DECLARE.includes(nom) ||
    VARIABLES_DE_CHEMIN.includes(nom) ||
    FAMILLES_DECLAREES.some(f => nom.startsWith(f));
  const garde = Object.entries(env).filter(([nom, v]) => v !== undefined && declare(nom));
  return { ...Object.fromEntries(garde), npm_config_cache: cacheNpm };
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

// The paths that the `files` field of <dir>'s `package.json` names; none without that field.
function fichiersPublies(dir) {
  const manifeste = path.join(dir, 'package.json');
  if (!existsSync(manifeste)) return [];
  const { files } = JSON.parse(readFileSync(manifeste, 'utf8'));
  return Array.isArray(files) ? files : [];
}

const inside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// The bwrap arguments for this agent, or the refusal that stops its launch. `montages` lists, in
// order, the paths outside the copy that are emptied, written, read back or made a symbolic link
// (`lien`, its text) (`montagesDeLaSeance`); an emptied one marked `scelle` is sealed read-only
// once every mount inside it is made.
// `fs` gives `lister(dir)`, `existe(path)`, `liens(dir)` and `publies(dir)`, so the plan is
// testable without disk.
export function plan({ trees, copie, composant, montages = [] }, fs) {
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
  if (!fs.existe(propre)) return { refus: `Le composant ${propre} n'existe pas.` };

  const caches = racine ? [] : trees.map(t => path.join(t, parentRel));
  for (const { lien, cible } of fs.liens(propre)) {
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
  args.push('--bind', copie, copie);
  const gitDeLaCopie = path.join(copie, '.git');
  if (fs.existe(gitDeLaCopie)) args.push('--ro-bind', gitDeLaCopie, gitDeLaCopie);
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
    } else if (e.name !== nom) {
      for (const part of new Set([...PUBLISHED, ...fs.publies(p)])) {
        const q = path.join(p, part);
        if (inside(q, p) && fs.existe(q)) args.push('--ro-bind', q, q);
      }
    }
  }
  args.push('--bind', propre, propre);
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
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const sep = process.argv.indexOf('--');
  const [copieArg, composant] = process.argv.slice(2, sep < 0 ? undefined : sep);
  const commande = sep < 0 ? [] : process.argv.slice(sep + 1);
  if (!copieArg || !composant || commande.length === 0) {
    process.stderr.write('usage: enveloppe.mjs <copie> <composant> -- <commande…>\n');
    process.exit(CODE_USAGE);
  }
  const copie = path.resolve(copieArg);
  const cacheNpm = execFileSync('npm', ['config', 'get', 'cache'], { encoding: 'utf8' }).trim();
  const claude = path.join(os.homedir(), '.claude');
  // A session's project directory carries its working directory, every sign outside
  // [A-Za-z0-9] turned into a dash; it is created here so that bwrap mounts it in writing.
  const enTirets = copie.replace(/[^A-Za-z0-9]/g, '-');
  const projet = path.join(claude, 'projects', enTirets);
  mkdirSync(projet, { recursive: true });
  const scratchpads = path.join(TEMPORAIRE, `claude-${process.getuid()}`, enTirets);
  mkdirSync(scratchpads, { recursive: true });
  // `~/.claude.json` holds the permissions and servers of every project: it enters the session
  // as a throwaway copy, in a temporary directory removed on exit.
  const temporaire = mkdtempSync(path.join(os.tmpdir(), 'enveloppe-'));
  const etatJetable = path.join(temporaire, 'claude.json');
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
  const { args, refus } = plan({ trees: worktrees(copie), copie, composant, montages }, disque);
  let code;
  if (refus) {
    process.stderr.write(`⛔ ENVELOPPE REFUSÉE — ${refus}\n`);
    code = CODE_REFUS;
  } else {
    const r = spawnSync('bwrap', [...args, ...commandeEprouvee(commande)], {
      stdio: 'inherit',
      env: environnementDeLaSeance(process.env, { cacheNpm }),
    });
    if (r.error) process.stderr.write(`⛔ ENVELOPPE IMPOSSIBLE — ${r.error.message}\n`);
    code = r.error ? CODE_REFUS : (r.status ?? 1);
  }
  rmSync(temporaire, { recursive: true, force: true });
  process.exit(code);
}
