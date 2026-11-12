#!/usr/bin/env node
// The hooks of Claude Code the frame's plugin declares (hooks.json): each runs
//
//   node "${CLAUDE_PLUGIN_ROOT}/hooks/crochet.mjs" <sous-commande>
//
// with Node alone, before any installation, as Husky's hooks run before the project's tools.
//
// - The project is `CLAUDE_PROJECT_DIR`, else the working directory; its command is
//   `node_modules/.bin/grillhouse`, which the project's `npm install` links (the package
//   @roomi-fields/grillhouse). When the project is a git worktree, the command is the main
//   tree's (the parent of `git rev-parse --git-common-dir`) and runs with the worktree as its
//   working directory: the code that judges is not the code of the copy it judges.
// - The common charter reaches each session, a subagent's included, by the import of the
//   project's CLAUDE.md, from the package installed, which Claude Code loads whole; no hook writes it, since Claude Code caps a hook's output (10,000 characters).
// - Each subcommand runs `grillhouse <sous-commande>`; without the command, `session-start` writes
//   a section that says to run `npm install`, and any other subcommand exits 0 and writes nothing.
// - The command receives the hook's input on its standard input, writes on the hook's outputs, and
//   its exit code is the hook's (2 blocks, as Claude Code reads it).
// - A command that does not know the subcommand (a package older than the plugin: it writes
//   « ⛔ sous-commande inconnue : <sous-commande> » and its usage, and exits 2) is as no command:
//   the hook exits 0 and writes nothing, so that a hook the plugin adds never blocks a tool, a
//   prompt or a stop with the usage.
import { spawnSync } from 'node:child_process';
import { existsSync, writeSync } from 'node:fs';
import path from 'node:path';

const sous = process.argv[2] ?? '';
const projet = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// The main tree of a git worktree: the parent of the common directory of git; the project itself
// outside a worktree or a repository.
function arbrePrincipal() {
  const r = spawnSync('git', ['-C', projet, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  });
  return r.status === 0 && r.stdout.trim() !== '' ? path.dirname(r.stdout.trim()) : projet;
}
const commande = path.join(arbrePrincipal(), 'node_modules', '.bin', 'grillhouse');

if (existsSync(commande)) {
  const r = spawnSync(commande, [sous], {
    stdio: ['inherit', 'inherit', 'pipe'],
    cwd: projet,
    encoding: 'utf8',
  });
  if (r.status === 2 && (r.stderr ?? '').startsWith(`⛔ sous-commande inconnue : ${sous}\n`)) {
    process.exitCode = 0;
  } else {
    if (r.stderr) {
      writeSync(2, r.stderr);
    }
    process.exitCode = r.status ?? 1;
  }
} else if (sous === 'session-start') {
  writeSync(
    1,
    "## Paquet Roomi's Grillhouse absent\nLe projet n'a pas encore installé le paquet du cadre (`node_modules/.bin/grillhouse`, @roomi-fields/grillhouse) : lance `npm install` à la racine du projet, puis rouvre la séance. La charte commune, que CLAUDE.md importe du paquet, arrive avec lui.\n"
  );
}
