// The base of a pass: the temporary directory of a run, its own and removed at its end, as Bazel
// gives each test its temporary directory (TEST_TMPDIR) under the base of its run. A pass killed
// leaves its base, which the next pass sweeps, as Bazel cleans its sandboxes.
//
// - A base is a directory `<dans>/grillhouse-<genre>-XXXXXX/`, `<dans>` the temporary directory of
//   whoever opens it (`os.tmpdir()`). It holds its owner (`.grillhouse-base`: the process that
//   opened it and that process's PID namespace) and `t/`, the directory where the pass and its
//   processes write: the pass names it in `TMPDIR` to its children, so `os.tmpdir()`, `mktemp` and
//   Claude Code (`CLAUDE_CODE_TMPDIR`, else `os.tmpdir()`) write there.
// - The genres: `vitest`, each run of the tests of the module typescript (a plugin of its base
//   configuration, scripts/vitest-config/base.mjs), which holds the runner's own temporary
//   directory too; `tests`, `npm test` (scripts/tests.mjs); `verification`,
//   `npm run verifier` (scripts/verifier.mjs), whose base Turborepo passes to its tasks
//   (`globalPassThroughEnv`, scripts/turbo-des-paquets.mjs); `circuit`, the results and progress
//   of the passes of a circuit's run (scripts/circuit.mjs; its working directory is the ticket's,
//   beside its copy, which no sweep touches); `integration`, the working directory of an
//   integration (scripts/integration/integrer.mjs); `enveloppe`, the throwaway state of a session's envelope
//   (scripts/enveloppe/enveloppe.mjs).
// - The base is removed at the end of the pass, green or red (`fermer`).
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

/**
 * Opens the base of a pass of <genre> in <dans>, after sweeping the orphan bases there.
 * @param {string} genre what the pass is (`vitest`, `circuit`…), in the base's name
 * @param {{ dans?: string }} options `dans`, the directory of the base (`os.tmpdir()`)
 * @returns {{ base: string, dossier: string, fermer: () => void }} the base, the directory its
 *   pass writes in (`TMPDIR` of its children), and the removal of the base
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
  return { base, dossier, fermer: () => rmSync(base, { recursive: true, force: true }) };
}
