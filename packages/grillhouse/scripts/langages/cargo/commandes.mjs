#!/usr/bin/env node
// The commands of the module cargo, the demand `commandes` of the join (scripts/jointure.d.ts):
// each one this script with its name first, `{ script, args }`, described, never run, by
// `commandes`; run by `grillhouse <commande>` in the root of the workspace, its arguments after.
//
//   npx grillhouse tests [--force] [<chemin>…] [--<option>…]   tester
//   npx grillhouse tests-du-paquet <chemin>… [--<option>…]      tests-du-paquet
//   npx grillhouse verifier [--tout | --gardes]                 verifier
//   node commandes.mjs typer                                    typer
//   npx grillhouse tests-de-nuit                                tests-de-nuit
//   npx grillhouse tailles-des-tests | executables-de-tests | clippy | frontieres | index-interfaces
//                                                               each guard, its own script
//
// - Each guard of structure of the module (./tailles-des-tests.mjs, ./executables-de-tests.mjs, ./clippy.mjs,
//   ./frontieres.mjs, ./index-interfaces.mjs) is a command by its name too, its own script, as the module typescript's: the line of a red
//   guard (`grillhouse <garde>`, scripts/gardes-du-cadre.mjs) names a command that exists.
// - `tester` plays the tests of the crates as tasks of Turborepo, the way of the module
//   typescript's (scripts/langages/typescript/tests.mjs): `turbo run test:unit --filter=<crate>…`
//   on the crates of the graph, each one a package with its own `package.json`
//   (scripts/paquet-npm.mjs), the task of a crate whose inputs did not move replayed from
//   Turborepo's cache; the frame selects nothing by the last green. A path, written from the root,
//   chooses the crate that holds it (only its task plays) and reaches the task, made absolute, in
//   the variable `GRILLHOUSE_TESTS` (`TESTS_CIBLES`, scripts/taches-du-graphe.mjs) beside the
//   options, which the `env` of the task names: it enters its hash, so a run by path of a crate
//   unchanged replays from the cache, and another path moves the hash. `--force` carries the moment
//   of the run in the variable instead (`rejouer`), which no cached run holds: the task plays for
//   real (`npm run test:forcer`). A path out of every crate, or in a crate without tests, or in a
//   crate that is no package of the graph, is refused, named, and nothing plays (code 2). The exit
//   code is Turborepo's.
// - `tests-du-paquet <chemin>…` is the body of that task, which the `test:unit` script of a crate
//   calls (`grillhouse tests-du-paquet <dossier du crate>`, written with the package): it never runs
//   Turborepo, so `tester` and the task do not loop. For a crate that plays tests
//   (./composants.mjs, `joueDesTests`): the build of its test targets, `cargo test --no-run -p
//   <crate>`, a task `build` of its own, as Turborepo's `test` depends on `build` (grillhouse-egm);
//   then `cargo nextest run -p <crate> --no-fail-fast`, which finds them built. Then `cargo test
//   --doc -p <crate>` for a crate whose library has doctests, which nextest does not play. Once
//   the tests and the benches played, the run removes the test executables its builds made, each
//   one cargo reports in JSON (`--message-format=json-render-diagnostics`, the `executable` of an
//   artifact of a test profile), as Swatinem/rust-cache keeps the dependencies and drops the
//   workspace's own artifacts: they weighed 3.4 of the 4.6 GiB of a copy of SyntHub
//   (grillhouse-pkl.8), and cargo builds again an executable it misses. The libraries, the
//   dependencies and the binaries of `cargo build` (`target/debug/<bin>`, a datum another package's
//   tests run) stay; only the crate's own task runs its test executables. A failed
//   build leaves the crate's other tasks not played (`code` null): a test that does not compile is
//   a red of the build, which the proof of the red reads as one (« construction de <crate> »,
//   scripts/circuit.mjs), and the tests play at the checks. The output of the build goes to its log,
//   `<target>/grillhouse/<crate>-build.log`, the task's `journal` from the root, then to the error
//   stream. The folder of a crate plays it whole; the source of a test target
//   (`<crate>/tests/<nom>.rs`) builds and plays that target alone (`--test <nom>`), without the
//   doctests; a module of a target `tests/<dossier>/main.rs` (`tests/it/foo.rs`, the crate's one
//   executable) builds that target and plays its tests alone, by the filterset of nextest
//   (`-E 'binary_id(<crate>::it) & test(/^foo::/)'`), as Cargo filters its own testsuite; the paths of the variable `GRILLHOUSE_TESTS` that lie in the crate replace the folder.
//   A path out of every crate, or in a crate without tests, is refused, named, and nothing plays
//   (code 2). `--force` changes nothing here: cargo keeps no result of a test to replay. Another
//   option goes to nextest.
// - A test target is named by its file, as `*_nuit_test.py` and `*.budget.test.*` (grillhouse-wbk):
//   `tests/<nom>_nuit.rs` (or `tests/<nom>_nuit/main.rs`, the target `<nom>_nuit`) is a night
//   test, `tests/<nom>_budget.rs` a time budget bench. A crate played whole leaves both out of
//   nextest, in `tester` as in `verifier`, which then plays its library (`--lib`), its binaries
//   (`--bins`) and each other test target (`--test <nom>`); its build still compiles them. The
//   night plays them (`tests-de-nuit`), as the module typescript's `*.budget.test.*`. A path that
//   names the file of a bench plays it, as Bazel builds a target tagged `manual` when named; a path
//   that names a night test is refused, named, and nothing plays (code 2): the night alone plays
//   it; a folder named leaves them out, as the day does.
// - A time budget bench plays alone, one test at a time (`--test-threads 1`), in a task `budget` of
//   its own after the other tests: in `tests-de-nuit` and in a path that names it. A red of the
//   task while the CPU pressure of the machine (`lirePression` of ./jointure) is at or above its
//   threshold at its start or at its end is « à repasser », 75, said in one line with the
//   pressure; at rest, a red.
// - `verifier` plays the tests of the crates as the tasks of Turborepo (`turbo run test:unit
//   --filter=<crate>…`, each crate a package of the graph, the cache of the tasks selecting those
//   that play again; `--tout` plays them for real, the moment of the pass in the variable
//   `GRILLHOUSE_TESTS`), then `cargo deny check`, the only run of cargo of the pass. It keeps no
//   green: the one pass of the verification keeps it (scripts/dernier-vert.mjs,
//   scripts/langages/typescript/verifier.mjs). Beside the module of package.json, whose pass plays
//   every task of the graph, the composed command sets `GRAPHE_JOUE` and `verifier` plays `cargo
//   deny check` alone (scripts/commandes-composees.mjs). It plays on a place of the machine and under its lock,
//   one heavy measure at a time (`avecLaMachineEtUnePlace` of ./jointure, as the module typescript's verifier): a
//   measure that holds it makes it wait, and the bound of the wait reached, it stops at 75 without
//   running cargo.
// - `verifier --gardes` plays the guards alone, the same verdict as the module typescript's: the
//   project's root scripts `grillhouse:gardes` (the frame's guards) then `gardes` (its own), each
//   one the package.json holds a task of the root, by npm, without its tests nor cargo deny, and
//   keeps no last green.
// - `tests-du-paquet`, `verifier` and `tests-de-nuit` play under a temporary directory of their pass, the module's guard of
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
// - `typer`: `cargo check --all-targets`.
// - Cargo runs with rustc wrapped by sccache, its cache common to the copies of the machine
//   (./sccache.mjs), in a copy as in an agent's envelope (grillhouse-cyr), its server started
//   under the machine's /tmp before each run of cargo that compiles (grillhouse-qmk).
//   `tests-du-paquet`, `verifier` and `typer` refuse, before any run of cargo, a PATH without sccache, in one line that names it
//   and `npx grillhouse maj`, which installs it (code 2).
// - Nextest reads the frame's profile `grillhouse` (./nextest.toml, a tool's configuration under
//   the project's own, `--tool-config-file`), whose JUnit report lands in nextest's store, at
//   `<workspace root>/target/nextest/grillhouse/junit.xml` (nextest's default `store.dir`, under
//   the workspace's root, even when the compilations' target directory lies elsewhere).
// - While the environment names a results directory (`GRILLHOUSE_RESULTATS`), the run writes
//   there what ./verdict.mjs reads: its tasks, each planned before it plays (`code` null until it
//   ran), and the JUnit report of each run of nextest. A task of the workspace is named after its
//   root, `//`, as Turborepo names the root's tasks.
// - `tests-du-paquet` and `verifier` refuse, before any run of cargo, a workspace whose
//   Cargo.lock git does not track (grillhouse-rph), in one line that names the file and the
//   gesture: `git add Cargo.lock`, or `cargo generate-lockfile` first when it is absent. Cargo
//   recommends committing it for every project, and the verification plays the exact versions of
//   the repository (`--locked`, as `npm ci` refuses a project without package-lock.json): a lock
//   ignored passes in the main repository, where it lies on disk, and fails in a copy taken from
//   git, the integration's.
// - The exit code: 0 when every task is green, 75 when the only reds are « à repasser », 1
//   otherwise; 2 for a path refused, a Cargo.lock not tracked or a command unknown.
// - `construire --echec <fichier> <plan>` is the launcher's build of the copy (scripts/enveloppe/lancer.sh),
//   the core's one for every language (`construireDepuisLesArguments` of
//   scripts/taches-du-graphe.mjs): the plan and its providers by `turbo run build --filter=<paquet>…`.
//   `construire <chemin>` builds one crate (`cargo build -p`), as the script `build` of its package.
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
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
  surUnePlace,
  avecLaMachineEtUnePlace,
  cheminsDeLaTache,
  construireDepuisLesArguments,
  ecrirePression,
  GRAPHE_JOUE,
  joueCeQuiNeSeDivisePas,
  lancerLesTaches,
  ligneDesRestes,
  lirePression,
  nomDuPaquet,
  ouvrirBase,
  retirerALInterruption,
  SCRIPT_DES_TESTS,
  SEUIL_PRESSION,
  testsCibles,
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
import { JUNIT, TACHES } from './verdict.mjs';

const ICI = fileURLToPath(import.meta.url);
const NEXTEST = path.join(path.dirname(ICI), 'nextest.toml');
const PROFIL = 'grillhouse';
export const NOMS = [
  'tester',
  'tests-du-paquet',
  'verifier',
  'typer',
  'construire',
  'tests-de-nuit',
];
// The task runner of the graph of the packages.
const OUTIL = 'turbo';
const A_REPASSER = 75;
const RACINE = '//';
// The task of the time budget benches of a crate.
const BUDGET = 'budget';
const VERROU = 'Cargo.lock';
// The commands that play the exact versions of the repository, refused without its Cargo.lock.
const VERROUILLEES = ['tests-du-paquet', 'verifier', 'tests-de-nuit'];
// The commands that compile, refused without sccache on the PATH (./sccache.mjs).
const COMPILENT = ['tests-du-paquet', 'verifier', 'typer', 'construire', 'tests-de-nuit'];
// The format of the build of the test targets: the messages of cargo in JSON on its output stream,
// its diagnostics rendered on its error stream, as without it (`executablesDeTest`).
const MESSAGES = '--message-format=json-render-diagnostics';
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
  { nom: 'executables-de-tests', args: [] },
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
    jouer(
      { t, args },
      {
        junit = null,
        journal = null,
        programme = 'cargo',
        temporaire = {},
        executables = null,
      } = {}
    ) {
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
          // With <executables>, cargo's messages in JSON come on its output stream, read, out of
          // the log (`executablesDeTest`).
          r = spawnSync(programme, args, {
            cwd: racine,
            env: { ...compilation, ...temporaire },
            stdio: ['inherit', executables ? 'pipe' : fd, fd],
            maxBuffer: 256 * 1024 * 1024,
          });
        } finally {
          closeSync(fd);
        }
        if (executables && r.stdout) {
          executables.push(...executablesDeTest(r.stdout.toString('utf8')));
        }
        process.stderr.write(readFileSync(journal, 'utf8'));
        t.journal = path.relative(racine, journal);
      } else {
        r = spawnSync(programme, args, {
          cwd: racine,
          env: { ...compilation, ...temporaire },
          stdio: 'inherit',
        });
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
    // Turns red the first green task of tests of <paquet>: what its tests left in its temporary
    // directory fails it.
    rougir(paquet) {
      const t = taches.find(x => x.paquet === paquet && x.tests && x.code === 0);
      if (t) {
        t.code = 1;
        ecrire();
      }
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

/**
 * The test executables cargo reports in its messages in JSON <sortie> (`--message-format`, one
 * message a line): the `executable` of each `compiler-artifact` built under a test profile
 * (`profile.test`), fresh or rebuilt; a line that is no message is passed over.
 * @param {string} sortie
 * @returns {string[]}
 */
export function executablesDeTest(sortie) {
  const vus = [];
  for (const ligne of sortie.split('\n')) {
    let m;
    try {
      m = JSON.parse(ligne);
    } catch {
      continue;
    }
    if (m?.reason === 'compiler-artifact' && m.profile?.test && typeof m.executable === 'string') {
      vus.push(m.executable);
    }
  }
  return vus;
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

/**
 * The arguments of nextest for the tranche <tranche> of a pass (`verifier --tranche i/n`): its own
 * split, `--partition hash:i/n` (each test by the hash of its name, so the n tranches together
 * play each test once), and `--no-tests=warn`, a crate whose part is empty being green; none
 * without a tranche.
 * @param {{ index: number, count: number } | null | undefined} tranche
 * @returns {string[]}
 */
export const partitionDeNextest = tranche =>
  tranche ? ['--partition', `hash:${tranche.index}/${tranche.count}`, '--no-tests=warn'] : [];

// Plans and plays the tests of the crates <choix> in the run <p>, each `{ c, cibles }`: `cibles`
// the test targets named, empty for the whole crate of the day (its night tests and its benches
// left out). For a crate that plays tests:
// the build of its test targets first, then nextest, then its doctests; a failed build leaves the
// crate's other tasks not played. The benches named, each crate's in a task `budget`, are
// planned with the rest and played by the function this one returns, after the other tests.
// In a tranche <tranche>, nextest plays its part (`partitionDeNextest`); the doctests and the
// benches, which nextest does not split, play in the first tranche alone.
function jouerLesTests(racine, p, choix, options, temporaire = () => ({}), tranche = null) {
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
  nextest.push(...j, ...partitionDeNextest(tranche));
  const indivisible = joueCeQuiNeSeDivisePas(tranche);
  const parCrate = [];
  const bancs = [];
  // The test executables the builds of the run report, removed once its tests played.
  const executables = [];
  for (const { c, cibles: nommees, jour, modules = new Map() } of choix) {
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
        MESSAGES,
        ...j,
        '-p',
        nom,
        ...(avecLeJour ? [] : cibles.flatMap(n => ['--test', n])),
      ];
      prevues.push([p.prevoir(nom, d, 'build', false, construction), { journal, executables }]);
      if (cibles.length === 0 || autres.length || avecLeJour) {
        const duC = duJour(c);
        const nommes = autres.flatMap(n => ['--test', n]);
        const selection = !cibles.length
          ? duC
          : avecLeJour
            ? duC.length
              ? [...duC, ...nommes]
              : []
            : [...nommes, ...filtreDesModules(nom, autres, modules)];
        const args = [...nextest, '-p', nom, ...selection, ...options];
        prevues.push([
          p.prevoir(nom, d, 'nextest', true, args),
          { junit, temporaire: temporaire(nom) },
        ]);
      }
      if (desBancs.length && indivisible) {
        const args = [
          ...nextestDuBanc,
          '-p',
          nom,
          ...desBancs.flatMap(n => ['--test', n]),
          ...filtreDesModules(nom, desBancs, modules),
        ];
        bancs.push({
          nom,
          d,
          temporaire: temporaire(nom),
          args: [...args, '--test-threads', '1', ...options],
          etat,
        });
      }
    }
    const doctests = c.cibles.some(t => t.kind.includes('lib') && t.doctest !== false);
    if ((cibles.length === 0 || avecLeJour) && doctests && indivisible) {
      const args = ['test', '--doc', ...j, '-p', nom];
      prevues.push([p.prevoir(nom, d, 'doctest', true, args), { temporaire: temporaire(nom) }]);
    }
    parCrate.push([prevues, etat]);
  }
  const prevusBancs = bancs.map(b => [
    p.prevoir(b.nom, b.d, BUDGET, true, b.args),
    b.etat,
    b.temporaire,
  ]);
  for (const [prevues, etat] of parCrate) {
    for (const [t, o] of prevues) {
      if (p.jouer(t, o) !== 0 && t.t.script === 'build') {
        etat.construit = false;
        break;
      }
    }
  }
  return () => {
    for (const [t, etat, temporaire] of prevusBancs) {
      if (etat.construit) {
        p.jouer(t, { junit, temporaire });
      }
    }
    // The copy keeps no test executable between two passes: cargo builds again the one it misses.
    for (const f of executables) {
      rmSync(f, { force: true });
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

// The refusal of a night test named in a targeted run: the night alone plays it.
const REFUS_DE_NUIT = 'un test de nuit se joue la nuit seulement (npx grillhouse nuit le joue)';

// The target `tests/<dossier>/main.rs` of the crate <crate> whose module is the file <abs> (out
// of `tests/common/` and of the target's root), and the module's path in the executable
// (`tests/it/foo.rs` and `tests/it/foo/mod.rs` → `foo`, `tests/it/foo/sous.rs` → `foo::sous`):
// `{ cible, module }`, null for any other file.
function moduleDeCible(crate, abs) {
  const parts = path.relative(crate.composant.dossier, abs).split(path.sep);
  if (parts.length < 3 || parts[0] !== 'tests' || parts[1] === 'common' || !abs.endsWith('.rs')) {
    return null;
  }
  const racine = path.join(crate.composant.dossier, 'tests', parts[1], 'main.rs');
  const cible = crate.cibles.find(t => t.kind.includes('test') && t.src === racine);
  const module = parts.slice(2);
  module[module.length - 1] = module[module.length - 1].replace(/\.rs$/, '');
  if (module.at(-1) === 'mod') {
    module.pop();
  }
  return cible && module.length ? { cible, module: module.join('::') } : null;
}

// The filterset of nextest that plays, of the targets <noms> of the crate <nom>, the modules
// <modules> holds (`Map` target → its modules, or null for the whole target), as Cargo's own
// testsuite filters one executable by module path: `binary_id(<crate>::<cible>) &
// test(/^<module>::/)`; none when every target plays whole.
function filtreDesModules(nom, noms, modules) {
  if (noms.every(n => (modules.get(n) ?? null) === null)) {
    return [];
  }
  const echapper = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const parCible = noms.map(n => {
    const binaire = `binary_id(${nom}::${n})`;
    const deN = modules.get(n) ?? null;
    if (deN === null) {
      return binaire;
    }
    const tests = deN.map(m => `test(/^${echapper(m)}::/)`).join(' | ');
    return `(${binaire} & (${tests}))`;
  });
  return ['-E', parCible.join(' | ')];
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
    // The folder of a crate without tests plays whole (its doctests, as the task of its package
    // does); any other path in it names a test that does not exist.
    if (!joueDesTests(racine, c) && abs !== c.dossier) {
      refus.push(`${chemin} : ${c.nom} n'a aucun test, ni dossier tests/, ni tests.rs sous src/`);
      continue;
    }
    const propre = crate.cibles.find(t => t.kind.includes('test') && t.src === abs);
    const duModule = propre ? null : moduleDeCible(crate, abs);
    const cible = propre ?? duModule?.cible;
    // A night test plays at night alone (`tests-de-nuit`): a targeted run refuses it, named.
    if (cible && horsDuJour(cible) === 'nuit') {
      refus.push(`${chemin} : ${REFUS_DE_NUIT}`);
      continue;
    }
    const deja = parDossier.get(c.dossier);
    // A file with no target of its own (a unit test of `src/`) asks for the day of its crate; a
    // target named stays named, whatever the order of the paths; a module of a target
    // `tests/<dossier>/main.rs` names its target, its tests alone (`modules`), unless the target
    // is named whole.
    const entree = deja ?? { c: crate, cibles: [], jour: false, modules: new Map() };
    parDossier.set(c.dossier, entree);
    if (!cible) {
      entree.jour = true;
      continue;
    }
    if (!entree.cibles.includes(cible.name)) {
      entree.cibles.push(cible.name);
    }
    const avant = entree.modules.get(cible.name);
    if (!duModule || avant === null) {
      entree.modules.set(cible.name, null);
    } else {
      entree.modules.set(cible.name, [...(avant ?? []), duModule.module]);
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

// The packages of the graph of the crates <crates>: `{ noms, absents }`, the names of those that are
// packages of the graph, and the names of the crates that are not.
function nomsDuGraphe(racine, crates) {
  const noms = new Set();
  const absents = [];
  for (const c of crates) {
    const nom = nomDuPaquet(racine, c.composant.dossier);
    if (nom === null) {
      absents.push(c.composant.nom);
    } else {
      noms.add(nom);
    }
  }
  return { noms, absents };
}

// Says, on the error stream, each crate of <absents> that is no package of the graph: its tests do
// not play, as a package without a `package.json` is out of Turborepo's tasks.
function direLesAbsents(absents) {
  for (const nom of absents) {
    process.stderr.write(
      `⚠️  ${nom} : pas un paquet du graphe (package.json absent) ; ses tests ne se jouent pas : npx grillhouse maj\n`
    );
  }
}

// The pass of `verifier` in <racine>, under the lock of the machine (<env> carries its mark): the
// tests of the crates as tasks of Turborepo (every one played for real with <args> `--tout`), then
// cargo deny. It keeps no green.
function verifier(racine, args, env) {
  const p = passe(racine, env);
  if (args.includes('--gardes')) {
    return gardes(racine, p);
  }
  // Beside the module of package.json (composed command), its pass has played the tasks.
  const { noms, absents } = env[GRAPHE_JOUE]
    ? { noms: new Set(), absents: [] }
    : nomsDuGraphe(racine, crates(racine));
  direLesAbsents(absents);
  const code = noms.size
    ? lancerLesTaches({
        outil: OUTIL,
        racine,
        taches: [SCRIPT_DES_TESTS],
        noms,
        tests: testsCibles({ arguments: [], force: args.includes('--tout') }),
        env,
      })
    : 0;
  p.jouer(p.prevoir(RACINE, racine, 'deny', false, ['deny', 'check']));
  return code === 0 ? p.code() : 1;
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
//
// <jouer>(env, parPaquet) also receives `parPaquet`: `{ temporaire(nom), restes(nom) }`, the
// sub-directory of the base one package's tests play under (made at the first call, named in
// TMPDIR, TMP and TEMP) and what is left in it, so a leftover has the package that left it. The
// base's own line names what lies beside those sub-directories.
function sousLaBase(genre, env, jouer) {
  const base = ouvrirBase(genre, { dans: env.TMPDIR || tmpdir() });
  const lacher = retirerALInterruption(base.fermer);
  const dossiers = new Map();
  const parPaquet = {
    temporaire(nom) {
      if (!dossiers.has(nom)) {
        const d = path.join(base.dossier, nom);
        mkdirSync(d, { recursive: true });
        dossiers.set(nom, d);
      }
      const d = dossiers.get(nom);
      return { TMPDIR: d, TMP: d, TEMP: d };
    },
    restes(nom) {
      try {
        return readdirSync(dossiers.get(nom)).sort();
      } catch {
        return [];
      }
    },
  };
  try {
    const code = jouer({ ...env, ...base.env }, parPaquet);
    const ligne = ligneDesRestes(
      base.restes().filter(n => n !== CACHE_DE_NODE && !dossiers.has(n))
    );
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
  // the copy for a session, the plan and its providers, as every language's.
  if (nom === 'construire' && args.includes('--echec')) {
    return construireDepuisLesArguments(OUTIL, args, racine);
  }
  if (nom === 'construire' || (nom === 'typer' && args.length)) {
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
    (VERROUILLEES.includes(nom)
      ? verrouNonVersionne(racine, env[COPIE_DE_L_ARBRE] || racine)
      : null) ?? (COMPILENT.includes(nom) ? sccacheAbsent(racine, env) : null);
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
  if (nom === 'verifier') {
    const dire = l => process.stdout.write(`${l}\n`);
    try {
      return sousLaBase('verification', env, envBase =>
        avecLaMachineEtUnePlace(envMachine => verifier(racine, args, envMachine), {
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
    return surUnePlace(e => tester(racine, tous, args, e), { env });
  }
  if (nom === 'tests-du-paquet') {
    return sousLaBase('tests', env, (envBase, pp) =>
      testsDuPaquet(racine, tous, args, envBase, pp)
    );
  }
  if (nom === 'tests-de-nuit') {
    return sousLaBase('tests', env, (envBase, pp) => testsDeNuit(racine, tous, envBase, pp));
  }
  process.stderr.write(`⛔ commande inconnue du module cargo : ${nom} (${NOMS.join(', ')})\n`);
  return 2;
}

// The pass of `tester` in <racine>, the crates <tous>, its arguments <args>, under <env>: the tasks
// `test:unit` of the crates the paths choose (every crate without a path) as Turborepo's, the
// exit code its.
function tester(racine, tous, args, env) {
  const chemins = args.filter(a => !a.startsWith('-'));
  const options = args.filter(a => a.startsWith('-') && a !== '--force');
  let choisis = tous;
  if (chemins.length) {
    const r = choisir(racine, tous, chemins);
    if (r.refus) {
      for (const l of r.refus) {
        process.stderr.write(`⛔ ${l}\n`);
      }
      return 2;
    }
    choisis = r.choix.map(x => x.c);
  }
  const { noms, absents } = nomsDuGraphe(racine, choisis);
  if (chemins.length && absents.length) {
    process.stderr.write(
      `⛔ ${absents.join(', ')} : pas un paquet du graphe (package.json absent) : npx grillhouse maj\n`
    );
    return 2;
  }
  direLesAbsents(absents);
  if (noms.size === 0) {
    return 0;
  }
  return lancerLesTaches({
    outil: OUTIL,
    racine,
    taches: [SCRIPT_DES_TESTS],
    noms,
    tests: testsCibles({
      arguments: [...chemins.map(c => path.resolve(racine, c)), ...options],
      force: args.includes('--force'),
    }),
    env,
  });
}

// The pass of `tests-du-paquet` in <racine>, the crates <tous>, its arguments <args>, under <env>:
// the body of the task `test:unit` of a crate. The paths its script names, completed by those of
// the variable of the task that lie in the same crate.
function testsDuPaquet(racine, tous, args, env, parPaquet) {
  const donnes = args.filter(a => !a.startsWith('-'));
  if (donnes.length === 0) {
    process.stderr.write(
      '⛔ tests-du-paquet : aucun chemin (un dossier de crate, ou un fichier de test).\n'
    );
    return 2;
  }
  const dossierDe = abs =>
    composantDans(
      tous.map(x => x.composant),
      racine,
      abs
    )?.dossier ?? null;
  const { chemins, options, tranche } = cheminsDeLaTache({ racine, donnes, env, dossierDe });
  const r = choisir(racine, tous, chemins);
  if (r.refus) {
    for (const l of r.refus) {
      process.stderr.write(`⛔ ${l}\n`);
    }
    return 2;
  }
  const p = passe(racine, env);
  jouerLesTests(
    racine,
    p,
    r.choix,
    [...args.filter(a => a.startsWith('-')), ...options],
    parPaquet.temporaire,
    tranche
  )();
  restesParPaquet(p, r.choix, parPaquet);
  return p.code();
}

// The line of the guard of each crate of <choix> whose tests left something in its temporary
// directory, naming it, and its task of tests turned red in the run <p>.
function restesParPaquet(p, choix, parPaquet) {
  for (const { c } of choix) {
    const nom = c.composant.nom;
    const ligne = ligneDesRestes(parPaquet.restes(nom), nom);
    if (ligne) {
      process.stderr.write(`${ligne}\n`);
      p.rougir(nom);
    }
  }
}

// The pass of `tests-de-nuit` in <racine>, the crates <tous>, under <env>: the night tests and the
// benches of each crate that holds some, each named.
function testsDeNuit(racine, tous, env, parPaquet) {
  const p = passe(racine, env);
  const choix = tous
    .filter(c => joueDesTests(racine, c.composant))
    .map(c => ({ c, cibles: c.cibles.filter(horsDuJour).map(t => t.name) }))
    .filter(x => x.cibles.length);
  if (choix.length) {
    jouerLesTests(racine, p, choix, [], parPaquet.temporaire)();
    restesParPaquet(p, choix, parPaquet);
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
