#!/usr/bin/env node
// The commands of the module cargo, the demand `commandes` of the join (scripts/jointure.d.ts):
// each one this script with its name first, `{ script, args }`, described, never run, by
// `commandes`; run by `grillhouse <commande>` in the root of the workspace, its arguments after.
//
//   npx grillhouse tests [--force] [<chemin>…] [--<option>…]   tester
//   npx grillhouse verifier [--tout | --gardes]                 verifier
//   node commandes.mjs typer                                    typer
//   npx grillhouse preparer                                     preparer
//   npx grillhouse clippy | frontieres | index-interfaces       each guard, its own script
//
// - Each guard of structure of the module (./clippy.mjs, ./frontieres.mjs, ./index-interfaces.mjs)
//   is a command by its name too, its own script, as the module typescript's: the line of a red
//   guard (`grillhouse <garde>`, scripts/gardes-du-cadre.mjs) names a command that exists.
// - `tester` plays the tests of each crate chosen, one crate after the other. For a crate that
//   plays tests (./composants.mjs, `joueDesTests`): the build of its test targets, `cargo test
//   --no-run -p <crate>`, a task `build` of its own, as Turborepo's `test` depends on `build`
//   (grillhouse-egm); then `cargo nextest run -p <crate> --no-fail-fast`, which finds them built.
//   Then `cargo test --doc -p <crate>` for a crate whose library has doctests, which nextest does
//   not play. A failed build leaves the crate's other tasks not played (`code` null): a test that
//   does not compile is a red of the build, which the proof of the red reads as one (« construction
//   de <crate> », scripts/circuit.mjs), and the tests play at the checks. The output of the build
//   goes to its log, `<target>/grillhouse/<crate>-build.log`, the task's `journal` from the root,
//   then to the error stream. A path, written from the root, chooses the crate that holds it; the
//   source of a test target (`<crate>/tests/<nom>.rs`) builds and plays that target alone
//   (`--test <nom>`), without the doctests. A path out of every crate, or in a crate without tests, is refused, named, and
//   nothing plays (code 2). Without a path, every crate plays, or, under the circuit's mark
//   (`GRILLHOUSE_DEPUIS_LE_VERT`), the crates the changes since the last green touch and their
//   dependents (./touches.mjs), every crate when no last green counts. `--force` changes nothing:
//   cargo keeps no result of a test to replay. Another option goes to nextest.
// - `verifier` plays the tests of the crates the changes since the last green touch and of their
//   dependents (every crate with `--tout`, or when no last green counts), as Turborepo's
//   `--filter=...[<commit>]`, then `cargo deny check`; green, it keeps the last green
//   (scripts/dernier-vert.mjs). It plays under the lock of the machine, one heavy measure at a
//   time (`avecLaMachine` of ./jointure, as the module typescript's verifier): a measure that
//   holds it makes it wait, and the bound of the wait reached, it stops at 75 without running
//   cargo.
// - `verifier --gardes` plays the guards alone, the same verdict as the module typescript's: the
//   project's root scripts `grillhouse:gardes` (the frame's guards) then `gardes` (its own), each
//   one the package.json holds a task of the root, by npm, without its tests nor cargo deny, and
//   keeps no last green.
// - `tester` and `verifier` play under a temporary directory of their pass, the module's guard of
//   the temporary directory, as the CI of osc-bridge (OB-ud1.3): a base (`ouvrirBase` of
//   ./jointure, genre `tests` or `verification`) in the temporary directory of the environment,
//   named in TMPDIR, TMP and TEMP to cargo, which nextest and the doctests inherit; removed at the
//   end of the pass, green, red or interrupted (SIGINT, SIGTERM, SIGHUP). What the tests left there
//   fails the pass (code 1), each name written on the error stream. A test makes its temporary
//   directory or file with the crate `tempfile` (`TempDir`, `NamedTempFile`), removed when dropped,
//   a failed test included, never a path built by hand under `std::env::temp_dir()`.
// - `typer`: `cargo check --all-targets`. `preparer`: `cargo fetch --locked`.
// - Cargo runs with rustc wrapped by sccache, its cache common to the copies of the machine
//   (./sccache.mjs), in a copy as in an agent's envelope (grillhouse-cyr). `tester`, `verifier`
//   and `typer` refuse, before any run of cargo, a PATH without sccache, in one line that names it
//   and `npx grillhouse maj`, which installs it (code 2).
// - Nextest reads the frame's profile `grillhouse` (./nextest.toml, a tool's configuration under
//   the project's own, `--tool-config-file`), whose JUnit report lands at
//   `<target>/nextest/grillhouse/junit.xml`.
// - While the environment names a results directory (`GRILLHOUSE_RESULTATS`), the run writes
//   there what ./verdict.mjs reads: its tasks, each planned before it plays (`code` null until it
//   ran), and the JUnit report of each run of nextest. A task of the workspace is named after its
//   root, `//`, as Turborepo names the root's tasks.
// - `tester`, `verifier` and `preparer` refuse, before any run of cargo, a workspace whose
//   Cargo.lock git does not track (grillhouse-rph), in one line that names the file and the
//   gesture: `git add Cargo.lock`, or `cargo generate-lockfile` first when it is absent. Cargo
//   recommends committing it for every project, and the verification plays the exact versions of
//   the repository (`--locked`, as `npm ci` refuses a project without package-lock.json): a lock
//   ignored passes in the main repository, where it lies on disk, and fails in a copy taken from
//   git, the integration's.
// - The exit code: 0 when every task is green, 75 when the only reds are « à repasser », 1
//   otherwise; 2 for a path refused, a Cargo.lock not tracked or a command unknown.
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { constants, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RESULTATS } from '../../resultats.mjs';
import {
  AttenteDeLaMachine,
  avecLaMachine,
  CHANGEMENTS,
  DEPUIS_LE_VERT,
  garderLeVert,
  ligneDesRestes,
  mesure,
  ouvrirBase,
  retirerALInterruption,
} from '../../services-du-noyau.mjs';
import { composantDans, crates, joueDesTests, metadonnees } from './composants.mjs';
import { avecSccache, sccacheAbsent } from './sccache.mjs';
import { touchesDesFichiers } from './touches.mjs';
import { JUNIT, TACHES } from './verdict.mjs';

const ICI = fileURLToPath(import.meta.url);
const NEXTEST = path.join(path.dirname(ICI), 'nextest.toml');
const PROFIL = 'grillhouse';
export const NOMS = ['tester', 'verifier', 'typer', 'preparer'];
const A_REPASSER = 75;
const RACINE = '//';
const VERROU = 'Cargo.lock';
// The commands that play the exact versions of the repository, refused without its Cargo.lock.
const VERROUILLEES = ['tester', 'verifier', 'preparer'];
// The commands that compile, refused without sccache on the PATH (./sccache.mjs).
const COMPILENT = ['tester', 'verifier', 'typer'];

/** The guards of structure of the module, in the order they play: each its name, its script beside
 * this one, and its arguments as a guard. */
export const GARDES = [
  { nom: 'clippy', args: [] },
  { nom: 'frontieres', args: [] },
  { nom: 'index-interfaces', args: ['--verifier'] },
].map(g => ({ ...g, script: path.join(path.dirname(ICI), `${g.nom}.mjs`) }));

/** The commands of the module, each this script and its name, described; then each guard, its
 * script by its name, as `grillhouse <garde>` runs it and the line of a red guard names it. */
export const commandes = () =>
  Object.fromEntries([
    ...NOMS.map(n => [n, { script: ICI, args: [n] }]),
    ...GARDES.map(g => [g.nom, { script: g.script, args: [] }]),
  ]);

// The id of each test binary of nextest of <c>, its target's source: the library under the
// crate's name, the others as `<crate>::<nom>`, a binary, an example or a bench prefixed by kind.
function binaires(c) {
  return Object.fromEntries(
    c.cibles.map(t => {
      const kind = t.kind[0];
      if (kind === 'test') {
        return [`${c.composant.nom}::${t.name}`, t.src];
      }
      if (['bin', 'example', 'bench'].includes(kind)) {
        return [`${c.composant.nom}::${kind}/${t.name}`, t.src];
      }
      return [c.composant.nom, t.src];
    })
  );
}

// The run of the tasks of a command in <racine>: each planned, then played by cargo, written in
// the results directory <env> names.
function passe(racine, env) {
  const dossier = env[RESULTATS] || null;
  const id = `${Date.now()}-${process.pid}`;
  const taches = [];
  const cibles = {};
  // Cargo compiles through sccache (./sccache.mjs).
  const compilation = avecSccache(racine, env);
  const ecrire = () => {
    if (!dossier) {
      return;
    }
    mkdirSync(path.join(dossier, TACHES), { recursive: true });
    writeFileSync(
      path.join(dossier, TACHES, `${id}.json`),
      `${JSON.stringify({ taches, cibles }, null, 2)}\n`
    );
  };
  return {
    cibles,
    prevoir(paquet, dossierDuPaquet, script, tests, args) {
      const t = {
        tache: `${paquet}#${script}`,
        paquet,
        dossier: path.relative(racine, dossierDuPaquet) || '.',
        script,
        tests,
        code: null,
        cache: null,
        journal: null,
      };
      taches.push(t);
      ecrire();
      return { t, args };
    },
    jouer({ t, args }, { junit = null, journal = null, programme = 'cargo' } = {}) {
      // A report of an earlier run is no report of this one, which may write none.
      if (junit) {
        rmSync(junit, { force: true });
      }
      let r;
      if (journal) {
        // The output of cargo, both streams in their order, goes to the task's log, then to the
        // command's error stream, where cargo writes it.
        mkdirSync(path.dirname(journal), { recursive: true });
        const fd = openSync(journal, 'w');
        try {
          r = spawnSync(programme, args, {
            cwd: racine,
            env: compilation,
            stdio: ['inherit', fd, fd],
          });
        } finally {
          closeSync(fd);
        }
        process.stderr.write(readFileSync(journal, 'utf8'));
        t.journal = path.relative(racine, journal);
      } else {
        r = spawnSync(programme, args, { cwd: racine, env: compilation, stdio: 'inherit' });
      }
      t.code = r.error ? 127 : (r.status ?? 128 + (constants.signals[r.signal] ?? 0));
      if (junit && dossier && existsSync(junit)) {
        mkdirSync(path.join(dossier, JUNIT), { recursive: true });
        copyFileSync(junit, path.join(dossier, JUNIT, `${id}-${t.paquet}.xml`));
      }
      ecrire();
      return t.code;
    },
    code() {
      const rouges = taches.filter(t => t.code !== 0);
      if (rouges.length === 0) {
        return 0;
      }
      return rouges.every(t => t.code === A_REPASSER) ? A_REPASSER : 1;
    },
  };
}

// The crates the changes since the last green of <racine> touch, and their dependents; every crate
// with <tout> or without a last green that counts. `{ choix, m }`, `m` the measure.
function depuisLeVert(racine, tous, tout, env) {
  const m = mesure(racine, { tout, dans: env.TMPDIR });
  process.stderr.write(`${m.ligne}\n`);
  const f = m.env[CHANGEMENTS];
  if (!f) {
    return { choix: tous, m };
  }
  const ch = JSON.parse(readFileSync(f, 'utf8'));
  const t = touchesDesFichiers(racine, [...ch.fichiers, ...ch.supprimes]);
  const nommes = new Set([...t.touches, ...t.dependants].map(c => c.dossier));
  return { choix: tous.filter(c => nommes.has(c.composant.dossier)), m };
}

// Plans and plays the tests of the crates <choix> (each `{ c, cibles }`, `cibles` the test targets
// named, empty for the whole crate) in the run <p>: for a crate that plays tests, the build of its
// test targets first, then nextest, then its doctests; a failed build leaves the crate's other
// tasks not played.
function jouerLesTests(racine, p, choix, options) {
  const m = metadonnees(racine);
  const junit = path.join(m.target_directory, 'nextest', PROFIL, 'junit.xml');
  const parCrate = [];
  for (const { c, cibles } of choix) {
    Object.assign(p.cibles, binaires(c));
    const d = c.composant.dossier;
    const nom = c.composant.nom;
    const prevues = [];
    if (joueDesTests(racine, c.composant)) {
      const selection = ['-p', nom, ...cibles.flatMap(n => ['--test', n])];
      const journal = path.join(m.target_directory, 'grillhouse', `${nom}-build.log`);
      const construction = ['test', '--no-run', ...selection];
      prevues.push([p.prevoir(nom, d, 'build', false, construction), { journal }]);
      const args = ['nextest', 'run', '--tool-config-file', `${PROFIL}:${NEXTEST}`];
      args.push('--profile', PROFIL, '--no-fail-fast', ...selection);
      prevues.push([p.prevoir(nom, d, 'nextest', true, [...args, ...options]), { junit }]);
    }
    const doctests = c.cibles.some(t => t.kind.includes('lib') && t.doctest !== false);
    if (cibles.length === 0 && doctests) {
      const args = ['test', '--doc', '-p', nom];
      prevues.push([p.prevoir(nom, d, 'doctest', true, args), {}]);
    }
    parCrate.push(prevues);
  }
  for (const prevues of parCrate) {
    for (const [t, o] of prevues) {
      if (p.jouer(t, o) !== 0 && t.t.script === 'build') {
        break;
      }
    }
  }
}

// The crates the paths <chemins> choose in <racine>: `{ choix }`, or `{ refus }` naming each path
// refused.
function choisir(racine, tous, chemins) {
  const parDossier = new Map();
  const refus = [];
  for (const chemin of chemins) {
    const abs = path.resolve(racine, chemin);
    const c = composantDans(
      tous.map(x => x.composant),
      racine,
      abs
    );
    const crate = c && tous.find(x => x.composant === c);
    if (!crate) {
      refus.push(`${chemin} : hors de tout crate`);
      continue;
    }
    if (!joueDesTests(racine, c)) {
      refus.push(`${chemin} : ${c.nom} n'a aucun test, ni dossier tests/, ni tests.rs sous src/`);
      continue;
    }
    const cible = crate.cibles.find(t => t.kind.includes('test') && t.src === abs);
    const deja = parDossier.get(c.dossier);
    if (!cible) {
      parDossier.set(c.dossier, { c: crate, cibles: [] });
    } else if (!deja) {
      parDossier.set(c.dossier, { c: crate, cibles: [cible.name] });
    } else if (deja.cibles.length) {
      deja.cibles.push(cible.name);
    }
  }
  if (refus.length) {
    return { refus };
  }
  return {
    choix: tous
      .filter(x => parDossier.has(x.composant.dossier))
      .map(x => parDossier.get(x.composant.dossier)),
  };
}

// The pass of `verifier` in <racine>, under the lock of the machine (<env> carries its mark): the
// tests of the crates the changes since the last green touch, then cargo deny; green, it keeps the
// last green.
function verifier(racine, args, env) {
  const p = passe(racine, env);
  if (args.includes('--gardes')) {
    return gardes(racine, p);
  }
  const tous = crates(racine);
  const { choix, m } = depuisLeVert(racine, tous, args.includes('--tout'), env);
  try {
    jouerLesTests(
      racine,
      p,
      choix.map(c => ({ c, cibles: [] })),
      []
    );
    p.jouer(p.prevoir(RACINE, racine, 'deny', false, ['deny', 'check']));
    const code = p.code();
    if (code === 0 && m.etat) {
      garderLeVert(m.etat);
    }
    return code;
  } finally {
    m.retirer();
  }
}

// The scripts of guards of the project, in the order they play, as the module typescript's
// `--gardes` plays its tasks: the frame's, then the project's own.
const SCRIPTS_DE_GARDES = ['grillhouse:gardes', 'gardes'];

// The pass of `verifier --gardes` in <racine>, the run <p>: each script of SCRIPTS_DE_GARDES the
// root package.json holds, a task of the root, whatever the verdict of the one before; no test.
function gardes(racine, p) {
  let scripts = {};
  try {
    scripts = JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8')).scripts ?? {};
  } catch {
    scripts = {};
  }
  for (const nom of SCRIPTS_DE_GARDES.filter(n => typeof scripts[n] === 'string')) {
    p.jouer(p.prevoir(RACINE, racine, nom, false, ['run', '--silent', nom]), { programme: 'npm' });
  }
  return p.code();
}

// Node's compile cache, which npm enables under the temporary directory (`module.enableCompileCache()`)
// when `verifier --gardes` runs the project's scripts: the guard of the base tolerates it at its
// root, as the module typescript's base of Vitest, and the base removes it with the rest.
const CACHE_DE_NODE = 'node-compile-cache';

// Plays <jouer>(env) under the base of a pass of <genre> in the temporary directory of <env>,
// named to cargo in TMPDIR, TMP and TEMP: its code, 1 when the tests left something there, named.
// The base goes at the end, or at an interruption.
function sousLaBase(genre, env, jouer) {
  const base = ouvrirBase(genre, { dans: env.TMPDIR || tmpdir() });
  const lacher = retirerALInterruption(base.fermer);
  try {
    const code = jouer({ ...env, ...base.env });
    const ligne = ligneDesRestes(base.restes().filter(n => n !== CACHE_DE_NODE));
    if (!ligne) {
      return code;
    }
    process.stderr.write(`${ligne}\n`);
    return code === 0 || code === A_REPASSER ? 1 : code;
  } finally {
    lacher();
    base.fermer();
  }
}

/**
 * The line that refuses the workspace at <racine> whose Cargo.lock git does not track, the
 * gesture named; null when git tracks it.
 * @param {string} racine
 * @returns {string | null}
 */
export function verrouNonVersionne(racine) {
  if (!existsSync(path.join(racine, VERROU))) {
    return `⛔ ${VERROU} absent : cargo generate-lockfile, puis git add ${VERROU}`;
  }
  const r = spawnSync('git', ['ls-files', '--error-unmatch', '--', VERROU], {
    cwd: racine,
    stdio: 'ignore',
  });
  return r.status === 0 ? null : `⛔ ${VERROU} non versionné : git add ${VERROU}`;
}

/**
 * Runs the command <nom> with <args> in the workspace at <racine>: its exit code.
 * @param {string} nom one of NOMS
 * @param {string[]} args its arguments
 * @param {{ racine?: string, env?: NodeJS.ProcessEnv }} [o]
 */
export function lancer(nom, args, { racine = process.cwd(), env = process.env } = {}) {
  const refus =
    (VERROUILLEES.includes(nom) ? verrouNonVersionne(racine) : null) ??
    (COMPILENT.includes(nom) ? sccacheAbsent(racine, env) : null);
  if (refus) {
    process.stderr.write(`${refus}\n`);
    return 2;
  }
  const p = passe(racine, env);
  if (nom === 'typer') {
    p.jouer(p.prevoir(RACINE, racine, 'check', false, ['check', '--all-targets']));
    return p.code();
  }
  if (nom === 'preparer') {
    p.jouer(p.prevoir(RACINE, racine, 'fetch', false, ['fetch', '--locked']));
    return p.code();
  }
  if (nom === 'verifier') {
    const dire = l => process.stdout.write(`${l}\n`);
    try {
      return sousLaBase('verification', env, envBase =>
        avecLaMachine(envMachine => verifier(racine, args, envMachine), {
          env: envBase,
          racine,
          dire,
        })
      );
    } catch (e) {
      if (!(e instanceof AttenteDeLaMachine)) {
        throw e;
      }
      dire(e.message);
      return e.code;
    }
  }
  const tous = crates(racine);
  if (nom === 'tester') {
    return sousLaBase('tests', env, envBase => tester(racine, tous, args, envBase));
  }
  process.stderr.write(`⛔ commande inconnue du module cargo : ${nom} (${NOMS.join(', ')})\n`);
  return 2;
}

// The pass of `tester` in <racine>, the crates <tous>, its arguments <args>, under <env>.
function tester(racine, tous, args, env) {
  const p = passe(racine, env);
  const chemins = args.filter(a => !a.startsWith('-'));
  const options = args.filter(a => a.startsWith('-') && a !== '--force');
  let choix;
  let m = null;
  if (chemins.length) {
    const r = choisir(racine, tous, chemins);
    if (r.refus) {
      for (const l of r.refus) {
        process.stderr.write(`⛔ ${l}\n`);
      }
      return 2;
    }
    choix = r.choix;
  } else if (env[DEPUIS_LE_VERT]) {
    ({ choix, m } = depuisLeVert(racine, tous, args.includes('--force'), env));
    choix = choix.map(c => ({ c, cibles: [] }));
  } else {
    choix = tous.map(c => ({ c, cibles: [] }));
  }
  try {
    jouerLesTests(racine, p, choix, options);
  } finally {
    m?.retirer();
  }
  return p.code();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [nom, ...args] = process.argv.slice(2);
  try {
    process.exitCode = lancer(nom, args);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exitCode = 1;
  }
}
