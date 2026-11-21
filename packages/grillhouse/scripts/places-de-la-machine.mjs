// The places of the machine: a fixed number of places for the whole machine, whatever repository a
// session or a pass plays in, as the executors of Jenkins and the agents of Buildkite are a fixed
// number, and as the job server of GNU make shares its slots between every make of one build.
// Each session of an agent (testwriter, developer, reviewer…) takes a place at its start and gives
// it back at its end; a circuit that waits for a question, or between two sessions, holds none.
// A pass takes no place: it takes its part of the budget of the machine (below), which alone
// bounds it. A place is a session of an agent or a circuit; a part is a pass. Witness: 2026-11-02,
// load 39 on 12 cores with five circuits at once (grillhouse-9kq).
//
// - The places live on the Temporal server, in the one workflow of the machine
//   (src/temporal/places/deroule.ts), which grants them by the rule of scripts/regles-des-places.mjs
//   (a free place under the ceiling, the turn of the rank of arrival, the admission at the load and
//   the memory as `make -l`'s, the spacing of the starts) and frees the place of a process gone. A
//   synchronous caller reads and takes them by ./places-du-serveur.mjs, in a process of its own.
// - The server is required on the workstation: one that does not answer stops the taking, named.
//   In the CI (CI set) no place is taken. A trial machine (GRILLHOUSE_PARTS_DE_LA_MACHINE, the
//   base configuration of the tests) takes its places on the server GRILLHOUSE_PLACES_D_ESSAI
//   names, and none without it, so that no test takes a place of the user's machine.
// - A session that holds a place carries its mark to its children (GRILLHOUSE_PLACE_TENUE). In
//   the envelope of an agent (GRILLHOUSE_ENVELOPPE set, ./enveloppe/paquets-du-plan.mjs) no place
//   and no part is taken: the place of the session, taken out of it by the circuit, covers its
//   commands, and the envelope passes on its mark; a number of process there means nothing on
//   the machine.
// - The ceiling is a configuration of the poste (`plafondDe` of ./plafond-de-la-machine.mjs:
//   GRILLHOUSE_PLACES of `~/.config/grillhouse/machine.env`, 3 without it), which the workflow
//   reads again at each judgement; two starts are spaced by ESPACEMENT_MS
//   (GRILLHOUSE_ESPACEMENT_MS names another, in ms), which the workflow reads when it starts.
// - A wait says its reason (place, rank, load, memory or spacing) when it begins and every 30 s,
//   and is bounded, GRILLHOUSE_ATTENTE_MACHINE_MS: at the bound, « à repasser » (75), the request
//   withdrawn.
// - A wait keeps the rank of its arrival, as the queue of a merge train keeps its order: the rank
//   is drawn when the circuit is launched (`prendreUnRang`) and kept from one session to the next.
// - The number of workers of the tests of a session is `travailleursDe`: max(1, cores ÷ places),
//   passed to the tool of each language (GRILLHOUSE_TRAVAILLEURS).
//
// The parts of the passes, as Slurm reserves the cores and the memory of a job and waits while
// they lack, and as the job server of GNU make shares its slots between every make of a build:
// - The budget of the machine (its hardware less the reserve of the user,
//   ./plafond-de-la-machine.mjs) is shared in parts, which every pass of the machine takes, whatever
//   repository it plays in: the heavy pass of a circuit, `npm run verifier`, a targeted
//   `npm test`, a slice of the CI on a machine of ours, the night. A pass starts when its part
//   fits in what the parts held leave of the budget and the machine admits it (the load under the
//   cores, 4 GB free: `admissionDePart` of ./regles-des-places.mjs); else it waits, says what it
//   waits for when it begins and every 30 s, keeps its rank (the measure of the frame before a
//   project's, then the order of arrival) and stops at « à repasser » (75) at the bound of the wait.
// - The state is shared by the machine, one file per pass in the directory of the user's state
//   (`${XDG_STATE_HOME:-~/.local/state}/grillhouse/parts`; GRILLHOUSE_PARTS_DE_LA_MACHINE names
//   another, which the base configuration of the tests gives to each test file): the part held
//   or waited for, its project, ticket, kind, rank and, once it names it, its progress directory,
//   which the board reads (`lireLesParts`). A pass whose process is gone frees its part.
// - A part holds precise threads (`fils` of its file): the passes choose them on the topology of the
//   system (./coeurs-dedies.mjs `choisirLesCoeurs`), none held by another. A measure of time
//   (`mesure`) takes dedicated cores, physical cores whole (its sibling threads with them), the
//   number its project declares (`grillhouse.mesure`) or the default part of the budget, and the
//   other passes go on on the cores left; it waits for its cores, keeping its rank, then for the
//   rest of them (their load, out of it, under 10 %), within the bound of the wait.
// - A pass that holds a part carries its mark to its children (GRILLHOUSE_PART_TENUE): a pass they
//   play takes no second part, and the workers of its tools are the cores of its part
//   (GRILLHOUSE_TRAVAILLEURS).
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync } from 'node:fs';
import { availableParallelism, homedir } from 'node:os';
import path from 'node:path';
import { departDe } from './mesure/base-de-passe.mjs';
import { lireLaConsommation } from './consommation-des-passes.mjs';
import { ecrireAtomique } from './mesure/avancement.mjs';
import { A_REPASSER } from './codes-de-sortie.mjs';
import {
  AttenteDeLaMachine,
  attendreDeLaPlace,
  borneDe,
  racineDeLaCopie,
  racineDuDepot,
  rangDeLaMesure,
} from './attente-de-la-machine.mjs';
import {
  budgetEnFils,
  chargeDesCoeursDuSysteme,
  choisirLesCoeurs,
  coeursDeLaMesureDe,
  filsDeLaMesure,
  lireLaTopologie,
  mesureDeclareeDe,
  SEUIL_DE_CHARGE,
} from './coeurs-dedies.mjs';
import { paquetsDeLEnveloppe } from './enveloppe/paquets-du-plan.mjs';
import { ecrireLaTrace, traceDesPlaces } from './journal-des-etats.mjs';
import { mesureDeLaMachine, processusVivant } from './mesure-de-la-machine.mjs';
import {
  budgetDe,
  partDe,
  partDeclareeDe,
  plafondDe,
  reserveDe,
} from './plafond-de-la-machine.mjs';
import { duree, refusDePart, VARIABLE_JETON } from './regles-des-places.mjs';
import { attendreUnPeu, lacherVerrou, prendreVerrou } from './verrou-de-fichier.mjs';

// The spacing and the jeton of the night are rules (./regles-des-places.mjs), published here too.
export {
  ESPACEMENT_MS,
  espacementDe,
  VARIABLE_ESPACEMENT,
  VARIABLE_JETON,
} from './regles-des-places.mjs';
export const VARIABLE_TRAVAILLEURS = 'GRILLHOUSE_TRAVAILLEURS';

/**
 * The command <commande> placed under `nice` then `ionice`, so a session or a pass yields the CPU
 * and the disk to the rest of the machine (its command kept whole at the end).
 * @param {string[]} commande
 * @returns {string[]}
 */
export function sousNiceEtIonice(commande) {
  return ['nice', '-n', '10', 'ionice', '-c', '2', '-n', '7', ...commande];
}
/** The mark of a place held, which the children of its holder inherit. */
export const VARIABLE_TENUE = 'GRILLHOUSE_PLACE_TENUE';
/** The measure of the machine a trial fixes, in JSON `{ coeurs, charge, memoireLibre, memoireTotale }`. */
export const VARIABLE_MESURE_D_ESSAI = 'GRILLHOUSE_MESURE_D_ESSAI';
/** The directory of the state of the parts a trial names, in place of the user's. */
export const VARIABLE_PARTS = 'GRILLHOUSE_PARTS_DE_LA_MACHINE';
/** The mark of a part held, which the children of its holder inherit. */
export const VARIABLE_PART_TENUE = 'GRILLHOUSE_PART_TENUE';
// The server of the places of a trial machine.
const VARIABLE_ESSAI = 'GRILLHOUSE_PLACES_D_ESSAI';

const RAPPEL_MS = 30_000;
// The reading and the taking of the places on the server, in a process of their own.
const PONT = path.join(import.meta.dirname, 'places-du-serveur.mjs');

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
 * The workers a task plays its tests on, as its environment gives them (GRILLHOUSE_TRAVAILLEURS,
 * set by the envelope for a session, by the pass for a heavy pass): what the module of each
 * language passes to its tool. Null without the variable: the tool keeps its own default.
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
  if (env[VARIABLE_PARTS]) {
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
 * The request of a place for the process <pid>: its start, its ticket, the root of its project,
 * the rank of its circuit, and the jeton of the night when <env> carries it (VARIABLE_JETON: the
 * passes of the night), which the workflow of the machine lets pass during the reservation of the
 * machine.
 * @param {{ env?: Record<string, string | undefined>, pid: number, depart?: string | null,
 *   ticket?: string | null, racine?: string, rang?: number | null }} o
 * @returns {{ pid: number, depart: string | null, ticket: string | null, racine?: string | null,
 *   rang?: number, jeton?: string }}
 */
export function demandeDePlace({ env = process.env, pid, depart, ticket = null, racine, rang }) {
  const jeton = env[VARIABLE_JETON];
  return {
    pid,
    depart: depart === undefined ? departDe(pid) : depart,
    ticket,
    ...(racine === undefined ? {} : { racine: racineDuDepot(racine) }),
    ...(rang === undefined || rang === null ? {} : { rang }),
    ...(jeton ? { jeton } : {}),
  };
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
    ...demandeDePlace({ env, pid, depart, ticket, racine, rang }),
    borneMs,
    rappelMs,
  };
  // No deadline of the process: the bridge holds the bound itself (`attendreLaPlace`), and under
  // the supervisor's closure the wait lasts until the reopening.
  const { code, lignes } = auServeur(e, ['prendre', JSON.stringify(demande)], 0);
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
 * The directory of the state of the parts under <env>: GRILLHOUSE_PARTS_DE_LA_MACHINE, else
 * `grillhouse/parts` under the state directory of the user (`XDG_STATE_HOME`, else
 * `~/.local/state`), common to every project of the machine.
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function dossierDesParts(env = process.env) {
  if (env[VARIABLE_PARTS]) {
    return env[VARIABLE_PARTS];
  }
  const etat = env.XDG_STATE_HOME || path.join(env.HOME || homedir(), '.local', 'state');
  return path.join(etat, 'grillhouse', 'parts');
}

/**
 * The state of a pass in its file of the parts: `etat` « tient » (its part is held) or « attend »
 * (`raison`: what it waits for), and what the board reads besides (`depot`, `copie`, `depuis`,
 * `dossier` its progress directory, `depasse` what it consumes beyond its part).
 * @typedef {{ id: string, pid: number, depart: any, projet: string, ticket: string | null,
 *   sorte: string, rang: number, coeurs: number, memoire: number, etat: string, raison?: string,
 *   depot?: string, copie?: string, depuis?: number, dossier?: string | null,
 *   depasse?: string | null }} PartDUnePasse
 */

/**
 * Writes the state of the pass <passe> in its file of <dossier>, whole or not at all. The file of a
 * pass is one: a new state replaces it.
 * @param {string} dossier
 * @param {{ id: string } & Record<string, unknown>} passe
 */
export function poserLaPart(dossier, passe) {
  ecrireAtomique(path.join(dossier, `${passe.id}.json`), passe);
}

/**
 * Gives back the part of the pass <id>: its file goes, and the directory when it is empty. A part
 * that is not there changes nothing.
 * @param {string} dossier
 * @param {string} id
 */
export function rendreLaPart(dossier, id) {
  rmSync(path.join(dossier, `${id}.json`), { force: true });
  try {
    rmdirSync(dossier);
  } catch {
    // other parts stand there, or the directory is gone
  }
}

/**
 * The parts of <dossier> as the machine holds them: `prises` (the passes that hold their part)
 * and `attentes` (those that wait, in the order of their rank). A pass whose process is gone
 * (`vivant`, `processusVivant` by default: its pid and its start) frees its part, its file
 * removed. A directory that is not there holds none.
 * @param {string} dossier
 * @param {{ vivant?: (p: PartDUnePasse) => boolean }} [o]
 * @returns {{ prises: PartDUnePasse[], attentes: PartDUnePasse[] }}
 */
export function lireLesParts(dossier, { vivant = processusVivant } = {}) {
  let noms;
  try {
    noms = readdirSync(dossier).filter(n => n.endsWith('.json'));
  } catch {
    return { prises: [], attentes: [] };
  }
  const prises = [];
  const attentes = [];
  for (const nom of noms) {
    let p;
    try {
      p = JSON.parse(readFileSync(path.join(dossier, nom), 'utf8'));
    } catch {
      continue;
    }
    if (!p || typeof p.id !== 'string') {
      continue;
    }
    if (!vivant(p)) {
      rmSync(path.join(dossier, nom), { force: true });
      continue;
    }
    (p.etat === 'attend' ? attentes : prises).push(p);
  }
  return { prises, attentes: attentes.sort((a, b) => a.rang - b.rang) };
}

/**
 * The machine a pass is judged on under <env>: the one a trial fixes (GRILLHOUSE_MESURE_D_ESSAI),
 * else the real one.
 * @param {Record<string, string | undefined>} env
 */
const machineDe = env => mesureDEssai(env) ?? mesureDeLaMachine();

/**
 * The budget of the machine under <env>: its hardware (the one a trial fixes, else the real one)
 * less the reserve of the user.
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ coeurs: number, memoire: number }}
 * @throws {Error} naming the variable of the reserve when it is faulty or leaves nothing
 */
export function budgetDeLaPasse(env = process.env) {
  const m = machineDe(env);
  return budgetDe({ coeurs: m.coeurs, memoireTotale: m.memoireTotale }, reserveDe(env, { coeurs: m.coeurs }));
}

/**
 * The part of a pass of the project at <racine> under <env>: the one the key `grillhouse.part` of
 * its main tree's `package.json` declares, else the default part of the budget.
 * @param {{ racine: string, env?: Record<string, string | undefined> }} o
 * @returns {{ coeurs: number, memoire: number }}
 * @throws {AttenteDeLaMachine} naming the key (code 1) when its value is faulty, before any work
 */
export function partDeLaPasse({ racine, env = process.env }) {
  const { declaree, faute } = partDeclareeDe(packageDuDepot(racine));
  if (faute) {
    throw new AttenteDeLaMachine(`✗ ${faute}`, 1);
  }
  return partDe({
    declaree,
    budget: budgetDeLaPasse(env),
    places: plafondDe(env),
    pic: plusGrandPicDeJour(racineDuDepot(racine)),
  });
}

// The kinds of pass the night and the measures of time write: their peaks are not those of a day.
const SORTES_HORS_JOUR = new Set(['nuit', 'tests-de-nuit', 'mesure']);

/**
 * The largest peak of memory (bytes) of the day passes in the register of the project at <racine>;
 * undefined without one. A line without a readable peak, a malformed one and those of the night
 * and of the measures of time do not count.
 * @param {string} racine
 * @returns {number | undefined}
 */
function plusGrandPicDeJour(racine) {
  let pic;
  for (const l of lireLaConsommation(racine)) {
    const p = l.memoirePic;
    if (
      SORTES_HORS_JOUR.has(l.sorte) ||
      l.sorte.startsWith('mesure') ||
      typeof p !== 'number' ||
      !Number.isFinite(p) ||
      p <= 0
    ) {
      continue;
    }
    pic = Math.max(pic ?? 0, p);
  }
  return pic;
}

// The `package.json` of the main tree of the repository at <racine>; empty without one (a
// repository without a package.json declares neither part nor measure).
function packageDuDepot(racine) {
  try {
    return JSON.parse(readFileSync(path.join(racineDuDepot(racine), 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * The cores a measure of time of the project at <racine> asks for, in threads: the key
 * `grillhouse.mesure` of its main tree's `package.json`, else the default part of the budget.
 * @param {{ racine: string, budget: { coeurs: number } }} o
 * @returns {number}
 * @throws {AttenteDeLaMachine} naming the key (code 1) when its value is faulty, before any work
 */
function coeursDeLaMesure({ racine, budget, env }) {
  const { declaree, faute } = mesureDeclareeDe(packageDuDepot(racine));
  if (faute) {
    throw new AttenteDeLaMachine(`✗ ${faute}`, 1);
  }
  return coeursDeLaMesureDe({ declaree, budget, places: plafondDe(env) });
}

const RANGS = { 1: 'mesure du cadre', 2: "mesure d'un projet" };
// The rank of a pass among the parts: the kind of its measure first (the frame's before a
// project's), then its time of arrival, so that a smaller rank passes first.
const ECHELLE_DES_RANGS = 1e14;

// Plays <f> holding the short lock of the admission of <dossier>, so that two passes never judge
// the same free budget at once.
function sousLAdmission(dossier, f) {
  mkdirSync(dossier, { recursive: true });
  const verrou = path.join(dossier, '.admission');
  prendreVerrou(verrou, { attendre: true });
  try {
    return f();
  } finally {
    lacherVerrou(verrou);
  }
}

/**
 * How a measure reads the load of the threads it was given under <env>: on the machine a trial
 * fixes (GRILLHOUSE_MESURE_D_ESSAI) they are at rest, no trial reading the load of the user's
 * machine; else the load the system gives (<systeme>).
 * @param {Record<string, string | undefined>} [env]
 * @param {(fils: number[]) => number | null} [systeme]
 * @returns {(fils: number[]) => number | null}
 */
export function lecteurDeLaCharge(env = process.env, systeme = chargeDesCoeursDuSysteme) {
  return env[VARIABLE_MESURE_D_ESSAI] ? () => 0 : systeme;
}

/**
 * Takes the part of a pass of the project at <racine>, waiting for it, saying what it waits for
 * (`dire`) when it begins and every <rappelMs>, and returns it. Room first on the disks the pass
 * writes on (`attendreDeLaPlace`), then the part: it is taken once it fits in what the parts held
 * leave of the budget and the load and the memory of the machine admit it, the waits of a smaller
 * rank passing first. Its state is one file of the parts (`poserLaPart`), « attend » then
 * « tient ». The night (VARIABLE_JETON) and a pass that asks for the <entiere> budget take the
 * whole budget: they play alone. A <mesure> of time takes dedicated cores (`fils`, whole physical
 * cores), waits for them and for their rest (<chargeDesCoeurs>: the load of the threads it gives,
 * null without a reading, by default `lecteurDeLaCharge`; <topologie>, the topology of the system, for a trial).
 * The reservation of the machine (<lireLaReservation>, the places of the server by default) is read at each
 * turn of the wait, before the admission lock: under the supervisor's closure the pass waits without bound
 * (« machine fermée par le superviseur »), under the night's it waits unless it carries its jeton, within
 * the bound; a reading that fails stands for no reservation. Where no part is taken (the envelope of an agent, a part already
 * held: GRILLHOUSE_PART_TENUE) the part returned holds nothing.
 * @param {{ env?: Record<string, string | undefined>, racine?: string, ticket?: string | null,
 *   sorte?: string, entiere?: boolean, borneMs?: number, rappelMs?: number,
 *   dire?: (l: string) => void, maintenant?: () => number, dormir?: (ms: number) => void,
 *   libre?: (d: string) => number, occupe?: (d: string) => string,
 *   occupeLaCopie?: (r: string) => string }} [o]
 * @returns {{ id: string | null, part: { coeurs: number, memoire: number } | null,
 *   env: Record<string, string | undefined>, rendre: () => void, raison: string | null }}
 *   `env`, the environment of its holder's children, with the mark of the part and the workers of
 *   its tools; `raison`, why no part is held, null when one is
 * @throws {AttenteDeLaMachine} at the bound of the wait (code 75), or on a faulty key or reserve
 *   (code 1), its reason named
 */
export function prendreUnePart({
  env = process.env,
  racine = process.cwd(),
  ticket,
  sorte,
  entiere = false,
  mesure = false,
  topologie,
  chargeDesCoeurs = lecteurDeLaCharge(env),
  borneMs = borneDe(env),
  rappelMs = RAPPEL_MS,
  dire = l => process.stdout.write(`${l}\n`),
  maintenant = Date.now,
  dormir = attendreUnPeu,
  lireLaReservation = () => lirePlaces({ env }).reservation ?? null,
  ...disques
} = {}) {
  const sans = raison => ({ id: null, part: null, fils: null, env, rendre: () => {}, raison });
  if (paquetsDeLEnveloppe(env)) {
    return sans("dans l'enveloppe d'un agent");
  }
  if (env[VARIABLE_PART_TENUE]) {
    return sans('sous la part de son parent');
  }
  // The caller names who the pass is, else its environment does (GRILLHOUSE_VERIFICATION_TICKET,
  // GRILLHOUSE_VERIFICATION_SORTE, empty as absent), else « Vérification » and no ticket.
  ticket = ticket ?? (env.GRILLHOUSE_VERIFICATION_TICKET || null);
  sorte = sorte ?? (env.GRILLHOUSE_VERIFICATION_SORTE || 'Vérification');
  const dossier = dossierDesParts(env);
  let budget;
  let part;
  // The precise threads of the budget and the topology they are chosen on.
  let budgetFils;
  let topo;
  try {
    budget = budgetDeLaPasse(env);
    topo = topologie ?? lireLaTopologie({ nombreDeFils: machineDe(env).coeurs });
    budgetFils = budgetEnFils({ topologie: topo, budget: budget.coeurs });
    if (mesure) {
      const demande = coeursDeLaMesure({ racine, budget, env });
      let fils = filsDeLaMesure({ budget: budgetFils, topologie: topo, demande });
      if (fils === null || !topo.lisible) {
        // No whole core in the budget, or a topology that does not read: each thread is a core.
        topo = { lisible: false, coeurs: topo.coeurs.flatMap(c => c.fils.map(f => ({ fils: [f], noeud: c.noeud }))) };
        fils = filsDeLaMesure({ budget: budgetFils, topologie: topo, demande });
        dire('la topologie des cœurs ne se lit pas : chaque fil compte pour un cœur.');
      }
      part = { coeurs: fils, memoire: Math.floor((budget.memoire * fils) / budget.coeurs) };
    } else {
      part = entiere || env[VARIABLE_JETON] ? budget : partDeLaPasse({ racine, env });
    }
  } catch (e) {
    throw e instanceof AttenteDeLaMachine ? e : new AttenteDeLaMachine(`✗ ${e.message}`, 1);
  }
  const depot = racineDuDepot(racine);
  const rangDeLaPasse = rangDeLaMesure(racine);
  const moi = {
    id: randomUUID(),
    pid: process.pid,
    depart: departDe(process.pid),
    projet: path.basename(depot),
    depot,
    copie: racineDeLaCopie(racine),
    ticket,
    sorte,
    rang: rangDeLaPasse * ECHELLE_DES_RANGS + maintenant(),
    coeurs: part.coeurs,
    memoire: part.memoire,
    dediee: mesure,
    depuis: maintenant(),
  };
  let tenus = null;
  try {
    attendreDeLaPlace({
      env,
      dire,
      borneMs,
      rappelMs,
      racine,
      maintenant,
      dormir,
      ...disques,
      inscrire: raison => {
        poserLaPart(dossier, { ...moi, etat: 'attend', raison });
        return () => {};
      },
    });
    let debut = maintenant();
    let dit = null;
    for (;;) {
      // The reservation of the machine is read each turn, before the admission lock, bounded by
      // the delay of a call to the server; a reading that fails stands for « no reservation ».
      let reservation = null;
      try {
        reservation = lireLaReservation() ?? null;
      } catch {
        reservation = null;
      }
      const fermee = reservation?.auteur === 'superviseur';
      const refus = sousLAdmission(dossier, () => {
        const { prises, attentes } = lireLesParts(dossier);
        let r = refusDePart(
          { prises, attentes },
          {
            id: moi.id,
            rang: moi.rang,
            part,
            budget,
            mesurer: () => machineDe(env),
            dediee: mesure,
            reservation,
            jeton: env[VARIABLE_JETON] ?? null,
          }
        );
        let fils = null;
        if (r === null) {
          // The count fits: the precise threads, none held by another pass (a measure's whole
          // cores, a free core cut by an ordinary pass's threads does not give one).
          fils = choisirLesCoeurs({
            budget: budgetFils,
            topologie: topo,
            tenus: prises.filter(p => p.id !== moi.id).flatMap(p => p.fils ?? []),
            demande: part.coeurs,
            dedies: mesure,
          });
          if (fils === null) {
            r = mesure
              ? `cœurs dédiés : ${part.coeurs} demandés, aucun cœur entier libre`
              : `cœurs : ${part.coeurs} demandés, pas assez de fils libres`;
          }
        }
        poserLaPart(
          dossier,
          r === null ? { ...moi, fils, etat: 'tient' } : { ...moi, etat: 'attend', raison: r }
        );
        tenus = r === null ? fils : null;
        return r;
      });
      if (refus === null) {
        break;
      }
      const t = maintenant();
      if (fermee) {
        // The supervisor's order lasts until its contrary: no bound, the wait counts from the reopening.
        debut = t;
      }
      if (t - debut >= borneMs) {
        throw new AttenteDeLaMachine(
          `⏱ attente de la part bornée à ${duree(borneMs)} (GRILLHOUSE_ATTENTE_MACHINE_MS), ${RANGS[rangDeLaPasse]} : ${refus} ; à repasser (code ${A_REPASSER}).`,
          A_REPASSER
        );
      }
      if (dit === null) {
        dire(
          `⏳ ${RANGS[rangDeLaPasse]}, la passe attend sa part (${part.coeurs} cœurs) : ${refus}${fermee ? ' ; sans borne, jusqu’à la réouverture.' : ` ; ${duree(borneMs)} au plus.`}`
        );
      } else if (t - dit >= rappelMs) {
        dire(`⏳ la passe attend sa part depuis ${duree(t - debut)} : ${refus}.`);
      }
      if (dit === null || t - dit >= rappelMs) {
        dit = t;
      }
      dormir(Math.max(1, Math.min(200, borneMs - (maintenant() - debut))));
    }
    // The rest of the dedicated cores: a measure goes once their load, out of it, is under the
    // threshold, within the bound of the wait; without a reading it does not judge that load.
    if (mesure) {
      let ditCharge = null;
      for (;;) {
        const charge = chargeDesCoeurs(tenus);
        if (charge === null) {
          dire('la charge des cœurs dédiés ne se lit pas : la mesure ne la juge pas.');
          break;
        }
        if (charge < SEUIL_DE_CHARGE) {
          break;
        }
        const t = maintenant();
        const pct = `${Math.round(charge * 100)} %`;
        if (t - debut >= borneMs) {
          throw new AttenteDeLaMachine(
            `⏱ attente du repos des cœurs dédiés bornée à ${duree(borneMs)} (GRILLHOUSE_ATTENTE_MACHINE_MS), ${RANGS[rangDeLaPasse]} : charge de ${pct} des cœurs dédiés hors la mesure, ${Math.round(SEUIL_DE_CHARGE * 100)} % au plus ; à repasser (code ${A_REPASSER}).`,
            A_REPASSER
          );
        }
        if (ditCharge === null || t - ditCharge >= rappelMs) {
          dire(`⏳ les cœurs dédiés ne sont pas au repos : charge de ${pct} hors la mesure, ${Math.round(SEUIL_DE_CHARGE * 100)} % au plus.`);
          ditCharge = t;
        }
        dormir(Math.max(1, Math.min(200, borneMs - (maintenant() - debut))));
      }
    }
    if (dit !== null) {
      dire(`✓ part prise après ${duree(maintenant() - debut)}.`);
    }
  } catch (e) {
    rendreLaPart(dossier, moi.id);
    throw e;
  }
  const {
    GRILLHOUSE_VERIFICATION_SORTE: _sorte,
    GRILLHOUSE_VERIFICATION_TICKET: _ticket,
    ...enfant
  } = env;
  return {
    id: moi.id,
    part,
    fils: tenus,
    dediee: mesure,
    budgetFils,
    topologie: topo,
    env: {
      ...enfant,
      [VARIABLE_PART_TENUE]: moi.id,
      [VARIABLE_TRAVAILLEURS]: String(part.coeurs),
    },
    rendre: () => rendreLaPart(dossier, moi.id),
    raison: null,
  };
}

/**
 * Names the progress directory <dossier> of the pass that holds the part its environment
 * <env> marks (GRILLHOUSE_PART_TENUE), in its file of the parts, where the board reads it; a
 * function that takes it out. Nothing without a part held (the envelope of an agent).
 * @param {{ env?: Record<string, string | undefined>, dossier: string }} o
 * @returns {() => void}
 */
export function nommerLAvancement({ env = process.env, dossier }) {
  const id = env[VARIABLE_PART_TENUE];
  if (!id) {
    return () => {};
  }
  const f = path.join(dossierDesParts(env), `${id}.json`);
  const ecrire = d => {
    try {
      const p = JSON.parse(readFileSync(f, 'utf8'));
      ecrireAtomique(f, { ...p, dossier: d });
      return true;
    } catch {
      return false;
    }
  };
  return ecrire(dossier) ? () => void ecrire(null) : () => {};
}

/**
 * Plays <passe> holding a part of the machine, given back at its end, whether it returns or
 * throws: its exit code, or, a wait that stops (its bound, 75; a faulty key, 1), its reason said
 * and its code. <passe> receives the environment of its children and the part (null where none is
 * held); the pass is a command a person runs (`npm test`) and the process itself.
 * @param {(env: Record<string, string | undefined>, part: { coeurs: number, memoire: number } | null) => number} passe
 * @param {{ env?: Record<string, string | undefined>, racine?: string,
 *   dire?: (l: string) => void }} [o]
 * @returns {number}
 */
export function surUnePart(
  passe,
  { env = process.env, racine = process.cwd(), dire = l => process.stderr.write(`${l}\n`) } = {}
) {
  let prise;
  try {
    prise = prendreUnePart({ env, racine, dire, sorte: 'Tests' });
  } catch (e) {
    if (!(e instanceof AttenteDeLaMachine)) {
      throw e;
    }
    dire(e.message);
    return e.code;
  }
  try {
    return passe(prise.env, prise.part);
  } finally {
    prise.rendre();
  }
}

/**
 * The places taken and the waits of the machine under <env>, as the server holds them: `{ plafond,
 * faute, prises, attentes, circuits }` (`faute`, a value of the ceiling the poste names and the
 * server refused, the ceiling read before kept; `circuits`, the places of the circuits, held or
 * waited for, `{ racine, ticket, rang, accordee, depuis, vu }`), `prises` `{ id, pid, depart, ticket, racine, rang, depuis }`, `attentes` in the
 * order of arrival `{ id, pid, ticket, rang, raison, depuis }`; none where no place is taken.
 * @param {{ env?: Record<string, string | undefined> }} [o]
 */
export function lirePlaces({ env = process.env, ms = 30_000 } = {}) {
  const e = surLeServeur(env);
  return e
    ? auServeur(e, ['lire'], ms).lignes[0]
    : { plafond: plafondDe(env), prises: [], attentes: [] };
}

// The command <mode> (`fermer`, `rouvrir`) of the bridge to the server under <env>: its issue. No
// server where no place is taken (the CI, the envelope of an agent), which cannot close a machine.
function commandeDeLaFermeture(mode, env) {
  const e = surLeServeur(env);
  if (!e) {
    throw new Error('aucun serveur Temporal ici : la machine ne se ferme que sur le poste');
  }
  return auServeur(e, [mode]).lignes[0];
}

/**
 * Closes the machine under <env> (the supervisor's reservation of the places, `cordon` of
 * kubectl): its issue, `fermee`, `deja-fermee`, or `nuit-tient` when the night holds the machine.
 * @param {{ env?: Record<string, string | undefined> }} [o]
 * @returns {'fermee' | 'deja-fermee' | 'nuit-tient'}
 */
export const fermerLaMachine = ({ env = process.env } = {}) => commandeDeLaFermeture('fermer', env);

/**
 * Reopens the machine under <env>: its issue, `rouverte`, `deja-ouverte`, or `nuit-tient` (the
 * reopening never lifts a night's reservation).
 * @param {{ env?: Record<string, string | undefined> }} [o]
 * @returns {'rouverte' | 'deja-ouverte' | 'nuit-tient'}
 */
export const rouvrirLaMachine = ({ env = process.env } = {}) =>
  commandeDeLaFermeture('rouvrir', env);

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
 *   fermeture: { auteur: 'nuit' | 'superviseur', depuis: number, phase: string } | null,
 *   plafond: number, faute: string | null, charge: number, coeurs: number, memoireGo: number,
 *   memoireTotaleGo: number, attentes: { ticket: string, depuis: number, disque?: string | null }[] }}
 * @throws {Error} naming GRILLHOUSE_MESURE_D_ESSAI when its value is faulty
 */
export function etatDesPlaces({ env = process.env, mesurer = mesureDeLaMachine, lues } = {}) {
  const fixee = mesureDEssai(env);
  const {
    plafond,
    faute = null,
    prises,
    attentes,
    circuits = [],
    nuit = null,
    fermeture = null,
  } = lues ?? lirePlaces({ env });
  const m = fixee ?? mesurer();
  return {
    prises: prises.length,
    tenues: prises.map(p => ({ ticket: p.ticket ?? null, racine: p.racine ?? null })),
    nuit: nuit?.phase ?? null,
    fermeture,
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
