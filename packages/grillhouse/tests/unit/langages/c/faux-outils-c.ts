import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The tests' stand-in for uv, clang-format and clang-tidy, first on the PATH, on the model of the
// fake cmake (./faux-cmake.ts): one script of Node laid under the three names, so that the tests
// of the module c's binaries and guards play without the real tools, whose case goes to the night
// (c.nuit.test.ts).
//
// - Each call is a line of JSON of the journal `FAUX_OUTILS_C_JOURNAL` names: `{ outil, args, cwd }`.
// - `<outil> --version`: `uv <FAUX_UV_VERSION> (faux)` (0.10.4 by default), `clang-format version
//   21.1.8`, `clang-tidy version 21.1.6`.
// - `uv tool list`: the tools `FAUX_UV_TOOLS` names (JSON: name → version), as uv prints them
//   (`<nom> v<version>` then `- <exécutable>`), « No tools installed » for none.
// - `uv tool install <spec>`: nothing; its code is `FAUX_UV_CODES` (JSON, `{ "tool install": n }`).
// - `clang-format … <fichier>…`: each file of the arguments that holds the word NONCONFORME is
//   reported on the error stream as clang-format 21 does (`<fichier>:1:1: error: code should be
//   clang-formatted [-Wclang-format-violations]`), and the code is 1 when any is.
// - `clang-tidy …`: writes on its standard output the text of the file `FAUX_CLANG_TIDY_SORTIE`
//   names, on its error stream `FAUX_CLANG_TIDY_ERREUR`; its code is `FAUX_CLANG_TIDY_CODE`, 0
//   by default.
const SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const outil = path.basename(process.argv[1]);
const args = process.argv.slice(2);
if (process.env.FAUX_OUTILS_C_JOURNAL) {
  fs.appendFileSync(process.env.FAUX_OUTILS_C_JOURNAL, JSON.stringify({ outil, args, cwd: process.cwd() }) + '\\n');
}
if (args[0] === '--version') {
  if (outil === 'uv') {
    if (process.env.FAUX_UV_ABSENT) process.exit(2);
    process.stdout.write('uv ' + (process.env.FAUX_UV_VERSION || '0.10.4') + ' (faux)\\n');
  } else {
    process.stdout.write(outil + ' version ' + (outil === 'clang-format' ? '21.1.8' : '21.1.6') + '\\n');
  }
  process.exit(0);
}
if (outil === 'uv') {
  const codes = JSON.parse(process.env.FAUX_UV_CODES || '{}');
  const sous = args.slice(0, 2).join(' ');
  if (sous === 'tool list') {
    const outils = Object.entries(JSON.parse(process.env.FAUX_UV_TOOLS || '{}'));
    process.stdout.write(outils.length ? outils.map(([n, v]) => n + ' v' + v + '\\n- ' + n + '\\n').join('') : 'No tools installed\\n');
  }
  process.exit(codes[sous] ?? 0);
}
if (outil === 'clang-format') {
  let code = 0;
  for (const a of args.filter(x => !x.startsWith('-'))) {
    if (fs.existsSync(a) && fs.statSync(a).isFile() && fs.readFileSync(a, 'utf8').includes('NONCONFORME')) {
      process.stderr.write(a + ':1:1: error: code should be clang-formatted [-Wclang-format-violations]\\n');
      code = 1;
    }
  }
  process.exit(code);
}
if (process.env.FAUX_CLANG_TIDY_SORTIE) process.stdout.write(fs.readFileSync(process.env.FAUX_CLANG_TIDY_SORTIE, 'utf8'));
if (process.env.FAUX_CLANG_TIDY_ERREUR) process.stderr.write(process.env.FAUX_CLANG_TIDY_ERREUR + '\\n');
process.exit(Number(process.env.FAUX_CLANG_TIDY_CODE || 0));
`;

/**
 * Writes the fake uv, clang-format and clang-tidy in a new directory under <dans>, and returns
 * that directory; <sans> names the tools the directory leaves out.
 */
export function installerFauxOutilsC(
  dans: string,
  sans: ('uv' | 'clang-format' | 'clang-tidy')[] = []
): string {
  const dossier = mkdtempSync(path.join(dans, 'faux-outils-c-'));
  for (const outil of ['uv', 'clang-format', 'clang-tidy'].filter(
    o => !sans.includes(o as never)
  )) {
    // The shebang names this Node, so that a PATH reduced to the fakes still runs them.
    writeFileSync(
      path.join(dossier, outil),
      SCRIPT.replace('#!/usr/bin/env node', `#!${process.execPath}`)
    );
    chmodSync(path.join(dossier, outil), 0o755);
  }
  return dossier;
}
