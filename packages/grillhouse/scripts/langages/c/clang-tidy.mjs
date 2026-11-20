#!/usr/bin/env node
// The guard clang-tidy of the module c: the lint of clang-tidy on each package, without debt (a
// finding refuses, never inscribed).
//
//   node clang-tidy.mjs     in the root of the project; 0 green, 1 a finding refused
//
// - Each package is configured by `cmake -S <paquet> -B .build-cmake/<paquet>
//   -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`, the directory `construire` and `tests-du-paquet` use
//   (./commandes.mjs: one configuration), then clang-tidy plays on its compile_commands.json
//   (`-p`), on the `.c` files of the package, its `.clang-tidy` read from there.
// - Each warning and each error `<fichier>:<ligne>:<colonne>: <gravité>: <message> [<règle>]` of
//   its standard output is a finding: its file from the root, its line, its rule; a note is none.
// - A cmake or a clang-tidy absent from the PATH, or a package without .clang-tidy, refuses in one
//   line, the tool never run; a configuration that fails is refused with the code of cmake, never
//   as a finding; clang-tidy red without a finding refuses, its error stream named.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONSTRUCTION, pourLOutil } from './commandes.mjs';
import { composants } from './composants.mjs';
import { fichiersC, manque } from './clang.mjs';

export const GARDE = 'clang-tidy';
const CONFIGURATION = '.clang-tidy';
const CMAKE = 'cmake';
const CONSTAT = /^(.+?):(\d+):\d+: (?:warning|error): (.*) \[([\w.,-]+)\]$/gm;

/**
 * The findings of the output <sortie> of clang-tidy: each `{ fichier, ligne, regle, message }`,
 * the file from <racine>.
 */
export function constatsDeClangTidy(sortie, racine) {
  const vus = new Set();
  const out = [];
  for (const [, f, ligne, message, regle] of sortie.matchAll(CONSTAT)) {
    const fichier = path.relative(racine, path.resolve(racine, f)).split(path.sep).join('/');
    const cle = `${fichier}:${ligne}:${regle}:${message}`;
    if (!vus.has(cle)) {
      vus.add(cle);
      out.push({ fichier, ligne: Number(ligne), regle, message });
    }
  }
  return out;
}

/** Runs the guard in the project at <racine>: its exit code, its refusals printed. */
export function commande(racine, { env = process.env } = {}) {
  const lignes = [];
  for (const c of composants(racine)) {
    const ligne = manque([CMAKE, GARDE], c.dossier, CONFIGURATION, env);
    if (ligne) {
      lignes.push(ligne);
      break;
    }
    const construction = path.join(racine, CONSTRUCTION, c.nom);
    const configure = spawnSync(
      CMAKE,
      ['-S', c.dossier, '-B', construction, '-DCMAKE_EXPORT_COMPILE_COMMANDS=ON'],
      { cwd: racine, env: pourLOutil(env), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    if (configure.error || configure.status !== 0) {
      const fin = configure.error?.message ?? (configure.stderr ?? '').trim().split('\n').at(-1);
      lignes.push(`⛔ cmake de ${c.nom} échoue (code ${configure.status ?? 127}) : ${fin ?? ''}`);
      continue;
    }
    const fichiers = fichiersC(racine, c.dossier, false);
    if (fichiers.length === 0) {
      continue;
    }
    const r = spawnSync(GARDE, ['-p', construction, '--quiet', ...fichiers], {
      cwd: racine,
      env: pourLOutil(env),
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    const constats = constatsDeClangTidy(r.stdout ?? '', racine);
    for (const k of constats) {
      lignes.push(`⛔ clang-tidy : ${k.fichier}:${k.ligne} — ${k.message} [${k.regle}]`);
    }
    if (constats.length === 0 && (r.error || r.status !== 0)) {
      const fin = r.error?.message ?? (r.stderr ?? '').trim().split('\n').at(-1) ?? '';
      lignes.push(`⛔ clang-tidy rouge (code ${r.status ?? r.signal}) : ${fin}`);
    }
  }
  for (const l of lignes) {
    process.stderr.write(`${l}\n`);
  }
  return lignes.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = commande(process.cwd());
}
