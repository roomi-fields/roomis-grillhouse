import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The tests' stand-in for cmake and ctest, first on the PATH, on the model of the fake uv
// (../python/faux-uv.ts): one script of Node, laid under the two names, so that the tests of the
// module c play without the real tools, whose case goes to the night (c.nuit.test.ts).
//
// - Each call is a line of JSON of the journal `FAUX_CMAKE_JOURNAL` names: `{ outil, args, cwd,
//   tmpdir, junit }`, the tool, its arguments, its working directory, its TMPDIR and, for a ctest
//   that wrote one, the text of the JUnit report it wrote.
// - `cmake --version`: `cmake version 4.2.3`; likewise `ctest --version`.
// - `cmake -S <source> -B <build> …` (the configuration): creates <build> and its
//   `CMakeCache.txt`, and registers the tests CTest will know: one per `tests/test_*.c` of
//   <source>, named without its extension, as the `tests/CMakeLists.txt` of the skeleton does
//   (`file(GLOB … CONFIGURE_DEPENDS)`); under `FAUX_CMAKE_SANS_TESTS` it registers none, as a
//   `tests/CMakeLists.txt` edited by hand to take no file. The registered tests are in
//   `<build>/enregistres.json`.
// - `cmake --build <build> …`: nothing; red, it writes on its error stream a line of the compiler.
// - `ctest --test-dir <build> [-R <regex>] [--no-tests=error] [--output-junit <f>] …`: plays the
//   registered tests the regex keeps (all without one), writes the JUnit report of ctest 4.2
//   (measured: a `testsuite`, a `testcase` by test, `status="fail"` with `<failure
//   message="Failed"/>` and the output of the test in `<system-out>`), and ends with code 8 when a
//   test fails, or when none is kept under `--no-tests=error`, 0 otherwise.
// - A test fails when `FAUX_CTEST_ECHECS` (JSON: test name → its output) names it.
// - The code of `cmake` is `FAUX_CMAKE_CODES` (JSON, by `configure` or `build`), 0 otherwise.
const SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const outil = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const cwd = process.cwd();
const journal = (junit) => {
  if (process.env.FAUX_CMAKE_JOURNAL) {
    fs.appendFileSync(process.env.FAUX_CMAKE_JOURNAL, JSON.stringify({ outil, args, cwd, tmpdir: process.env.TMPDIR ?? null, junit: junit ?? null }) + '\\n');
  }
};
const apres = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : null; };
if (args[0] === '--version') {
  journal();
  process.stdout.write(outil + ' version 4.2.3\\n');
  process.exit(0);
}
if (outil === 'cmake') {
  journal();
  const codes = JSON.parse(process.env.FAUX_CMAKE_CODES || '{}');
  const source = apres('-S');
  const build = apres('-B');
  if (source !== null && build !== null) {
    const s = path.resolve(cwd, source);
    const b = path.resolve(cwd, build);
    fs.mkdirSync(b, { recursive: true });
    fs.writeFileSync(path.join(b, 'CMakeCache.txt'), '');
    const dossier = path.join(s, 'tests');
    const tests = process.env.FAUX_CMAKE_SANS_TESTS || !fs.existsSync(dossier)
      ? []
      : fs.readdirSync(dossier).filter(n => /^test_.*\\.c$/.test(n)).map(n => n.slice(0, -2)).sort();
    fs.writeFileSync(path.join(b, 'enregistres.json'), JSON.stringify(tests));
    process.exit(codes.configure ?? 0);
  }
  if (args[0] === '--build') {
    const code = codes.build ?? 0;
    if (code !== 0) process.stderr.write('src/x.c:1:1: error: unknown type name \\'faux\\'\\n');
    process.exit(code);
  }
  process.exit(0);
}
// ctest
const b = path.resolve(cwd, apres('--test-dir') ?? '.');
const regex = apres('-R') ?? apres('--tests-regex');
const junitFichier = apres('--output-junit');
const enregistres = JSON.parse(fs.readFileSync(path.join(b, 'enregistres.json'), 'utf8'));
const gardes = regex === null ? enregistres : enregistres.filter(n => new RegExp(regex).test(n));
const echecs = JSON.parse(process.env.FAUX_CTEST_ECHECS || '{}');
const cas = gardes.map(n => {
  const sortie = Object.hasOwn(echecs, n) ? echecs[n] : '';
  return Object.hasOwn(echecs, n)
    ? '\\t<testcase name="' + n + '" classname="' + n + '" time="0.001" status="fail">\\n\\t\\t<failure message="Failed"/>\\n\\t\\t<properties/>\\n\\t\\t<system-out>' + sortie.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '\\n</system-out>\\n\\t</testcase>\\n'
    : '\\t<testcase name="' + n + '" classname="' + n + '" time="0.001" status="run">\\n\\t\\t<properties/>\\n\\t\\t<system-out></system-out>\\n\\t</testcase>\\n';
});
const nEchecs = gardes.filter(n => Object.hasOwn(echecs, n)).length;
let junit = null;
if (junitFichier) {
  junit = '<?xml version="1.0" encoding="UTF-8"?>\\n<testsuite name="(empty)" tests="' + gardes.length + '" failures="' + nEchecs + '" disabled="0" skipped="0">\\n' + cas.join('') + '</testsuite>\\n';
  fs.mkdirSync(path.dirname(path.resolve(cwd, junitFichier)), { recursive: true });
  fs.writeFileSync(path.resolve(cwd, junitFichier), junit);
}
journal(junit);
if (gardes.length === 0) {
  process.stdout.write('No tests were found!!!\\n');
  process.exit(args.includes('--no-tests=error') ? 8 : 0);
}
process.exit(nEchecs ? 8 : 0);
`;

/**
 * Writes the fake cmake and ctest in a new directory under <dans>, and returns that directory;
 * <sans> names a tool the directory leaves out.
 */
export function installerFauxCmake(dans: string, sans: 'cmake' | 'ctest' | null = null): string {
  const dossier = mkdtempSync(path.join(dans, 'faux-cmake-'));
  for (const outil of ['cmake', 'ctest'].filter(o => o !== sans)) {
    writeFileSync(path.join(dossier, outil), SCRIPT);
    chmodSync(path.join(dossier, outil), 0o755);
  }
  return dossier;
}
