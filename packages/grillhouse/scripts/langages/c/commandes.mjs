#!/usr/bin/env node
// The commands of the module c, the demand `commandes` of the join (scripts/jointure.d.ts): each
// one this script with its name first, `{ script, args }`, described, never run, by `commandes`;
// run by `grillhouse <commande>` in the root of the project, its arguments after.
//
//   npx grillhouse tests [--force] [<chemin>…] [--<option>…]   tester
//   npx grillhouse tests-du-paquet <chemin>… [--<option>…]      tests-du-paquet
//   npx grillhouse verifier [--tout | --gardes]                 verifier
//   node commandes.mjs typer                                    typer
//   npx grillhouse index-interfaces                             the guard, its own script
//
// - A package is played by CMake and CTest, in `.build-cmake/<paquet>` at the root, outside the
//   package's tree: `cmake -S <paquet> -B <construction>` configures, `cmake --build` compiles,
//   `ctest --test-dir <construction>` plays; a step that fails ends the task of the package, its
//   code the task's (a compiler error is the build's: red, no test plays).
// - `tester` and `verifier` play the tasks of the packages as Turborepo's, the way of the module
//   python's (../python/commandes.mjs): `turbo run test:unit` (and `typecheck`) on the projects
//   of the graph, each one a package with its own `package.json` (scripts/paquet-npm.mjs), a path
//   written from the root choosing the project that holds it (a path out of every project is
//   refused, named, code 2). `verifier --gardes` plays the guards of the root scripts alone.
// - `tests-du-paquet <chemin>…` is the body of the task `test:unit`: a path is a package (its
//   folder: played whole) or one of its test files, `tests/test_*.c` (played alone, by `ctest -R`);
//   any other path is refused, named, and nothing plays (code 2). Every `tests/test_*.c` is one
//   CTest test, `test_<nom>`, which the skeleton's `tests/CMakeLists.txt` registers; the JUnit
//   report CTest writes (`--output-junit`) is kept as it is (./verdict.mjs). A test file that
//   CTest registers none of (a `tests/CMakeLists.txt` edited by hand) is red, « fichier de test
//   non pris par CTest », named. A package played whole without a test file is compiled, and green.
// - `typer`: the configuration and the compilation of every package, or of the one named;
//   `construire <chemin>` builds the one package named, as the script `build` of its package.json.
// - `cmake` and `ctest` absent from the PATH: one line that names the tool, code 1.
// - The tests play under a temporary directory of their pass (`ouvrirBase`), removed at the end,
//   what the tests left there failing the pass (code 1), as the module python's.
// - While the environment names a results directory (`GRILLHOUSE_RESULTATS`), the run writes
//   there what ./verdict.mjs reads: its tasks, each planned before it plays, and the JUnit report
//   of each run of CTest.
// - The exit code: 0 when every task is green, 1 otherwise; 2 for a path refused or a command
//   unknown.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { constants, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RESULTATS } from '../../resultats.mjs';
import {
  AttenteDeLaMachine,
  avecLaPasse,
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
  surUnePart,
  testsCibles,
  travailleursDeLaSeance,
  trouverDansLePath,
} from '../../services-du-noyau.mjs';
import { TYPAGE } from '../../paquets.mjs';
import {
  composantDans,
  composants,
  estUnFichierDeTest,
  fichiersDeTest,
  joueDesTests,
  TESTS,
} from './composants.mjs';
import { casDuRapport, JUNIT, TACHES } from './verdict.mjs';

const ICI = fileURLToPath(import.meta.url);
export const NOMS = ['tester', 'tests-du-paquet', 'verifier', 'typer', 'construire'];
// The task runner of the graph of the packages.
const OUTIL = 'turbo';
const RACINE = '//';
/** The constructions of CMake, one directory per package, at the root. */
export const CONSTRUCTION = '.build-cmake';
const A_REPASSER = 75;

/** The guards of the module: each its name and its script beside this one. */
export const GARDES = [{ nom: 'index-interfaces', args: ['--verifier'] }].map(g => ({
  ...g,
  script: path.join(path.dirname(ICI), `${g.nom}.mjs`),
}));

/** The commands of the module, each this script and its name; then each guard, its script. */
export const commandes = () =>
  Object.fromEntries([
    ...NOMS.map(n => [n, { script: ICI, args: [n] }]),
    ...GARDES.map(g => [g.nom, { script: g.script, args: [] }]),
  ]);

/**
 * Whether <journal>, the output of a build, shows a failure of the compiler.
 * @param {string} journal
 */
export const echecDeCompilation = journal => /(?:fatal )?error: |^CMake Error/m.test(journal);

// The run of the tasks of a command in <racine>: each planned, then played, written in the
// results directory <env> names.
function passe(racine, env) {
  const dossier = env[RESULTATS] || null;
  const id = `${Date.now()}-${process.pid}`;
  const taches = [];
  const rapports = {};
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
    env,
    prevoir(paquet, dossierDuPaquet, script, tests) {
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
      return t;
    },
    // The file of the JUnit report CTest writes for the package <nom> at <dossierDuPaquet>: in
    // the results directory when there is one, else beside the construction.
    junit(nom, dossierDuPaquet, construction) {
      if (!dossier) {
        return path.join(construction, 'ctest-junit.xml');
      }
      const f = `${id}-${nom}.xml`;
      rapports[f] = dossierDuPaquet;
      mkdirSync(path.join(dossier, JUNIT), { recursive: true });
      return path.join(dossier, JUNIT, f);
    },
    // Ends the task <t> with <code>.
    finir(t, code) {
      t.code = code;
      ecrire();
      return code;
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

// The exit code of <r>, the result of a spawn.
const codeDe = r => (r.error ? 127 : (r.status ?? 128 + (constants.signals[r.signal] ?? 0)));

// The tools <noms> the PATH of <env> lacks, named on the error stream: true when one lacks.
function manque(noms, env) {
  const absents = noms.filter(n => trouverDansLePath(n, env) === null);
  for (const n of absents) {
    process.stderr.write(`⛔ ${n} absent du PATH : le poste exige cmake et ctest (CMake).\n`);
  }
  return absents.length > 0;
}

// The environment of a tool: <env> whose PATH ends with the folder of the Node that runs this
// script, as npm gives the scripts it runs, so that a tool written for Node finds it.
const pourLOutil = env => ({
  ...env,
  PATH: [env.PATH, path.dirname(process.execPath)].filter(Boolean).join(path.delimiter),
});

// Runs <programme> <args> in <cwd>: its code.
const jouer = (programme, args, cwd, env) =>
  codeDe(spawnSync(programme, args, { cwd, env: pourLOutil(env), stdio: 'inherit' }));

// The configuration and the compilation of the package <c> in the run <p>, under <t>: the first
// code that is not 0, else 0.
function construire(p, c, t, env) {
  const construction = path.join(p.racine, CONSTRUCTION, c.nom);
  const travailleurs = travailleursDeLaSeance(env);
  const configure = jouer('cmake', ['-S', c.dossier, '-B', construction], p.racine, env);
  if (configure !== 0) {
    return configure;
  }
  return jouer(
    'cmake',
    [
      '--build',
      construction,
      ...(travailleurs === null ? [] : ['--parallel', String(travailleurs)]),
    ],
    p.racine,
    env
  );
}

// The names of the cases of the JUnit report at <fichier>; none when it is not there.
function casJoues(fichier) {
  return existsSync(fichier) ? casDuRapport(readFileSync(fichier, 'utf8')).map(x => x.nom) : [];
}

// Plays each `{ c, fichiers }` of <choix> in the run <p>, `fichiers` the test files named (their
// names without `.c`), null for the whole package: the task `ctest` of each.
function jouerLesTests(p, choix, env) {
  for (const { c, fichiers } of choix) {
    const t = p.prevoir(c.nom, c.dossier, 'ctest', true);
    const sansTest = fichiers === null && fichiersDeTest(c.dossier).length === 0;
    if (manque(sansTest ? ['cmake'] : ['cmake', 'ctest'], env)) {
      p.finir(t, 127);
      continue;
    }
    let code = construire(p, c, t, env);
    const voulus = fichiers ?? fichiersDeTest(c.dossier).map(f => path.basename(f, '.c'));
    if (code === 0 && voulus.length > 0) {
      const construction = path.join(p.racine, CONSTRUCTION, c.nom);
      const junit = p.junit(c.nom, c.dossier, construction);
      mkdirSync(path.dirname(junit), { recursive: true });
      const args = [
        '--test-dir',
        construction,
        '--output-junit',
        junit,
        '--no-tests=error',
        '--output-on-failure',
        ...(fichiers === null ? [] : ['-R', `^(${fichiers.join('|')})$`]),
      ];
      // CTest's own codes (8 for a failed test) are the task's failure, 1.
      code = jouer('ctest', args, p.racine, env) === 0 ? 0 : 1;
      const joues = new Set(casJoues(junit));
      const sans = voulus.filter(n => !joues.has(n));
      if (sans.length > 0) {
        process.stderr.write(
          `⛔ ${c.nom} : fichier de test non pris par CTest : ${sans.map(n => `${TESTS}/${n}.c`).join(', ')} (tests/CMakeLists.txt les enregistre).\n`
        );
        code = code === 0 ? 1 : code;
      }
    }
    p.finir(t, code);
  }
}

// The packages the paths <chemins> choose in <racine>: `{ choix }`, each `{ c, fichiers }`, or
// `{ refus }`.
function choisir(racine, tous, chemins) {
  const parDossier = new Map();
  const refus = [];
  for (const chemin of chemins) {
    const c = composantDans(tous, racine, chemin);
    if (!c) {
      refus.push(`${chemin} : hors de tout paquet C (CMakeLists.txt avec project())`);
      continue;
    }
    const parts = path.relative(c.dossier, path.resolve(racine, chemin)).split(path.sep);
    const entier = parts.length === 1 && parts[0] === '';
    const test = parts.length === 2 && parts[0] === TESTS && estUnFichierDeTest(parts[1]);
    if (!entier && !test) {
      refus.push(`${chemin} : ni un paquet C, ni un fichier de test (${TESTS}/test_*.c)`);
      continue;
    }
    const deja = parDossier.get(c.dossier) ?? { c, fichiers: [] };
    if (entier || deja.fichiers === null) {
      deja.fichiers = null;
    } else {
      deja.fichiers.push(path.basename(parts[1], '.c'));
    }
    parDossier.set(c.dossier, deja);
  }
  return refus.length ? { refus } : { choix: [...parDossier.values()] };
}

// The graph packages of the projects <projets>: `{ noms, absents }`.
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

// Says each project of <absents> that is no package of the graph: its tests do not play.
function direLesAbsents(absents) {
  for (const nom of absents) {
    process.stderr.write(
      `⚠️  ${nom} : pas un paquet du graphe (package.json absent) ; ses tests ne se jouent pas : npx grillhouse maj\n`
    );
  }
}

// The pass of `tester` in <racine>, its arguments <args>, under <env>: the tasks `test:unit` of the
// projects the paths choose (every project that plays tests without a path) as Turborepo's.
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

// The pass of `tests-du-paquet` in <racine>, its arguments <args>, under <env>: the body of the
// task `test:unit` of a project.
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
  const { chemins, tranche } = cheminsDeLaTache({ racine, donnes, env, dossierDe });
  const r = choisir(racine, tous, chemins);
  if (r.refus) {
    for (const l of r.refus) {
      process.stderr.write(`⛔ ${l}\n`);
    }
    return 2;
  }
  // CTest has no split of its own: a tranche past the first plays none of its tests.
  if (!joueCeQuiNeSeDivisePas(tranche)) {
    return 0;
  }
  const p = passe(racine, env);
  jouerLesTests(p, r.choix, env);
  return p.code();
}

// The pass of `verifier` in <racine>, under the lock of the machine: the typing and the tests of
// the projects as tasks of Turborepo. It keeps no green.
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
  if (code !== 0) {
    process.stderr.write('⛔ rouge.\n');
  }
  return code === 0 ? 0 : 1;
}

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
    const t = p.prevoir(RACINE, racine, nom, false);
    p.finir(t, jouer('npm', ['run', '--silent', nom], racine, p.env));
  }
  return p.code();
}

// What the tools write at the root of the temporary directory, which the base removes with the
// rest: Node's compile cache, which npm enables.
const DES_OUTILS = n => n === 'node-compile-cache';

// Plays <jouerSous>(env) under the base of a pass of <genre> in the temporary directory of <env>:
// its code, 1 when the tests left something there, named.
function sousLaBase(genre, env, jouerSous) {
  const base = ouvrirBase(genre, { dans: env.TMPDIR || tmpdir() });
  const lacher = retirerALInterruption(base.fermer);
  try {
    const code = jouerSous({ ...env, ...base.env });
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
    return surUnePart(e => tester(racine, args, e), { env, racine });
  }
  if (nom === 'tests-du-paquet') {
    return sousLaBase('tests', env, e => testsDuPaquet(racine, args, e));
  }
  if (nom === 'verifier') {
    const dire = l => process.stdout.write(`${l}\n`);
    try {
      return sousLaBase('verification', env, envBase =>
        avecLaPasse(envMachine => verifier(racine, args, envMachine), {
          lourde: true,
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
  // The launcher's `construire` (`--echec <fichier> <plan>`) builds the copy for a session, the
  // plan and its providers, as every language's.
  if (nom === 'construire' && args.includes('--echec')) {
    return construireDepuisLesArguments(OUTIL, args, racine);
  }
  if (nom === 'typer' || nom === 'construire') {
    // `construire` and `typer` with a path: the one project of that folder; `typer` alone types
    // them all.
    let choisis = composants(racine);
    if (nom === 'construire' || (nom === 'typer' && args.length)) {
      const [chemin, ...autres] = args;
      const abs = chemin === undefined ? null : path.resolve(racine, chemin);
      const c = abs === null ? undefined : choisis.find(x => x.dossier === abs);
      if (!c || autres.length) {
        process.stderr.write(
          `⛔ ${nom} : ${chemin ?? 'aucun chemin'} ne désigne pas un paquet C (un dossier de CMakeLists.txt avec project(), une fois).\n`
        );
        return 2;
      }
      choisis = [c];
    }
    return sousLaBase('tests', env, e => {
      const p = passe(racine, e);
      for (const c of choisis) {
        const t = p.prevoir(c.nom, c.dossier, 'compile', false);
        p.finir(t, manque(['cmake'], e) ? 127 : construire(p, c, t, e));
      }
      return p.code();
    });
  }
  process.stderr.write(`⛔ commande inconnue du module c : ${nom} (${NOMS.join(', ')})\n`);
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
