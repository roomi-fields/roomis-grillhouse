#!/usr/bin/env node
// The guard clippy of the module cargo: the lints of clippy on every target of the workspace,
// each a finding the project's debt counts (../../dette.mjs), as the module typescript's guards.
//
//   node clippy.mjs     in the root of the workspace; 0 green, 1 a finding refused
//
// - It runs `cargo clippy --all-targets --message-format=json -- -D warnings`: every target, the
//   tests of `tests/` included, which clippy reads only with `--all-targets`; every warning denied;
//   rustc wrapped by sccache, as every command of the module that compiles (./sccache.mjs); a
//   PATH without sccache refuses before cargo runs, the line naming `npx grillhouse maj`.
// - Each diagnostic of the compiler that carries a code is a finding: its file, the primary span's
//   from the root, its line, its message the compiler's. A lint (`clippy::needless_return`, a lint
//   of rustc such as `unused_variables`) is its rule, which the debt keys; an error of compilation
//   (`E0308`) carries none: it refuses, named, never inscribed. A message without code
//   (« aborting due to … ») and a line that is no diagnostic are not read. The same diagnostic
//   found by two targets (the library and its tests) counts once, as cargo prints it once.
// - The findings are judged by the debt, keyed by file and lint (`GRILLHOUSE_DETTE=inscrire`
//   writes them, a lint more refuses, a lint less is pruned), and written in SARIF under the
//   results directory (../../resultats.mjs). Clippy red without any diagnostic (a manifest cargo
//   cannot read, a missing tool) refuses, named, never inscribed.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MODE, trancher } from '../../dette.mjs';
import { avecSccache, sccacheAbsent } from './sccache.mjs';

export const GARDE = 'clippy';
export const ARGS = ['clippy', '--all-targets', '--message-format=json', '--', '-D', 'warnings'];

// The code of an error of compilation, which is no lint.
const ERREUR = /^E\d{4}$/;

const lireLigne = l => {
  try {
    return JSON.parse(l);
  } catch {
    return null;
  }
};

/**
 * The findings of the output <sortie> of `cargo clippy --message-format=json` in the workspace at
 * <racine>, in their order: each `{ fichier, ligne, regle, message }`.
 * @param {string} sortie the JSON lines cargo printed
 * @param {string} racine the root of the workspace
 */
export function constatsDeClippy(sortie, racine) {
  const vus = new Set();
  const out = [];
  for (const l of sortie.split('\n')) {
    const m = lireLigne(l.trim());
    const d = m?.reason === 'compiler-message' ? m.message : null;
    if (!d?.code?.code) {
      continue;
    }
    const span = d.spans?.find(s => s.is_primary) ?? d.spans?.[0];
    const fichier = span
      ? path.relative(racine, path.resolve(racine, span.file_name)).split(path.sep).join('/')
      : undefined;
    const c = {
      ...(fichier ? { fichier } : {}),
      ...(span ? { ligne: span.line_start } : {}),
      ...(ERREUR.test(d.code.code) ? {} : { regle: d.code.code }),
      message: `${d.code.code} : ${d.message}`,
    };
    const cle = JSON.stringify([c.fichier, c.ligne, span?.column_start, c.message]);
    if (vus.has(cle)) {
      continue;
    }
    vus.add(cle);
    out.push(c);
  }
  return out;
}

/**
 * Runs the guard in the workspace at <racine>: its exit code, its refusals printed.
 * @param {string} racine the root of the workspace
 * @param {{ env?: NodeJS.ProcessEnv }} [o] the environment (the results directory, the debt's mode)
 */
export function commande(racine, { env = process.env } = {}) {
  const absent = sccacheAbsent(racine, env);
  if (absent) {
    process.stderr.write(`${absent}\n`);
    return 1;
  }
  const r = spawnSync('cargo', ARGS, {
    cwd: racine,
    env: avecSccache(racine, env),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const constats = r.error ? [] : constatsDeClippy(r.stdout ?? '', racine);
  if (r.error || (r.status !== 0 && constats.length === 0)) {
    const fin = r.error?.message ?? (r.stderr ?? '').trim().split('\n').at(-1) ?? '';
    constats.push({ message: `cargo clippy rouge (code ${r.status ?? r.signal}) : ${fin}` });
  }
  const { refus, lignes } = trancher(racine, GARDE, constats, env[MODE] || undefined, env);
  for (const c of refus) {
    const lieu = c.fichier ? `${c.fichier}${c.ligne ? `:${c.ligne}` : ''} — ` : '';
    process.stderr.write(`⛔ clippy : ${lieu}${c.message}\n`);
  }
  for (const l of lignes) {
    process.stderr.write(`${l}\n`);
  }
  return refus.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = commande(process.cwd());
}
