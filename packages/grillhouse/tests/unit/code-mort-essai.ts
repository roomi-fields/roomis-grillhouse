import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

// The trial harness of the dead-code guard: the real guard (knip) run in a repository built in
// a fresh directory under <racine>, its modules linked to this repository's node_modules.
const SCRIPT = path.resolve(__dirname, '../../scripts/code-mort.mjs');
const MODULES = path.resolve(__dirname, '../../../../node_modules');
const KNIP = path.join(MODULES, 'knip/bin/knip.js');

// One run of knip by the guard: its arguments and the settings of its `--config` file (null
// without one).
type AppelKnip = { args: string[]; config: Record<string, unknown> | null };

// The node_modules of a trial whose knip is the real one behind a recorder: each run appends its
// arguments and settings to <journal>, then hands over to the real knip, its output untouched.
function modulesJournal(dir: string, journal: string) {
  const nm = path.join(dir, 'node_modules');
  mkdirSync(path.join(nm, '.bin'), { recursive: true });
  for (const e of readdirSync(MODULES)) {
    if (e !== '.bin') {
      symlinkSync(path.join(MODULES, e), path.join(nm, e));
    }
  }
  for (const e of readdirSync(path.join(MODULES, '.bin'))) {
    const src = path.join(MODULES, '.bin', e);
    if (e !== 'knip') {
      symlinkSync(
        lstatSync(src).isSymbolicLink() ? readlinkSync(src) : src,
        path.join(nm, '.bin', e)
      );
    }
  }
  const knip = path.join(nm, '.bin', 'knip');
  writeFileSync(
    knip,
    [
      '#!/usr/bin/env node',
      "const fs = require('node:fs');",
      "const { spawnSync } = require('node:child_process');",
      'const args = process.argv.slice(2);',
      "const i = args.indexOf('--config');",
      "const config = i >= 0 ? JSON.parse(fs.readFileSync(args[i + 1], 'utf8')) : null;",
      `fs.appendFileSync(${JSON.stringify(journal)}, JSON.stringify({ args, config }) + '\\n');`,
      `const r = spawnSync(process.execPath, [${JSON.stringify(KNIP)}, ...args], { stdio: 'inherit' });`,
      'process.exit(r.status ?? 1);',
      '',
    ].join('\n')
  );
  chmodSync(knip, 0o755);
}

// Each file is written at its path; a file given as null is left out of the repository. With
// `journal`, each run of knip is recorded in `appels`, in order.
export function codeMortEssai(
  racine: string,
  files: Record<string, string | null>,
  { journal = false }: { journal?: boolean } = {}
) {
  const dir = mkdtempSync(path.join(racine, 'code-mort-'));
  for (const [rel, text] of Object.entries(files)) {
    if (text === null) {
      continue;
    }
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  const fichierJournal = `${dir}.journal`;
  if (journal) {
    modulesJournal(dir, fichierJournal);
  } else {
    symlinkSync(MODULES, path.join(dir, 'node_modules'));
  }
  const r = spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
  const appels: AppelKnip[] = existsSync(fichierJournal)
    ? readFileSync(fichierJournal, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(l => JSON.parse(l) as AppelKnip)
    : [];
  return { dir, status: r.status, sortie: (r.stdout ?? '') + (r.stderr ?? ''), appels };
}
