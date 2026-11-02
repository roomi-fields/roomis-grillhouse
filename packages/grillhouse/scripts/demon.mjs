// A command run as a daemon, as daemon(3) and `setsid --fork` make one, in a unit of its own as
// `systemd-run --user` starts one: the circuit of a ticket (scripts/circuit.mjs) runs so, and goes
// on to its end when the session that launched it ends, or when the group of control that holds
// that session is killed (grillhouse-mwz: on 2026-11-01, systemd-oomd killed the scope of the tmux
// pane of BPScript's supervisor, 94 processes, two circuits among them, daemons apart from the
// session's tree; BP 320.8 before: the circuit, a background command of the session, died with it).
//
// - `executerEnDemon(script, argv, main, { unite })` is the entry of the script <script>, run with
//   the arguments <argv>; it returns the exit code of its process. It plays one of three roles,
//   which the variable DETACHE carries from one to the next. <unite> names the daemon's unit.
// - The caller (no variable): it launches a relay, its own script again, in a session of its own,
//   and waits for it; then it reads the daemon's output in a directory of its own
//   (`<tmpdir>/grillhouse-sortie-du-circuit-XXXXXX`, apart from the bases of the runs, which a sweep
//   reads) and relays it to its own streams while it waits, every PAS_MS; once the daemon's code is
//   there, written after its last line, it reads the output to its end, then ends on that code. A
//   daemon gone without a code ends the caller at 1, said. A daemon that gives the hand back
//   (`rendreLaMain`, as `systemctl start` returns once its unit has started) ends the caller at 0
//   once its output so far is relayed, and goes on alone (grillhouse-pq6: the supervisor's launch
//   of a circuit returns at once, and the circuit's question wakes it by the wait of the
//   questions, scripts/superviseur.mjs). A caller that dies leaves the daemon running.
// - The relay: it launches the daemon, its own script again, in a session of its own (setsid), its
//   output to the directory, writes its pid there and ends at once: the daemon's parent becomes the
//   system's, so that the daemon is neither in the caller's process group nor under it in the tree
//   of processes, which the end of a session of Claude Code kills. When the user's systemd answers
//   (`systemdUtilisateur`), the daemon starts through `systemd-run --user --scope`, which runs it
//   in place, its process and environment kept, in a scope of its own
//   (`<unite>-<pid of the relay>.scope`, under app.slice), out of the group of control of its
//   caller (the scope of a terminal or of a tmux pane), which systemd stops whole; without it, as
//   in the envelope of the agents, it starts as it is.
// - The daemon: it runs <main>(<argv>); at its exit, its code is written for the caller, or the
//   directory removed when the caller is gone or has the hand back.
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vivant } from './mesure/base-de-passe.mjs';

// The variable that carries, to the relay and then to the daemon, its role, the directory of the
// daemon's output and the caller's process.
const DETACHE = 'GRILLHOUSE_CIRCUIT_DETACHE';
// How often the caller reads the daemon's output and end.
const PAS_MS = 100;

const lire = f => (existsSync(f) ? readFileSync(f, 'utf8') : '');

// The directory of the caller of this daemon while it waits, null once the hand is given back or
// out of a daemon.
let aRendre = null;
// The caller of this daemon, null out of a daemon.
let appelantDuDemon = null;

// The environment in which systemd-run reaches the user's systemd: the directory of the user's
// runtime, `/run/user/<uid>` as pam_systemd sets it, when the environment does not give it (a task
// of Turborepo passes on neither it nor the address of the bus).
const pourSystemd = () => ({
  ...process.env,
  XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.()}`,
});

let systemd = null;
/** Whether the user's systemd starts a scope (`systemd-run --user --scope true` ends at 0), read once. */
export function systemdUtilisateur() {
  systemd ??=
    spawnSync('systemd-run', ['--user', '--scope', '--quiet', '--collect', '--', 'true'], {
      stdio: 'ignore',
      timeout: 5000,
      env: pourSystemd(),
    }).status === 0;
  return systemd;
}

// A name of unit of systemd from <nom>: each character it refuses becomes `_`.
const nomDUnite = nom => String(nom).replace(/[^A-Za-z0-9:_.-]/g, '_');

// The caller: see the header.
async function appeler(script, argv, unite) {
  const dossier = mkdtempSync(path.join(os.tmpdir(), 'grillhouse-sortie-du-circuit-'));
  const f = nom => path.join(dossier, nom);
  try {
    const relais = spawn(process.execPath, [script, ...argv], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        [DETACHE]: JSON.stringify({ role: 'relais', dossier, appelant: process.pid, unite }),
      },
    });
    await new Promise(r => {
      relais.on('error', r);
      relais.on('close', r);
    });
    const pid = Number(lire(f('pid')));
    const lus = { sortie: 0, erreurs: 0 };
    const recopier = () => {
      for (const [nom, flux] of [
        ['sortie', process.stdout],
        ['erreurs', process.stderr],
      ]) {
        if (!existsSync(f(nom))) {
          continue;
        }
        const tout = readFileSync(f(nom));
        if (tout.length > lus[nom]) {
          flux.write(tout.subarray(lus[nom]));
        }
        lus[nom] = tout.length;
      }
    };
    for (;;) {
      // The code is written after the last line: once it is there, the output is read to its end;
      // the hand given back (`rendreLaMain`) is written after the daemon's line that says so.
      const fini = existsSync(f('code'));
      const rendue = existsSync(f('rendu'));
      recopier();
      if (fini) {
        return Number(lire(f('code')));
      }
      if (rendue) {
        return 0;
      }
      if (!pid || !vivant(pid)) {
        recopier();
        if (existsSync(f('code'))) {
          return Number(lire(f('code')));
        }
        process.stderr.write(`⛔ le circuit (processus ${pid || '?'}) finit sans code de fin.\n`);
        return 1;
      }
      await new Promise(r => setTimeout(r, PAS_MS));
    }
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

// The relay: see the header.
function relayer(script, argv, { dossier, appelant, unite }) {
  const sortie = openSync(path.join(dossier, 'sortie'), 'a');
  const erreurs = openSync(path.join(dossier, 'erreurs'), 'a');
  const commande = [process.execPath, script, ...argv];
  const aPart = systemdUtilisateur();
  const [programme, ...args] = aPart
    ? [
        'systemd-run',
        '--user',
        '--scope',
        '--quiet',
        '--collect',
        `--unit=${nomDUnite(`${unite}-${process.pid}`)}`,
        '--',
        ...commande,
      ]
    : commande;
  const demon = spawn(programme, args, {
    detached: true,
    stdio: ['ignore', sortie, erreurs],
    env: {
      ...(aPart ? pourSystemd() : process.env),
      [DETACHE]: JSON.stringify({ role: 'demon', dossier, appelant }),
    },
  });
  writeFileSync(path.join(dossier, 'pid'), String(demon.pid ?? ''));
  demon.unref();
  return 0;
}

// The daemon: see the header.
async function demon(argv, main, { dossier, appelant }) {
  aRendre = dossier;
  appelantDuDemon = appelant;
  process.on('exit', code => {
    if (!vivant(appelant) || !existsSync(dossier)) {
      rmSync(dossier, { recursive: true, force: true });
      return;
    }
    const provisoire = path.join(dossier, `code.${process.pid}`);
    writeFileSync(provisoire, String(code ?? 1));
    renameSync(provisoire, path.join(dossier, 'code'));
  });
  return await main(argv);
}

/**
 * Whether this process is the daemon of a script run by `executerEnDemon`, read before it runs.
 * @returns {boolean}
 */
export function estLeDemon() {
  try {
    return JSON.parse(process.env[DETACHE] ?? 'null')?.role === 'demon';
  } catch {
    return false;
  }
}

/**
 * Whether what this process writes on its error stream now reaches a reader: in a daemon, while
 * it has not given the hand back (`rendreLaMain`) and its caller, which relays it, lives; out of a
 * daemon, always, its output its caller's own (grillhouse-pq6.1: the circuit inscribes the
 * question it says there as gone up, scripts/superviseur.mjs).
 * @returns {boolean}
 */
export function sortieLue() {
  return appelantDuDemon === null || (aRendre !== null && vivant(appelantDuDemon));
}

/**
 * Gives the hand back to the caller of this daemon, as `systemctl start` returns once its unit has
 * started: <message> on the daemon's error stream, which the caller relays, then the caller ends
 * at 0, and the daemon goes on alone, its output no longer read. Once per daemon; nothing out of
 * a daemon (a run in its caller's own process).
 * @param {string} message the line the caller relays last
 * @returns {boolean} whether a caller got the hand back
 */
export function rendreLaMain(message) {
  if (aRendre === null) {
    return false;
  }
  const dossier = aRendre;
  aRendre = null;
  process.stderr.write(message);
  try {
    writeFileSync(path.join(dossier, 'rendu'), '');
  } catch {
    return false;
  }
  return true;
}

/**
 * The entry of <script> run with <argv> as a daemon, <main> its run, in the unit <unite>: the exit
 * code.
 */
export async function executerEnDemon(script, argv, main, { unite = path.basename(script) } = {}) {
  const lu = process.env[DETACHE] ? JSON.parse(process.env[DETACHE]) : null;
  delete process.env[DETACHE];
  if (lu?.role === 'relais') {
    return relayer(script, argv, lu);
  }
  if (lu?.role === 'demon') {
    return await demon(argv, main, lu);
  }
  return await appeler(script, argv, unite);
}
