// `grillhouse machine fermer [--attendre]` and `grillhouse machine rouvrir`: closes the machine to
// new work and reopens it, as `kubectl cordon` / `drain` / `uncordon` do for a node, so that the
// poste restarts without cutting a circuit in the middle of its work.
//
// - `fermer`: no place is given any more, to any project of the poste, and no ticket starts; each
//   circuit alive finishes its step, then waits without starting the next. The command returns at
//   once (as `cordon`), saying what still runs by project and by ticket, and « la machine est
//   vide » when nothing plays; played again, it reads that state. With `--attendre` it returns
//   only once the machine is empty (as `drain`): exit 0.
// - `rouvrir`: the circuits go on by themselves at the next step.
// - A night that holds the machine is never doubled nor lifted: the command says so (exit 0).
// - The closure lives in the state of the places on the Temporal server: it survives a restart of
//   the poste, and no circuit starts again before the reopening.
import path from 'node:path';
import { setTimeout as dormirVraiment } from 'node:timers/promises';
import { direLaFermeture } from './fermeture-de-la-machine.mjs';
import {
  dossierDesParts,
  fermerLaMachine,
  lireLesParts,
  lirePlaces,
  rouvrirLaMachine,
} from './places-de-la-machine.mjs';

const SONDE_MS = 2_000;

/**
 * What the machine holds now: the sessions (places) and the passes (parts that hold their part),
 * and the reservation in place.
 * @param {Record<string, string | undefined>} env
 */
export function lireLaMachine(env = process.env) {
  const lues = lirePlaces({ env });
  return {
    prises: lues.prises ?? [],
    parts: lireLesParts(dossierDesParts(env)).prises,
    fermeture: lues.fermeture ?? null,
  };
}

/**
 * Plays the command <mode> (`fermer` or `rouvrir`) with its arguments <args>: its lines, one per
 * call of <dire>; the exit code.
 * @param {string | undefined} mode
 * @param {string[]} args
 * @param {{ env?: Record<string, string | undefined>, dire?: (l: string) => void,
 *   maintenant?: () => number,
 *   agir?: (mode: 'fermer' | 'rouvrir', o: { env: Record<string, string | undefined> }) => string,
 *   lire?: (env: Record<string, string | undefined>) => ReturnType<typeof lireLaMachine>,
 *   dormir?: (ms: number) => Promise<unknown> }} [o]
 * @returns {Promise<number>}
 */
export async function jouer(
  mode,
  args,
  {
    env = process.env,
    dire = l => console.log(l),
    maintenant = Date.now,
    agir = (m, o) => (m === 'fermer' ? fermerLaMachine(o) : rouvrirLaMachine(o)),
    lire = lireLaMachine,
    dormir = dormirVraiment,
  } = {},
) {
  const attendre = args.includes('--attendre');
  if ((mode !== 'fermer' && mode !== 'rouvrir') || args.some(a => a !== '--attendre') || (attendre && mode !== 'fermer')) {
    process.stderr.write('usage : grillhouse machine fermer [--attendre] | rouvrir\n');
    return 2;
  }
  const issue = agir(mode, { env });
  const dit = () => {
    const { prises, parts, fermeture } = lire(env);
    for (const l of direLaFermeture({ issue, reservation: fermeture, prises, parts, maintenant: maintenant() })) {
      dire(l);
    }
    return prises.length + parts.length;
  };
  const restent = dit();
  if (!attendre || issue === 'nuit-tient') {
    return 0;
  }
  let encore = restent;
  while (encore > 0) {
    await dormir(SONDE_MS);
    const { prises, parts } = lire(env);
    if (prises.length + parts.length === 0) {
      dire('la machine est vide');
      return 0;
    }
    encore = prises.length + parts.length;
  }
  return 0;
}

if (process.argv[1] && path.basename(process.argv[1]) === 'machine.mjs') {
  const [mode, ...args] = process.argv.slice(2);
  try {
    process.exitCode = await jouer(mode, args);
  } catch (x) {
    process.stderr.write(`⛔ grillhouse machine : ${x?.message ?? x}\n`);
    process.exitCode = 1;
  }
}
