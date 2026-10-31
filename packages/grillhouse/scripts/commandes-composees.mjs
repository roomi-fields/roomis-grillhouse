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
// - `tester`: an argument that begins with « - » is an option, given to every module; any other is
//   a path from the root, given to the module of the component that holds it
//   (`moduleDuFichier`), or out of every component to the first module whose rule of a test file
//   judges it (`estUnTest`). With paths, the modules that receive none do not play. A path no
//   module takes is refused, named, and nothing plays (code 2).
// - The last green (scripts/dernier-vert.mjs) is kept once, after the last module: while the
//   modules play, a module green defers its own (`VERT_DIFFERE`); when every module played green
//   and each deferred one, the first deferred is kept, the state of the repository when the pass
//   began. A pass with one module red keeps none, so that the next pass plays its changes again.
// - The exit code: 0 when every module is green, 75 when the only reds are « à repasser », else the
//   first other code; 128 plus the number of a signal that ended a module.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { constants, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { moduleDuFichier } from './composition-des-langages.mjs';
import { garderLeVert, VERT_DIFFERE } from './dernier-vert.mjs';
import { langagesDe } from './langages.mjs';

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

// The arguments of each module of <modules> for the command <nom>: `{ parts: [{ module, args }] }`,
// or `{ refus }`, the paths no module takes.
function repartir(nom, args, modules, racine) {
  if (nom !== 'tester') {
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
  const dossier = mkdtempSync(path.join(tmpdir(), 'grillhouse-vert-differe-'));
  const differe = path.join(dossier, 'verts');
  try {
    const codes = r.parts.map(({ module, args: siens }) => {
      const c = module.commandes(racine)[nom];
      dire(`▶ ${module.nom} : ${nom}`);
      const p = spawnSync(process.execPath, [c.script, ...c.args, ...siens], {
        cwd: racine,
        stdio: 'inherit',
        env: { ...env, [VERT_DIFFERE]: differe },
      });
      if (p.error) {
        process.stderr.write(`⛔ ${module.nom} : ${nom} : ${p.error.message}\n`);
        return 1;
      }
      return p.status ?? 128 + (constants.signals[p.signal ?? 'SIGTERM'] ?? 0);
    });
    const code = unir(codes);
    let verts = [];
    try {
      verts = readFileSync(differe, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(l => JSON.parse(l));
    } catch {
      verts = [];
    }
    if (code === 0 && verts.length > 0 && verts.length === r.parts.length) {
      garderLeVert(verts[0], {});
    }
    return code;
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
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
