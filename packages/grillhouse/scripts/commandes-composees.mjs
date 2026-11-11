#!/usr/bin/env node
// A command of a project of several languages (./composition-des-langages.mjs, `commandes`):
// each declared module that describes it plays it with its own tool, one after the other, and the
// verdicts join into one, as Bazel runs each target with the rule of its language and one red
// fails the build. `grillhouse tests`, `grillhouse verifier` and every command of a module run it
// in such a project; the circuit, the queue and the night reach it by them.
//
//   node commandes-composees.mjs <nom> [arguments…]      from the root of the project
//
// - The modules are the project's (scripts/langages.mjs, `langagesDe`), in the order of the
//   declaration; each one that describes the command <nom> plays it, by Node, its arguments then
//   these, in the working directory, with this process's standard streams and environment, its
//   results directory included (`GRILLHOUSE_RESULTATS`), where each module writes under names of
//   its own. A line on the error stream names each module before it plays, so that what a
//   command prints on its standard output stays its own.
// - `tester`, `tests-du-paquet`, `construire` and `typer` (the last three: one package, as the
//   scripts of its package.json call them): an argument that begins with « - » is an option, given to every module; any other is
//   a path from the root, given to the module of the component that holds it
//   (`moduleDuFichier`), or out of every component to the first module whose rule of a test file
//   judges it (`estUnTest`). With paths, the modules that receive none do not play. A path no
//   module takes is refused, named, and nothing plays (code 2).
// - The launcher's `construire --echec <fichier> <plan>` is one implementation for every language
//   (scripts/taches-du-graphe.mjs): the first module plays it, once.
// - No green is kept here, and no module is given one to defer: the last green
//   (scripts/dernier-vert.mjs) is kept by the one pass of the verification, once, when every task
//   of every language of the graph is green (scripts/langages/typescript/verifier.mjs). A module
//   that plays after a red one gets `PASSE_ROUGE` in its environment: that pass keeps none.
// - `verifier`: the module of package.json plays last, and passes over the whole graph (every task
//   of every language, once); the others play before it in their declared order and get
//   `GRAPHE_JOUE` and play no task of it again (cargo: its `deny check` alone), so that nextest
//   and pytest play once.
// - The exit code: 0 when every module is green, 75 when the only reds are « à repasser », else the
//   first other code; 128 plus the number of a signal that ended a module.
import { spawnSync } from 'node:child_process';
import { constants } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { moduleDuFichier } from './composition-des-langages.mjs';
import { langagesDe } from './langages.mjs';
import { GRAPHE_JOUE, PASSE_ROUGE } from './taches-du-graphe.mjs';

/** This script, the one every composed command runs. */
export const SCRIPT = fileURLToPath(import.meta.url);
const A_REPASSER = 75;

/**
 * The verdict of the codes <codes> joined: 0 when every code is 0, 75 when the others are 75,
 * else the first other.
 * @param {number[]} codes
 */
export const unir = codes =>
  codes.find(c => c !== 0 && c !== A_REPASSER) ??
  (codes.some(c => c === A_REPASSER) ? A_REPASSER : 0);

// The commands whose path arguments go to the module of the component that holds each.
const PAR_CHEMIN = ['tester', 'tests-du-paquet', 'construire', 'typer'];

// The arguments of each module of <modules> for the command <nom>: `{ parts: [{ module, args }] }`,
// or `{ refus }`, the paths no module takes.
function repartir(nom, args, modules, racine) {
  // `construire` and `typer` name a package by its path, as `tester`.
  // The launcher's build is one implementation for every language (scripts/taches-du-graphe.mjs): it
  // plays once, by the first module, not once per module (each would build the same copy again).
  if (nom === 'construire' && args.includes('--echec')) {
    return { parts: modules.slice(0, 1).map(module => ({ module, args })) };
  }
  if (!PAR_CHEMIN.includes(nom)) {
    return { parts: modules.map(module => ({ module, args })) };
  }
  const estChemin = a => !a.startsWith('-');
  if (!args.some(estChemin)) {
    return { parts: modules.map(module => ({ module, args })) };
  }
  const parModule = new Map();
  const refus = [];
  for (const a of args.filter(estChemin)) {
    const m =
      moduleDuFichier(modules, racine, a) ??
      modules.find(x => x.estUnTest(a, racine) !== null) ??
      null;
    if (m) {
      parModule.set(m, [...(parModule.get(m) ?? []), a]);
    } else {
      refus.push(a);
    }
  }
  if (refus.length) {
    return { refus };
  }
  return {
    parts: modules
      .filter(m => parModule.has(m))
      .map(module => ({
        module,
        args: args.filter(a => !estChemin(a) || parModule.get(module).includes(a)),
      })),
  };
}

/**
 * Plays the command <nom> with <args> in each module of <modules> that describes it, in the
 * project at <racine>, under <env>: the joined exit code.
 * @param {string} nom
 * @param {string[]} args
 * @param {{ racine?: string, modules?: import('./jointure.js').Langage[], env?: NodeJS.ProcessEnv,
 *   dire?: (ligne: string) => void }} [o]
 * @returns {number}
 */
export function jouer(
  nom,
  args,
  {
    racine = process.cwd(),
    modules = langagesDe(racine),
    env = process.env,
    dire = l => process.stderr.write(`${l}\n`),
  } = {}
) {
  const avec = modules.filter(m => Object.hasOwn(m.commandes(racine), nom));
  const r = repartir(nom, args, avec, racine);
  if (r.refus) {
    for (const a of r.refus) {
      process.stderr.write(`⛔ ${a} : aucun composant ne le tient, d'aucun langage du projet.\n`);
    }
    return 2;
  }
  // A module that plays after a red one is told so (PASSE_ROUGE): the one pass of the verification
  // keeps no green then.
  const codes = [];
  const duGraphe = r.parts.find(x => x.module.manifeste === 'package.json')?.module;
  // `verifier`: the module of the graph plays last, so that its pass, the one that keeps the last
  // green, knows the verdict of every other module; the others keep their relative order.
  const ordre =
    nom === 'verifier' && duGraphe
      ? [...r.parts.filter(x => x.module !== duGraphe), ...r.parts.filter(x => x.module === duGraphe)]
      : r.parts;
  for (const { module, args: siens } of ordre) {
    const c = module.commandes(racine)[nom];
    dire(`▶ ${module.nom} : ${nom}`);
    const rouge = codes.some(x => x !== 0);
    const p = spawnSync(process.execPath, [c.script, ...c.args, ...siens], {
      cwd: racine,
      stdio: 'inherit',
      env: {
        ...env,
        ...(rouge ? { [PASSE_ROUGE]: '1' } : {}),
        ...(nom === 'verifier' && module !== duGraphe && duGraphe ? { [GRAPHE_JOUE]: '1' } : {}),
      },
    });
    if (p.error) {
      process.stderr.write(`⛔ ${module.nom} : ${nom} : ${p.error.message}\n`);
      codes.push(1);
    } else {
      codes.push(p.status ?? 128 + (constants.signals[p.signal ?? 'SIGTERM'] ?? 0));
    }
  }
  return unir(codes);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [nom, ...args] = process.argv.slice(2);
  try {
    process.exitCode = jouer(nom, args);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exitCode = 1;
  }
}
