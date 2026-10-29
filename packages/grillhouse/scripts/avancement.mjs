// The progress of an automatic pass, in figures, as Bazel's counter of actions « [1 234 / 2 000] »
// and the steps of a CI: the files of tests done over planned, and the instant of the last sign,
// which the board shows (scripts/tableau.mjs), so that a pass that freezes is seen.
//
// - A pass has its progress directory, which the variable GRILLHOUSE_AVANCEMENT (AVANCEMENT of
//   scripts/mesure/avancement.mjs) names to its commands: the circuit opens one for each
//   automatic pass and names it in its state (scripts/circuit.mjs), `npm run verifier` opens its own when it
//   receives none (scripts/langages/typescript/verifier.mjs). The directory holds `passe.json` (`{ genre, debut,
//   precedent }`: its kind, its start, the total of the previous pass of that kind), the records
//   of its tasks (`taches/`, written by the reporter of progress of the base configuration, one
//   per run of Vitest, and by the queue for the steps of its CI, scripts/integration/file.mjs),
//   and the plans of its runs of Turborepo (`plan/`).
// - The reading adds the records: the files done, and the files planned of the tasks started;
//   while every task the plans name has not started, the total of the previous pass of the same
//   kind stands when it is greater (a pass without a plan never knows all its tasks started).
//   The last sign is the latest writing of a record, or the start of the pass without one.
// - A plan: before a run that plays tests, its plan names the tasks of tests and those the run
//   replays from its cache (`inscrireLePlan`, which the module of the language feeds from the plan
//   of its runner); a task replayed counts its files as done at once, its number known by its hash
//   from the pass that played it, as a cache of Bazel keeps the outcome of an action by its key.
// - The totals live in `<git common dir>/grillhouse/avancement.json`, one per repository, its
//   copies included, beside the last green (scripts/dernier-vert.mjs): `{ passes, taches }`, the
//   total of the last pass of each kind and the files planned of each task by its hash (the
//   latest TACHES_GARDEES); each pass keeps its own at its end (`garderLeTotal`).
// - A measure out of a ticket (`npm run verifier` of a supervisor or of an integration) writes
//   beside the lock of the machine (scripts/verrou-de-machine.mjs; the file of the lock with
//   `.avancement.json` added, never the lock itself) its repository, its command, its progress
//   directory and its process, removed at its end; the board reads it while that process lives
//   and the lock is held (`lireLaMesure`).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ecrireAtomique, TACHES } from './mesure/avancement.mjs';
import { verrouDeMachine } from './verrou-de-machine.mjs';

const PASSE = 'passe.json';
const PLAN = 'plan';
const TACHES_GARDEES = 2_000;

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const lister = d => {
  try {
    return readdirSync(d).filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }
};

// The file of the totals of the repository at <racine>, null out of git.
function fichierDesTotaux(racine) {
  const r = spawnSync(
    'git',
    ['-C', racine, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    {
      encoding: 'utf8',
    }
  );
  return r.status === 0 ? path.join(r.stdout.trim(), 'grillhouse', 'avancement.json') : null;
}
const lireLesTotaux = racine => {
  const f = fichierDesTotaux(racine);
  const t = f ? lireJson(f) : null;
  return { fichier: f, passes: t?.passes ?? {}, taches: t?.taches ?? {} };
};

/**
 * Opens the progress directory of a pass of kind <genre> (null: a pass whose total is not kept)
 * in the repository at <racine>, made under <dans>, its start <debut>; its path.
 * @param {{ racine: string, genre?: string | null, dans?: string, debut?: number }} o
 */
export function ouvrirAvancement({ racine, genre = null, dans = tmpdir(), debut = Date.now() }) {
  const dossier = mkdtempSync(path.join(dans, 'avancement-'));
  const precedent = genre ? (lireLesTotaux(racine).passes[genre] ?? null) : null;
  ecrireAtomique(path.join(dossier, PASSE), { genre, debut, precedent });
  return dossier;
}

/**
 * Before a run while <dossier> is a progress directory: its plan, the tasks of tests <taches> it
 * names (`{ hash, cache }`, `cache` whether the run replays it from its cache), each task replayed
 * counted done at once, its number known by its hash. The module of the language reads the plan of
 * its runner (scripts/langages/typescript/turbo-des-paquets.mjs, `planifier`).
 * @param {string | undefined} dossier
 * @param {{ racine: string, taches: { hash: string, cache: boolean }[] }} o
 */
export function inscrireLePlan(dossier, { racine, taches }) {
  if (!dossier || !taches.length) return;
  const { taches: connues } = lireLesTotaux(racine);
  try {
    for (const t of taches.filter(x => x.cache)) {
      const n = connues[t.hash] ?? 0;
      ecrireAtomique(path.join(dossier, TACHES, `cache-${t.hash}.json`), {
        hash: t.hash,
        faits: n,
        prevus: n,
        a: Date.now(),
        cache: true,
      });
    }
    ecrireAtomique(path.join(dossier, PLAN, `${process.pid}-${Date.now()}.json`), {
      hashes: taches.map(t => t.hash),
    });
  } catch {
    // A directory that does not write leaves the pass going, without its progress.
  }
}

// The records of <dossier>, one per task: a task Turborepo replayed and played anyway counts by
// the record of its run, a task played again by its latest.
function enregistrements(dossier) {
  const parHash = new Map();
  const sans = [];
  for (const f of lister(path.join(dossier, TACHES))) {
    const e = lireJson(path.join(dossier, TACHES, f));
    if (!e || !Number.isFinite(e.faits) || !Number.isFinite(e.prevus)) continue;
    if (!e.hash) sans.push(e);
    else {
      const avant = parHash.get(e.hash);
      if (!avant || (!e.cache && (avant.cache || e.a > avant.a))) parHash.set(e.hash, e);
    }
  }
  return [...parHash.values(), ...sans];
}

/**
 * The progress of the pass whose directory is <dossier>: its files done and planned, and the
 * instant of its last sign (ms); null when the directory does not read.
 * @param {string} dossier
 * @returns {{ faits: number, prevus: number, dernier: number } | null}
 */
export function lireAvancement(dossier) {
  const passe = lireJson(path.join(dossier, PASSE));
  if (!passe) return null;
  const liste = enregistrements(dossier);
  const faits = liste.reduce((s, e) => s + e.faits, 0);
  const demarres = liste.reduce((s, e) => s + e.prevus, 0);
  const planifies = new Set(
    lister(path.join(dossier, PLAN)).flatMap(
      f => lireJson(path.join(dossier, PLAN, f))?.hashes ?? []
    )
  );
  const vus = new Set(liste.map(e => e.hash).filter(Boolean));
  const tous = planifies.size > 0 && [...planifies].every(h => vus.has(h));
  const prevus = tous ? demarres : Math.max(demarres, passe.precedent ?? 0);
  const debut = Number(passe.debut) || 0;
  const dernier = Math.max(debut, ...liste.map(e => Number(e.a) || 0));
  return { faits, prevus, debut, dernier };
}

/**
 * Keeps, at the end of the pass whose directory is <dossier>, its total under its kind and the
 * files planned of each task it played, in the totals of the repository at <racine>.
 * @param {string} dossier
 * @param {string} racine
 */
export function garderLeTotal(dossier, racine) {
  const passe = lireJson(path.join(dossier, PASSE));
  if (!passe) return;
  const t = lireLesTotaux(racine);
  if (!t.fichier) return;
  const liste = enregistrements(dossier);
  if (passe.genre && liste.length) t.passes[passe.genre] = liste.reduce((s, e) => s + e.prevus, 0);
  for (const e of liste.filter(x => x.hash && !x.cache)) {
    delete t.taches[e.hash];
    t.taches[e.hash] = e.prevus;
  }
  const cles = Object.keys(t.taches);
  for (const c of cles.slice(0, Math.max(0, cles.length - TACHES_GARDEES))) delete t.taches[c];
  try {
    ecrireAtomique(t.fichier, { passes: t.passes, taches: t.taches });
  } catch {
    // A place that does not write keeps no total: the next pass counts without it.
  }
}

// The file of the measure out of a ticket under <env>: beside the lock of the machine.
function fichierDeLaMesure(env = process.env) {
  const verrou = verrouDeMachine(env);
  return { verrou, fichier: `${verrou}.avancement.json` };
}

/**
 * Names beside the lock of the machine the measure out of a ticket that runs: the repository
 * <depot>, the command <commande>, its progress directory <dossier>, this process; a function that
 * removes it.
 * @param {{ env?: Record<string, string | undefined>, depot: string, commande: string, dossier: string }} o
 * @returns {() => void}
 */
export function ecrireLaMesure({ env = process.env, depot, commande, dossier }) {
  const { fichier } = fichierDeLaMesure(env);
  try {
    mkdirSync(path.dirname(fichier), { recursive: true });
    ecrireAtomique(fichier, { depot, commande, dossier, pid: process.pid });
  } catch {
    return () => {};
  }
  return () => {
    if (lireJson(fichier)?.pid === process.pid) rmSync(fichier, { force: true });
  };
}

const vivant = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

/**
 * The measure out of a ticket that holds the lock of the machine under <env>: its repository, its
 * command and its progress; null without one, or when its process is gone or the lock is not held.
 * @param {Record<string, string | undefined>} [env]
 */
export function lireLaMesure(env = process.env) {
  const { verrou, fichier } = fichierDeLaMesure(env);
  const m = lireJson(fichier);
  if (!m || !Number.isInteger(m.pid) || !vivant(m.pid) || !existsSync(verrou)) return null;
  const a = typeof m.dossier === 'string' ? lireAvancement(m.dossier) : null;
  if (!a) return null;
  return { depot: String(m.depot ?? ''), commande: String(m.commande ?? ''), ...a };
}
