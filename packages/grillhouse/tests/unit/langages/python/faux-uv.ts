import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { poserLeFauxProgramme } from '../../faux-programme.js';

// The tests' stand-in for uv, first on the PATH (grillhouse-ziy, criterion 7), on the model of the
// fake cargo (../cargo/faux-cargo.ts): a script of Node named `uv`, so that the tests of the
// module python play without the real tool, whose case goes to the night (python.nuit.test.ts).
//
// - Each call is a line of JSON of the journal `FAUX_UV_JOURNAL` names: `{ args, cwd, pycache,
//   venv, cache, tmpdir }`, its arguments, its working directory, its PYTHONPYCACHEPREFIX, its
//   UV_PROJECT_ENVIRONMENT, its UV_CACHE_DIR and its TMPDIR.
// - `uv --version`: `uv <FAUX_UV_VERSION> (faux)`, 0.10.4 by default; under `FAUX_UV_ABSENT`, it
//   fails (code 2).
// - `uv run … <pytest> …`, the program named `pytest` or a path to a file of that name. By a path,
//   it plays that file as the real uv does: missing under UV_PROJECT_ENVIRONMENT, it is first laid
//   there, as the sync of `uv run` lays it, except under `FAUX_UV_SANS_PYTEST` (an environment
//   without it); still missing, or its shebang naming an interpreter that does not exist, the call
//   fails (code 2, « Failed to spawn »). By its name alone it always plays, as the `pytest` of the
//   PATH uv falls back to. `lancePytest(args)` tells such a call.
// - Its test files are those of the paths named after the program, else of its
//   working directory, as pytest 9 collects them (measured): a folder gives every `test_*.py` and
//   `*_test.py` under it, those an `--ignore-glob=*_nuit_test.py` names left out; a file named
//   plays even when an `--ignore-glob` names it, as pytest never ignores a path named, unless a
//   folder named holds it, through which pytest collects it, the `--ignore-glob` applied; with `--junit-xml=<f>`, it writes there a JUnit report of the family xunit1, one
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
  fs.appendFileSync(process.env.FAUX_UV_JOURNAL, JSON.stringify({ args, cwd, pycache: process.env.PYTHONPYCACHEPREFIX ?? null, venv: process.env.UV_PROJECT_ENVIRONMENT ?? null, cache: process.env.UV_CACHE_DIR ?? null, tmpdir: process.env.TMPDIR ?? null }) + '\\n');
}
if (args[0] === '--version') {
  if (process.env.FAUX_UV_ABSENT) process.exit(2);
  process.stdout.write('uv ' + (process.env.FAUX_UV_VERSION || '0.10.4') + ' (faux)\\n');
  process.exit(0);
}
const programme = args.findIndex(a => path.basename(a) === 'pytest');
const sous = programme >= 0 ? 'pytest' : args.includes('compileall') ? 'compileall' : args[0];
const codes = JSON.parse(process.env.FAUX_UV_CODES || '{}');
const code = codes[sous + ' ' + path.basename(cwd)] ?? codes[sous] ?? 0;
if (sous === 'pytest') {
  if (args[programme] !== 'pytest') {
    const f = path.resolve(cwd, args[programme]);
    const venv = process.env.UV_PROJECT_ENVIRONMENT;
    if (!fs.existsSync(f) && !process.env.FAUX_UV_SANS_PYTEST && venv && f === path.join(venv, 'bin', 'pytest')) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, '#!/bin/sh\\n', { mode: 0o755 });
    }
    const shebang = fs.existsSync(f) ? /^#!\\s*(\\S+)/.exec(fs.readFileSync(f, 'utf8')) : null;
    if (!shebang || !fs.existsSync(shebang[1])) {
      process.stderr.write('error: Failed to spawn: ' + args[programme] + '\\n');
      process.exit(2);
    }
  }
  const apres = args.slice(programme + 1);
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
  const ignore = f => ignores.some(g => path.matchesGlob(path.basename(f), g));
  const dossiers = (nommes.length ? nommes : ['.']).filter(n => fs.existsSync(path.join(cwd, n)) && fs.statSync(path.join(cwd, n)).isDirectory());
  const dans = (f, d) => !path.relative(d, f).startsWith('..');
  const fichiers = [...new Set([
    ...dossiers.flatMap(d => tous(path.join(cwd, d))).filter(f => !ignore(f)),
    ...nommes.filter(n => !dossiers.includes(n) && !dossiers.some(d => dans(n, d))).map(n => path.normalize(n)),
  ])];
  if (junit) {
    const cas = f => '<testcase classname="x" name="essai" file="' + f + '" line="1">' + (code === 0 ? '' : '<failure message="rouge &amp; faux">rouge</failure>') + '</testcase>';
    fs.mkdirSync(path.dirname(junit), { recursive: true });
    fs.writeFileSync(junit, '<?xml version="1.0"?><testsuites><testsuite name="pytest">' + fichiers.map(cas).join('') + '</testsuite></testsuites>');
  }
  if (process.env.FAUX_UV_RESTE) fs.writeFileSync(path.join(process.env.TMPDIR, process.env.FAUX_UV_RESTE), '');
}
process.exit(code);
`;

/** Whether the call of arguments <args> plays pytest, by its name or by a path to it. */
export const lancePytest = (args: string[]) => args.some(a => path.basename(a) === 'pytest');

/** Writes the fake uv in a new directory under <dans>, and returns that directory. */
export function installerFauxUv(dans: string): string {
  const dossier = mkdtempSync(path.join(dans, 'faux-uv-'));
  poserLeFauxProgramme(path.join(dossier, 'uv'), SCRIPT);
  return dossier;
}
