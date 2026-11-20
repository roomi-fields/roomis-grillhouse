#!/usr/bin/env node
// The guard clang-format of the module c: every .c and .h of each package conforms to the
// .clang-format of the package, without debt (a finding refuses, never inscribed).
//
//   node clang-format.mjs     in the root of the project; 0 green, 1 a finding refused
//
// - It runs `clang-format --dry-run --Werror <fichiers>` per package, from the root, the style
//   being the package's `.clang-format` (clang-format finds it from the file); each file it names
//   as `<fichier>:<ligne>:<colonne>: error:` is a finding, named by its path from the root.
// - A clang-format absent from the PATH, or a package without .clang-format, refuses in one line,
//   the tool never run; clang-format red without a finding refuses, its last line named.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { composants } from './composants.mjs';
import { fichiersC, manque } from './clang.mjs';

export const GARDE = 'clang-format';
const CONFIGURATION = '.clang-format';

/** Runs the guard in the project at <racine>: its exit code, its refusals printed. */
export function commande(racine, { env = process.env } = {}) {
  const lignes = [];
  for (const c of composants(racine)) {
    const ligne = manque(['clang-format'], c.dossier, CONFIGURATION, env);
    if (ligne) {
      lignes.push(ligne);
      break;
    }
    const fichiers = fichiersC(racine, c.dossier, true);
    if (fichiers.length === 0) {
      continue;
    }
    const r = spawnSync(GARDE, ['--dry-run', '--Werror', ...fichiers], {
      cwd: racine,
      env,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const trouves = [
      ...new Set(
        [...(r.stderr ?? '').matchAll(/^(.+?):(\d+):\d+: error: (.*)$/gm)].map(
          ([, f, l, m]) => `⛔ clang-format : ${path.relative(racine, path.resolve(racine, f))}:${l} — ${m}`
        )
      ),
    ];
    if (trouves.length > 0) {
      lignes.push(...trouves);
    } else if (r.error || r.status !== 0) {
      const fin = r.error?.message ?? (r.stderr ?? '').trim().split('\n').at(-1) ?? '';
      lignes.push(`⛔ clang-format rouge (code ${r.status ?? r.signal}) : ${fin}`);
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
