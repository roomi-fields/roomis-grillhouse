#!/usr/bin/env node
// `grillhouse:gardes`: the frame's guards, the one list of them, played in its order.
//
//   npx grillhouse gardes-du-cadre      (npm run grillhouse:gardes, a task of Turborepo)
//
// - The guards are those of the modules of the project's languages (`gardes`,
//   scripts/jointure.d.ts, scripts/langages.mjs), each module's in their order, the modules in the
//   order of the declaration.
// - Each guard is a script of the package, and plays in the working directory, under the environment of the run
//   (`GRILLHOUSE_DETTE` among it, scripts/dette.mjs), whatever the verdict of the ones before: a
//   red does not stop the pass, as `--continue` does for Turborepo's tasks.
// - Each red guard is named with its code at the end; the exit code is 1 when one guard is red,
//   0 when all are green.
// - While the run names its results directory (`GRILLHOUSE_RESULTATS`, scripts/resultats.mjs),
//   each guard writes its findings there in SARIF; a red guard that wrote no finding (a note of
//   the debt, `a-elaguer`, is none) has one written for it, without location, its name (its
//   script's, without extension) and its code: a red no reader can place.
// - The build is not among them: Turborepo builds before this task (turbo.json).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { langageDe } from './langages.mjs';
import { A_ELAGUER, ecrireSarif, lireSarif, RESULTATS } from './resultats.mjs';

// The guards of the frame in the repository at <racine>, each its script and its arguments, in
// the order they play: the language's.
export function gardesDuCadre(racine) {
  return langageDe(racine).gardes(racine);
}

// The name of each guard of the frame, as its findings carry it: its script's, without extension.
const nomDeGarde = garde => path.basename(garde[0]).replace(/\.[cm]?js$/, '');
export const nomsDesGardes = racine => gardesDuCadre(racine).map(nomDeGarde);
// A guard as its lines name it: its subcommand and its arguments.
const libelle = garde => ['grillhouse', nomDeGarde(garde), ...garde.slice(1)].join(' ');

// Plays each guard of <gardes> in <racine> under <env>; its verdict, 0 or 1. `dire` writes a line.
export function jouerLesGardes({
  racine = process.cwd(),
  gardes = gardesDuCadre(racine),
  env = process.env,
  dire = l => process.stdout.write(`${l}\n`),
}) {
  const rouges = [];
  // The findings under the results directory, the notes of the debt left out.
  const nombre = () => lireSarif(env[RESULTATS]).constats.filter(k => k.genre !== A_ELAGUER).length;
  for (const garde of gardes) {
    const avant = env[RESULTATS] ? nombre() : 0;
    const r = spawnSync(process.execPath, garde, { cwd: racine, env, stdio: 'inherit' });
    if (r.status === 0) continue;
    const code = `code ${r.status ?? r.signal}`;
    rouges.push(`${libelle(garde)} (${code})`);
    if (env[RESULTATS] && nombre() === avant) {
      ecrireSarif({
        garde: nomDeGarde(garde),
        racine,
        env,
        constats: [{ message: `${libelle(garde)} rouge (${code}), sans constat situé.` }],
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
