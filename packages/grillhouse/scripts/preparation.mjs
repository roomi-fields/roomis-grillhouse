// The preparation of a project for its first session, which `grillhouse init` runs on the project
// it creates (scripts/init.mjs). Idempotent: a second preparation changes nothing.
//
// - git: the directory becomes a repository when it is none.
// - Beads, the ticket store the skills work from: the tool (`bd`, installed by
//   `npm install -g @beads/bd` when absent), then the store, under the prefix given, else the
//   store's own, else the directory's name; the repository's `beads.role` is `maintainer`.
// - CodeGraph, the code knowledge graph the skills query (the MCP server of `.mcp.json`): the tool
//   (installed by `npm install -g @colbymchenry/codegraph` when absent) and the index of the code.
// - The folder git reads the hooks from: `core.hooksPath` set to Beads' (`.beads/hooks`) when the
//   repository names none. The frame's git hooks come by the project's `prepare`
//   (`grillhouse hooks`), which the `npm install` below runs.
// - The frame's plugins its settings declare, installed for the project (scripts/greffons.mjs): a
//   plugin that cannot be installed has its line naming the command to type, and the other steps
//   still run.
// - `npm install`, when the project has a package.json.
// A global tool whose installation fails stops the preparation, its message naming the command.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { installerGreffons } from './greffons.mjs';

// The prefix of the tickets: the one given, else the store's own, else the directory's name.
function prefixeDe(projet, donne) {
  if (donne) return donne;
  if (existsSync(path.join(projet, '.beads'))) {
    const r = spawnSync('bd', ['config', 'get', 'issue_prefix'], {
      cwd: projet,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    const existant = (r.stdout ?? '').trim();
    if (r.status === 0 && existant !== '' && !existant.includes('(')) return existant;
  }
  return path
    .basename(projet)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-');
}

// Runs <commande> in <projet>, its output this process's; throws on a failure.
const lancer = (projet, commande, args) =>
  execFileSync(commande, args, { cwd: projet, stdio: 'inherit' });
const present = commande => spawnSync('sh', ['-c', `command -v ${commande}`]).status === 0;

// A global tool of the preparation, installed by npm when absent.
function outil(commande, paquet) {
  if (present(commande)) return;
  try {
    execFileSync('npm', ['install', '-g', paquet], { stdio: 'inherit' });
  } catch {
    throw new Error(
      `L'installation de ${paquet} échoue : lance npm install -g ${paquet}, puis recommence.`
    );
  }
}

/**
 * Prepares the project at <projet>, its tickets under <prefixe> (see the header). Returns the lines
 * of failure of the plugins (empty when everything stands).
 */
export function preparer(projet, prefixe) {
  if (spawnSync('git', ['-C', projet, 'rev-parse', '--git-dir']).status !== 0) {
    lancer(projet, 'git', ['init', '-q']);
  }
  outil('bd', '@beads/bd');
  outil('codegraph', '@colbymchenry/codegraph');
  if (!existsSync(path.join(projet, '.codegraph'))) lancer(projet, 'codegraph', ['init', projet]);
  lancer(projet, 'bd', [
    'init',
    '--init-if-missing',
    '--non-interactive',
    '--skip-agents',
    '--quiet',
    '--prefix',
    prefixeDe(projet, prefixe),
  ]);
  lancer(projet, 'git', ['config', 'beads.role', 'maintainer']);
  const r = spawnSync('git', ['-C', projet, 'config', 'core.hooksPath'], { encoding: 'utf8' });
  if ((r.stdout ?? '').trim() === '') {
    lancer(projet, 'git', ['config', 'core.hooksPath', '.beads/hooks']);
  }
  const lignes = installerGreffons(projet);
  if (existsSync(path.join(projet, 'package.json'))) lancer(projet, 'npm', ['install']);
  return lignes;
}
