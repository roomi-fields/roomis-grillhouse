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
// - `session-start` writes the common charter (`charte.md` of the plugin) first, then runs
//   `grillhouse session-start`; without the command, it writes, after the charter, a section that
//   says to run `npm install`. So every session receives the charter, the supervisor's and a
//   role's, and its start after a compaction.
// - `subagent-start` gives a subagent the common charter as its additional context (JSON of the
//   hook SubagentStart): a subagent receives no output of the session's start.
// - Any other subcommand runs `grillhouse <sous-commande>`; without the command, the hook exits 0
//   and writes nothing.
// - The command receives the hook's input on its standard input, writes on the hook's outputs, and
//   its exit code is the hook's (2 blocks, as Claude Code reads it).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GREFFON = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sous = process.argv[2] ?? '';
const projet = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const commande = path.join(projet, 'node_modules', '.bin', 'grillhouse');
const charte = () => readFileSync(path.join(GREFFON, 'charte.md'), 'utf8');

if (sous === 'subagent-start') {
  writeSync(
    1,
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: charte() },
    })
  );
} else {
  if (sous === 'session-start') writeSync(1, charte());
  if (existsSync(commande)) {
    if (sous === 'session-start') writeSync(1, '\n');
    const r = spawnSync(commande, [sous], { stdio: 'inherit', cwd: projet });
    process.exitCode = r.status ?? 1;
  } else if (sous === 'session-start') {
    writeSync(
      1,
      "\n## Paquet Roomi's Grillhouse absent\nLe projet n'a pas encore installé le paquet du cadre (`node_modules/.bin/grillhouse`, @roomi-fields/grillhouse) : lance `npm install` à la racine du projet, puis rouvre la séance.\n"
    );
  }
}
