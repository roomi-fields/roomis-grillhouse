// The published version that leads the frame's repository, as rustc is built by its stage0 (a
// published compiler, fixed in src/stage0, downloaded into a cache) and Bazel by a released Bazel:
// the tool that orchestrates is a published version; the code the tickets change is the code that
// is built and tested.
//
// The command (bin/grillhouse.mjs) imports this module, and `grillhouse outil` (scripts/outil.mjs)
// installs a version by it.
//
// - The key `grillhouse.outil` of the project's package.json (the working directory) names the
//   version, `x.y.z`; absent or null, the project has none: an ordinary project, whose command is
//   already the version it installed. Any other value is refused by its name.
// - A version is installed under ~/.cache/grillhouse/outil/<version>/ (`dossierDeLOutil`), by
//   `npm install` of the published package @roomi-fields/grillhouse@<version>, then of the peer
//   dependencies it declares, at their ranges, the optional ones included (TypeScript, Turborepo,
//   API Extractor…): the tool stands alone, as a stage0 brings its library. It installs in a folder
//   of its own beside it (`<version>.installation-<pid>`), renamed once complete: a version half
//   installed is never taken for one there, the folder of a process that died is swept at the
//   next installation, and a folder another launch completed meanwhile is taken. npm writes on
//   the error stream alone, so that the output of a hook of Claude Code stays the command's. A
//   failure is written in the state file of the tool (`<version>.echec`, its date and its reason),
//   removed at the first installation that succeeds: within 5 minutes of it, a launch runs no npm
//   again, and while it stands the session's start (`node aiguillage.mjs --echec`) and the board
//   (`echecDeLOutil`) say that the orchestration runs on the code of the repository.
// - The switch (`aiguillage`), which the command (bin/grillhouse.mjs) asks before any subcommand:
//   a subcommand of the orchestration (REDIRIGEES) in a project that names its version runs by the
//   command of that version, installed at its first launch; a version that cannot be installed is
//   said in one line, and the code that runs takes its place. Every other subcommand runs the code
//   that runs, the ticket's copy for a session of the circuit: those of the copy (DU_CODE_EN_COURS,
//   and the commands of the modules of language) and the tools of the repository
//   (OUTILS_DU_DEPOT). Each subcommand of the core is in one of the three lists, which a test
//   holds. The code that runs is the version installed when their paths are the same: it runs in
//   place.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CLE = 'grillhouse.outil';
export const NOM_DU_PAQUET = '@roomi-fields/grillhouse';
export const X_Y_Z = /^\d+\.\d+\.\d+$/;
// The package that runs: this script's.
const PAQUET_QUI_TOURNE = path.resolve(import.meta.dirname, '..');

/**
 * The subcommands of the orchestration, which the published version runs: the circuit, the
 * supervisor, the night, the board and the status line, the hooks of Claude Code, the locks and
 * the rights of the sessions, the envelope and its launcher, the integration, the
 * results, the removal of a copy and the balance, even when the supervisor runs one by hand.
 */
export const REDIRIGEES = new Set([
  'attente-au-tour',
  'bilan',
  'circuit',
  'commande',
  'droits',
  'enveloppe',
  'integrer',
  'journal',
  'lancer',
  'ligne-etat',
  'nuit',
  'registre',
  'resultats',
  'retirer-copie',
  'session-start',
  'structure-guard',
  'superviseur',
  'tableau',
  'ticket-du-sous-agent',
  'verrou',
]);

/**
 * The subcommands that play the code of the copy: the tests, the verification, the guards, the
 * temporary folder, the git hooks and the merge driver, the affected components; the commands of
 * the modules of language too, which are no subcommand of the core.
 */
export const DU_CODE_EN_COURS = new Set([
  'composants-affectes',
  'dependances-internes',
  'flux-des-paquets',
  'fusion-du-changelog',
  'gardes-du-cadre',
  'hook',
  'hooks',
  'langages-des-paquets',
  'style-a-l-ecriture',
  'temporaire',
  'tests',
  'verifier',
]);

/** The tools of the repository, which run its code: creation, update, release, installation. */
export const OUTILS_DU_DEPOT = new Set([
  'greffons',
  'init',
  'maj',
  'outil',
  'paquet',
  'pression',
  'sortie',
  'sous-modules',
  'temporal',
  'ticket',
]);

// How long a failed installation is kept: within it, a launch runs no npm again.
const RETENUE_MS = 5 * 60 * 1000;

// The cache of the published versions: ~/.cache/grillhouse/outil.
export const cacheDesOutils = (maison = os.homedir()) =>
  path.join(maison, '.cache', 'grillhouse', 'outil');

/** The folder of the version <version> under <cache>. */
export const dossierDeLOutil = (version, cache = cacheDesOutils()) => path.join(cache, version);

// The command of the version installed in <dossier>.
const commandeDans = dossier =>
  path.join(dossier, 'node_modules', NOM_DU_PAQUET, 'bin', 'grillhouse.mjs');

const realpath = p => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

/**
 * The version the project at <racine> names (`grillhouse.outil` of its package.json), or null.
 * @param {string} [racine]
 * @returns {string | null}
 * @throws {Error} a value that is no version x.y.z, named by its key
 */
export function versionDeLOutil(racine = process.cwd()) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
  const v = pkg?.grillhouse?.outil;
  if (v === undefined || v === null) {
    return null;
  }
  if (typeof v !== 'string' || !X_Y_Z.test(v)) {
    throw new Error(`la clé ${CLE} vaut ${JSON.stringify(v)}, pas une version x.y.z.`);
  }
  return v;
}

/**
 * Where the subcommand <nom> runs in the project at <racine>: `{ version, dossier, commande }`, the
 * version of the key and its command under <cache>, for a subcommand of the orchestration that the
 * package <paquet> (the one that runs) is not; null otherwise (see the header).
 * @param {string} nom
 * @param {{ racine?: string, cache?: string, paquet?: string }} [options]
 * @returns {{ version: string, dossier: string, commande: string } | null}
 */
export function aiguillage(
  nom,
  { racine = process.cwd(), cache = cacheDesOutils(), paquet = PAQUET_QUI_TOURNE } = {}
) {
  if (!REDIRIGEES.has(nom)) {
    return null;
  }
  const version = versionDeLOutil(racine);
  if (version === null) {
    return null;
  }
  const dossier = dossierDeLOutil(version, cache);
  const commande = commandeDans(dossier);
  if (realpath(paquet) === realpath(path.resolve(path.dirname(commande), '..'))) {
    return null;
  }
  return { version, dossier, commande };
}

// The state file of the failed installation of <version> under <cache>.
const fichierDEchec = (version, cache) => `${dossierDeLOutil(version, cache)}.echec`;

// The failure the state file <f> holds, `{ date, raison }`, or null.
function lireLEchec(f) {
  try {
    const e = JSON.parse(readFileSync(f, 'utf8'));
    return typeof e?.raison === 'string' && !Number.isNaN(Date.parse(e?.date)) ? e : null;
  } catch {
    return null;
  }
}

/**
 * The failed installation of the version the project at <racine> names: `{ version, raison, date }`
 * while its state file stands (written at each failure, removed at the first installation that
 * succeeds), which the session's start and the board say; null otherwise, or without the key. A
 * state file beside the version installed (a failure written after another launch succeeded) is
 * removed, and gives null.
 * @param {string} [racine]
 * @param {{ cache?: string }} [options]
 * @returns {{ version: string, raison: string, date: string } | null}
 */
export function echecDeLOutil(racine = process.cwd(), { cache = cacheDesOutils() } = {}) {
  let version;
  try {
    version = versionDeLOutil(racine);
  } catch {
    return null;
  }
  if (version === null) {
    return null;
  }
  const f = fichierDEchec(version, cache);
  // A failure written after another launch installed the version: the version stands.
  if (existsSync(commandeDans(dossierDeLOutil(version, cache)))) {
    rmSync(f, { force: true });
    return null;
  }
  const e = lireLEchec(f);
  return e && { version, raison: e.raison, date: e.date };
}

// The pids of the folders of installation (`<version>.installation-<pid>`) under <cache>, each of a
// process that has ended removed.
function balayer(cache) {
  let entrees = [];
  try {
    entrees = readdirSync(cache);
  } catch {
    return;
  }
  for (const e of entrees) {
    const pid = Number(/\.installation-(\d+)$/.exec(e)?.[1]);
    if (pid && !vivant(pid)) {
      rmSync(path.join(cache, e), { recursive: true, force: true });
    }
  }
}

const vivant = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

// Runs npm install of <specs> under <prefixe>, its output on the error stream; throws the reason
// of a failure: npm's last line, or its code.
function npmInstall(npm, prefixe, specs) {
  const r = spawnSync(
    npm,
    ['install', '--prefix', prefixe, '--no-audit', '--no-fund', '--save-exact', ...specs],
    { stdio: ['ignore', 2, 'pipe'], encoding: 'utf8' }
  );
  process.stderr.write(r.stderr ?? '');
  if (r.status === 0) {
    return;
  }
  const ligne = String(r.stderr ?? '')
    .trim()
    .split('\n')
    .at(-1);
  throw new Error(
    `npm install ${specs.join(' ')} : ${r.error?.message || ligne || `code ${r.status}`}`
  );
}

/**
 * Installs the published version <version> under <cache> (see the header), by the command <npm>:
 * the package, then the peer dependencies it declares, at their ranges, the optional ones
 * included, so that the tool stands alone, as a stage0 brings its library. A failure is kept
 * <retenue> ms, within which a call runs no npm and throws it again.
 * @param {string} version
 * @param {{ cache?: string, npm?: string, retenue?: number }} [options]
 * @returns {{ dossier: string, installe: boolean }} installe false when it was there
 * @throws {Error} npm failing, the version named
 */
export function installer(
  version,
  { cache = cacheDesOutils(), npm = 'npm', retenue = RETENUE_MS } = {}
) {
  const dossier = dossierDeLOutil(version, cache);
  if (existsSync(commandeDans(dossier))) {
    return { dossier, installe: false };
  }
  const echec = fichierDEchec(version, cache);
  const garde = lireLEchec(echec);
  if (garde && Date.now() - Date.parse(garde.date) < retenue) {
    throw new Error(garde.raison);
  }
  mkdirSync(cache, { recursive: true });
  balayer(cache);
  const chantier = `${dossier}.installation-${process.pid}`;
  rmSync(chantier, { recursive: true, force: true });
  mkdirSync(chantier, { recursive: true });
  try {
    try {
      npmInstall(npm, chantier, [`${NOM_DU_PAQUET}@${version}`]);
      const pkg = JSON.parse(
        readFileSync(path.join(chantier, 'node_modules', NOM_DU_PAQUET, 'package.json'), 'utf8')
      );
      const pairs = Object.entries(pkg.peerDependencies ?? {}).map(([n, r]) => `${n}@${r}`);
      if (pairs.length) {
        npmInstall(npm, chantier, pairs);
      }
      if (!existsSync(commandeDans(chantier))) {
        throw new Error(`npm n'a pas posé la commande de ${NOM_DU_PAQUET}@${version}`);
      }
    } catch (e) {
      const raison = `${NOM_DU_PAQUET}@${version} : ${e.message}`;
      writeFileSync(echec, JSON.stringify({ date: new Date().toISOString(), raison }));
      throw new Error(raison);
    }
    rmSync(echec, { force: true });
    try {
      renameSync(chantier, dossier);
    } catch (e) {
      // Another launch installed it meanwhile: its folder stands.
      if (!existsSync(commandeDans(dossier))) {
        throw e;
      }
    }
    return { dossier, installe: true };
  } finally {
    rmSync(chantier, { recursive: true, force: true });
  }
}

// `node aiguillage.mjs --echec [<racine>]`, which the session's start runs: the line that says the
// failed installation of the version of the key, nothing without one.
if (
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href &&
  process.argv[2] === '--echec'
) {
  const e = echecDeLOutil(process.argv[3] ?? process.cwd());
  if (e) {
    process.stdout.write(
      `⚠️ Version publiée ${e.version} non installable (${e.raison}) : l'orchestration tourne sur le code du dépôt. \`npx grillhouse outil\` la réinstalle.\n`
    );
  }
}
