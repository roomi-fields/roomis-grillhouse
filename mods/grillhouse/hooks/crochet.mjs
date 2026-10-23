#!/usr/bin/env node
// The hooks of Claude Code the frame's plugin declares (hooks.json): each runs
//
//   node "${CLAUDE_PLUGIN_ROOT}/hooks/crochet.mjs" <sous-commande>
//
// with Node alone, before any installation, as Husky's hooks run before the project's tools.
//
// - The project is `CLAUDE_PROJECT_DIR`, else the working directory; its command is
//   `node_modules/.bin/grillhouse`, which the project's `npm install` links (the package
//   @roomi-fields/grillhouse).
// - The common charter reaches each session, a subagent's included, by the import of the
//   project's CLAUDE.md, from the package installed, which Claude Code loads whole; no hook writes it, since Claude Code caps a hook's output (10,000 characters).
// - Each subcommand runs `grillhouse <sous-commande>`; without the command, `session-start` writes
//   a section that says to run `npm install`, and any other subcommand exits 0 and writes nothing.
// - The command receives the hook's input on its standard input, writes on the hook's outputs, and
//   its exit code is the hook's (2 blocks, as Claude Code reads it).
import { spawnSync } from 'node:child_process';
import { existsSync, writeSync } from 'node:fs';
import path from 'node:path';

const sous = process.argv[2] ?? '';
const projet = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const commande = path.join(projet, 'node_modules', '.bin', 'grillhouse');

if (existsSync(commande)) {
  const r = spawnSync(commande, [sous], { stdio: 'inherit', cwd: projet });
  process.exitCode = r.status ?? 1;
} else if (sous === 'session-start') {
  writeSync(
    1,
    "## Paquet Roomi's Grillhouse absent\nLe projet n'a pas encore installé le paquet du cadre (`node_modules/.bin/grillhouse`, @roomi-fields/grillhouse) : lance `npm install` à la racine du projet, puis rouvre la séance. La charte commune, que CLAUDE.md importe du paquet, arrive avec lui.\n"
  );
}
