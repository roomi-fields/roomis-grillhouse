// The one address of the register of finished agents: GRILLHOUSE_REGISTRE first, else the
// workstation's `~/.claude/grillhouse/registre.jsonl`. A module of its own, imported by every
// reader and writer of the register (scripts/registre.mjs re-exports it), so that bilan.mjs and
// tableau.mjs read it without a cycle through registre.mjs.
import os from 'node:os';
import path from 'node:path';

export const REGISTRE =
  process.env.GRILLHOUSE_REGISTRE ??
  path.join(os.homedir(), '.claude', 'grillhouse', 'registre.jsonl');
