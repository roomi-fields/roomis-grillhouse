// The base of a pass: the temporary directory of a run, its own and removed at its end, as Bazel
// gives each test its temporary directory (TEST_TMPDIR) under the base of its run. A pass killed
// leaves its base, which the next pass sweeps, as Bazel cleans its sandboxes.
//
// - A base is a directory `<dans>/grillhouse-<genre>-XXXXXX/`, `<dans>` the temporary directory of
//   whoever opens it (`os.tmpdir()`). It holds its owner (`.grillhouse-base`: the process that
//   opened it and that process's PID namespace) and `t/`, the directory where the pass and its
//   processes write: the pass names it in `TMPDIR`, `TMP` and `TEMP` to its children (`env`), so
//   `os.tmpdir()`, `mktemp`, Rust's `std::env::temp_dir()`, Python's `tempfile` and Claude Code
//   (`CLAUDE_CODE_TMPDIR`, else `os.tmpdir()`) write there.
// - The genres: `vitest`, each run of the tests of the module typescript (a plugin of its base
//   configuration, scripts/langages/typescript/vitest-config/base.mjs), which holds the runner's own temporary
//   directory too; `tests`, `npm test` (scripts/langages/typescript/tests.mjs); `verification`,
//   `npm run verifier` (scripts/langages/typescript/verifier.mjs), whose base Turborepo passes to its tasks
//   (`globalPassThroughEnv`, scripts/langages/typescript/turbo-des-paquets.mjs); `circuit`, the results and progress
//   of the passes of a circuit's run (scripts/circuit.mjs; its working directory is the ticket's,
//   beside its copy, which no sweep touches); `integration`, the working directory of an
//   integration (scripts/integration/integrer.mjs); `enveloppe`, the throwaway state of a session's envelope
//   (scripts/enveloppe/enveloppe.mjs).
// - The owner of a base is the process that opens it, for a pass and a session out of a ticket
//   (the night, a verification); a ticket (`ouvrirBaseDuTicket`: `<dans>/grillhouse-ticket-<id>/`,
//   the temporary directory of the agents of one ticket, which the launcher gives each session of
//   the ticket, scripts/enveloppe/lancer.sh, and `npx grillhouse temporaire <ticket>` the
//   supervisor), kept from one session and one resumption to the next, removed when its ticket is
//   closed (`balayerLesTickets`, which the removal of the finished copies plays,
//   scripts/copies-finies.mjs), as a finished copy goes, and only then, frozen or not, as a
//   retention policy fixed in advance; or a directory
//   (`cacheDeLaRacine`: the cache of a build rooted in the temporary directory), swept once that
//   directory is gone, from the namespace that opened it, or, from the host (the next base of a
//   pass, out of an envelope, where the home is read-only), untouched for 7 days whatever its
//   namespace, as GitHub Actions removes a cache unused for 7 days. What an agent needs to resume lives in its copy or its handover, never in
//   the ticket's temporary directory alone, which holds what is made again.
// - The caches of compilation never lie in the temporary directory, a disk in memory that the
//   sessions of the machine share: they go under `${XDG_CACHE_HOME:-~/.cache}/grillhouse/<outil>`
//   (`cacheDeCompilation`), as Bazel keeps its output_base under ~/.cache; a build rooted in the
//   temporary directory (a project of trial) keeps its outputs there too (`cacheDeLaRacine`).
// - The base is removed at the end of the pass, green or red (`fermer`), and when the pass is
//   interrupted (SIGINT, SIGTERM, SIGHUP: `retirerALInterruption`), as pytest's `tmp_path` and
//   Rust's `tempfile` remove theirs.
// - The guard of a pass of tests: what its tests left in `t/` (`restes`) fails the pass, named
//   (`ligneDesRestes`), as the CI of osc-bridge runs its tests under a temporary directory of
//   their own and fails on anything left there; each module of language plays it in its runner of
//   tests (the base configuration of Vitest, the module cargo's `tester` and `verifier`).
// - Opening a base first sweeps `<dans>`: every base there whose owner is gone is removed, whatever
//   its genre. A base is judged by its owner's process only when that owner lives in the PID
//   namespace of the sweeper (an envelope has its own, bwrap --unshare-pid, where a number means
//   nothing outside): a base of another namespace, a base without a readable owner (one being
//   created) and a base whose owner lives are never touched.
// - The trial directories under the home, `~/.cache/grillhouse-essais-*` (`racineSousLaMaison`,
//   grillhouse-matiere), are not in the base: each holds its owner file (`.grillhouse-base`, the
//   pass that made it). Opening a base sweeps them too (`balayerLesEssais`), from the host alone
//   (the home is read-only in an envelope): one whose pass is gone (`passeMorte`) is removed, and
//   one without a readable owner file, after 24 hours. `essais()` of a base names those of its own
//   pass, which a run of Vitest counts as a leftover that fails it (the base configuration of the
//   module typescript, vitest-config/base.mjs).
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The prefix of a base's name, and the file of its owner.
const PREFIXE = 'grillhouse-';
const PROPRIETAIRE = '.grillhouse-base';

/**
 * The start time of the process `pid`, in clock ticks since boot: field 22 of `/proc/<pid>/stat`
 * (after the command, itself free to hold spaces and parentheses); null when it does not read.
 * With its number, it names one process, as a number alone does not once it is reused.
 */
export function departDe(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const depart = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
    return depart && /^\d+$/.test(depart) ? depart : null;
  } catch {
    return null;
  }
}

/** Whether the process `pid` lives and is the one that started at `depart` (departDe). */
export function leMemeVivant(pid, depart) {
  return Number.isInteger(pid) && typeof depart === 'string' && departDe(pid) === depart;
}

/** Whether the process `pid` exists. */
export function vivant(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

// The PID namespace of this process, or null when /proc does not tell it.
function espace() {
  try {
    return readlinkSync('/proc/self/ns/pid');
  } catch {
    return null;
  }
}

// The owner of the base <base>, or null when it does not read.
function proprietaire(base) {
  try {
    return JSON.parse(readFileSync(path.join(base, PROPRIETAIRE), 'utf8'));
  } catch {
    return null;
  }
}

// Whether the base <base> is an orphan: its owner, a directory or a process, belongs to this
// namespace of processes and is gone; a directory another namespace sees (an envelope's private
// /tmp) or a process of another namespace is never judged here. A ticket's base goes with its
// ticket (`balayerLesTickets`).
function orpheline(base) {
  const p = proprietaire(base);
  const ici = espace();
  if (p === null || ici === null || p.espace !== ici) {
    return false;
  }
  if (typeof p.racine === 'string') {
    return !existsSync(p.racine);
  }
  return Number.isInteger(p.pid) && !vivant(p.pid);
}

// Removes every orphan base in <dans>.
// <vieilles> true (on the host): a base of a cache of a root untouched for AGE_DU_CACHE_MS goes too,
// whatever namespace opened it.
function balayer(dans, { vieilles = false } = {}) {
  let noms;
  try {
    noms = readdirSync(dans);
  } catch {
    return;
  }
  for (const nom of noms) {
    const base = path.join(dans, nom);
    if (nom.startsWith(PREFIXE) && (orpheline(base) || (vieilles && vieille(base)))) {
      rmSync(base, { recursive: true, force: true });
    }
  }
}

/** How long a cache of a root lives untouched: 7 days, as GitHub Actions keeps a cache unused. */
export const AGE_DU_CACHE_MS = 7 * 24 * 3600 * 1000;

// Whether <base> is a base of a cache of a root untouched (its directory's mtime) for
// AGE_DU_CACHE_MS.
function vieille(base) {
  if (typeof proprietaire(base)?.racine !== 'string') {
    return false;
  }
  try {
    return Date.now() - statSync(base).mtimeMs > AGE_DU_CACHE_MS;
  } catch {
    return false;
  }
}

// Whether <env> is an agent's envelope, where the home is read-only (scripts/enveloppe/).
const enEnveloppe = env => Boolean(env.GRILLHOUSE_ENVELOPPE);

// The sweep of the caches of the roots under <env> (`cacheDeLaRacine`, in each tool's directory of
// the frame's caches), from the host only: the orphans and the old ones.
function balayerLesCaches(env) {
  if (enEnveloppe(env)) {
    return;
  }
  const racine = path.dirname(cacheDeCompilation('-', env));
  for (const outil of contenu(racine)) {
    balayer(path.join(racine, outil), { vieilles: true });
  }
}

// The variables that name the temporary directory: TMPDIR (POSIX, Node, Rust), TMP and TEMP
// (Windows, Python's `tempfile`).
const TEMPORAIRES = ['TMPDIR', 'TMP', 'TEMP'];

// The names in <dossier>, sorted; none when it does not read.
function contenu(dossier) {
  try {
    return readdirSync(dossier).sort();
  } catch {
    return [];
  }
}

/**
 * The line of the guard of a pass of tests: what its tests left in their temporary directory,
 * named; null when they left nothing.
 * @param {string[]} restes the names left (`restes` of a base)
 * @param {string} [paquet] the package whose tests played under that directory, when the pass
 *   gives each package its own; the line names it
 * @returns {string | null}
 */
export function ligneDesRestes(restes, paquet) {
  if (restes.length === 0) {
    return null;
  }
  const de = paquet ? `Les tests de ${paquet} ont` : 'Les tests ont';
  return `⛔ ${de} laissé dans leur dossier temporaire : ${restes.join(', ')}. Un test retire ce qu'il y crée, rouge compris.`;
}

// The signals that interrupt a pass: Ctrl-C, a kill, the end of its terminal.
const INTERRUPTIONS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/**
 * Runs <retirer> when the process is interrupted (SIGINT, SIGTERM, SIGHUP), then lets the signal
 * end it as it would have: its handler gone, the signal sent again. A process blocked in a
 * synchronous child (`spawnSync`) runs it once the child ends, which the same Ctrl-C ends.
 * @param {() => void} retirer what goes at the interruption
 * @returns {() => void} the removal of the handlers, at the end of the pass
 */
export function retirerALInterruption(retirer) {
  const lacher = () => {
    for (const s of INTERRUPTIONS) {
      process.removeListener(s, surSignal);
    }
  };
  function surSignal(signal) {
    lacher();
    retirer();
    process.kill(process.pid, signal);
  }
  for (const s of INTERRUPTIONS) {
    process.on(s, surSignal);
  }
  return lacher;
}

// The trial directories under the home (`racineSousLaMaison`, grillhouse-matiere): their prefix, and
// how long one without a readable owner file waits before it goes (the ones the passes before the
// owner file left, and one being created).
const ESSAIS = `${PREFIXE}essais-`;
const AGE_DES_ESSAIS_MS = 24 * 3600 * 1000;

// The cache directory of the home, where the trial directories lie.
const cacheDeLaMaison = () => path.join(process.env.HOME || homedir(), '.cache');

// Whether the owner <p> of a trial directory is a pass of this namespace that is gone: its number
// is free, or reused by a process that started at another time.
function passeMorte(p) {
  const ici = espace();
  if (p === null || ici === null || p.espace !== ici || !Number.isInteger(p.pid)) {
    return false;
  }
  return typeof p.depart === 'string' ? !leMemeVivant(p.pid, p.depart) : !vivant(p.pid);
}

// Removes from the home's cache every trial directory whose pass is gone, and, from the host
// only (the home is read-only in an envelope, whose namespace is its own), the ones without a
// readable owner file older than a day.
function balayerLesEssais(env) {
  if (enEnveloppe(env)) {
    return;
  }
  const cache = cacheDeLaMaison();
  for (const nom of contenu(cache)) {
    if (!nom.startsWith(ESSAIS)) {
      continue;
    }
    const dossier = path.join(cache, nom);
    const p = proprietaire(dossier);
    let retirer = false;
    if (p === null) {
      try {
        retirer = Date.now() - statSync(dossier).mtimeMs > AGE_DES_ESSAIS_MS;
      } catch {
        retirer = false;
      }
    } else {
      retirer = passeMorte(p);
    }
    if (retirer) {
      rmSync(dossier, { recursive: true, force: true });
    }
  }
}

/**
 * Opens the base of a pass of <genre> in <dans>, after sweeping the orphan bases there, and the
 * orphan trial directories under the home.
 * @param {string} genre what the pass is (`vitest`, `circuit`…), in the base's name
 * @param {{ dans?: string }} options `dans`, the directory of the base (`os.tmpdir()`)
 * @returns {{ base: string, dossier: string, env: Record<string, string>, restes: () => string[],
 *   essais: () => string[], fermer: () => void }} the base; the directory its pass writes in; the
 *   variables that name it to the pass's children (TMPDIR, TMP, TEMP); what is in it, sorted; the
 *   names of the `grillhouse-essais-*` directories of the home's cache whose owner file names this
 *   pass, read at the call; and the removal of the base
 */
export function ouvrirBase(genre, { dans = tmpdir() } = {}) {
  balayer(dans);
  balayerLesCaches(process.env);
  balayerLesEssais(process.env);
  mkdirSync(dans, { recursive: true });
  const base = mkdtempSync(path.join(dans, `${PREFIXE}${genre}-`));
  const moi = { pid: process.pid, depart: departDe(process.pid), espace: espace() };
  writeFileSync(path.join(base, PROPRIETAIRE), `${JSON.stringify(moi)}\n`);
  const dossier = path.join(base, 't');
  mkdirSync(dossier);
  return {
    base,
    dossier,
    env: Object.fromEntries(TEMPORAIRES.map(v => [v, dossier])),
    restes: () => contenu(dossier),
    essais: () =>
      contenu(cacheDeLaMaison()).filter(nom => {
        if (!nom.startsWith(ESSAIS)) {
          return false;
        }
        const p = proprietaire(path.join(cacheDeLaMaison(), nom));
        return p?.pid === moi.pid && p.depart === moi.depart && p.espace === moi.espace;
      }),
    fermer: () => rmSync(base, { recursive: true, force: true }),
  };
}

// The prefix of the base of a ticket, and the form of a ticket's id.
const DU_TICKET = `${PREFIXE}ticket-`;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * The base of the ticket <ticket> in <dans>: `<dans>/grillhouse-ticket-<ticket>/`, its owner the
 * ticket, made when absent and the same at each call; the temporary directory of the agents of
 * one ticket, kept from one session to the next, removed when it is closed (`balayerLesTickets`).
 * @param {string} ticket the ticket's id
 * @param {{ dans?: string }} options `dans`, the directory of the base (`os.tmpdir()`)
 * @returns {{ base: string, dossier: string }} the base, and the directory its agents write in
 */
export function ouvrirBaseDuTicket(ticket, { dans = tmpdir() } = {}) {
  if (!ID.test(ticket)) {
    throw new Error(`⛔ « ${ticket} » n'est pas l'identifiant d'un ticket.`);
  }
  const base = path.join(dans, `${DU_TICKET}${ticket}`);
  const dossier = path.join(base, 't');
  mkdirSync(dossier, { recursive: true });
  if (proprietaire(base) === null) {
    writeFileSync(path.join(base, PROPRIETAIRE), `${JSON.stringify({ ticket })}\n`);
  }
  return { base, dossier };
}

/**
 * Removes from <dans> the base of each ticket that is closed; the ids of the tickets whose base
 * went. A ticket open, frozen or not, keeps its base, as a retention policy fixed in advance.
 * <fermes> reads the closed tickets, null when they do not read: called once, and only when a
 * ticket's base is there.
 * @param {() => Set<string> | null} fermes
 * @param {{ dans?: string }} options `dans`, the directory of the bases (`os.tmpdir()`)
 * @returns {string[]}
 */
export function balayerLesTickets(fermes, { dans = tmpdir() } = {}) {
  const tickets = contenu(dans)
    .filter(n => n.startsWith(DU_TICKET))
    .map(n => ({ base: path.join(dans, n), ticket: proprietaire(path.join(dans, n))?.ticket }))
    .filter(b => typeof b.ticket === 'string');
  if (tickets.length === 0) {
    return [];
  }
  const clos = fermes();
  if (clos === null) {
    return [];
  }
  const retires = tickets.filter(b => clos.has(b.ticket));
  for (const b of retires) {
    rmSync(b.base, { recursive: true, force: true });
  }
  return retires.map(b => b.ticket);
}

/**
 * The ticket whose base is the entry <nom> of the temporary directory, or null.
 * @param {string} nom
 */
export function ticketDeLaBase(nom) {
  return nom.startsWith(DU_TICKET) ? nom.slice(DU_TICKET.length) : null;
}

// Whether <chemin> lies in <dossier> or is it.
const sous = (chemin, dossier) => {
  const rel = path.relative(dossier, chemin);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// The temporary directories under <env>: the one it names, the system's, and /tmp.
const temporaires = env =>
  [env.TMPDIR || env.TMP || env.TEMP, tmpdir(), '/tmp'].filter(Boolean).map(d => path.resolve(d));

/**
 * Whether <chemin> lies in a temporary directory under <env> (`TMPDIR`, `os.tmpdir()`, `/tmp`).
 * @param {string} chemin
 * @param {Record<string, string | undefined>} [env]
 */
export function dansLeTemporaire(chemin, env = process.env) {
  return temporaires(env).some(t => sous(path.resolve(chemin), t));
}

/**
 * The cache of compilation of <outil> under <env>: `${XDG_CACHE_HOME:-$HOME/.cache}/grillhouse/
 * <outil>`, as the lock of the machine lives there (scripts/verrou-de-machine.mjs).
 * @param {string} outil `sccache`, `uv`, `cargo`…
 * @param {Record<string, string | undefined>} [env]
 */
export function cacheDeCompilation(outil, env = process.env) {
  const cache = env.XDG_CACHE_HOME || path.join(env.HOME || homedir(), '.cache');
  return path.join(path.resolve(cache), 'grillhouse', outil);
}

/**
 * The cache of <outil> for the build rooted at <racine>: `<cacheDeCompilation(outil)>/
 * grillhouse-<empreinte of racine>/`, its owner <racine> and the namespace of processes that
 * opened it, made when absent; the caches of the roots that this namespace sees gone are swept
 * first, and from the host the ones untouched for 7 days, whatever their namespace (`AGE_DU_CACHE_MS`,
 * as GitHub Actions and cargo-sweep); each use renews its age. With `creer` false, its path alone, nothing made nor swept (a reading, `cargo metadata`).
 * @param {string} outil
 * @param {string} racine
 * @param {Record<string, string | undefined>} [env]
 */
export function cacheDeLaRacine(outil, racine, env = process.env, { creer = true } = {}) {
  const dans = cacheDeCompilation(outil, env);
  const reelle = path.resolve(racine);
  const empreinte = createHash('sha256').update(reelle).digest('hex').slice(0, 16);
  const cache = path.join(dans, `${PREFIXE}${empreinte}`);
  if (!creer) {
    return cache;
  }
  if (enEnveloppe(env)) {
    balayer(dans);
  } else {
    balayerLesCaches(env);
  }
  mkdirSync(cache, { recursive: true });
  // A use renews it: its age counts from the last.
  const maintenant = new Date();
  utimesSync(cache, maintenant, maintenant);
  if (proprietaire(cache) === null) {
    writeFileSync(
      path.join(cache, PROPRIETAIRE),
      `${JSON.stringify({ racine: reelle, espace: espace() })}\n`
    );
  }
  return cache;
}

// `npx grillhouse temporaire <ticket>`: prints the directory of the ticket's agents.
function commande(argv) {
  if (argv.length !== 1 || argv[0].startsWith('-')) {
    process.stderr.write('usage: npx grillhouse temporaire <ticket>\n');
    return 2;
  }
  try {
    process.stdout.write(`${ouvrirBaseDuTicket(argv[0]).dossier}\n`);
    return 0;
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = commande(process.argv.slice(2));
}
