// A pass of the circuit on the machine: each takes a place of the machine, like a session of an
// agent (scripts/places-de-la-machine.mjs); a heavy pass (the final pass, `npm run verifier`)
// holds besides the exclusive lock of the machine (scripts/verrou-de-machine.mjs), once its place
// is given (`avecLaMachineEtUnePlace`). A targeted pass (the proof of the red and the checks,
// which play the tests of the ticket only) starts while a heavy one holds the lock.
import {
  coeursDeLaMachine,
  garderLaConsommation,
  scopeSystemd,
  sorteDeLaPasse,
} from './consommation-des-passes.mjs';
import { paquetsDeLEnveloppe } from './enveloppe/paquets-du-plan.mjs';
import { VARIABLE_TENUE } from './verrou-de-machine.mjs';
import {
  VARIABLE_TRAVAILLEURS,
  avecLaMachineEtUnePlace,
  avecUnePlace,
  sousNiceEtIonice,
  travailleursDe,
} from './places-de-la-machine.mjs';

/**
 * Whether the npm command of a step is a heavy pass: `npm run verifier`, whatever its step.
 * @param {{ etape: string, args: string[] }} o
 */
export function passeLourde({ args }) {
  return args.includes('verifier');
}

/**
 * What a pass or a session out of the envelope launches: a heavy pass runs its command as it is,
 * without the workers it inherits (GRILLHOUSE_TRAVAILLEURS): it shares the cores between its own
 * tasks of tests (scripts/langages/typescript/verifier.mjs); any other runs under `nice` and
 * `ionice`, GRILLHOUSE_TRAVAILLEURS set to max(1, cores ÷ places).
 * @param {{ lourde: boolean, cmd: string, args: string[], env: Record<string, string | undefined> }} o
 * @returns {{ cmd: string, args: string[], env: Record<string, string | undefined> }}
 */
export function lancementDeLaPasse({ lourde, cmd, args, env }) {
  const { [VARIABLE_TRAVAILLEURS]: _herite, ...sansTravailleurs } = env;
  if (lourde) {
    return { cmd, args, env: sansTravailleurs };
  }
  const [commande, ...arguments_] = sousNiceEtIonice([cmd, ...args]);
  return {
    cmd: commande,
    args: arguments_,
    env: { ...sansTravailleurs, [VARIABLE_TRAVAILLEURS]: String(travailleursDe({ env })) },
  };
}

// How a pass ended, from what it returns: a number or a `{ status, signal, error }` of a child
// process; `interrompue` for a signal, `rouge` for a failure, `verte` otherwise.
const issueDe = r => {
  if (typeof r === 'number') {
    return r === 0 ? 'verte' : 'rouge';
  }
  if (r && typeof r === 'object') {
    if (r.signal) {
      return 'interrompue';
    }
    if (r.error !== undefined || (r.status !== undefined && r.status !== 0)) {
      return 'rouge';
    }
  }
  return 'verte';
};

/**
 * <mesure> wrapped to keep what it consumes: once the lock is taken (the wrapper runs inside it),
 * a scope is opened, and read before the lock is given back; the line goes to the register of the
 * project (./consommation-des-passes.mjs), the pass red or interrupted included. Without the means
 * to measure (the envelope of an agent, no manager of the user) the pass plays as before and says
 * so once, no line written; a pass under the lock its parent holds is not measured twice.
 * @param {(env: Record<string, string | undefined>) => unknown} mesure
 * @param {{ env: Record<string, string | undefined>, racine: string, ticket?: string,
 *   sorte: string, dire: (l: string) => void, scope?: object, horloge: () => number,
 *   coeurs: number }} o
 */
function mesureeDansUnScope(mesure, { env, racine, ticket, sorte, dire, scope, horloge, coeurs }) {
  const sousLeVerrouDuParent = Boolean(env[VARIABLE_TENUE]);
  const enveloppe = paquetsDeLEnveloppe(env) !== null;
  return envMachine => {
    if (sousLeVerrouDuParent) {
      return mesure(envMachine);
    }
    const ouvert = enveloppe
      ? { raison: "dans l'enveloppe d'un agent" }
      : (scope ?? scopeSystemd({ racine, sorte, ticket, coeurs })).ouvrir();
    if ('raison' in ouvert) {
      dire(`consommation non mesurée : ${ouvert.raison}`);
      return mesure(envMachine);
    }
    const debut = horloge();
    let issue = 'rouge';
    try {
      const r = mesure(envMachine);
      issue = issueDe(r);
      return r;
    } finally {
      let lecture = null;
      try {
        lecture = ouvert.lire();
      } catch {
        // an unreadable scope keeps a line without values
      }
      try {
        garderLaConsommation(racine, {
          sorte,
          ...(ticket ? { ticket } : {}),
          dureeMs: horloge() - debut,
          cpuNs: lecture?.cpuNs ?? null,
          memoirePic: lecture?.memoirePic ?? null,
          coeurs,
          issue,
          fin: new Date().toISOString(),
        });
      } finally {
        ouvert.clore?.();
      }
    }
  };
}

/**
 * Plays <mesure> on a place of the machine, and under its lock besides when it is <lourde>, the
 * environment it receives being the pass's own. The wait of either says its reason and stops at
 * the bound (75).
 * @template T
 * @param {(env: Record<string, string | undefined>) => T} mesure
 * @param {{ lourde: boolean, env?: Record<string, string | undefined>, racine?: string,
 *   ticket?: string, sorte?: string, rang?: number, dire?: (l: string) => void,
 *   borneMs?: number, rappelMs?: number } & Record<string, unknown>} options
 * @returns {T}
 */
export function avecLaPasse(
  mesure,
  { lourde, env = process.env, racine, ticket, sorte, ...options }
) {
  if (lourde) {
    const { dire, borneMs, rappelMs, rang, scope, horloge, coeurs } = options;
    const mesuree = mesureeDansUnScope(mesure, {
      env,
      racine: racine ?? process.cwd(),
      ticket: ticket ?? (env.GRILLHOUSE_VERIFICATION_TICKET || undefined),
      sorte: sorteDeLaPasse(sorte ?? (env.GRILLHOUSE_VERIFICATION_SORTE || 'verification')),
      dire: dire ?? (l => process.stdout.write(`${l}\n`)),
      scope,
      horloge: horloge ?? Date.now,
      coeurs: coeurs ?? coeursDeLaMachine(),
    });
    return avecLaMachineEtUnePlace(mesuree, {
      env,
      racine,
      ticket,
      sorte,
      ...(rang !== undefined ? { rang } : {}),
      ...(dire ? { dire } : {}),
      ...(borneMs !== undefined ? { borneMs } : {}),
      ...(rappelMs !== undefined ? { rappelMs } : {}),
    });
  }
  return avecUnePlace(place => mesure(place.env), { ...options, env, ticket });
}
