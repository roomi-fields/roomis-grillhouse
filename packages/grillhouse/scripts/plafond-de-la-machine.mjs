// The settings of the poste for the machine (scripts/places-de-la-machine.mjs), configurations of
// the poste read again at each judgement, as Buildkite reads the number of its agents from its
// configuration and Nomad its `client.reserved`: the workflow of the machine reads the ceiling of
// the places by an activity (src/temporal/places/activites.ts), the board and the number of workers
// of the tests by this same function, so that a ceiling changed counts without restarting anything.
//
// - The file of the poste `machine.env`, under the frame's directory of configuration
//   (`~/.config/grillhouse/`, scripts/fichier-du-poste.mjs), holds `GRILLHOUSE_PLACES=<n>`, as
//   `turbo-cache.env` holds the server of the cache.
// - The environment wins, as for every file of the poste: GRILLHOUSE_PLACES set (a trial machine,
//   a test) is read instead of the file. Without either, PLAFOND_PAR_DEFAUT, 3.
// - A value that is not a positive integer is refused by its name and its place.
//
// The budget of the machine and the part of a pass (functions with the hardware and the settings
// as input, nothing read from the machine), as Slurm reserves the cores and the memory of a job
// and Bazel bounds `--local_resources`:
// - The reserve of the user, the share of the machine no pass takes: GRILLHOUSE_RESERVE_COEURS
//   (by default min(4, max(0, cores − 4)): 0 on 4 cores or fewer, 2 on 6, 4 from 8) and GRILLHOUSE_RESERVE_MEMOIRE_GO (4 GB), the environment first, then
//   `machine.env`; zero is admitted, a value that is not a whole number ≥ 0 is refused by its name.
// - The budget is the cores and the memory of the machine less the reserve; a reserve that leaves
//   no core or no memory is refused by its name.
// - The part of a pass is its cores and its memory: the default part has the budget divided by the
//   places of the machine in cores (whole division, 2 at least), and in memory the largest peak the
//   project measured plus a quarter, never under its floor (the cores' proportion of the budget
//   before the division, a third of it, which it is without a measure); a
//   part a project declares (`grillhouse.part` of its `package.json`) replaces its own values; a
//   part larger than the budget is the budget (one pass at a time), and never under one core.
import { readFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import path from 'node:path';
import {
  avecLeFichierDuPoste,
  configurationDuPoste,
  variablesDuTexte,
} from './fichier-du-poste.mjs';

const GO = 1024 ** 3;
export const VARIABLE_PLACES = 'GRILLHOUSE_PLACES';
export const VARIABLE_RESERVE_COEURS = 'GRILLHOUSE_RESERVE_COEURS';
export const VARIABLE_RESERVE_MEMOIRE = 'GRILLHOUSE_RESERVE_MEMOIRE_GO';
/** The file of the poste that holds the ceiling, under `~/.config/grillhouse/`. */
export const FICHIER_DE_LA_MACHINE = 'machine.env';
/** The ceiling of the places of the machine when nothing names another. */
export const PLAFOND_PAR_DEFAUT = 3;
/** The cores the reserve of the user keeps when nothing names another. */
export const RESERVE_COEURS_PAR_DEFAUT = 4;
/** The memory the reserve of the user keeps when nothing names another, in GB. */
export const RESERVE_MEMOIRE_GO_PAR_DEFAUT = 4;
/** The cores the reservation of an ordinary pass holds when its project declares none. */
export const COEURS_PAR_DEFAUT = 3;
/** The cores the reservation of a direct pass holds, fixed. */
export const COEURS_DU_DIRECT = 2;
// The cores the reserve of the user leaves the passes at least; the floor of the memory.
const COEURS_LAISSES_AUX_PASSES = 4;

/**
 * The ceiling of the places under <env>: GRILLHOUSE_PLACES of the environment, else of the file
 * of the poste `machine.env`, else 3.
 * @param {Record<string, string | undefined>} [env]
 * @param {{ lire?: (f: string) => string | null }} [o] the reading of the file, for a trial
 * @returns {number}
 * @throws {Error} naming GRILLHOUSE_PLACES and where it is set when its value is not a positive integer
 */
export function plafondDe(env = process.env, o = {}) {
  const dedans = env[VARIABLE_PLACES] !== undefined;
  const v = avecLeFichierDuPoste(env, { fichier: FICHIER_DE_LA_MACHINE, ...o })[VARIABLE_PLACES];
  if (v === undefined || v === '') {
    return PLAFOND_PAR_DEFAUT;
  }
  if (!/^[1-9]\d*$/.test(v)) {
    const ou = dedans
      ? 'dans l’environnement'
      : `dans ${path.join(configurationDuPoste(env) ?? '~/.config/grillhouse', FICHIER_DE_LA_MACHINE)}`;
    throw new Error(
      `${VARIABLE_PLACES} vaut « ${v} » ${ou} : un entier positif est attendu (${PLAFOND_PAR_DEFAUT} par défaut).`
    );
  }
  return Number(v);
}

// The text of the file `machine.env` of the poste under <env>, null when it does not read.
function fichierDuPoste(env) {
  const dossier = configurationDuPoste(env);
  if (dossier === null) {
    return null;
  }
  try {
    return readFileSync(path.join(dossier, FICHIER_DE_LA_MACHINE), 'utf8');
  } catch {
    return null;
  }
}

// The value of <nom> under <env>, else in the file of the poste (its text read by <lire>), as a
// whole number ≥ 0; <defaut> without either.
function entierDuPoste(env, nom, defaut, lire) {
  const dedans = env[nom] !== undefined && env[nom] !== '';
  const fichier = variablesDuTexte(
    (lire ? lire(path.join(configurationDuPoste(env) ?? '', FICHIER_DE_LA_MACHINE)) : fichierDuPoste(env)) ?? ''
  );
  const v = dedans ? env[nom] : fichier[nom];
  if (v === undefined || v === '') {
    return defaut;
  }
  if (!/^\d+$/.test(v)) {
    const ou = dedans
      ? 'dans l’environnement'
      : `dans ${path.join(configurationDuPoste(env) ?? '~/.config/grillhouse', FICHIER_DE_LA_MACHINE)}`;
    throw new Error(`${nom} vaut « ${v} » ${ou} : un entier supérieur ou égal à zéro est attendu.`);
  }
  return Number(v);
}

/**
 * The reserve of the user under <env>: the cores and the memory (bytes) no pass takes.
 * @param {Record<string, string | undefined>} [env]
 * The default reserve of cores leaves the passes 4 cores at least, or all the cores of a smaller
 * machine: min(4, max(0, cores − 4)), so 0 on 4 cores or fewer, 2 on 6, 4 from 8.
 * @param {{ lire?: (f: string) => string | null, coeurs?: number }} [o] the reading of the file
 *   and the cores of the machine, for a trial
 * @returns {{ coeurs: number, memoire: number }}
 * @throws {Error} naming the variable whose value is not a whole number ≥ 0
 */
export function reserveDe(env = process.env, o = {}) {
  const coeursDeLaMachine = o.coeurs ?? cpus().length;
  const parDefaut = Math.min(
    RESERVE_COEURS_PAR_DEFAUT,
    Math.max(0, coeursDeLaMachine - COEURS_LAISSES_AUX_PASSES)
  );
  return {
    coeurs: entierDuPoste(env, VARIABLE_RESERVE_COEURS, parDefaut, o.lire),
    memoire:
      entierDuPoste(env, VARIABLE_RESERVE_MEMOIRE, RESERVE_MEMOIRE_GO_PAR_DEFAUT, o.lire) * GO,
  };
}

/**
 * The budget of the machine: its cores and its memory less the reserve of the user.
 * @param {{ coeurs: number, memoireTotale: number }} materiel
 * @param {{ coeurs: number, memoire: number }} reserve
 * @returns {{ coeurs: number, memoire: number }}
 * @throws {Error} naming GRILLHOUSE_RESERVE_COEURS or GRILLHOUSE_RESERVE_MEMOIRE_GO when the
 *   reserve leaves nothing
 */
export function budgetDe({ coeurs, memoireTotale }, reserve) {
  if (reserve.coeurs >= coeurs) {
    throw new Error(
      `${VARIABLE_RESERVE_COEURS} vaut ${reserve.coeurs} pour ${coeurs} cœurs : le budget de la machine serait nul, une réserve plus petite que ses cœurs est attendue.`
    );
  }
  if (reserve.memoire >= memoireTotale) {
    throw new Error(
      `${VARIABLE_RESERVE_MEMOIRE} vaut ${reserve.memoire / GO} Go pour ${Math.round(memoireTotale / GO)} Go de mémoire : le budget de la machine serait nul, une réserve plus petite que sa mémoire est attendue.`
    );
  }
  return { coeurs: coeurs - reserve.coeurs, memoire: memoireTotale - reserve.memoire };
}

/** The margin over the largest measured peak of memory: a quarter. */
const MARGE_DE_LA_MEMOIRE = 1.25;

// The default memory: its floor, the proportion of the budget a part of 4 cores held (or a third
// of the budget rounded up when that is more), raised to the largest measured peak <pic> plus a
// quarter (the hard ceiling of the group kills a pass above it) when the register measured more. A
// register that holds light passes alone (the guards, a pass of 50 ms: a peak of 16 Mo) would
// else give the next pass a ceiling its kernel kills it under, as the Vertical Pod Autoscaler
// bounds its recommendation by a minimum (`minAllowed`).
function memoireParDefautDe(budget, pic) {
  const coeursDAvant = Math.max(
    1,
    Math.min(budget.coeurs, Math.max(COEURS_LAISSES_AUX_PASSES, Math.ceil(budget.coeurs / 3)))
  );
  const plancher = Math.floor((budget.memoire * coeursDAvant) / budget.coeurs);
  return Math.min(budget.memoire, Math.max(plancher, Math.floor((pic ?? 0) * MARGE_DE_LA_MEMOIRE)));
}

/**
 * The reservation of a pass: the cores its project declares (`partDeclareeDe`), else 3, within the
 * budget and one core at least; a direct pass reserves 2 cores, fixed. Its memory is the declared
 * one, else the default memory, within the budget.
 * @param {{ declaree: { coeurs?: number, memoire?: number } | null,
 *   budget: { coeurs: number, memoire: number }, pic: number | undefined, direct?: boolean }} o
 * @returns {{ coeurs: number, memoire: number }}
 */
export function partDe({ declaree, budget, pic, direct = false }) {
  const voulus = direct ? COEURS_DU_DIRECT : (declaree?.coeurs ?? COEURS_PAR_DEFAUT);
  return {
    coeurs: Math.max(1, Math.min(budget.coeurs, voulus)),
    memoire: Math.min(budget.memoire, declaree?.memoire ?? memoireParDefautDe(budget, pic)),
  };
}

/**
 * The part a project declares in the key `grillhouse.part` of its `package.json` <pkg>
 * (`{ coeurs, memoireGo }`, each optional): `{ declaree, faute }`, `declaree` null without the
 * key, `faute` the line that names the key and what is wrong when it is.
 * @param {{ grillhouse?: { part?: unknown } }} pkg
 * @returns {{ declaree: { coeurs?: number, memoire?: number } | null, faute: string | null }}
 */
export function partDeclareeDe(pkg) {
  const part = pkg?.grillhouse?.part;
  if (part === undefined) {
    return { declaree: null, faute: null };
  }
  const faute = dit => ({
    declaree: null,
    faute: `grillhouse.part : ${dit} ({ "coeurs": <entier ≥ 1>, "memoireGo": <nombre > 0> } est attendu).`,
  });
  if (part === null || typeof part !== 'object' || Array.isArray(part)) {
    return faute(`« ${JSON.stringify(part)} » n’est pas un objet`);
  }
  const inconnue = Object.keys(part).find(k => k !== 'coeurs' && k !== 'memoireGo');
  if (inconnue !== undefined) {
    return faute(`la clé « ${inconnue} » est inconnue`);
  }
  const { coeurs, memoireGo } = part;
  if (coeurs !== undefined && !(Number.isInteger(coeurs) && coeurs >= 1)) {
    return faute(`coeurs vaut ${JSON.stringify(coeurs)}`);
  }
  if (memoireGo !== undefined && !(typeof memoireGo === 'number' && memoireGo > 0)) {
    return faute(`memoireGo vaut ${JSON.stringify(memoireGo)}`);
  }
  return {
    declaree: {
      ...(coeurs === undefined ? {} : { coeurs }),
      ...(memoireGo === undefined ? {} : { memoire: memoireGo * GO }),
    },
    faute: null,
  };
}

/**
 * The hardware of this machine: its cores and its total memory (bytes).
 * @returns {{ coeurs: number, memoireTotale: number }}
 */
export const materielDeLaMachine = () => ({ coeurs: cpus().length, memoireTotale: totalmem() });

/**
 * The budget of this machine under <env>: its hardware less the reserve of the user.
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ coeurs: number, memoire: number }}
 * @throws {Error} naming the variable of the reserve when it is faulty or leaves nothing
 */
export const budgetDeLaMachine = (env = process.env) => {
  const materiel = materielDeLaMachine();
  return budgetDe(materiel, reserveDe(env, { coeurs: materiel.coeurs }));
};
