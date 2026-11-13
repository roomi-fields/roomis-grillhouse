// The places of the machine: a fixed number of places for the whole machine, whatever repository a
// session or a pass plays in, as the executors of Jenkins and the agents of Buildkite are a fixed
// number, and as the job server of GNU make shares its slots between every make of one build.
// Each session of an agent (testwriter, developer, reviewer…) takes a place at its start and gives
// it back at its end; a circuit that waits for a question, or between two sessions, holds none.
// Each pass takes one too (scripts/passe-de-la-machine.mjs: a targeted pass, and a heavy one
// besides the exclusive lock of the machine, scripts/verrou-de-machine.mjs). Witness: 2026-11-02,
// load 39 on 12 cores with five circuits at once (grillhouse-9kq).
//
// - The places live on the Temporal server, in the one workflow of the machine
//   (src/temporal/places/deroule.ts), which grants them by the rule of scripts/regles-des-places.mjs
//   (a free place under the ceiling, the turn of the rank of arrival, the admission at the load and
//   the memory as `make -l`'s, the spacing of the starts) and frees the place of a process gone. A
//   synchronous caller reads and takes them by ./places-du-serveur.mjs, in a process of its own.
// - The server is required on the workstation: one that does not answer stops the taking, named.
//   In the CI (CI set) no place is taken. A trial machine (GRILLHOUSE_VERROU_MACHINE, the base
//   configuration of the tests) takes its places on the server GRILLHOUSE_PLACES_D_ESSAI names,
//   and none without it, so that no test takes a place of the user's machine.
// - A pass or a session that holds a place carries its mark to its children
//   (GRILLHOUSE_PLACE_TENUE): a pass they play takes no second place. In the envelope of an agent
//   (GRILLHOUSE_ENVELOPPE set, ./enveloppe/paquets-du-plan.mjs) no place is taken, as no lock is
//   (./verrou-de-machine.mjs): the place of the session, taken out of it by the circuit, covers its
//   commands, and the envelope passes on its mark; a number of process there means nothing on
//   the machine.
// - The ceiling is a configuration of the poste (`plafondDe` of ./plafond-de-la-machine.mjs:
//   GRILLHOUSE_PLACES of `~/.config/grillhouse/machine.env`, 3 without it), which the workflow
//   reads again at each judgement; two starts are spaced by ESPACEMENT_MS
//   (GRILLHOUSE_ESPACEMENT_MS names another, in ms), which the workflow reads when it starts.
// - A wait says its reason (place, rank, load, memory or spacing) when it begins and every 30 s,
//   and is bounded as the wait for the lock of the machine, GRILLHOUSE_ATTENTE_MACHINE_MS: at the
//   bound, « à repasser » (75), the request withdrawn.
// - A wait keeps the rank of its arrival, as the queue of a merge train keeps its order: the rank
//   is drawn when the circuit is launched (`prendreUnRang`) and kept from one session to the next.
// - The number of workers of the tests of a session is `travailleursDe`: max(1, cores ÷ places),
//   passed to the tool of each language (GRILLHOUSE_TRAVAILLEURS).
import { spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { departDe } from './mesure/base-de-passe.mjs';
import { A_REPASSER } from './codes-de-sortie.mjs';
import { paquetsDeLEnveloppe } from './enveloppe/paquets-du-plan.mjs';
import { ecrireLaTrace, traceDesPlaces } from './journal-des-etats.mjs';
import { mesureDeLaMachine } from './mesure-de-la-machine.mjs';
import { plafondDe } from './plafond-de-la-machine.mjs';
import { AttenteDeLaMachine, avecLaMachine, borneDe, racineDuDepot } from './verrou-de-machine.mjs';

export const VARIABLE_ESPACEMENT = 'GRILLHOUSE_ESPACEMENT_MS';
export const VARIABLE_TRAVAILLEURS = 'GRILLHOUSE_TRAVAILLEURS';
/** The mark of a place held, which the children of its holder inherit. */
export const VARIABLE_TENUE = 'GRILLHOUSE_PLACE_TENUE';
/** The measure of the machine a trial fixes, in JSON `{ coeurs, charge, memoireLibre, memoireTotale }`. */
export const VARIABLE_MESURE_D_ESSAI = 'GRILLHOUSE_MESURE_D_ESSAI';
// The server of the places of a trial machine.
const VARIABLE_ESSAI = 'GRILLHOUSE_PLACES_D_ESSAI';

/** The gap between two starts when GRILLHOUSE_ESPACEMENT_MS names none, in ms. */
export const ESPACEMENT_MS = 10_000;
const RAPPEL_MS = 30_000;
// The reading and the taking of the places on the server, in a process of their own.
const PONT = path.join(import.meta.dirname, 'places-du-serveur.mjs');

/**
 * The gap between two starts under <env>, in ms.
 * @param {Record<string, string | undefined>} [env]
 * @returns {number}
 * @throws {Error} naming GRILLHOUSE_ESPACEMENT_MS when its value is not a number of ms
 */
export function espacementDe(env = process.env) {
  const v = env[VARIABLE_ESPACEMENT];
  if (v === undefined || v === '') {
    return ESPACEMENT_MS;
  }
  if (!/^\d+$/.test(v)) {
    throw new Error(
      `${VARIABLE_ESPACEMENT} vaut « ${v} » : un nombre de millisecondes est attendu.`
    );
  }
  return Number(v);
}

/**
 * The number of workers of the tests of a session: max(1, cores ÷ places), the division whole.
 * @param {{ coeurs?: number, places?: number, env?: Record<string, string | undefined> }} [o]
 * @returns {number}
 */
export function travailleursDe({
  coeurs = availableParallelism(),
  places,
  env = process.env,
} = {}) {
  return Math.max(1, Math.floor(coeurs / (places ?? plafondDe(env))));
}

/**
 * The workers a session of an agent plays its tests on, as its environment gives them
 * (GRILLHOUSE_TRAVAILLEURS, set by the envelope): what the module of each language passes to its
 * tool. Null without the variable (a heavy pass): the tool keeps every core.
 * @param {Record<string, string | undefined>} [env]
 * @returns {number | null}
 * @throws {Error} naming GRILLHOUSE_TRAVAILLEURS when its value is not a positive integer
 */
export function travailleursDeLaSeance(env = process.env) {
  const v = env[VARIABLE_TRAVAILLEURS];
  if (v === undefined || v === '') {
    return null;
  }
  if (!/^[1-9]\d*$/.test(v)) {
    throw new Error(`${VARIABLE_TRAVAILLEURS} vaut « ${v} » : un entier positif est attendu.`);
  }
  return Number(v);
}

/**
 * The environment the server of the machine is read under on <env>: the address of its server
 * (TEMPORAL_ADDRESS), or null where no place is taken (the CI, the envelope of an agent, a trial
 * machine without its server); the places and the night under way (scripts/circuits-du-serveur.mjs
 * `nuitDuServeur`) read there.
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string | undefined> | null}
 */
export function surLeServeur(env) {
  if (env.CI || paquetsDeLEnveloppe(env)) {
    return null;
  }
  if (env.GRILLHOUSE_VERROU_MACHINE) {
    return env[VARIABLE_ESSAI] ? { ...env, TEMPORAL_ADDRESS: env[VARIABLE_ESSAI] } : null;
  }
  return env;
}

// The mode <args> of ./places-du-serveur.mjs under <env>, waited for within <ms>: its exit code,
// its lines in JSON; a server that does not answer, or a call that fails, stops the measure as a
// wait of the machine does (`AttenteDeLaMachine`, code 1), its reason named.
function auServeur(env, args, ms = 30_000) {
  const r = spawnSync(process.execPath, [PONT, ...args], {
    env,
    encoding: 'utf8',
    timeout: ms,
    maxBuffer: 16 * 1024 * 1024,
  });
  const lignes = (r.stdout ?? '')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l));
  // A server still busy after the bridge's attempts: the measure is to be played again (75), as
  // the bound of a wait is; only `prendre` gives a 75 of its own, its wait said in its lines.
  if (r.status === A_REPASSER && args[0] !== 'prendre') {
    throw new AttenteDeLaMachine(
      `⏳ ${(r.stderr || 'les places de la machine ne répondent pas à temps').trim()}`,
      A_REPASSER
    );
  }
  if (r.status !== 0 && r.status !== A_REPASSER) {
    throw new AttenteDeLaMachine(
      `✗ ${(r.stderr || r.error?.message || `les places de la machine ne se lisent pas, code ${r.status}`).trim()}`,
      1
    );
  }
  return { code: r.status, lignes };
}

/**
 * Draws the next rank of arrival of the machine: a circuit draws it when it is launched and keeps
 * it from one session to the next, so a wait for a place keeps its place in the line. Null where no
 * place is taken.
 * @param {{ env?: Record<string, string | undefined> }} [o]
 * @returns {number | null}
 */
export function prendreUnRang({ env = process.env } = {}) {
  const e = surLeServeur(env);
  return e ? auServeur(e, ['rang']).lignes[0] : null;
}

/**
 * Takes a place of the machine, waiting for one, saying why it waits (`dire`), and returns the
 * place. Where no place is taken, or under a place already held (GRILLHOUSE_PLACE_TENUE), the
 * place returned holds nothing.
 * @param {{ env?: Record<string, string | undefined>, ticket?: string | null, rang?: number,
 *   pid?: number, depart?: string | null, borneMs?: number, rappelMs?: number,
 *   dire?: (l: string) => void }} [o] `pid` and `depart` name the process of the session (the
 *   taking process by default); `rang` the rank of the arrival of the circuit (drawn by the server
 *   when absent)
 * @returns {{ id: string | null, rang: number | null, env: Record<string, string | undefined>,
 *   rendre: () => void, rattacher: (p: { pid: number, depart: string | null }) => void }} `env`,
 *   the environment of its holder's children, with the mark of the place; `rattacher` names the
 *   process of the session once launched (the taking process held the place until then)
 * @throws {AttenteDeLaMachine} at the bound of the wait (code 75), its reason named
 */
export function prendreUnePlace({
  env = process.env,
  ticket = null,
  rang,
  pid = process.pid,
  depart,
  borneMs = borneDe(env),
  rappelMs = RAPPEL_MS,
  dire = l => process.stdout.write(`${l}\n`),
  racine = process.cwd(),
} = {}) {
  const e = env[VARIABLE_TENUE] ? null : surLeServeur(env);
  if (!e) {
    return { id: null, rang: rang ?? null, env, rendre: () => {}, rattacher: () => {} };
  }
  const demande = {
    pid,
    depart: depart === undefined ? departDe(pid) : depart,
    ticket,
    racine: racineDuDepot(racine),
    ...(rang === undefined || rang === null ? {} : { rang }),
    borneMs,
    rappelMs,
  };
  const { code, lignes } = auServeur(e, ['prendre', JSON.stringify(demande)], borneMs + 60_000);
  for (const l of lignes) {
    if (l.dire) {
      // The wait, said and dated in the journal of states, its reason the message said.
      ecrireLaTrace(racine, traceDesPlaces({ evenement: 'attente', ticket, raison: l.dire }));
      dire(l.dire);
    }
  }
  if (code === A_REPASSER) {
    throw new AttenteDeLaMachine(lignes.at(-1)?.dire ?? 'attente de place bornée', A_REPASSER);
  }
  const place = lignes.find(l => l.id);
  ecrireLaTrace(racine, traceDesPlaces({ evenement: 'prise', ticket, place: place.id }));
  return {
    id: place.id,
    rang: place.rang,
    env: { ...env, [VARIABLE_TENUE]: place.id },
    // A place that does not go back is said, and the pass keeps its code: the workflow of the
    // machine frees the place of a process gone.
    rendre: () => {
      try {
        auServeur(e, ['rendre', place.id]);
        ecrireLaTrace(racine, traceDesPlaces({ evenement: 'rendue', ticket, place: place.id }));
      } catch (x) {
        if (!(x instanceof AttenteDeLaMachine)) {
          throw x;
        }
        dire(
          `⚠ la place ${place.id} ne se rend pas (${x.message}) : le déroulé de la machine la libère à la fin de son processus.`
        );
      }
    },
    rattacher: p => {
      auServeur(e, ['rattacher', place.id, String(p.pid), String(p.depart)]);
    },
  };
}

/**
 * Plays <seance> holding a place, given back at its end, whether it returns, throws or (for an
 * asynchronous one) settles; <seance> receives the place, its `env` the environment of its
 * children.
 * @param {(place: ReturnType<typeof prendreUnePlace>) => T} seance
 * @param {Parameters<typeof prendreUnePlace>[0]} [options]
 * @returns {T}
 * @template T
 */
export function avecUnePlace(seance, options) {
  const place = prendreUnePlace(options);
  let r;
  try {
    r = seance(place);
  } catch (e) {
    place.rendre();
    throw e;
  }
  if (r && typeof r.then === 'function') {
    return r.then(
      v => {
        place.rendre();
        return v;
      },
      e => {
        place.rendre();
        throw e;
      }
    );
  }
  place.rendre();
  return r;
}

/**
 * Plays the pass <passe> on a place of the machine, as a command a person or an agent runs (`npm
 * test`): its exit code, or, a wait that stops (its bound, 75; a server that does not answer, 1),
 * its reason said and its code. <passe> receives the environment of its children, with the mark
 * of the place.
 * @param {(env: Record<string, string | undefined>) => number} passe
 * @param {{ env?: Record<string, string | undefined>, dire?: (l: string) => void }} [o]
 * @returns {number}
 */
export function surUnePlace(
  passe,
  { env = process.env, dire = l => process.stderr.write(`${l}\n`) } = {}
) {
  try {
    return avecUnePlace(place => passe(place.env), { env, dire });
  } catch (e) {
    if (!(e instanceof AttenteDeLaMachine)) {
      throw e;
    }
    dire(e.message);
    return e.code;
  }
}

/**
 * Plays the heavy measure <mesure> on a place of the machine, then under its exclusive lock
 * (`avecLaMachine` of ./verrou-de-machine.mjs), and returns what it returns: the place first, so
 * that a pass that waits for its place holds no lock. <mesure> receives the environment of its
 * children, which carries the marks of both.
 * @param {(env: Record<string, string | undefined>) => T} mesure
 * @param {Parameters<typeof avecLaMachine>[1] & { rang?: number }} [options] those of the lock,
 *   whose `env`, `ticket`, `dire`, `borneMs` and `rappelMs` the place reads too, and `rang`, the
 *   rank of the circuit of the pass
 * @returns {T}
 * @template T
 */
export function avecLaMachineEtUnePlace(mesure, options = {}) {
  const { env = process.env, ticket, rang, dire, borneMs, rappelMs, ...verrou } = options;
  return avecUnePlace(
    place =>
      avecLaMachine(mesure, {
        ...verrou,
        env: place.env,
        ...(ticket === undefined ? {} : { ticket }),
        ...(dire ? { dire } : {}),
        ...(borneMs === undefined ? {} : { borneMs }),
        ...(rappelMs === undefined ? {} : { rappelMs }),
      }),
    {
      env,
      ticket: ticket ?? null,
      ...(rang === undefined ? {} : { rang }),
      ...(dire ? { dire } : {}),
      ...(borneMs === undefined ? {} : { borneMs }),
      ...(rappelMs === undefined ? {} : { rappelMs }),
    }
  );
}

/**
 * The places taken and the waits of the machine under <env>, as the server holds them: `{ plafond,
 * faute, prises, attentes, circuits }` (`faute`, a value of the ceiling the poste names and the
 * server refused, the ceiling read before kept; `circuits`, the places of the circuits, held or
 * waited for, `{ racine, ticket, rang, accordee, depuis, vu }`), `prises` `{ id, pid, depart, ticket, racine, rang, depuis }`, `attentes` in the
 * order of arrival `{ id, pid, ticket, rang, raison, depuis }`; none where no place is taken.
 * @param {{ env?: Record<string, string | undefined> }} [o]
 */
export function lirePlaces({ env = process.env } = {}) {
  const e = surLeServeur(env);
  return e
    ? auServeur(e, ['lire']).lignes[0]
    : { plafond: plafondDe(env), prises: [], attentes: [] };
}

/**
 * The machine a trial fixes under <env> (GRILLHOUSE_MESURE_D_ESSAI, JSON `{ coeurs, charge,
 * memoireLibre, memoireTotale }`), or null without the variable.
 * @param {Record<string, string | undefined>} env
 * @returns {{ coeurs: number, charge: number, memoireLibre: number, memoireTotale: number } | null}
 * @throws {Error} naming GRILLHOUSE_MESURE_D_ESSAI when its value is not that JSON
 */
function mesureDEssai(env) {
  const v = env[VARIABLE_MESURE_D_ESSAI];
  if (v === undefined || v === '') {
    return null;
  }
  let m;
  try {
    m = JSON.parse(v);
  } catch {
    m = null;
  }
  if (
    !m ||
    typeof m !== 'object' ||
    ['coeurs', 'charge', 'memoireLibre', 'memoireTotale'].some(
      c => typeof m[c] !== 'number' || !Number.isFinite(m[c])
    )
  ) {
    throw new Error(
      `${VARIABLE_MESURE_D_ESSAI} vaut « ${v} » : un JSON { coeurs, charge, memoireLibre, memoireTotale } de nombres est attendu.`
    );
  }
  return {
    coeurs: m.coeurs,
    charge: m.charge,
    memoireLibre: m.memoireLibre,
    memoireTotale: m.memoireTotale,
  };
}

/**
 * The places as the board shows them: taken and ceiling, the load over one minute and the cores,
 * the free memory and the total memory in whole GB, and the waits (ticket, since when) in the order of arrival: those
 * of a place for a session or a pass, then the tickets that wait for a place of a circuit, not
 * started (`circuits` of the server, which the queue of each project reserves). The
 * machine is the one GRILLHOUSE_MESURE_D_ESSAI fixes, else the real one (`mesurer`).
 * @param {{ env?: Record<string, string | undefined>, mesurer?: () => { coeurs: number,
 *   charge: number, memoireLibre: number, memoireTotale: number },
 *   lues?: { plafond: number, faute?: string | null, prises: { ticket: string | null,
 *   racine?: string | null }[], attentes: { ticket: string, depuis: number }[],
 *   circuits?: { ticket: string, depuis: number, accordee?: boolean, raison?: string | null }[] }
 *   }} [o] `lues`, the places as the server holds them (`lirePlaces` by default); `tenues` of the
 *   result gives each place taken, its ticket and the root of its project (null without one)
 * @returns {{ prises: number, tenues: { ticket: string | null, racine: string | null }[],
 *   plafond: number, faute: string | null, charge: number, coeurs: number, memoireGo: number,
 *   memoireTotaleGo: number, attentes: { ticket: string, depuis: number, disque?: string | null }[] }}
 * @throws {Error} naming GRILLHOUSE_MESURE_D_ESSAI when its value is faulty
 */
export function etatDesPlaces({ env = process.env, mesurer = mesureDeLaMachine, lues } = {}) {
  const fixee = mesureDEssai(env);
  const { plafond, faute = null, prises, attentes, circuits = [] } = lues ?? lirePlaces({ env });
  const m = fixee ?? mesurer();
  return {
    prises: prises.length,
    tenues: prises.map(p => ({ ticket: p.ticket ?? null, racine: p.racine ?? null })),
    plafond,
    faute,
    charge: Math.round(m.charge * 10) / 10,
    coeurs: m.coeurs,
    memoireGo: Math.floor(m.memoireLibre / 1024 ** 3),
    memoireTotaleGo: Math.floor(m.memoireTotale / 1024 ** 3),
    attentes: [
      ...attentes.map(a => ({ ticket: a.ticket, depuis: a.depuis })),
      ...circuits
        .filter(c => !c.accordee)
        .map(c => ({ ticket: c.ticket, depuis: c.depuis, disque: c.raison ?? null })),
    ],
  };
}
