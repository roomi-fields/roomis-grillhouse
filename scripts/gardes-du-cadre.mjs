#!/usr/bin/env node
// `grillhouse:gardes`: the frame's guards, the one list of them, played in its order.
//
//   node scripts/gardes-du-cadre.mjs      (npm run grillhouse:gardes, a task of Turborepo)
//
// - Each guard plays, in the working directory, under the environment of the run
//   (`GRILLHOUSE_DETTE` among it, scripts/dette.mjs), whatever the verdict of the ones before: a
//   red does not stop the pass, as `--continue` does for Turborepo's tasks.
// - Each red guard is named with its code at the end; the exit code is 1 when one guard is red,
//   0 when all are green.
// - The build is not among them: Turborepo builds before this task (turbo.json).
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// The guards of the frame, each its script and its arguments, in the order they play.
export const GARDES_DU_CADRE = [
  ['scripts/turbo-des-paquets.mjs'],
  ['scripts/index-interfaces.mjs', '--verifier'],
  ['scripts/consommateurs.mjs'],
  ['scripts/frontieres.mjs'],
  ['scripts/interfaces-contre-code.mjs'],
  ['scripts/resumes.mjs'],
  ['scripts/code-mort.mjs'],
];

// Plays each guard of <gardes> in <racine> under <env>; its verdict, 0 or 1. `dire` writes a line.
export function jouerLesGardes({
  racine = process.cwd(),
  gardes = GARDES_DU_CADRE,
  env = process.env,
  dire = l => process.stdout.write(`${l}\n`),
}) {
  const rouges = [];
  for (const garde of gardes) {
    const r = spawnSync(process.execPath, garde, { cwd: racine, env, stdio: 'inherit' });
    if (r.status !== 0) rouges.push(`${garde.join(' ')} (code ${r.status ?? r.signal})`);
  }
  if (rouges.length === 0) return 0;
  for (const r of rouges) dire(`⛔ garde rouge : ${r}`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = jouerLesGardes({});
}
