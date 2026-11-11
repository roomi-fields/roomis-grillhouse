#!/usr/bin/env node
// The commands of the module python, the demand `commandes` of the join (scripts/jointure.d.ts):
// each one this script with its name first, `{ script, args }`, described, never run, by
// `commandes`; run by `grillhouse <commande>` in the root of the project, its arguments after.
//
//   npx grillhouse tests [--force] [<chemin>…] [--<option>…]   tester
//   npx grillhouse tests-du-paquet <chemin>… [--<option>…]      tests-du-paquet
//   npx grillhouse verifier [--tout | --gardes]                 verifier
//   node commandes.mjs typer                                    typer
//   npx grillhouse tests-de-nuit                                tests-de-nuit
//   npx grillhouse tailles-des-tests | index-interfaces         each guard, its own script
//
// - Each command plays in the folder of each package (./composants.mjs), one after the other, by
//   uv, which reads its pyproject.toml, its uv.lock (`--locked`: a lock out of date is refused, as
//   `npm ci`), and the Python its `requires-python` and its `.python-version` ask.
// - `tester` plays the tests of the packages as tasks of Turborepo, the way of the module
//   typescript's (scripts/langages/typescript/tests.mjs): `turbo run test:unit --filter=<projet>…`
//   on the projects of the graph, each one a package with its own `package.json`
//   (scripts/paquet-npm.mjs), the task of a project whose inputs did not move replayed from
//   Turborepo's cache; the frame selects nothing by the last green. A path, written from the root,
//   chooses the project that holds it (only its task plays) and reaches the task, made absolute, in
//   the variable `GRILLHOUSE_TESTS` (`TESTS_CIBLES`, scripts/taches-du-graphe.mjs) beside the
//   options, which the `env` of the task names: it enters its hash, so a run by path of a project
//   unchanged replays from the cache, and another path moves the hash. `--force` carries the moment
//   of the run in the variable instead (`rejouer`), which no cached run holds: the task plays for
//   real (`npm run test:forcer`). A path out of every project, or in a project that is no package
//   of the graph, is refused, named, and nothing plays (code 2). The exit code is Turborepo's.
// - `tests-du-paquet <chemin>…` is the body of that task, which the `test:unit` script of a project
//   calls (`grillhouse tests-du-paquet <dossier du projet>`, written with the package): it never
//   runs Turborepo, so `tester` and the task do not loop. It plays pytest in the project:
//   `uv run --locked --group test pytest`, the group `test` holding pytest and what the tests
//   depend on, its JUnit report in the family `xunit1` (./verdict.mjs). A path, written from the
//   root, chooses the project that holds it, and pytest plays that path alone; the paths of the
//   variable `GRILLHOUSE_TESTS` that lie in the project replace the folder the script names. A path
//   out of every project is refused, named, and nothing plays (code 2). The night tests
//   (`*_nuit_test.py`, the one class out of the day: Python has no time budget bench) are left out
//   of every folder, played whole or named (`--ignore-glob`), and a night test named is refused,
//   named, and nothing plays (code 2), as the module cargo's: the night alone plays it. `--force` changes nothing here:
//   pytest keeps no result to replay. Another option goes to pytest. A project played whole (its
//   own folder named) whose pytest collects no test (code 5) is green, as `cargo test` on a crate
//   without a test and the skeleton typescript's `passWithNoTests`; a path within the project that
//   collects no test stays red, as a run whose paths name no test fails in every language.
// - `verifier` plays the typing and the tests of the projects as the tasks of Turborepo (`turbo run
//   typecheck test:unit --filter=<projet>…`, the cache of the tasks selecting those that play
//   again; `--tout` plays the tests for real, the moment of the pass in the variable
//   `GRILLHOUSE_TESTS`). It keeps no green: the one pass of the verification keeps it
//   (scripts/dernier-vert.mjs, scripts/langages/typescript/verifier.mjs). Beside the module of
//   package.json, whose pass plays every task of the graph, the composed command sets
//   `GRAPHE_JOUE` and `verifier` plays nothing again. It plays on a place of
//   the machine and under its lock (`avecLaMachineEtUnePlace` of ./jointure), as the module cargo's. `verifier --gardes` plays
//   the guards alone: the project's root scripts `grillhouse:gardes` then `gardes` the package.json
//   holds.
// - `typer`: `uv run --locked python -m compileall`, the folders whose name begins with a dot (the
//   `.venv`) left out.
// - `tests-de-nuit`: pytest on the night tests of each package that holds some; none, nothing
//   plays and the code is 0. The night (scripts/nuit.sh) runs it.
// - `construire --echec <fichier> <plan>` is the launcher's build of the copy
//   (scripts/enveloppe/lancer.sh), the core's one for every language
//   (`construireDepuisLesArguments` of scripts/taches-du-graphe.mjs): the plan and its providers by
//   `turbo run build --filter=<paquet>…`. `construire <chemin>` syncs one project, as the script
//   `build` of its package.
// - `tests-du-paquet`, `tests-de-nuit`, `verifier` and `typer` play under a temporary
//   directory of their pass, the guard of the temporary directory: a base (`ouvrirBase` of ./jointure) named in TMPDIR, TMP and TEMP, removed at the
//   end of the pass, green, red or interrupted; what the tests left there fails the pass (code 1),
//   each name written on the error stream, the lock files uv takes there (`uv-<hash>.lock`) apart,
//   which the base removes with the rest. A test makes its temporary
//   directory or file with `tempfile` (`TemporaryDirectory`, `NamedTemporaryFile`), removed at
//   its end, a failed test included, never `mkdtemp` by hand.
// - Python writes its bytecode under one tree at the root, `__pycache__` (PYTHONPYCACHEPREFIX),
//   which the envelope makes proper to the session (`sorties.propres` of ./index.mjs); uv the
//   environment of each package under `.venv/<dossier>` at the root (UV_PROJECT_ENVIRONMENT; the
//   tree of HEAD's version of the proof of the red, which `uv run --locked` reconciles with its own
//   manifest and lock, reuses the copy's, under the folder `GRILLHOUSE_VENV_DE_LA_COPIE` names), and
//   pytest its cache under `.pytest_cache/<dossier>` (`cache_dir`), where the envelope opens them
//   in writing, rather than in the package's folder, which a session whose plan does not write the
//   package could not write; uv its cache under ~/.cache/grillhouse/uv (UV_CACHE_DIR), the frame's
//   caches of compilation, never in the temporary directory.
// - While the environment names a results directory (`GRILLHOUSE_RESULTATS`), the run writes
//   there what ./verdict.mjs reads: its tasks, each planned before it plays, and the JUnit report
//   of each run of pytest.
// - uv absent from the PATH: one line that names it and `npx grillhouse maj`, which installs it.
// - The exit code: 0 when every task is green, 75 when the only reds are « à repasser », 1
//   otherwise; 2 for a path refused or a command unknown.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { constants, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RESULTATS } from '../../resultats.mjs';
import {
  AttenteDeLaMachine,
  surUnePlace,
  avecLaMachineEtUnePlace,
  cacheDeCompilation,
  cheminsDeLaTache,
  construireDepuisLesArguments,
  GRAPHE_JOUE,
  joueCeQuiNeSeDivisePas,
  lancerLesTaches,
  ligneDesRestes,
  nomDuPaquet,
  ouvrirBase,
  retirerALInterruption,
  SCRIPT_DES_TESTS,
  testsCibles,
  travailleursDeLaSeance,
} from '../../services-du-noyau.mjs';
import { TYPAGE } from '../../paquets.mjs';
import {
  composantDans,
  composants,
  estDeNuit,
  fichiersDeTest,
  GROUPE,
  joueDesTests,
} from './composants.mjs';
import { JUNIT, TACHES } from './verdict.mjs';

const ICI = fileURLToPath(import.meta.url);
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
/** The night tests, which the day leaves out. */
export const DE_NUIT = '*_nuit_test.py';
/** The tree of the bytecode of Python, at the root. */
export const PYCACHE = '__pycache__';
/** The environments of uv and the caches of pytest, one per package, at the root. */
export const VENV = '.venv';
/** The variable by which a tree of HEAD's version receives the copy's folder of environments. */
export const VENV_DE_LA_COPIE = 'GRILLHOUSE_VENV_DE_LA_COPIE';
export const CACHE_DE_PYTEST = '.pytest_cache';

/** The guards of the module: each its name and its script beside this one. */
export const GARDES = [
  { nom: 'tailles-des-tests', args: [] },
  { nom: 'index-interfaces', args: ['--verifier'] },
].map(g => ({
  ...g,
  script: path.join(path.dirname(ICI), `${g.nom}.mjs`),
}));

/** The commands of the module, each this script and its name; then each guard, its script. */
export const commandes = () =>
  Object.fromEntries([
    ...NOMS.map(n => [n, { script: ICI, args: [n] }]),
    ...GARDES.map(g => [g.nom, { script: g.script, args: [] }]),
  ]);

// The run of the tasks of a command in <racine>: each planned, then played, written in the
// results directory <env> names.
function passe(racine, env) {
  const dossier = env[RESULTATS] || null;
  const id = `${Date.now()}-${process.pid}`;
  const taches = [];
  const rapports = {};
  // uv keeps its cache with the frame's caches of compilation, out of the temporary directory.
  const environnement = {
    ...env,
    PYTHONPYCACHEPREFIX: path.join(racine, PYCACHE),
    UV_CACHE_DIR: cacheDeCompilation('uv', env),
  };
  const ecrire = () => {
    if (!dossier) {
      return;
    }
    mkdirSync(path.join(dossier, TACHES), { recursive: true });
    writeFileSync(
      path.join(dossier, TACHES, `${id}.json`),
      `${JSON.stringify({ taches, rapports }, null, 2)}\n`
    );
  };
  return {
    racine,
    prevoir(paquet, dossierDuPaquet, script, tests, args, programme = 'uv') {
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
      return { t, args, cwd: dossierDuPaquet, programme };
    },
    // The JUnit report of a run of pytest of the package <nom> at <dossierDuPaquet>, its option;
    // none without a results directory.
    junit(nom, dossierDuPaquet) {
      if (!dossier) {
        return [];
      }
      const f = `${id}-${nom}.xml`;
      rapports[f] = dossierDuPaquet;
      return ['-o', 'junit_family=xunit1', `--junit-xml=${path.join(dossier, JUNIT, f)}`];
    },
    // <vert>, the codes that count green beside 0.
    jouer({ t, args, cwd, programme }, vert = []) {
      // The environment of uv of the package, at the root (`sorties` of ./index.mjs).
      // A tree of HEAD's version receives the copy's folder of environments (`GRILLHOUSE_VENV_DE_LA_COPIE`)
      // and reuses its environment of the package.
      const venv = path.join(
        environnement[VENV_DE_LA_COPIE] || path.join(racine, VENV),
        path.relative(racine, cwd)
      );
      const r = spawnSync(programme, args, {
        cwd,
        env: { ...environnement, UV_PROJECT_ENVIRONMENT: venv },
        stdio: 'inherit',
      });
      if (r.error?.code === 'ENOENT' && programme === 'uv') {
        process.stderr.write("⛔ uv absent du PATH : `npx grillhouse maj` l'installe.\n");
      }
      t.code = r.error ? 127 : (r.status ?? 128 + (constants.signals[r.signal] ?? 0));
      if (vert.includes(t.code)) {
        t.code = 0;
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

const UV_RUN = ['run', '--locked'];
// The code of pytest for « no tests collected », distinct from a failure (1).
const AUCUN_TEST = 5;

// The selection of pytest for the paths <chemins> of a package, from its folder (empty: the
// whole package): the night left out of every folder (`--ignore-glob`), as the module cargo's; a
// night file named never reaches it (`choisir` refuses it).
function selection(chemins) {
  return [`--ignore-glob=${DE_NUIT}`, ...chemins];
}

// Whether the pyproject of the package at <dossier> declares pytest-xdist, which `-n` needs.
function declareXdist(dossier) {
  try {
    return /pytest-xdist/.test(readFileSync(path.join(dossier, 'pyproject.toml'), 'utf8'));
  } catch {
    return false;
  }
}

// Plays pytest in the run <p> for each `{ c, chemins }` of <choix>, `chemins` from the package's
// folder (empty: the whole package), the night left out (`selection`), <options> given to pytest.
// The package played whole (no path, or its own folder) that collects no test is green, as
// `cargo test` on a crate without a test; a path within it that collects none stays red.
function jouerLesTests(p, choix, options) {
  for (const { c, chemins } of choix) {
    const cache = path.join(p.racine, CACHE_DE_PYTEST, path.relative(p.racine, c.dossier));
    const args = [...UV_RUN, '--group', GROUPE, 'pytest', '-o', `cache_dir=${cache}`];
    args.push(...p.junit(c.nom, c.dossier));
    // The workers of a session of an agent (GRILLHOUSE_TRAVAILLEURS): `-n` of pytest-xdist, for a
    // package whose test group declares it; a heavy pass, without the variable, plays alone.
    const travailleurs = travailleursDeLaSeance(process.env);
    if (travailleurs !== null && declareXdist(c.dossier)) {
      args.push('-n', String(travailleurs));
    }
    const entier = chemins.every(ch => ch === '.');
    p.jouer(
      p.prevoir(c.nom, c.dossier, 'pytest', true, [...args, ...selection(chemins), ...options]),
      entier ? [AUCUN_TEST] : []
    );
  }
}

// The packages the paths <chemins> choose in <racine>: `{ choix }`, or `{ refus }`.
function choisir(racine, tous, chemins) {
  const parDossier = new Map();
  const refus = [];
  for (const chemin of chemins) {
    const c = composantDans(tous, racine, chemin);
    if (!c) {
      refus.push(`${chemin} : hors de tout paquet Python (pyproject.toml)`);
      continue;
    }
    // A night test plays at night alone (`tests-de-nuit`): a targeted run refuses it, named.
    if (estDeNuit(path.basename(chemin))) {
      refus.push(
        `${chemin} : un test de nuit se joue la nuit seulement (npx grillhouse nuit le joue)`
      );
      continue;
    }
    const rel = path.relative(c.dossier, path.resolve(racine, chemin)) || '.';
    const deja = parDossier.get(c.dossier) ?? { c, chemins: [] };
    deja.chemins.push(rel);
    parDossier.set(c.dossier, deja);
  }
  return refus.length ? { refus } : { choix: [...parDossier.values()] };
}

// The graph packages of the projects <projets>: `{ noms, absents }`, the names of those that are
// packages of the graph, and the names of the projects that are not.
function nomsDuGraphe(racine, projets) {
  const noms = new Set();
  const absents = [];
  for (const c of projets) {
    const nom = nomDuPaquet(racine, c.dossier);
    if (nom === null) {
      absents.push(c.nom);
    } else {
      noms.add(nom);
    }
  }
  return { noms, absents };
}

// Says, on the error stream, each project of <absents> that is no package of the graph: its tests
// do not play, as a package without a `package.json` is out of Turborepo's tasks.
function direLesAbsents(absents) {
  for (const nom of absents) {
    process.stderr.write(
      `⚠️  ${nom} : pas un paquet du graphe (package.json absent) ; ses tests ne se jouent pas : npx grillhouse maj\n`
    );
  }
}

// The pass of `tester` in <racine>, its arguments <args>, under <env>: the tasks `test:unit` of the
// projects the paths choose (every project that plays tests without a path) as Turborepo's, the
// exit code its.
function tester(racine, args, env) {
  const tous = composants(racine);
  const chemins = args.filter(a => !a.startsWith('-'));
  const options = args.filter(a => a.startsWith('-') && a !== '--force');
  let choisis = tous.filter(c => joueDesTests(racine, c));
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

// The pass of `tests-du-paquet` in <racine>, its arguments <args>, under <env>: the body of the task
// `test:unit` of a project. The paths its script names, completed by those of the variable of the
// task that lie in the same project.
function testsDuPaquet(racine, args, env) {
  const tous = composants(racine);
  const donnes = args.filter(a => !a.startsWith('-'));
  if (donnes.length === 0) {
    process.stderr.write(
      '⛔ tests-du-paquet : aucun chemin (un dossier de projet, ou un fichier de test).\n'
    );
    return 2;
  }
  const dossierDe = abs => composantDans(tous, racine, abs)?.dossier ?? null;
  const { chemins, options, tranche } = cheminsDeLaTache({ racine, donnes, env, dossierDe });
  const r = choisir(racine, tous, chemins);
  if (r.refus) {
    for (const l of r.refus) {
      process.stderr.write(`⛔ ${l}\n`);
    }
    return 2;
  }
  // pytest has no split of its own: a tranche past the first plays none of its tests, the first
  // plays them all, so the n tranches together play each test once.
  if (!joueCeQuiNeSeDivisePas(tranche)) {
    return 0;
  }
  const p = passe(racine, env);
  jouerLesTests(p, r.choix, [...args.filter(a => a.startsWith('-')), ...options]);
  return p.code();
}

// The pass of `verifier` in <racine>, under the lock of the machine: the typing and the tests of
// the projects as tasks of Turborepo (the tests played for real with <args> `--tout`). It keeps no
// green.
function verifier(racine, args, env) {
  if (args.includes('--gardes')) {
    return gardes(racine, passe(racine, env));
  }
  // Beside the module of package.json (composed command), its pass has played the tasks.
  if (env[GRAPHE_JOUE]) {
    return 0;
  }
  const { noms, absents } = nomsDuGraphe(racine, composants(racine));
  direLesAbsents(absents);
  if (noms.size === 0) {
    return 0;
  }
  const code = lancerLesTaches({
    outil: OUTIL,
    racine,
    taches: [TYPAGE, SCRIPT_DES_TESTS],
    noms,
    tests: testsCibles({ arguments: [], force: args.includes('--tout') }),
    env,
  });
  return code === 0 ? 0 : 1;
}

// The typing of the package <c> in the run <p>: compileall, the folders of a dot left out.
const typerLePaquet = (p, c) =>
  p.jouer(
    p.prevoir(c.nom, c.dossier, 'compileall', false, [
      ...UV_RUN,
      'python',
      '-m',
      'compileall',
      '-q',
      '-x',
      String.raw`/\.`,
      '.',
    ])
  );

// The scripts of guards of the project, in the order they play: the frame's, then its own.
const SCRIPTS_DE_GARDES = ['grillhouse:gardes', 'gardes'];

// The pass of `verifier --gardes` in <racine>: each script of SCRIPTS_DE_GARDES the root
// package.json holds, a task of the root; no test.
function gardes(racine, p) {
  let scripts = {};
  try {
    scripts = JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8')).scripts ?? {};
  } catch {
    scripts = {};
  }
  for (const nom of SCRIPTS_DE_GARDES.filter(n => typeof scripts[n] === 'string')) {
    p.jouer(p.prevoir(RACINE, racine, nom, false, ['run', '--silent', nom], 'npm'));
  }
  return p.code();
}

// What the tools write at the root of the temporary directory, which the guard of the base
// tolerates and the base removes with the rest: Node's compile cache, which npm enables; the lock
// file uv takes on the environment of a project (`uv-<hash>.lock`, measured with uv 0.10.4).
const DES_OUTILS = n => n === 'node-compile-cache' || /^uv-[0-9a-f]+\.lock$/.test(n);

// Plays <jouer>(env) under the base of a pass of <genre> in the temporary directory of <env>,
// named in TMPDIR, TMP and TEMP: its code, 1 when the tests left something there, named.
function sousLaBase(genre, env, jouer) {
  const base = ouvrirBase(genre, { dans: env.TMPDIR || tmpdir() });
  const lacher = retirerALInterruption(base.fermer);
  try {
    const code = jouer({ ...env, ...base.env });
    const ligne = ligneDesRestes(base.restes().filter(n => !DES_OUTILS(n)));
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
 * Runs the command <nom> with <args> in the project at <racine>: its exit code.
 * @param {string} nom one of NOMS
 * @param {string[]} args its arguments
 * @param {{ racine?: string, env?: NodeJS.ProcessEnv }} [o]
 */
export function lancer(nom, args, { racine = process.cwd(), env = process.env } = {}) {
  if (nom === 'tester') {
    return surUnePlace(e => tester(racine, args, e), { env });
  }
  if (nom === 'tests-du-paquet') {
    return sousLaBase('tests', env, e => testsDuPaquet(racine, args, e));
  }
  if (nom === 'tests-de-nuit') {
    return sousLaBase('tests', env, e => {
      const p = passe(racine, e);
      const choix = composants(racine)
        .map(c => ({
          c,
          chemins: fichiersDeTest(c.dossier)
            .filter(f => estDeNuit(path.basename(f)))
            .map(f => path.relative(c.dossier, f)),
        }))
        .filter(x => x.chemins.length);
      jouerLesTests(p, choix, []);
      return p.code();
    });
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
  // The launcher's `construire` (`--echec <fichier> <plan>`, scripts/enveloppe/lancer.sh) builds
  // the copy for a session, the plan and its providers, as every language's.
  if (nom === 'construire' && args.includes('--echec')) {
    return construireDepuisLesArguments(OUTIL, args, racine);
  }
  if (nom === 'typer' || nom === 'construire') {
    // `construire` and `typer` with a path: the one project of that folder, as Turborepo's task of
    // one package; `typer` alone types them all.
    let choisis = composants(racine);
    if (nom === 'construire' || (nom === 'typer' && args.length)) {
      const [chemin, ...autres] = args;
      const abs = chemin === undefined ? null : path.resolve(racine, chemin);
      const c = abs === null ? undefined : choisis.find(x => x.dossier === abs);
      if (!c || autres.length) {
        process.stderr.write(
          `⛔ ${nom} : ${chemin ?? 'aucun chemin'} ne désigne pas un projet Python (un dossier de pyproject.toml, une fois).\n`
        );
        return 2;
      }
      choisis = [c];
    }
    return sousLaBase('tests', env, e => {
      const p = passe(racine, e);
      for (const c of choisis) {
        if (nom === 'typer') {
          typerLePaquet(p, c);
        } else {
          p.jouer(
            p.prevoir(c.nom, c.dossier, 'sync', false, ['sync', '--locked', '--group', GROUPE])
          );
        }
      }
      return p.code();
    });
  }
  process.stderr.write(`⛔ commande inconnue du module python : ${nom} (${NOMS.join(', ')})\n`);
  return 2;
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
