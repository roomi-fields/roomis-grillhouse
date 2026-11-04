#!/usr/bin/env node
// The commands of the module cargo, the demand `commandes` of the join (scripts/jointure.d.ts):
// each one this script with its name first, `{ script, args }`, described, never run, by
// `commandes`; run by `grillhouse <commande>` in the root of the workspace, its arguments after.
//
//   npx grillhouse tests [--force] [<chemin>…] [--<option>…]   tester
//   npx grillhouse verifier [--tout | --gardes]                 verifier
//   node commandes.mjs typer                                    typer
//   npx grillhouse preparer                                     preparer
//   npx grillhouse tests-de-nuit                                tests-de-nuit
//   npx grillhouse tailles-des-tests | clippy | frontieres | index-interfaces
//                                                               each guard, its own script
//
// - Each guard of structure of the module (./tailles-des-tests.mjs, ./clippy.mjs,
//   ./frontieres.mjs, ./index-interfaces.mjs) is a command by its name too, its own script, as the module typescript's: the line of a red
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
// - A test target is named by its file, as `*_nuit_test.py` and `*.budget.test.*` (grillhouse-wbk):
//   `tests/<nom>_nuit.rs` (or `tests/<nom>_nuit/main.rs`, the target `<nom>_nuit`) is a night
//   test, `tests/<nom>_budget.rs` a time budget bench. A crate played whole leaves both out of
//   nextest, in `tester` as in `verifier`, which then plays its library (`--lib`), its binaries
//   (`--bins`) and each other test target (`--test <nom>`); its build still compiles them. The
//   night plays them (`tests-de-nuit`), as the module typescript's `*.budget.test.*`. A path that
//   names the file of one plays it, as Bazel builds a target tagged `manual` when named; a folder
//   named leaves them out, as the day does.
// - A time budget bench plays alone, one test at a time (`--test-threads 1`), in a task `budget` of
//   its own after the other tests: in `tests-de-nuit` and in a path that names it. A red of the
//   task while the CPU pressure of the machine (`lirePression` of ./jointure) is at or above its
//   threshold at its start or at its end is « à repasser », 75, said in one line with the
//   pressure; at rest, a red.
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
// - `tester`, `verifier` and `tests-de-nuit` play under a temporary directory of their pass, the module's guard of
//   the temporary directory, as the CI of osc-bridge (OB-ud1.3): a base (`ouvrirBase` of
//   ./jointure, genre `tests` or `verification`) in the temporary directory of the environment,
//   named in TMPDIR, TMP and TEMP to cargo, which nextest and the doctests inherit; removed at the
//   end of the pass, green, red or interrupted (SIGINT, SIGTERM, SIGHUP). What the tests left there
//   fails the pass (code 1), each name written on the error stream. A test makes its temporary
//   directory or file with the crate `tempfile` (`TempDir`, `NamedTempFile`), removed when dropped,
//   a failed test included, never a path built by hand under `std::env::temp_dir()`.
// - `tests-de-nuit`: the night tests then the benches of each crate that holds some; none, nothing
//   plays and the code is 0. The night (scripts/nuit.sh) runs it after the full pass, and plays it
//   again at rest after a 75.
// - `typer`: `cargo check --all-targets`. `preparer`: `cargo fetch --locked`.
// - Cargo runs with rustc wrapped by sccache, its cache common to the copies of the machine
//   (./sccache.mjs), in a copy as in an agent's envelope (grillhouse-cyr), its server started
//   under the machine's /tmp before each run of cargo that compiles (grillhouse-qmk). `tester`, `verifier`
//   and `typer` refuse, before any run of cargo, a PATH without sccache, in one line that names it
//   and `npx grillhouse maj`, which installs it (code 2).
// - Nextest reads the frame's profile `grillhouse` (./nextest.toml, a tool's configuration under
//   the project's own, `--tool-config-file`), whose JUnit report lands in nextest's store, at
//   `<workspace root>/target/nextest/grillhouse/junit.xml` (nextest's default `store.dir`, under
//   the workspace's root, even when the compilations' target directory lies elsewhere).
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
  ecrirePression,
  garderLeVert,
  ligneDesRestes,
  lirePression,
  mesure,
  ouvrirBase,
  retirerALInterruption,
  SEUIL_PRESSION,
  travailleursDeLaSeance,
} from '../../services-du-noyau.mjs';
import {
  BANC,
  COPIE_DE_L_ARBRE,
  composantDans,
  crates,
  DE_NUIT,
  joueDesTests,
  metadonnees,
} from './composants.mjs';
import { avecSccache, demarrerLeServeur, sccacheAbsent } from './sccache.mjs';
import { touchesDesFichiers } from './touches.mjs';
import { JUNIT, TACHES } from './verdict.mjs';

const ICI = fileURLToPath(import.meta.url);
const NEXTEST = path.join(path.dirname(ICI), 'nextest.toml');
const PROFIL = 'grillhouse';
export const NOMS = ['tester', 'verifier', 'typer', 'construire', 'preparer', 'tests-de-nuit'];
const A_REPASSER = 75;
const RACINE = '//';
// The task of the time budget benches of a crate.
const BUDGET = 'budget';
const VERROU = 'Cargo.lock';
// The commands that play the exact versions of the repository, refused without its Cargo.lock.
const VERROUILLEES = ['tester', 'verifier', 'preparer', 'tests-de-nuit'];
// The commands that compile, refused without sccache on the PATH (./sccache.mjs).
const COMPILENT = ['tester', 'verifier', 'typer', 'construire', 'tests-de-nuit'];
// The kinds of a target that are no library.
const PAS_UNE_BIBLIOTHEQUE = ['test', 'bin', 'example', 'bench', 'custom-build'];

/**
 * Whether the target <t> of a crate is a test target out of the day: `nuit`, `banc`, or null.
 * @param {{ kind: string[], name: string }} t
 */
export function horsDuJour(t) {
  if (!t.kind.includes('test')) {
    return null;
  }
  if (t.name.endsWith(DE_NUIT)) {
    return 'nuit';
  }
  return t.name.endsWith(BANC) ? 'banc' : null;
}

/**
 * Whether the test file <chemin> (from the root <racine>) is a test target out of the day, a night
 * test or a time budget bench (`horsDuJour`); false for any other file, a unit test of `src/`
 * included.
 * @param {string} chemin
 * @param {string} racine
 */
export function fichierHorsDuJour(chemin, racine) {
  const abs = path.resolve(racine, chemin);
  const c = crates(racine).find(x => x.cibles.some(t => t.src === abs));
  return Boolean(c?.cibles.some(t => t.src === abs && horsDuJour(t) !== null));
}
// The subcommands of cargo that compile, before which the server of sccache starts.
const COMPILATIONS = ['test', 'nextest', 'check', 'build'];

/** The guards of structure of the module, in the order they play: each its name, its script beside
 * this one, and its arguments as a guard. */
export const GARDES = [
  { nom: 'tailles-des-tests', args: [] },
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
  // The CPU pressure of the machine, the file <env> names or the kernel's.
  const pression = () => lirePression(env.GRILLHOUSE_PRESSION_CPU || undefined);
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
      // The server of sccache, started under a short temporary directory (./sccache.mjs).
      if (COMPILATIONS.includes(args[0])) {
        demarrerLeServeur(racine, env);
      }
      const banc = t.script === BUDGET;
      const avant = banc ? pression() : null;
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
        const suffixe = t.script === 'nextest' ? '' : `-${t.script}`;
        copyFileSync(junit, path.join(dossier, JUNIT, `${id}-${t.paquet}${suffixe}.xml`));
      }
      if (banc && t.code !== 0) {
        sousCharge(t, [avant, pression()]);
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

// A red of the time budget benches of the task <t>, the pressures <pressions> measured at its start
// and at its end: « à repasser » (75) when one is at or above the threshold, said; else its code
// stands, a pressure that does not read said.
function sousCharge(t, pressions) {
  const lues = pressions.filter(p => p !== null);
  if (lues.length === 0) {
    process.stderr.write(`⏱ banc de temps de ${t.paquet} rouge, pression CPU illisible : rouge.\n`);
    return;
  }
  const haute = Math.max(...lues);
  if (haute < SEUIL_PRESSION) {
    return;
  }
  process.stderr.write(
    `⏱ banc de temps de ${t.paquet} rouge sous charge (pression CPU ${ecrirePression(haute)}, seuil ${SEUIL_PRESSION} %) : à repasser (${A_REPASSER}).\n`
  );
  t.code = A_REPASSER;
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

// Plans and plays the tests of the crates <choix> in the run <p>, each `{ c, cibles }`: `cibles`
// the test targets named, empty for the whole crate of the day (its night tests and its benches
// left out). For a crate that plays tests:
// the build of its test targets first, then nextest, then its doctests; a failed build leaves the
// crate's other tasks not played. The benches named, each crate's in a task `budget`, are
// planned with the rest and played by the function this one returns, after the other tests.
function jouerLesTests(racine, p, choix, options) {
  const m = metadonnees(racine);
  // Nextest's store is `target/nextest` under the workspace's root (its default `store.dir`),
  // whatever the target directory of the compilations (./sccache.mjs).
  const junit = path.join(m.workspace_root, 'target', 'nextest', PROFIL, 'junit.xml');
  const nextest = ['nextest', 'run', '--tool-config-file', `${PROFIL}:${NEXTEST}`];
  nextest.push('--profile', PROFIL, '--no-fail-fast');
  // The workers of a session of an agent (GRILLHOUSE_TRAVAILLEURS): `-j` of cargo and of nextest;
  // a heavy pass, without it, keeps every core.
  const travailleurs = travailleursDeLaSeance(process.env);
  const j = travailleurs === null ? [] : ['-j', String(travailleurs)];
  // A bench plays on one thread (`--test-threads 1`, which `-j` of nextest is the alias of): it
  // takes the arguments without `-j`.
  const nextestDuBanc = [...nextest];
  nextest.push(...j);
  const parCrate = [];
  const bancs = [];
  for (const { c, cibles: nommees, jour } of choix) {
    // Targets named beside the day of the crate (`jour`, a unit test of `src/` named): the day
    // builds whole, and plays besides the targets named.
    const cibles = jour && nommees.length === 0 ? [] : nommees;
    const avecLeJour = Boolean(jour) && nommees.length > 0;
    Object.assign(p.cibles, binaires(c));
    const d = c.composant.dossier;
    const nom = c.composant.nom;
    const prevues = [];
    const etat = { construit: true };
    if (joueDesTests(racine, c.composant)) {
      const tests = c.cibles.filter(t => t.kind.includes('test'));
      const deBanc = n => tests.some(t => t.name === n && horsDuJour(t) === 'banc');
      const desBancs = cibles.filter(deBanc);
      const autres = cibles.filter(n => !deBanc(n));
      const journal = path.join(m.target_directory, 'grillhouse', `${nom}-build.log`);
      const construction = [
        'test',
        '--no-run',
        ...j,
        '-p',
        nom,
        ...(avecLeJour ? [] : cibles.flatMap(n => ['--test', n])),
      ];
      prevues.push([p.prevoir(nom, d, 'build', false, construction), { journal }]);
      if (cibles.length === 0 || autres.length || avecLeJour) {
        const duC = duJour(c);
        const nommes = autres.flatMap(n => ['--test', n]);
        const selection = !cibles.length ? duC : avecLeJour ? (duC.length ? [...duC, ...nommes] : []) : nommes;
        const args = [...nextest, '-p', nom, ...selection, ...options];
        prevues.push([p.prevoir(nom, d, 'nextest', true, args), { junit }]);
      }
      if (desBancs.length) {
        const args = [...nextestDuBanc, '-p', nom, ...desBancs.flatMap(n => ['--test', n])];
        bancs.push({ nom, d, args: [...args, '--test-threads', '1', ...options], etat });
      }
    }
    const doctests = c.cibles.some(t => t.kind.includes('lib') && t.doctest !== false);
    if ((cibles.length === 0 || avecLeJour) && doctests) {
      const args = ['test', '--doc', ...j, '-p', nom];
      prevues.push([p.prevoir(nom, d, 'doctest', true, args), {}]);
    }
    parCrate.push([prevues, etat]);
  }
  const prevusBancs = bancs.map(b => [p.prevoir(b.nom, b.d, BUDGET, true, b.args), b.etat]);
  for (const [prevues, etat] of parCrate) {
    for (const [t, o] of prevues) {
      if (p.jouer(t, o) !== 0 && t.t.script === 'build') {
        etat.construit = false;
        break;
      }
    }
  }
  return () => {
    for (const [t, etat] of prevusBancs) {
      if (etat.construit) {
        p.jouer(t, { junit });
      }
    }
  };
}

// The selection of nextest of the crate <c> played whole in the day: none when it has no night
// test nor bench; else its library, its binaries and each other test target, named.
function duJour(c) {
  const tests = c.cibles.filter(t => t.kind.includes('test'));
  if (!tests.some(horsDuJour)) {
    return [];
  }
  const lib = c.cibles.some(t => !t.kind.some(k => PAS_UNE_BIBLIOTHEQUE.includes(k)));
  const bins = c.cibles.some(t => t.kind.includes('bin'));
  return [
    ...(lib ? ['--lib'] : []),
    ...(bins ? ['--bins'] : []),
    ...tests.filter(t => !horsDuJour(t)).flatMap(t => ['--test', t.name]),
  ];
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
    // A file with no target of its own (a unit test of `src/`) asks for the day of its crate; a
    // target named stays named, whatever the order of the paths.
    const entree = deja ?? { c: crate, cibles: [], jour: false };
    parDossier.set(c.dossier, entree);
    if (!cible) {
      entree.jour = true;
    } else {
      entree.cibles.push(cible.name);
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
    )();
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
 * gesture named; null when git tracks it. <copie> is the root git reads (a tree of HEAD's version
 * has no `.git`: its copy's, where the same file is tracked).
 * @param {string} racine
 * @param {string} [copie]
 * @returns {string | null}
 */
export function verrouNonVersionne(racine, copie = racine) {
  if (!existsSync(path.join(racine, VERROU))) {
    return `⛔ ${VERROU} absent : cargo generate-lockfile, puis git add ${VERROU}`;
  }
  const r = spawnSync('git', ['ls-files', '--error-unmatch', '--', VERROU], {
    cwd: copie,
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
  // `construire` and `typer` with a path: the one crate of that folder (`cargo build -p`,
  // `cargo check -p`), as Turborepo's task of one package; `typer` alone checks the workspace.
  let crate = null;
  // The launcher's `construire` (`--echec <fichier> <plan>`, scripts/enveloppe/lancer.sh) builds
  // the copy for a session: a crate has no such build, and plays nothing.
  if (nom === 'construire' && args.includes('--echec')) {
    return 0;
  }
  if (nom === 'construire' ||(nom === 'typer' && args.length)) {
    const [chemin, ...autres] = args;
    const abs = chemin === undefined ? null : path.resolve(racine, chemin);
    crate = abs === null ? undefined : crates(racine).find(x => x.composant.dossier === abs);
    if (!crate || autres.length) {
      process.stderr.write(
        `⛔ ${nom} : ${chemin ?? 'aucun chemin'} ne désigne pas un crate (un dossier de crate, une fois).\n`
      );
      return 2;
    }
  }
  const refus =
    (VERROUILLEES.includes(nom) ? verrouNonVersionne(racine, env[COPIE_DE_L_ARBRE] || racine) : null) ??
    (COMPILENT.includes(nom) ? sccacheAbsent(racine, env) : null);
  if (refus) {
    process.stderr.write(`${refus}\n`);
    return 2;
  }
  const p = passe(racine, env);
  if (crate) {
    const sous = nom === 'construire' ? 'build' : 'check';
    const nomDuCrate = crate.composant.nom;
    p.jouer(p.prevoir(nomDuCrate, crate.composant.dossier, sous, false, [sous, '-p', nomDuCrate]));
    return p.code();
  }
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
  if (nom === 'tests-de-nuit') {
    return sousLaBase('tests', env, envBase => testsDeNuit(racine, tous, envBase));
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
    jouerLesTests(racine, p, choix, options)();
  } finally {
    m?.retirer();
  }
  return p.code();
}

// The pass of `tests-de-nuit` in <racine>, the crates <tous>, under <env>: the night tests and the
// benches of each crate that holds some, each named.
function testsDeNuit(racine, tous, env) {
  const p = passe(racine, env);
  const choix = tous
    .filter(c => joueDesTests(racine, c.composant))
    .map(c => ({ c, cibles: c.cibles.filter(horsDuJour).map(t => t.name) }))
    .filter(x => x.cibles.length);
  if (choix.length) {
    jouerLesTests(racine, p, choix, [])();
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
