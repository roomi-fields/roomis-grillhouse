#!/usr/bin/env node
// The envelope of a role agent: runs a command (the agent's `claude` session) inside a bwrap
// sandbox that shows the agent its own component, and of every other component only what it
// publishes. `node scripts/enveloppe/enveloppe.mjs <copie> <composant> -- <commande…>`
//
// - The root `/` is read-only. Only these are written: the agent's copy; a `/tmp` empty and
//   proper to the session, where only the scratchpad directory of the copy comes back; the npm
//   cache; the Claude session state (`~/.claude` and the copy's project directory), whose
//   configuration, skills, plugins and other projects stay read-only. `~/.claude.json` is a
//   throwaway copy: the session writes it, the real file does not change. Every `.git`, the
//   copy's included, stays read-only: the agent reads the git state and delivers a patch
//   (`git diff`, and `git diff --no-index /dev/null <file>` for a new file); it never commits.
// - An envelope on the main tree is refused.
// - <copie> is the agent's git worktree; <composant> is the component's path inside it
//   (`packages/a`, or `src/parser` in a one-package project).
// - In every worktree of the repository, the component's parent directory (`packages/`, `src/`)
//   is emptied. In <copie>, the component is mounted back in writing; every sibling component
//   gets back, read-only, its published parts: `package.json`, `docs/INTERFACE.md`, `dist/`.
//   The parent's own files (`src/index.ts`) come back read-only, and the emptied directories are
//   then sealed read-only.
// - The traversal guard refuses to launch when a symbolic link inside the component points into
//   a hidden directory: such a link would cross the envelope.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PUBLISHED = ['package.json', 'docs/INTERFACE.md', 'dist'];
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

// The mounts outside the copy, in bwrap's order: an empty `/tmp`; the copy's scratchpads, the
// npm cache and `~/.claude` in writing; the throwaway `~/.claude.json`; over them, what the
// session reads without writing; last, the copy's project directory, in writing.
export function montagesDeLaSeance({ cacheNpm, claude, projet, etatJetable, scratchpads }) {
  return [
    { chemin: TEMPORAIRE, vide: true },
    ...[scratchpads, cacheNpm, claude].map(chemin => ({ chemin, ecriture: true })),
    { chemin: `${claude}.json`, source: etatJetable, ecriture: true },
    ...CLAUDE_EN_LECTURE.map(nom => ({ chemin: path.join(claude, nom), ecriture: false })),
    { chemin: projet, ecriture: true },
  ];
}

// The worktrees of the repository that holds <copie>, main tree first.
export function worktrees(copie) {
  const out = execFileSync('git', ['-C', copie, 'worktree', 'list', '--porcelain'], {
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .filter(l => l.startsWith('worktree '))
    .map(l => l.slice('worktree '.length));
}

// What a directory of the real disk holds, as { name, dir } entries.
export function lister(dir) {
  return readdirSync(dir, { withFileTypes: true }).map(e => ({
    name: e.name,
    dir: e.isDirectory(),
  }));
}

// The symbolic links under <dir> whose resolved target lies outside <dir>.
export function liensSortants(dir) {
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

const inside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// The bwrap arguments for this agent, or the refusal that stops its launch. `montages` lists, in
// order, the paths outside the copy that are written or read back (`montagesDeLaSeance`).
// `fs` gives `lister(dir)`, `existe(path)` and `liens(dir)`, so the plan is testable without disk.
export function plan({ trees, copie, composant, montages = [] }, fs) {
  // The worktrees start with the main tree: an envelope on it would let the agent write its root.
  if (trees.length > 0 && path.resolve(trees[0]) === path.resolve(copie)) {
    return {
      refus: `La copie ${copie} est l'arbre principal : un agent travaille dans sa propre copie.`,
    };
  }
  const parentRel = path.dirname(composant);
  const nom = path.basename(composant);
  if (parentRel === '.' || parentRel === '') {
    return {
      refus: `Le composant ${composant} n'a pas de dossier parent : l'enveloppe masque ses voisins dans ce parent.`,
    };
  }
  const propre = path.join(copie, composant);
  if (!fs.existe(propre)) return { refus: `Le composant ${propre} n'existe pas.` };

  const caches = trees.map(t => path.join(t, parentRel));
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
    '--proc',
    '/proc',
  ];
  for (const { chemin, source = chemin, ecriture, vide } of montages) {
    if (vide) args.push('--tmpfs', chemin);
    else if (fs.existe(source)) args.push(ecriture ? '--bind' : '--ro-bind', source, chemin);
  }
  // The copy is mounted after them: an emptied /tmp does not hide it. Its .git stays read-only.
  args.push('--bind', copie, copie);
  const gitDeLaCopie = path.join(copie, '.git');
  if (fs.existe(gitDeLaCopie)) args.push('--ro-bind', gitDeLaCopie, gitDeLaCopie);
  for (const c of caches) if (fs.existe(c)) args.push('--tmpfs', c);
  const parent = path.join(copie, parentRel);
  for (const e of fs.lister(parent)) {
    const p = path.join(parent, e.name);
    if (!e.dir) {
      args.push('--ro-bind', p, p);
    } else if (e.name !== nom) {
      for (const part of PUBLISHED) {
        const q = path.join(p, part);
        if (fs.existe(q)) args.push('--ro-bind', q, q);
      }
    }
  }
  args.push('--bind', propre, propre);
  // The emptied directories close behind the mounts: nothing new is written there.
  for (const c of caches) if (fs.existe(c)) args.push('--remount-ro', c);
  args.push('--chdir', copie);
  return { args };
}

const disque = {
  lister,
  existe: existsSync,
  liens: d => (existsSync(d) && statSync(d).isDirectory() ? liensSortants(d) : []),
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const sep = process.argv.indexOf('--');
  const [copieArg, composant] = process.argv.slice(2, sep < 0 ? undefined : sep);
  const commande = sep < 0 ? [] : process.argv.slice(sep + 1);
  if (!copieArg || !composant || commande.length === 0) {
    process.stderr.write('usage: enveloppe.mjs <copie> <composant> -- <commande…>\n');
    process.exit(2);
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
  const montages = montagesDeLaSeance({ cacheNpm, claude, projet, etatJetable, scratchpads });
  const { args, refus } = plan({ trees: worktrees(copie), copie, composant, montages }, disque);
  let code;
  if (refus) {
    process.stderr.write(`⛔ ENVELOPPE REFUSÉE — ${refus}\n`);
    code = 3;
  } else {
    const r = spawnSync('bwrap', [...args, ...commande], { stdio: 'inherit' });
    if (r.error) process.stderr.write(`⛔ ENVELOPPE IMPOSSIBLE — ${r.error.message}\n`);
    code = r.error ? 3 : (r.status ?? 1);
  }
  rmSync(temporaire, { recursive: true, force: true });
  process.exit(code);
}
