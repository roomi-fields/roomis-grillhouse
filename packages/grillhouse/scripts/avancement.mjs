// The progress of an automatic pass, in figures, as Bazel's counter of actions « [1 234 / 2 000] »
// and the steps of a CI: the files of tests done over planned, and the instant of the last sign,
// which the board shows (scripts/tableau.mjs), so that a pass that freezes is seen.
//
// - A pass has its progress directory, which the variable GRILLHOUSE_AVANCEMENT (AVANCEMENT of
//   scripts/mesure/avancement.mjs) names to its commands: the circuit opens one for each
//   automatic pass in its working directory, `<copie>.travail`, where the board reads it
//   (`avancementDuTravail`), `npm run verifier` opens its own when it receives none
//   (scripts/langages/typescript/verifier.mjs). The directory holds `passe.json` (`{ genre, debut,
//   precedent, totaux }`: its kind, its start, the total of the previous pass of that kind, and
//   the file of the totals where its end keeps its own), the records of its tasks (`taches/`, written by the reporter of progress of the base configuration, one
//   per run of Vitest, and by the queue for the steps of its CI, scripts/integration/file.mjs),
//   and the plans of its runs of Turborepo (`plan/`).
// - The CI of a ticket's commit is read by one act at a time, each a process of its own: its
//   readings share one progress directory in the working directory of the ticket,
//   `avancement-ci` (`avancementDeLaCI`), opened by the first and emptied when a reading looks
//   for a run again (another CI, after a reopening), where the board reads the steps
//   of the run done over planned while the circuit waits for it; the next pass of the circuit
//   removes it with the others (`avecLAvancementDuTravail`).
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
// - The holder of the lock of the machine (scripts/verrou-de-machine.mjs: a measure out of a
//   ticket, `npm run verifier` of a supervisor, or a heavy pass of the
//   circuit of a ticket) names its progress directory beside the lock (`nommerLAvancement`); the
//   board reads the holder with its progress, and the waits for the lock or for room
//   (`lireLaMesure`).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AVANCEMENT, ecrireAtomique, TACHES } from './mesure/avancement.mjs';
import { lireLeVerrou } from './verrou-de-machine.mjs';

const PASSE = 'passe.json';
const PLAN = 'plan';
// The name of a progress directory starts so (`ouvrirAvancement`).
const PREFIXE = 'avancement-';
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
// The totals read in the file <f>, empty without one.
const totauxDe = f => {
  const t = f ? lireJson(f) : null;
  return { fichier: f, passes: t?.passes ?? {}, taches: t?.taches ?? {} };
};
// The totals of the repository at <racine>.
const lireLesTotaux = racine => totauxDe(fichierDesTotaux(racine));

/**
 * Opens the progress directory of a pass of kind <genre> (null: a pass whose total is not kept)
 * in the repository at <racine>, made under <dans>, its start <debut>; its path. The file of the
 * totals is resolved now and kept in `passe.json` (`totaux`): the integration removes the ticket's
 * copy before its pass ends, and its total goes to the same repository.
 * @param {{ racine: string, genre?: string | null, dans?: string, debut?: number }} o
 */
export function ouvrirAvancement({ racine, genre = null, dans = tmpdir(), debut = Date.now() }) {
  const dossier = mkdtempSync(path.join(dans, PREFIXE));
  const totaux = lireLesTotaux(racine);
  const precedent = genre ? (totaux.passes[genre] ?? null) : null;
  ecrireAtomique(path.join(dossier, PASSE), { genre, debut, precedent, totaux: totaux.fichier });
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
  if (!dossier || !taches.length) {
    return;
  }
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
    if (!e || !Number.isFinite(e.faits) || !Number.isFinite(e.prevus)) {
      continue;
    }
    if (!e.hash) {
      sans.push(e);
    } else {
      const avant = parHash.get(e.hash);
      if (!avant || (!e.cache && (avant.cache || e.a > avant.a))) {
        parHash.set(e.hash, e);
      }
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
  if (!passe) {
    return null;
  }
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
 * The progress of the pass under way in the working directory <travail> of a circuit, where each
 * automatic pass of the circuit opens its progress directory (`avecLAvancementDuTravail`, one
 * pass at a time): the latest started that reads, null without one.
 * @param {string} travail
 * @returns {{ faits: number, prevus: number, debut: number, dernier: number } | null}
 */
export function avancementDuTravail(travail) {
  let noms = [];
  try {
    noms = readdirSync(travail).filter(f => f.startsWith(PREFIXE));
  } catch {
    return null;
  }
  return (
    noms
      .map(f => lireAvancement(path.join(travail, f)))
      .filter(Boolean)
      .sort((a, b) => b.debut - a.debut)[0] ?? null
  );
}

/**
 * The progress directory of the readings of the CI of a ticket's commit, in the working directory
 * <travail> of its circuit, where the board reads it (`avancementDuTravail`): one for all its
 * readings, opened by the first, emptied when <nouvelle> (a reading that looks for its run, the
 * records of another run gone); null when the circuit has no working directory.
 * @param {string} travail
 * @param {{ nouvelle?: boolean, debut?: number }} [o]
 * @returns {string | null}
 */
export function avancementDeLaCI(travail, { nouvelle = false, debut = Date.now() } = {}) {
  if (!existsSync(travail)) {
    return null;
  }
  const dossier = path.join(travail, `${PREFIXE}ci`);
  try {
    if (nouvelle) {
      rmSync(dossier, { recursive: true, force: true });
    }
    if (!existsSync(path.join(dossier, PASSE))) {
      mkdirSync(dossier, { recursive: true });
      ecrireAtomique(path.join(dossier, PASSE), { genre: null, debut, precedent: null });
    }
  } catch {
    // A directory that does not write leaves the queue going, without its progress.
    return null;
  }
  return dossier;
}

/**
 * Runs <passe> under a progress directory of the kind <genre> (null: none kept) opened in the
 * working directory <travail> of a ticket's circuit, where the board reads it
 * (`avancementDuTravail`): each automatic pass of the circuit (scripts/activites.mjs), one pass
 * at a time. The directories a killed pass left there go first. The directory is given to <passe> and named to it and its children by
 * GRILLHOUSE_AVANCEMENT (`AVANCEMENT`); then its total is kept in the repository at <racine> and
 * it is removed. Without the working directory, <passe> runs without one (null).
 * Returns what <passe> returns.
 * @template T
 * @param {string} travail
 * @param {{ racine: string, genre: string | null }} o
 * @param {(dossier: string | null) => T} passe
 * @returns {T}
 */
export function avecLAvancementDuTravail(travail, { racine, genre }, passe) {
  if (!existsSync(travail)) {
    return passe(null);
  }
  for (const f of readdirSync(travail).filter(n => n.startsWith(PREFIXE))) {
    rmSync(path.join(travail, f), { recursive: true, force: true });
  }
  const dossier = ouvrirAvancement({ racine, genre, dans: travail });
  const avant = process.env[AVANCEMENT];
  process.env[AVANCEMENT] = dossier;
  try {
    return passe(dossier);
  } finally {
    if (avant === undefined) {
      delete process.env[AVANCEMENT];
    } else {
      process.env[AVANCEMENT] = avant;
    }
    garderLeTotal(dossier);
    rmSync(dossier, { recursive: true, force: true });
  }
}

/**
 * Keeps, at the end of the pass whose directory is <dossier>, its total under its kind and the
 * files planned of each task it played, in the totals its opening named (`totaux` of its
 * `passe.json`); none out of git.
 * @param {string} dossier
 */
export function garderLeTotal(dossier) {
  const passe = lireJson(path.join(dossier, PASSE));
  if (!passe) {
    return;
  }
  const t = totauxDe(passe.totaux ?? null);
  if (!t.fichier) {
    return;
  }
  const liste = enregistrements(dossier);
  if (passe.genre && liste.length) {
    t.passes[passe.genre] = liste.reduce((s, e) => s + e.prevus, 0);
  }
  for (const e of liste.filter(x => x.hash && !x.cache)) {
    delete t.taches[e.hash];
    t.taches[e.hash] = e.prevus;
  }
  const cles = Object.keys(t.taches);
  for (const c of cles.slice(0, Math.max(0, cles.length - TACHES_GARDEES))) {
    delete t.taches[c];
  }
  try {
    ecrireAtomique(t.fichier, { passes: t.passes, taches: t.taches });
  } catch {
    // A place that does not write keeps no total: the next pass counts without it.
  }
}

/**
 * Who holds the lock of the machine under <env> and who waits for it, as the board shows them
 * (scripts/tableau.mjs): `detenteur`, its repository (`depot`, the root of its main tree, and
 * `projet`, its folder), ticket, kind, since when and progress
 * (`avancement`, its files done and planned and its last sign; null while it names no progress
 * directory, or that directory does not read), null when the lock is free or its process gone;
 * `attentes`, each live wait, the oldest first, its project, ticket, kind, what it waits for
 * (`quoi`) and since when (`lireLeVerrou` of scripts/verrou-de-machine.mjs).
 * @param {Record<string, string | undefined>} [env]
 */
export function lireLaMesure(env = process.env) {
  const { detenteur: d, attentes } = lireLeVerrou(env);
  return {
    detenteur: d && {
      depot: d.depot,
      projet: d.projet,
      ticket: d.ticket,
      sorte: d.sorte,
      depuis: d.depuis,
      avancement: typeof d.dossier === 'string' ? lireAvancement(d.dossier) : null,
    },
    attentes: attentes.map(({ depot, projet, ticket, sorte, quoi, depuis }) => ({
      depot,
      projet,
      ticket,
      sorte,
      quoi,
      depuis,
    })),
  };
}
