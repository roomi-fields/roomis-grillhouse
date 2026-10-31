// The cache of compilation of the module cargo: sccache (Mozilla), the wrapper of rustc
// (`RUSTC_WRAPPER=sccache`) that Firefox and the CI of Rust use, which the update installs
// (./binaires.json). Each copy keeps its own target directory, so that two compilations never wait
// on the lock cargo takes on a target directory; sccache shares their compilations, its cache one
// directory of the home (`SCCACHE_DIR`, ~/.cache/sccache, sccache's default on Linux, named so
// that the envelope opens the same, ./index.mjs `sorties`), common to every copy of the machine.
// Every command of the module that compiles (tests, verification, typing, clippy) runs cargo
// under this environment, in a copy as in an agent's envelope.
//
// - One server per copy and per namespace of processes: by default the server of sccache listens
//   on 127.0.0.1:4226 (README of v0.19.0), one for the whole machine, and the envelope shares the
//   network, so that a server born in one agent's envelope would serve another copy, and one born
//   outside would compile for an agent out of his envelope. Each run names its server's socket
//   (`SCCACHE_SERVER_UDS`), an abstract unix socket (the README's `\x00<name>` form), named after
//   the copy and the namespace of processes it runs in (`/proc/self/ns/pid`), which each envelope
//   creates (`--unshare-pid`): the two sides of an envelope, and two envelopes of one copy, never
//   share a server, whatever the environment says. An abstract socket writes no file, so that
//   neither the read-only copy nor the 108 bytes of a socket's path bind it, and it goes with its
//   server, leaving no stale file. The disk cache stays common.
// - A wrapper the project sets already is its own: the run keeps it, without sccache. It is read
//   as cargo reads it: the environment (`RUSTC_WRAPPER`, `CARGO_BUILD_RUSTC_WRAPPER`), then
//   `build.rustc-wrapper` of each `.cargo/config.toml` (or `.cargo/config`) from the project up to
//   the root, then of `$CARGO_HOME` (`~/.cargo` by default).
// - A machine without sccache on the PATH of the command is refused before any run of cargo, in
//   one line that names it and the command that installs it (`sccacheAbsent`), rather than on the
//   error of cargo that cannot run its wrapper.
import { createHash } from 'node:crypto';
import { accessSync, constants, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

// The loader of smol-toml, an optional peer of the package, a tool of this module.
const require = createRequire(import.meta.url);

/** The cache of sccache, from the home: what the envelope opens in writing. */
export const CACHE = '~/.cache/sccache/';

// The directories of cargo's configuration for a run in <racine> under <env>, in cargo's order:
// `.cargo` of the project and of each parent up to the root, then `$CARGO_HOME`.
function dossiersDeConfiguration(racine, env) {
  const dossiers = [];
  for (let d = path.resolve(racine); ; d = path.dirname(d)) {
    dossiers.push(path.join(d, '.cargo'));
    if (path.dirname(d) === d) {
      break;
    }
  }
  const maison = env.CARGO_HOME || path.join(env.HOME || homedir(), '.cargo');
  return [...dossiers, maison];
}

// The wrapper of rustc the project at <racine> sets, as cargo reads it (see the header), or null.
function lanceurDuProjet(racine, env) {
  const parLEnvironnement = env.RUSTC_WRAPPER || env.CARGO_BUILD_RUSTC_WRAPPER;
  if (parLEnvironnement) {
    return parLEnvironnement;
  }
  const { parse } = require('smol-toml');
  for (const dossier of dossiersDeConfiguration(racine, env)) {
    for (const nom of ['config.toml', 'config']) {
      try {
        const w = parse(readFileSync(path.join(dossier, nom), 'utf8'))?.build?.['rustc-wrapper'];
        if (w) {
          return String(w);
        }
      } catch {
        // An absent or unreadable configuration sets no wrapper.
      }
    }
  }
  return null;
}

/** The namespace of processes this process runs in, `pid:[<inode>]`. */
export const espaceDesProcessus = () => readlinkSync('/proc/self/ns/pid');

const reel = p => {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

/**
 * The socket of the server of sccache for the copy at <racine> in the namespace of processes
 * <espace>: an abstract unix socket, named after both.
 * @param {string} racine
 * @param {string} [espace] this process's namespace by default
 */
export function socketDuServeur(racine, espace = espaceDesProcessus()) {
  const empreinte = createHash('sha256')
    .update(`${reel(racine)}\0${espace}`)
    .digest('hex');
  return `\\x00grillhouse-sccache-${empreinte.slice(0, 16)}`;
}

/**
 * The line that refuses a run in <racine> whose PATH (<env>'s) holds no sccache, the command that
 * installs it named; null when one is there, or when the project sets its own wrapper.
 * @param {string} racine
 * @param {NodeJS.ProcessEnv} env
 * @returns {string | null}
 */
export function sccacheAbsent(racine, env) {
  if (lanceurDuProjet(racine, env)) {
    return null;
  }
  const present = (env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .some(d => {
      try {
        accessSync(path.join(d, 'sccache'), constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
  return present
    ? null
    : "⛔ sccache absent du PATH : cargo compile à travers lui (RUSTC_WRAPPER=sccache) ; `npx grillhouse maj` l'installe avec les autres binaires du module cargo.";
}

/**
 * <env> with rustc wrapped by sccache for the copy at <racine>, its cache the home's, its server
 * the copy's; <env> as it is when the project sets its own wrapper.
 * @param {string} racine
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function avecSccache(racine, env) {
  if (lanceurDuProjet(racine, env)) {
    return env;
  }
  return {
    ...env,
    RUSTC_WRAPPER: 'sccache',
    SCCACHE_DIR: path.join(env.HOME || homedir(), '.cache', 'sccache'),
    SCCACHE_SERVER_UDS: socketDuServeur(racine),
  };
}
