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
// - While the run names its results directory (`GRILLHOUSE_RESULTATS`, scripts/resultats.mjs),
//   each guard writes its findings there in SARIF; a red guard that wrote no finding has one
//   written for it, without location, its name (its script's, without extension) and its code:
//   a red no reader can place.
// - The build is not among them: Turborepo builds before this task (turbo.json).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ecrireSarif, lireSarif, RESULTATS } from './resultats.mjs';

// The guards of the frame, each its script and its arguments, in the order they play.
export const GARDES_DU_CADRE = [
  ['scripts/turbo-des-paquets.mjs'],
  ['scripts/index-interfaces.mjs', '--verifier'],
  ['scripts/consommateurs.mjs'],
  ['scripts/consommateurs-arbitres.mjs'],
  ['scripts/frontieres.mjs'],
  ['scripts/interfaces-contre-code.mjs'],
  ['scripts/resumes.mjs'],
  ['scripts/code-mort.mjs'],
];

// The name of each guard of the frame, as its findings carry it: its script's, without extension.
const nomDeGarde = garde => path.basename(garde[0]).replace(/\.[cm]?js$/, '');
export const NOMS_DES_GARDES = GARDES_DU_CADRE.map(nomDeGarde);

// Plays each guard of <gardes> in <racine> under <env>; its verdict, 0 or 1. `dire` writes a line.
export function jouerLesGardes({
  racine = process.cwd(),
  gardes = GARDES_DU_CADRE,
  env = process.env,
  dire = l => process.stdout.write(`${l}\n`),
}) {
  const rouges = [];
  for (const garde of gardes) {
    const avant = env[RESULTATS] ? lireSarif(env[RESULTATS]).constats.length : 0;
    const r = spawnSync(process.execPath, garde, { cwd: racine, env, stdio: 'inherit' });
    if (r.status === 0) continue;
    const code = `code ${r.status ?? r.signal}`;
    rouges.push(`${garde.join(' ')} (${code})`);
    if (env[RESULTATS] && lireSarif(env[RESULTATS]).constats.length === avant) {
      ecrireSarif({
        garde: nomDeGarde(garde),
        racine,
        env,
        constats: [{ message: `${garde.join(' ')} rouge (${code}), sans constat situé.` }],
      });
    }
  }
  if (rouges.length === 0) return 0;
  for (const r of rouges) dire(`⛔ garde rouge : ${r}`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = jouerLesGardes({});
}
