// The places of the machine: a fixed number of places for the whole machine, whatever repository a
// session plays in, as the executors of Jenkins and the agents of Buildkite are a fixed number,
// and as the job server of GNU make shares its slots between every make of one build. Each session
// of an agent (testwriter, developer, reviewer…) takes a place at its start and gives it back at
// its end; a circuit that waits for a question, or between two sessions, holds none. The heavy
// passes keep the exclusive lock of the machine (scripts/verrou-de-machine.mjs), independent of the
// places. Witness: 2026-11-02, load 39 on 12 cores with five circuits at once (grillhouse-9kq).
//
// - The ceiling is PLAFOND_PAR_DEFAUT, 3, unless GRILLHOUSE_PLACES names another (a positive
//   integer; any other value is refused by the name of the variable).
// - The state is one file of the user's cache, shared by every repository of the machine:
//   `${XDG_CACHE_HOME:-~/.cache}/grillhouse/places.json`, read and written under a file lock
//   (`places.json.lock`, scripts/verrou-de-fichier.mjs). It holds the places taken, the waits
//   (ticket, reason, rank) and the counter of ranks.
// - A place is written with its process and its start (pid and start time of the process, as the
//   lock of the machine judges its holder, `departDe`): the next reader frees the place whose
//   process no longer exists or whose start differs (the number reused), with no lease and no
//   duration. A session killed frees its place so.
// - The admission is `make -l`'s: a start only if the load over one minute is under the number of
//   cores and if 4 GB of memory at least are free (`admission`). The load and the memory are
//   measured under the same lock as the taking, and two starts are spaced by ESPACEMENT_MS
//   (GRILLHOUSE_ESPACEMENT_MS names another, in ms): the load of a session that starts only shows
//   afterwards, so three simultaneous starts do not all pass.
// - A wait says its reason (place, rank, load, memory or spacing) when it begins and every 30 s,
//   and is bounded as the wait for the lock of the machine, GRILLHOUSE_ATTENTE_MACHINE_MS: at the
//   bound, « à repasser » (75).
// - A wait keeps the rank of its arrival, as the queue of a merge train keeps its order: the rank
//   is drawn when the circuit is launched (`prendreUnRang`) and kept from one session to the next;
//   a start does not take a free place while a wait of a lower rank lives, so a circuit well
//   advanced is not passed by a ticket that arrived after it, between projects too.
// - The number of workers of the tests of a session is `travailleursDe`: max(1, cores ÷ places),
//   passed to the tool of each language (GRILLHOUSE_TRAVAILLEURS).
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { availableParallelism, freemem, homedir, loadavg } from 'node:os';
import path from 'node:path';
import { departDe, leMemeVivant, vivant } from './mesure/base-de-passe.mjs';
import { ecrireAtomique } from './mesure/avancement.mjs';
import { A_REPASSER } from './mesure/pression.mjs';
import { attendreUnPeu, lacherVerrou, prendreVerrou } from './verrou-de-fichier.mjs';
import { AttenteDeLaMachine, borneDe } from './verrou-de-machine.mjs';

export const VARIABLE_PLACES = 'GRILLHOUSE_PLACES';
export const VARIABLE_ESPACEMENT = 'GRILLHOUSE_ESPACEMENT_MS';
export const VARIABLE_TRAVAILLEURS = 'GRILLHOUSE_TRAVAILLEURS';

/** The ceiling of the places of the machine when GRILLHOUSE_PLACES names none. */
export const PLAFOND_PAR_DEFAUT = 3;
/** The memory a start wants free, in bytes: 4 GB. */
export const MEMOIRE_MIN = 4 * 1024 ** 3;
/** The gap between two starts when GRILLHOUSE_ESPACEMENT_MS names none, in ms. */
export const ESPACEMENT_MS = 10_000;
const RAPPEL_MS = 30_000;

/**
 * The ceiling of the places under <env>.
 * @param {Record<string, string | undefined>} [env]
 * @returns {number}
 * @throws {Error} naming GRILLHOUSE_PLACES when its value is not a positive integer
 */
export function plafondDe(env = process.env) {
  const v = env[VARIABLE_PLACES];
  if (v === undefined || v === '') return PLAFOND_PAR_DEFAUT;
  if (!/^[1-9]\d*$/.test(v))
    throw new Error(`${VARIABLE_PLACES} vaut « ${v} » : un entier positif est attendu (3 par défaut).`);
  return Number(v);
}

// The gap between two starts under <env>, in ms.
function espacementDe(env) {
  const v = env[VARIABLE_ESPACEMENT];
  if (v === undefined || v === '') return ESPACEMENT_MS;
  if (!/^\d+$/.test(v))
    throw new Error(`${VARIABLE_ESPACEMENT} vaut « ${v} » : un nombre de millisecondes est attendu.`);
  return Number(v);
}

/**
 * The number of workers of the tests of a session: max(1, cores ÷ places), the division whole.
 * @param {{ coeurs?: number, places?: number, env?: Record<string, string | undefined> }} [o]
 * @returns {number}
 */
export function travailleursDe({ coeurs = availableParallelism(), places, env = process.env } = {}) {
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
  if (v === undefined || v === '') return null;
  if (!/^[1-9]\d*$/.test(v))
    throw new Error(`${VARIABLE_TRAVAILLEURS} vaut « ${v} » : un entier positif est attendu.`);
  return Number(v);
}

/**
 * Whether a start is admitted at this load and this free memory, as `make -l` admits it: the load
 * under the number of cores, and at least MEMOIRE_MIN free. A refusal says why.
 * @param {{ coeurs: number, charge: number, memoireLibre: number }} o `memoireLibre` in bytes
 * @returns {{ ok: true } | { ok: false, raison: string }}
 */
export function admission({ coeurs, charge, memoireLibre }) {
  if (charge >= coeurs)
    return { ok: false, raison: `charge de la machine ${nombre(charge)} sur ${coeurs} cœurs` };
  if (memoireLibre < MEMOIRE_MIN)
    return {
      ok: false,
      raison: `mémoire libre ${nombre(memoireLibre / 1024 ** 3)} Go, sous les ${MEMOIRE_MIN / 1024 ** 3} Go demandés`,
    };
  return { ok: true };
}

// 11.2 → « 11,2 », 4 → « 4 ».
const nombre = n => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

// The memory available now, in bytes (MemAvailable of the kernel, else the free memory of node).
function memoireDisponible() {
  try {
    const kio = /^MemAvailable:\s+(\d+) kB/m.exec(readFileSync('/proc/meminfo', 'utf8'))?.[1];
    if (kio) return Number(kio) * 1024;
  } catch {
    // no /proc/meminfo: the free memory of node
  }
  return freemem();
}

/**
 * The file of the state of the places under <env>, shared by every repository of the machine.
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function cheminDesPlaces(env = process.env) {
  // A trial machine (the base configuration of the tests names a lock of the machine of its own,
  // GRILLHOUSE_VERROU_MACHINE) has its places beside that lock, and not in the user's cache.
  if (env.GRILLHOUSE_VERROU_MACHINE) return `${env.GRILLHOUSE_VERROU_MACHINE}.places.json`;
  const cache = env.XDG_CACHE_HOME || path.join(env.HOME || homedir(), '.cache');
  return path.join(cache, 'grillhouse', 'places.json');
}

const VIDE = () => ({ rang: 0, dernier: 0, prises: [], attentes: [] });

function lireEtat(f) {
  try {
    const e = JSON.parse(readFileSync(f, 'utf8'));
    return { ...VIDE(), ...e };
  } catch {
    return VIDE();
  }
}

// Whether the process of a place or of a wait lives, and is the one that started it.
const tient = x => (x.depart ? leMemeVivant(x.pid, x.depart) : vivant(x.pid));

// Frees the places and waits whose process is gone; whether it changed the state.
function purger(etat) {
  const n = etat.prises.length + etat.attentes.length;
  etat.prises = etat.prises.filter(tient);
  etat.attentes = etat.attentes.filter(tient);
  return etat.prises.length + etat.attentes.length !== n;
}

const tenus = new Set();

// Plays <f>(etat, ecrire) on the state under the file lock; a call made while this process already
// holds the lock (the measure of the load, read in the same turn) reads without writing.
function sousLeVerrou(env, f) {
  const fichier = cheminDesPlaces(env);
  const verrou = `${fichier}.lock`;
  if (tenus.has(verrou)) {
    const etat = lireEtat(fichier);
    purger(etat);
    return f(etat, () => {});
  }
  mkdirSync(path.dirname(fichier), { recursive: true });
  prendreVerrou(verrou, { attendre: true });
  tenus.add(verrou);
  try {
    const etat = lireEtat(fichier);
    const change = purger(etat);
    let ecrit = false;
    const r = f(etat, () => {
      ecrit = true;
      ecrireAtomique(fichier, etat);
    });
    if (change && !ecrit) ecrireAtomique(fichier, etat);
    return r;
  } finally {
    tenus.delete(verrou);
    lacherVerrou(verrou);
  }
}

/**
 * The places taken and the waits of the machine under <env>, the places whose process is gone freed.
 * `prises`: `{ id, pid, depart, ticket, rang, depuis }`; `attentes`: the waits in the order of
 * arrival, `{ id, pid, ticket, rang, raison, depuis }`.
 * @param {{ env?: Record<string, string | undefined> }} [o]
 */
export function lirePlaces({ env = process.env } = {}) {
  return sousLeVerrou(env, etat => ({
    plafond: plafondDe(env),
    prises: etat.prises,
    attentes: [...etat.attentes].sort((a, b) => a.rang - b.rang),
  }));
}

/**
 * Draws the next rank of arrival of the machine: a circuit draws it when it is launched and keeps
 * it from one session to the next, so a wait for a place keeps its place in the line.
 * @param {{ env?: Record<string, string | undefined> }} [o]
 * @returns {number}
 */
export function prendreUnRang({ env = process.env } = {}) {
  return sousLeVerrou(env, (etat, ecrire) => {
    etat.rang += 1;
    ecrire();
    return etat.rang;
  });
}

const duree = ms => (ms < 120_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);

/**
 * Takes a place of the machine, waiting for one (a free place, the turn of its rank, the load and
 * the memory, the spacing of the starts), saying why it waits, and returns the place.
 * @param {{ env?: Record<string, string | undefined>, ticket?: string | null, rang?: number,
 *   pid?: number, depart?: string | null, coeurs?: number, charge?: () => number,
 *   memoireLibre?: () => number, espacementMs?: number, borneMs?: number, rappelMs?: number,
 *   dire?: (l: string) => void }} [o] `pid` and `depart` name the process of the session (the
 *   taking process by default); `rang` the rank of the arrival of the circuit (drawn here when
 *   absent); `charge` and `memoireLibre` read the load over one minute and the free memory in
 *   bytes, under the lock of the taking
 * @returns {{ id: string, rang: number, rendre: () => void,
 *   rattacher: (p: { pid: number, depart: string | null }) => void }} `rattacher` names the process
 *   of the session once launched (the taking process held the place until then)
 * @throws {AttenteDeLaMachine} at the bound of the wait (code 75), its reason named
 */
export function prendreUnePlace({
  env = process.env,
  ticket = null,
  rang,
  pid = process.pid,
  depart,
  coeurs = availableParallelism(),
  charge = () => loadavg()[0],
  memoireLibre = memoireDisponible,
  espacementMs = espacementDe(env),
  borneMs = borneDe(env),
  rappelMs = RAPPEL_MS,
  dire = l => process.stdout.write(`${l}\n`),
} = {}) {
  const plafond = plafondDe(env);
  const monDepart = depart === undefined ? departDe(pid) : depart;
  const id = randomUUID();
  const moi = { pid: process.pid, depart: departDe(process.pid) };
  const monRang = rang ?? prendreUnRang({ env });
  const debut = Date.now();
  let dit = null;
  let inscrit = false;
  try {
    for (;;) {
      const r = sousLeVerrou(env, (etat, ecrire) => {
        const raison = refus(etat);
        if (raison === null) {
          etat.attentes = etat.attentes.filter(a => a.id !== id);
          etat.prises.push({
            id,
            pid,
            depart: monDepart,
            ticket,
            rang: monRang,
            depuis: Date.now(),
          });
          etat.dernier = Date.now();
          ecrire();
          return { pris: true };
        }
        const a = etat.attentes.find(x => x.id === id);
        if (a?.raison !== raison) {
          etat.attentes = etat.attentes.filter(x => x.id !== id);
          etat.attentes.push({
            id,
            ...moi,
            ticket,
            rang: monRang,
            raison,
            depuis: a?.depuis ?? Date.now(),
          });
          ecrire();
        }
        inscrit = true;
        return { pris: false, raison };
      });
      if (r.pris) {
        if (dit !== null) dire(`✓ place prise après ${duree(Date.now() - debut)}.`);
        return {
          id,
          rang: monRang,
          rendre: () => rendre(env, id),
          rattacher: p => rattacher(env, id, p),
        };
      }
      const t = Date.now();
      if (t - debut >= borneMs)
        throw new AttenteDeLaMachine(
          `⏱ attente de place bornée à ${duree(borneMs)} (GRILLHOUSE_ATTENTE_MACHINE_MS) : ${r.raison} ; à repasser (code ${A_REPASSER}).`,
          A_REPASSER
        );
      if (dit === null)
        dire(`⏳ attente d'une place : ${r.raison} ; ${duree(borneMs)} au plus.`);
      else if (t - dit >= rappelMs)
        dire(`⏳ attente d'une place depuis ${duree(t - debut)} : ${r.raison}.`);
      if (dit === null || t - dit >= rappelMs) dit = t;
      attendreUnPeu(Math.max(1, Math.min(200, borneMs - (Date.now() - debut))));
    }
  } finally {
    if (inscrit) {
      sousLeVerrou(env, (etat, ecrire) => {
        const n = etat.attentes.length;
        etat.attentes = etat.attentes.filter(a => a.id !== id);
        if (etat.attentes.length !== n) ecrire();
      });
    }
  }

  // Why this start does not pass now, null when it does; measured under the lock of the taking.
  function refus(etat) {
    if (etat.prises.length >= plafond)
      return `aucune place libre : ${etat.prises.length} prises sur ${plafond}`;
    const avant = etat.attentes.find(a => a.id !== id && a.rang < monRang);
    if (avant)
      return `place réservée : ${avant.ticket ?? 'un départ'} est arrivé avant et attend (${avant.raison})`;
    const a = admission({ coeurs, charge: charge(), memoireLibre: memoireLibre() });
    if (!a.ok) return a.raison;
    const ecoule = Date.now() - etat.dernier;
    if (ecoule < espacementMs)
      return `espacement des départs : le dernier date de ${duree(ecoule)}, ${duree(espacementMs)} au moins`;
    return null;
  }
}

// Writes the process <pid> and its start <depart> on the place <id> (the session once launched).
function rattacher(env, id, { pid, depart }) {
  sousLeVerrou(env, (etat, ecrire) => {
    const p = etat.prises.find(x => x.id === id);
    if (!p) return;
    p.pid = pid;
    p.depart = depart;
    ecrire();
  });
}

// Gives the place <id> back; a place given back twice, or freed already, changes nothing.
function rendre(env, id) {
  sousLeVerrou(env, (etat, ecrire) => {
    const n = etat.prises.length;
    etat.prises = etat.prises.filter(p => p.id !== id);
    if (etat.prises.length !== n) ecrire();
  });
}

/**
 * Plays <seance> holding a place, given back at its end, whether it returns, throws or (for an
 * asynchronous one) settles.
 * @param {(place: { id: string, rang: number }) => T} seance
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
 * The places as the board shows them: taken and ceiling, the load over one minute and the cores,
 * the free memory in whole GB, and the waits (ticket, since when) in the order of arrival.
 * @param {{ env?: Record<string, string | undefined>, coeurs?: number, charge?: () => number,
 *   memoireLibre?: () => number }} [o]
 */
export function etatDesPlaces({
  env = process.env,
  coeurs = availableParallelism(),
  charge = () => loadavg()[0],
  memoireLibre = memoireDisponible,
} = {}) {
  const { plafond, prises, attentes } = existsSync(cheminDesPlaces(env))
    ? lirePlaces({ env })
    : { plafond: plafondDe(env), prises: [], attentes: [] };
  return {
    prises: prises.length,
    plafond,
    charge: Math.round(charge() * 10) / 10,
    coeurs,
    memoireGo: Math.floor(memoireLibre() / 1024 ** 3),
    attentes: attentes.map(a => ({ ticket: a.ticket, depuis: a.depuis })),
  };
}
