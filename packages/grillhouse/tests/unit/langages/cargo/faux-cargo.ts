import { appendFileSync, chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The tests' stand-in for cargo, first on the PATH (grillhouse-pkl.3), on the model of the fake
// Turborepo of integration-essai.ts: a script of Node named `cargo`, so that the tests of the
// module cargo play without the real tool, whose cases go to the night
// (cargo.nuit.test.ts).
//
// - `cargo metadata`: what cargo answers with `--no-deps`, read from the manifests of the
//   working directory in the subset of TOML the trials of scripts/langages/cargo/exemples.mjs
//   write (tables, strings, booleans, arrays of strings, inline tables, dotted keys): the members
//   of `[workspace]` (a pattern `dir/*` included) and the root's `[package]`; each crate's
//   dependencies of each kind, by its path or by the workspace's; its targets, the library
//   (`src/lib.rs`), the binary (`src/main.rs`) and each test (`tests/<nom>.rs`); its
//   `[package.metadata]`; the workspace's `[workspace.metadata]`, as `metadata` (grillhouse-pkl.6).
// - `cargo clippy …`: prints the file `FAUX_CARGO_CLIPPY` names, the JSON lines of a recorded run
//   of clippy, nothing without it (grillhouse-pkl.6).
// - `cargo nextest run -p <crate> [--test <nom>]…`: writes the JUnit report of the profile
//   `grillhouse` under `target/nextest/grillhouse/junit.xml`, one suite per test binary of the
//   crate (the library, each test target or the ones named), one test `essai` each, failed when
//   its code is not 0.
// - `cargo install --list`: the binaries `FAUX_CARGO_INSTALLES` names (JSON, a version by name),
//   in cargo's form, `<nom> v<version>:` then the binary, indented (grillhouse-pkl.7); it reads
//   no manifest, as cargo's own, and plays in a directory without Cargo.toml.
// - `cargo nextest …` under `FAUX_CARGO_TEMPORAIRE` writes there its temporary directories
//   (TMPDIR, TMP, TEMP, JSON); under `FAUX_CARGO_RESTE`, leaves a file of that name in its TMPDIR,
//   as a test that forgets its file; under `FAUX_CARGO_ATTENDRE`, waits that many ms, as a long
//   test (grillhouse-nt4).
// - Each call is a line of the journal `FAUX_CARGO_JOURNAL` names (its arguments, joined by a
//   blank); its code is the one `FAUX_CARGO_CODES` gives (JSON, by `<sous-commande> <crate>` or
//   `<sous-commande>`), 0 otherwise.
const SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (process.env.FAUX_CARGO_JOURNAL) fs.appendFileSync(process.env.FAUX_CARGO_JOURNAL, args.join(' ') + '\\n');
const codes = JSON.parse(process.env.FAUX_CARGO_CODES || '{}');
const valeur = v => {
  v = v.trim();
  if (v.startsWith('{')) {
    const o = {};
    for (const kv of v.slice(1, -1).split(',')) {
      const m = /^\\s*([\\w.-]+)\\s*=\\s*(.+)$/.exec(kv);
      if (m) o[m[1]] = valeur(m[2]);
    }
    return o;
  }
  return JSON.parse(v);
};
const toml = texte => {
  const racine = {};
  let t = racine;
  for (let l of texte.split('\\n')) {
    l = l.replace(/#.*$/, '').trim();
    if (!l) continue;
    const s = /^\\[([^\\]]+)\\]$/.exec(l);
    if (s) {
      t = racine;
      for (const k of s[1].split('.')) t = t[k.trim()] ??= {};
      continue;
    }
    const kv = /^([\\w.-]+)\\s*=\\s*(.+)$/.exec(l);
    if (!kv) continue;
    const cles = kv[1].split('.');
    let o = t;
    for (const k of cles.slice(0, -1)) o = o[k] ??= {};
    o[cles.at(-1)] = valeur(kv[2]);
  }
  return racine;
};
const racine = process.cwd();
const lire = d => toml(fs.readFileSync(path.join(d, 'Cargo.toml'), 'utf8'));
const tete = fs.existsSync(path.join(racine, 'Cargo.toml')) ? lire(racine) : {};
const dossiers = [];
if (tete.package) dossiers.push(racine);
for (const m of tete.workspace?.members ?? []) {
  if (m.endsWith('/*')) {
    const base = path.join(racine, m.slice(0, -2));
    for (const n of fs.readdirSync(base).sort()) {
      if (fs.existsSync(path.join(base, n, 'Cargo.toml'))) dossiers.push(path.join(base, n));
    }
  } else if (m !== '.') dossiers.push(path.join(racine, m));
}
const crate = d => {
  const m = lire(d);
  const deps = [];
  for (const [table, kind] of [['dependencies', null], ['dev-dependencies', 'dev'], ['build-dependencies', 'build']]) {
    for (const [nom, v] of Object.entries(m[table] ?? {})) {
      const duTout = v && v.workspace === true;
      const w = duTout ? tete.workspace?.dependencies?.[nom] : v;
      const p = w && typeof w === 'object' && w.path ? path.resolve(duTout ? racine : d, w.path) : undefined;
      deps.push({ name: nom, kind, path: p, rename: null });
    }
  }
  const targets = [];
  const src = f => path.join(d, f);
  if (fs.existsSync(src('src/lib.rs'))) targets.push({ kind: ['lib'], name: m.package.name.replace(/-/g, '_'), src_path: src('src/lib.rs'), doctest: true });
  if (fs.existsSync(src('src/main.rs'))) targets.push({ kind: ['bin'], name: m.package.name, src_path: src('src/main.rs'), doctest: false });
  if (fs.existsSync(src('tests'))) {
    for (const f of fs.readdirSync(src('tests')).sort()) {
      if (f.endsWith('.rs')) targets.push({ kind: ['test'], name: f.slice(0, -3), src_path: src('tests/' + f), doctest: false });
    }
  }
  return {
    name: m.package.name,
    id: 'path+file://' + d + '#' + m.package.name + '@0.1.0',
    manifest_path: path.join(d, 'Cargo.toml'),
    dependencies: deps,
    targets,
    metadata: m.package.metadata ?? null,
  };
};
const sous = args[0] === 'nextest' ? 'nextest' : args[0];
const nomme = args[args.indexOf('-p') + 1];
const code = codes[sous + ' ' + nomme] ?? codes[sous] ?? 0;
if (sous === 'nextest' && process.env.FAUX_CARGO_TEMPORAIRE) {
  const { TMPDIR, TMP, TEMP } = process.env;
  fs.writeFileSync(process.env.FAUX_CARGO_TEMPORAIRE, JSON.stringify({ TMPDIR, TMP, TEMP }));
}
if (sous === 'nextest' && process.env.FAUX_CARGO_RESTE) {
  fs.writeFileSync(path.join(process.env.TMPDIR, process.env.FAUX_CARGO_RESTE), '');
}
if (sous === 'nextest' && process.env.FAUX_CARGO_ATTENDRE) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.FAUX_CARGO_ATTENDRE));
}
if (sous === 'metadata') {
  const packages = dossiers.map(crate);
  process.stdout.write(JSON.stringify({
    packages,
    workspace_members: packages.map(p => p.id),
    workspace_root: racine,
    target_directory: path.join(racine, 'target'),
    metadata: tete.workspace?.metadata ?? null,
    resolve: null,
    version: 1,
  }));
}
if (sous === 'install' && args.includes('--list')) {
  for (const [n, v] of Object.entries(JSON.parse(process.env.FAUX_CARGO_INSTALLES || '{}'))) {
    process.stdout.write(n + ' v' + v + ':\\n    ' + n + '\\n');
  }
}
if (sous === 'clippy' && process.env.FAUX_CARGO_CLIPPY) {
  process.stdout.write(fs.readFileSync(process.env.FAUX_CARGO_CLIPPY, 'utf8'));
}
if (sous === 'nextest') {
  const c = dossiers.map(crate).find(p => p.name === nomme);
  const tests = args.flatMap((a, i) => (a === '--test' ? [args[i + 1]] : []));
  const binaires = c.targets
    .filter(t => (tests.length ? t.kind[0] === 'test' && tests.includes(t.name) : ['lib', 'test'].includes(t.kind[0])))
    .map(t => (t.kind[0] === 'lib' ? c.name : c.name + '::' + t.name));
  const cas = code === 0 ? '<testcase name="essai"/>' : '<testcase name="essai"><failure message="rouge &amp; faux">rouge</failure></testcase>';
  const xml = '<?xml version="1.0"?><testsuites>' + binaires.map(b => '<testsuite name="' + b + '">' + cas + '</testsuite>').join('') + '</testsuites>';
  const j = path.join(racine, 'target', 'nextest', 'grillhouse');
  fs.mkdirSync(j, { recursive: true });
  fs.writeFileSync(path.join(j, 'junit.xml'), xml);
}
process.exit(code);
`;

/**
 * Writes the fake cargo in a new directory under <dans>, and returns that directory, to put first
 * on the PATH.
 */
export function installerFauxCargo(dans: string): string {
  const dossier = mkdtempSync(path.join(dans, 'faux-cargo-'));
  writeFileSync(path.join(dossier, 'cargo'), SCRIPT);
  chmodSync(path.join(dossier, 'cargo'), 0o755);
  return dossier;
}

/**
 * Puts the fake cargo of <dossier> first on the PATH of this process, its journal at <journal>
 * and no code; returns what restores the environment.
 */
export function avecFauxCargo(dossier: string, journal: string): () => void {
  const avant = {
    PATH: process.env.PATH,
    FAUX_CARGO_JOURNAL: process.env.FAUX_CARGO_JOURNAL,
    FAUX_CARGO_CODES: process.env.FAUX_CARGO_CODES,
    FAUX_CARGO_CLIPPY: process.env.FAUX_CARGO_CLIPPY,
    FAUX_CARGO_INSTALLES: process.env.FAUX_CARGO_INSTALLES,
  };
  process.env.PATH = `${dossier}${path.delimiter}${process.env.PATH ?? ''}`;
  process.env.FAUX_CARGO_JOURNAL = journal;
  delete process.env.FAUX_CARGO_CODES;
  delete process.env.FAUX_CARGO_CLIPPY;
  delete process.env.FAUX_CARGO_INSTALLES;
  appendFileSync(journal, '');
  return () => {
    for (const [k, v] of Object.entries(avant)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  };
}
