#!/usr/bin/env node
// The envelope of a role agent: runs a command (the agent's `claude` session) inside a bwrap
// sandbox that shows the agent its own component, and of every other component only what it
// publishes. `node scripts/enveloppe/enveloppe.mjs <copie> <composant> -- <commande…>`
//
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
import { readdirSync, readlinkSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PUBLISHED = ['package.json', 'docs/INTERFACE.md', 'dist'];

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

// The bwrap arguments for this agent, or the refusal that stops its launch.
// `fs` gives `lister(dir)`, `existe(path)` and `liens(dir)`, so the plan is testable without disk.
export function plan({ trees, copie, composant }, fs) {
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

  const args = ['--dev-bind', '/', '/'];
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
  const { args, refus } = plan({ trees: worktrees(copie), copie, composant }, disque);
  if (refus) {
    process.stderr.write(`⛔ ENVELOPPE REFUSÉE — ${refus}\n`);
    process.exit(3);
  }
  const r = spawnSync('bwrap', [...args, ...commande], { stdio: 'inherit' });
  if (r.error) {
    process.stderr.write(`⛔ ENVELOPPE IMPOSSIBLE — ${r.error.message}\n`);
    process.exit(3);
  }
  process.exit(r.status ?? 1);
}
