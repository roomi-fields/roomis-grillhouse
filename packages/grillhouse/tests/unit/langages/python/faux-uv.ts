import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The tests' stand-in for uv, first on the PATH (grillhouse-ziy, criterion 7), on the model of the
// fake cargo (../cargo/faux-cargo.ts): a script of Node named `uv`, so that the tests of the
// module python play without the real tool, whose case goes to the night (python.nuit.test.ts).
//
// - Each call is a line of JSON of the journal `FAUX_UV_JOURNAL` names: `{ args, cwd, pycache,
//   venv, tmpdir }`, its arguments, its working directory, its PYTHONPYCACHEPREFIX, its
//   UV_PROJECT_ENVIRONMENT and its TMPDIR.
// - `uv --version`: `uv <FAUX_UV_VERSION> (faux)`, 0.10.4 by default; under `FAUX_UV_ABSENT`, it
//   fails (code 2).
// - `uv run … pytest …`: the test files are the paths named after `pytest`, else every `test_*.py`
//   and `*_test.py` under its working directory, those an `--ignore-glob=*_nuit_test.py` names
//   left out; with `--junit-xml=<f>`, it writes there a JUnit report of the family xunit1, one
//   `testcase` « essai » per file, its `file` from the working directory, failed when its code is
//   not 0. Under `FAUX_UV_RESTE`, it leaves a file of that name in its TMPDIR, as a test that
//   forgets its file.
// - Its code is the one `FAUX_UV_CODES` gives (JSON, by `<sous-commande> <dossier>` or
//   `<sous-commande>`, the sub-command `pytest`, `compileall`, `sync`, the folder the basename of
//   its working directory), 0 otherwise.
const SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const cwd = process.cwd();
if (process.env.FAUX_UV_JOURNAL) {
  fs.appendFileSync(process.env.FAUX_UV_JOURNAL, JSON.stringify({ args, cwd, pycache: process.env.PYTHONPYCACHEPREFIX ?? null, venv: process.env.UV_PROJECT_ENVIRONMENT ?? null, tmpdir: process.env.TMPDIR ?? null }) + '\\n');
}
if (args[0] === '--version') {
  if (process.env.FAUX_UV_ABSENT) process.exit(2);
  process.stdout.write('uv ' + (process.env.FAUX_UV_VERSION || '0.10.4') + ' (faux)\\n');
  process.exit(0);
}
const sous = args.includes('pytest') ? 'pytest' : args.includes('compileall') ? 'compileall' : args[0];
const codes = JSON.parse(process.env.FAUX_UV_CODES || '{}');
const code = codes[sous + ' ' + path.basename(cwd)] ?? codes[sous] ?? 0;
if (sous === 'pytest') {
  const apres = args.slice(args.indexOf('pytest') + 1);
  const nommes = [];
  let junit = null;
  const ignores = [];
  for (let i = 0; i < apres.length; i++) {
    const a = apres[i];
    if (a === '-o') { i++; continue; }
    if (a.startsWith('--junit-xml=')) { junit = a.slice(12); continue; }
    if (a.startsWith('--ignore-glob=')) { ignores.push(a.slice(14)); continue; }
    if (!a.startsWith('-')) nommes.push(a);
  }
  const estTest = n => /^test_.*\\.py$|_test\\.py$/.test(n);
  const tous = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const f = path.join(d, e.name);
    if (e.isDirectory()) return e.name.startsWith('.') ? [] : tous(f);
    return estTest(e.name) ? [path.relative(cwd, f)] : [];
  });
  const fichiers = nommes.length
    ? nommes
    : tous(cwd).filter(f => !ignores.some(g => path.matchesGlob(path.basename(f), g)));
  if (junit) {
    const cas = f => '<testcase classname="x" name="essai" file="' + f + '" line="1">' + (code === 0 ? '' : '<failure message="rouge &amp; faux">rouge</failure>') + '</testcase>';
    fs.mkdirSync(path.dirname(junit), { recursive: true });
    fs.writeFileSync(junit, '<?xml version="1.0"?><testsuites><testsuite name="pytest">' + fichiers.map(cas).join('') + '</testsuite></testsuites>');
  }
  if (process.env.FAUX_UV_RESTE) fs.writeFileSync(path.join(process.env.TMPDIR, process.env.FAUX_UV_RESTE), '');
}
process.exit(code);
`;

/** Writes the fake uv in a new directory under <dans>, and returns that directory. */
export function installerFauxUv(dans: string): string {
  const dossier = mkdtempSync(path.join(dans, 'faux-uv-'));
  writeFileSync(path.join(dossier, 'uv'), SCRIPT);
  chmodSync(path.join(dossier, 'uv'), 0o755);
  return dossier;
}
