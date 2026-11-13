// The cache of compilation of the module cargo: sccache (Mozilla), the wrapper of rustc
// (`RUSTC_WRAPPER=sccache`) that Firefox and the CI of Rust use, which the update installs
// (./binaires.json). Each copy keeps its own target directory, so that two compilations never wait
// on the lock cargo takes on a target directory; sccache shares their compilations, its cache one
// directory of the home (`SCCACHE_DIR`, ~/.cache/grillhouse/sccache, the frame's caches of
// compilation, `cacheDeCompilation` of scripts/mesure/base-de-passe.mjs, named so that the envelope
// opens the same, ./index.mjs `sorties`), common to every copy of the machine.
// - A workspace rooted in the temporary directory (a project of trial) builds out of it: its
//   target directory is `CARGO_TARGET_DIR`, a cache of the root under ~/.cache/grillhouse/cargo/
//   (`cacheDeLaRacine`), swept once the root is gone, as Bazel keeps its output_base under
//   ~/.cache and never on a disk in memory; a `CARGO_TARGET_DIR` already set stays
//   (`cibleDeCompilation`).
// - Cargo compiles without incremental compilation (`CARGO_INCREMENTAL=0`), as the CI of Rust and
//   the usual continuous integrations do: a copy of a ticket compiles once and seldom again, and
//   its `target/debug/incremental` held up to 1.1 GB of a target of 5.0 GB (SyntHub, SH-ae6.2.7,
//   grillhouse-k5y); sccache caches no incremental compilation either. Whoever decides it keeps
//   it, as cargo reads it, which lets each of them override every profile: the caller, by
//   `CARGO_INCREMENTAL` (an agent or a person who debugs, `CARGO_INCREMENTAL=1`),
//   `CARGO_BUILD_INCREMENTAL` or a `CARGO_PROFILE_<nom>_INCREMENTAL` of the environment; the
//   project, by `incremental` in a `[profile.*]` of its Cargo.toml, or `build.incremental` or a
//   profile of a `.cargo/config.toml` from the project up to the root, then of `$CARGO_HOME`. The
//   frame writes no other setting of a profile.
// Every command of the module that compiles (tests, verification, typing, clippy) runs cargo
// under this environment, in a copy as in an agent's envelope.
//
// - One server per copy, per temporary directory and per namespace of processes: by default the
//   server of sccache listens on 127.0.0.1:4226 (README of v0.19.0), one for the whole machine, and
//   the envelope shares the network, so that a server born in one agent's envelope would serve
//   another copy, and one born outside would compile for an agent out of his envelope. Each run
//   names its server's socket (`SCCACHE_SERVER_UDS`), an abstract unix socket (the README's
//   `\x00<name>` form), named after the copy, the temporary directory of the run (TMPDIR) and the
//   namespace of processes it runs in (`/proc/self/ns/pid`), which each envelope creates
//   (`--unshare-pid`): the two sides of an envelope, and two envelopes of one copy, never share a
//   server, whatever the environment says. An abstract socket writes no file, so that neither the
//   read-only copy nor the 108 bytes of a socket's path bind it, and it goes with its server,
//   leaving no stale file. A server cargo starts keeps the temporary directory of its run, where it
//   writes as it compiles, and outlives it (its idle time): a pass, whose temporary directory goes
//   at its end, never joins the server of another (SyntHub, grillhouse-67dz). The disk cache stays
//   common.
// - The server starts before each run of cargo that compiles, under the machine's `/tmp`
//   (`demarrerLeServeur`): sccache 0.19.0 starts its server by binding a socket of a path under
//   TMPDIR (`<TMPDIR>/sccacheXXXXXX/sock`, src/commands.rs, `run_server_process`), which fails
//   past the 108 bytes of a socket's path (« path must be shorter than SUN_LEN »), and the
//   temporary directory of a pass of tests under the working directory of a session passes them
//   (grillhouse-qmk, OSC Bridge OB-p58). Cargo then finds the server running and starts none; it
//   keeps its own temporary directory, the pass's.
// - A wrapper the project sets already is its own: the run keeps it, without sccache. It is read
//   as cargo reads it: the environment (`RUSTC_WRAPPER`, `CARGO_BUILD_RUSTC_WRAPPER`), then
//   `build.rustc-wrapper` of each `.cargo/config.toml` (or `.cargo/config`) from the project up to
//   the root, then of `$CARGO_HOME` (`~/.cargo` by default).
// - A machine without sccache on the PATH of the command is refused before any run of cargo, in
//   one line that names it and the command that installs it (`sccacheAbsent`), rather than on the
//   error of cargo that cannot run its wrapper.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import {
  cacheDeCompilation,
  cacheDeLaRacine,
  dansLeTemporaire,
  trouverDansLePath,
} from '../../services-du-noyau.mjs';

// The loader of smol-toml, an optional peer of the package, a tool of this module.
const require = createRequire(import.meta.url);

/** The cache of sccache, from the home: what the envelope opens in writing. */
export const CACHE = '~/.cache/grillhouse/sccache/';

/** The targets of the workspaces rooted in the temporary directory, from the home: what the
 * envelope opens in writing (`cibleDeCompilation`). */
export const CIBLES = '~/.cache/grillhouse/cargo/';

// The machine's temporary directory, short whatever the copy: the one the server of sccache starts
// under (`demarrerLeServeur`), an empty one proper to the session in an envelope.
const COURT = '/tmp';

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
 * The socket of the server of sccache for the copy at <racine>, the temporary directory
 * <temporaire> and the namespace of processes <espace>: an abstract unix socket, named after the
 * three.
 * @param {string} racine
 * @param {string} temporaire the temporary directory of the run (its TMPDIR)
 * @param {string} [espace] this process's namespace by default
 */
export function socketDuServeur(racine, temporaire, espace = espaceDesProcessus()) {
  const empreinte = createHash('sha256')
    .update(`${reel(racine)}\0${reel(temporaire)}\0${espace}`)
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
  return trouverDansLePath('sccache', env)
    ? null
    : "⛔ sccache absent du PATH : cargo compile à travers lui (RUSTC_WRAPPER=sccache) ; `npx grillhouse binaires` l'installe avec les autres binaires du module cargo.";
}

/**
 * Starts the server of sccache of the copy at <racine> under <env> (`avecSccache`), under the
 * machine's temporary directory (`COURT`), unless the project sets its own wrapper; a server
 * already running stays, and its refusal of a second one is no failure.
 * @param {string} racine
 * @param {NodeJS.ProcessEnv} env the environment before `avecSccache`
 */
export function demarrerLeServeur(racine, env) {
  if (lanceurDuProjet(racine, env)) {
    return;
  }
  spawnSync('sccache', ['--start-server'], {
    env: { ...avecSccache(racine, env), TMPDIR: COURT },
    stdio: 'ignore',
  });
}

/**
 * The target directory of the workspace at <racine> under <env>, out of the temporary directory:
 * `{ CARGO_TARGET_DIR }`, a cache of the root (`cacheDeLaRacine`), for a root in the temporary
 * directory; nothing otherwise, or when <env> sets one already. With `creer` false, a reading
 * (`cargo metadata`): the path alone, nothing written.
 * @param {string} racine
 * @param {NodeJS.ProcessEnv} env
 * @param {{ creer?: boolean }} [options]
 * @returns {{ CARGO_TARGET_DIR?: string }}
 */
export function cibleDeCompilation(racine, env, { creer = true } = {}) {
  if (env.CARGO_TARGET_DIR || !dansLeTemporaire(racine, env)) {
    return {};
  }
  return { CARGO_TARGET_DIR: cacheDeLaRacine('cargo', racine, env, { creer }) };
}

// Whether a TOML document <toml> sets `incremental` in one of its profiles (`[profile.<nom>]`),
// or, with <build>, in its `[build]` table.
const poseLIncremental = (toml, build) =>
  Object.values(toml?.profile ?? {}).some(p => p && Object.hasOwn(p, 'incremental')) ||
  (build && Object.hasOwn(toml?.build ?? {}, 'incremental'));

// Whether the caller or the project at <racine> under <env> decides incremental compilation, as
// cargo reads it (see the header): the environment (`CARGO_INCREMENTAL`, `CARGO_BUILD_INCREMENTAL`,
// a `CARGO_PROFILE_<nom>_INCREMENTAL`), the profiles of the Cargo.toml at <racine>, then
// `build.incremental` and the profiles of each `.cargo/config.toml` (or `.cargo/config`).
function incrementalDecide(racine, env) {
  if (
    Object.keys(env).some(
      k =>
        k === 'CARGO_INCREMENTAL' ||
        k === 'CARGO_BUILD_INCREMENTAL' ||
        /^CARGO_PROFILE_\w+_INCREMENTAL$/.test(k)
    )
  ) {
    return true;
  }
  const { parse } = require('smol-toml');
  const lu = f => {
    try {
      return parse(readFileSync(f, 'utf8'));
    } catch {
      // An absent or unreadable file decides nothing.
      return null;
    }
  };
  if (poseLIncremental(lu(path.join(racine, 'Cargo.toml')), false)) {
    return true;
  }
  return dossiersDeConfiguration(racine, env).some(d =>
    ['config.toml', 'config'].some(nom => poseLIncremental(lu(path.join(d, nom)), true))
  );
}

/**
 * <env> with rustc wrapped by sccache for the copy at <racine>, its cache the home's, its server
 * the copy's, its target out of the temporary directory (`cibleDeCompilation`); without sccache
 * when the project sets its own wrapper. Incremental compilation is off (`CARGO_INCREMENTAL=0`)
 * unless the caller or the project decides it (`incrementalDecide`).
 * @param {string} racine
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function avecSccache(racine, env) {
  const cible = {
    ...cibleDeCompilation(racine, env),
    ...(incrementalDecide(racine, env) ? {} : { CARGO_INCREMENTAL: '0' }),
  };
  if (lanceurDuProjet(racine, env)) {
    return { ...env, ...cible };
  }
  return {
    ...env,
    ...cible,
    RUSTC_WRAPPER: 'sccache',
    SCCACHE_DIR: cacheDeCompilation('sccache', env),
    SCCACHE_SERVER_UDS: socketDuServeur(racine, env.TMPDIR || tmpdir()),
  };
}
