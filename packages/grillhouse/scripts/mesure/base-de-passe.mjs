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
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

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

// Whether the base <base> is an orphan: its owner reads, lives in this namespace, and is gone.
function orpheline(base) {
  let p;
  try {
    p = JSON.parse(readFileSync(path.join(base, PROPRIETAIRE), 'utf8'));
  } catch {
    return false;
  }
  const ici = espace();
  return ici !== null && p.espace === ici && Number.isInteger(p.pid) && !vivant(p.pid);
}

// Removes every orphan base in <dans>.
function balayer(dans) {
  let noms;
  try {
    noms = readdirSync(dans);
  } catch {
    return;
  }
  for (const nom of noms) {
    const base = path.join(dans, nom);
    if (nom.startsWith(PREFIXE) && orpheline(base)) rmSync(base, { recursive: true, force: true });
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
 * @returns {string | null}
 */
export function ligneDesRestes(restes) {
  if (restes.length === 0) return null;
  return `⛔ Les tests ont laissé dans leur dossier temporaire : ${restes.join(', ')}. Un test retire ce qu'il y crée, rouge compris.`;
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
    for (const s of INTERRUPTIONS) process.removeListener(s, surSignal);
  };
  function surSignal(signal) {
    lacher();
    retirer();
    process.kill(process.pid, signal);
  }
  for (const s of INTERRUPTIONS) process.on(s, surSignal);
  return lacher;
}

/**
 * Opens the base of a pass of <genre> in <dans>, after sweeping the orphan bases there.
 * @param {string} genre what the pass is (`vitest`, `circuit`…), in the base's name
 * @param {{ dans?: string }} options `dans`, the directory of the base (`os.tmpdir()`)
 * @returns {{ base: string, dossier: string, env: Record<string, string>, restes: () => string[],
 *   fermer: () => void }} the base; the directory its pass writes in; the variables that name it
 *   to the pass's children (TMPDIR, TMP, TEMP); what is in it, sorted; and the removal of the base
 */
export function ouvrirBase(genre, { dans = tmpdir() } = {}) {
  balayer(dans);
  mkdirSync(dans, { recursive: true });
  const base = mkdtempSync(path.join(dans, `${PREFIXE}${genre}-`));
  writeFileSync(
    path.join(base, PROPRIETAIRE),
    `${JSON.stringify({ pid: process.pid, espace: espace() })}\n`
  );
  const dossier = path.join(base, 't');
  mkdirSync(dossier);
  return {
    base,
    dossier,
    env: Object.fromEntries(TEMPORAIRES.map(v => [v, dossier])),
    restes: () => contenu(dossier),
    fermer: () => rmSync(base, { recursive: true, force: true }),
  };
}
