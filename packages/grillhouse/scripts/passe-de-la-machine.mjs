// A pass of the circuit on the machine: a heavy pass (the final pass, `npm run verifier`) holds the
// exclusive lock of the machine (scripts/verrou-de-machine.mjs); a targeted pass (the proof of the
// red and the checks, which play the tests of the ticket only) takes a place like a session of an
// agent (scripts/places-de-la-machine.mjs). Locks and places are independent: a targeted pass
// starts while a heavy one holds the lock, and a heavy one starts without waiting for the places.
import { sousNiceEtIonice } from './enveloppe/enveloppe.mjs';
import { VARIABLE_TRAVAILLEURS, avecUnePlace, travailleursDe } from './places-de-la-machine.mjs';
import { avecLaMachine } from './verrou-de-machine.mjs';

/**
 * Whether the npm command of a step is a heavy pass: `npm run verifier`, whatever its step.
 * @param {{ etape: string, args: string[] }} o
 */
export function passeLourde({ args }) {
  return args.includes('verifier');
}

/**
 * What a pass or a session out of the envelope launches: a heavy pass runs its command as it is,
 * every core kept (no GRILLHOUSE_TRAVAILLEURS, even inherited); any other runs under `nice` and
 * `ionice`, GRILLHOUSE_TRAVAILLEURS set to max(1, cores ÷ places).
 * @param {{ lourde: boolean, cmd: string, args: string[], env: Record<string, string | undefined> }} o
 * @returns {{ cmd: string, args: string[], env: Record<string, string | undefined> }}
 */
export function lancementDeLaPasse({ lourde, cmd, args, env }) {
  const { [VARIABLE_TRAVAILLEURS]: _herite, ...sansTravailleurs } = env;
  if (lourde) return { cmd, args, env: sansTravailleurs };
  const [commande, ...arguments_] = sousNiceEtIonice([cmd, ...args]);
  return {
    cmd: commande,
    args: arguments_,
    env: { ...sansTravailleurs, [VARIABLE_TRAVAILLEURS]: String(travailleursDe({ env })) },
  };
}

/**
 * Plays <mesure> under the lock of the machine (<lourde>) or on a place (otherwise), the
 * environment it receives being the pass's own. The wait of either says its reason and stops at
 * the bound (75).
 * @template T
 * @param {(env: Record<string, string | undefined>) => T} mesure
 * @param {{ lourde: boolean, env?: Record<string, string | undefined>, racine?: string,
 *   ticket?: string, sorte?: string, rang?: number, dire?: (l: string) => void,
 *   borneMs?: number, rappelMs?: number } & Record<string, unknown>} options
 * @returns {T}
 */
export function avecLaPasse(mesure, { lourde, env = process.env, racine, ticket, sorte, ...options }) {
  if (lourde) {
    const { dire, borneMs, rappelMs } = options;
    return avecLaMachine(mesure, {
      env,
      racine,
      ticket,
      sorte,
      ...(dire ? { dire } : {}),
      ...(borneMs !== undefined ? { borneMs } : {}),
      ...(rappelMs !== undefined ? { rappelMs } : {}),
    });
  }
  return avecUnePlace(() => mesure(env), { ...options, env, ticket });
}
