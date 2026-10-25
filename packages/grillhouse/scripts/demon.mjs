// A command run as a daemon, as daemon(3) and `setsid --fork` make one: the circuit of a ticket
// (scripts/circuit.mjs) runs so, and goes on to its end when the session that launched it ends
// (BP 320.8: the circuit, a background command of the supervisor's session, died with it).
//
// - `executerEnDemon(script, argv, main)` is the entry of the script <script>, run with the
//   arguments <argv>; it returns the exit code of its process. It plays one of three roles, which
//   the variable DETACHE carries from one to the next.
// - The caller (no variable): it launches a relay, its own script again, in a session of its own,
//   and waits for it; then it reads the daemon's output in a directory of its own
//   (`<tmpdir>/grillhouse-sortie-du-circuit-XXXXXX`, apart from the bases of the runs, which a sweep
//   reads) and relays it to its own streams while it waits, every PAS_MS; once the daemon's code is
//   there, written after its last line, it reads the output to its end, then ends on that code. A
//   daemon gone without a code ends the caller at 1, said. A caller that dies leaves the daemon
//   running.
// - The relay: it launches the daemon, its own script again, in a session of its own (setsid), its
//   output to the directory, writes its pid there and ends at once: the daemon's parent becomes the
//   system's, so that the daemon is neither in the caller's process group nor under it in the tree
//   of processes, which the end of a session of Claude Code kills.
// - The daemon: it runs <main>(<argv>); at its exit, its code is written for the caller, or the
//   directory removed when the caller is gone.
import { spawn } from 'node:child_process';
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
import { vivant } from './vitest-config/base-de-passe.mjs';

// The variable that carries, to the relay and then to the daemon, its role, the directory of the
// daemon's output and the caller's process.
const DETACHE = 'GRILLHOUSE_CIRCUIT_DETACHE';
// How often the caller reads the daemon's output and end.
const PAS_MS = 100;

const lire = f => (existsSync(f) ? readFileSync(f, 'utf8') : '');

// The caller: see the header.
async function appeler(script, argv) {
  const dossier = mkdtempSync(path.join(os.tmpdir(), 'grillhouse-sortie-du-circuit-'));
  const f = nom => path.join(dossier, nom);
  try {
    const relais = spawn(process.execPath, [script, ...argv], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        [DETACHE]: JSON.stringify({ role: 'relais', dossier, appelant: process.pid }),
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
      // The code is written after the last line: once it is there, the output is read to its end.
      const fini = existsSync(f('code'));
      recopier();
      if (fini) {
        return Number(lire(f('code')));
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
function relayer(script, argv, { dossier, appelant }) {
  const sortie = openSync(path.join(dossier, 'sortie'), 'a');
  const erreurs = openSync(path.join(dossier, 'erreurs'), 'a');
  const demon = spawn(process.execPath, [script, ...argv], {
    detached: true,
    stdio: ['ignore', sortie, erreurs],
    env: { ...process.env, [DETACHE]: JSON.stringify({ role: 'demon', dossier, appelant }) },
  });
  writeFileSync(path.join(dossier, 'pid'), String(demon.pid ?? ''));
  demon.unref();
  return 0;
}

// The daemon: see the header.
async function demon(argv, main, { dossier, appelant }) {
  process.on('exit', code => {
    if (!vivant(appelant)) {
      rmSync(dossier, { recursive: true, force: true });
      return;
    }
    const provisoire = path.join(dossier, `code.${process.pid}`);
    writeFileSync(provisoire, String(code ?? 1));
    renameSync(provisoire, path.join(dossier, 'code'));
  });
  return await main(argv);
}

/** The entry of <script> run with <argv> as a daemon, <main> its run: the exit code. */
export async function executerEnDemon(script, argv, main) {
  const lu = process.env[DETACHE] ? JSON.parse(process.env[DETACHE]) : null;
  delete process.env[DETACHE];
  if (lu?.role === 'relais') {
    return relayer(script, argv, lu);
  }
  if (lu?.role === 'demon') {
    return await demon(argv, main, lu);
  }
  return await appeler(script, argv);
}
