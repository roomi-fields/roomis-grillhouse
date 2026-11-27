#!/usr/bin/env node
// `npm run verifier`: the verification pass, one run of Turborepo on the whole graph. Its verdict
// is green (0) or red (1); « à repasser » (75) only when the wait for the part of the machine, or
// for room in the temporary directory, reaches its bound, or the memory watch cuts it.
// Mechanism: packages/grillhouse/docs/architecture/tests.md, §5.1 (the pass), §5.3 (the tests
// replayed), §3.1.
//
//   npx grillhouse verifier [<argument of Turborepo>…]      (npm run verifier -- --force)
//   npx grillhouse verifier --tout [<argument>…]             every test, played for real
//   npx grillhouse verifier --gardes [<argument>…]           the guards alone (the reviewer)
//   npx grillhouse verifier --sans-tests [<argument>…]       every control but the tests
//   npx grillhouse verifier --tranche i/n [<argument>…]      the tests of the tranche i of n
//
// - The measure: against the last green (scripts/dernier-vert.mjs), the changes reach Vitest in
//   `GRILLHOUSE_CHANGEMENTS`, which no hash counts (vitest-config/changements.mjs); the line `↳`
//   says whether the pass is targeted or complete. The final pass of a circuit gives the base of
//   its lot (`GRILLHOUSE_BASE_DU_LOT`) and measures against it, targeted; a `--base` given takes
//   precedence. The guards and the builds play whole. A pass green and restricted by no filter
//   keeps its tree as the last green; a red one leaves it. The pass alone keeps it, for every
//   language: it plays the tasks of every package of the graph, a crate's and a Python
//   project's beside a TypeScript package's (their `test:unit` and `typecheck`).
// - `--tout`, and `--force` (the night, scripts/nuit.sh), play the complete pass: each task of
//   tests for real (`GRILLHOUSE_TESTS` carries only `rejouer`, the moment of the pass, no path).
// - The part of the budget of the machine (scripts/places-de-la-machine.mjs, `avecLaPasse`): a
//   pass whose part does not fit waits, says so with what it waits for, when it begins and every
//   30 s; the wait bounded (60 min), it ends at 75; a key `grillhouse.part` or a reserve that is
//   faulty ends it at once, red (1); either way without playing. A pass in the frame's own
//   repository passes before a project's. It plays held to its part in a control group of its own.
// - Turborepo plays the build, the guards (`grillhouse:gardes`, the project's `gardes`), the
//   typing (`typecheck`, ./turbo-des-paquets.mjs) and the tests (`test:unit`) beside each other:
//   `turbo run grillhouse:gardes gardes typecheck test:unit --continue=dependencies-successful
//   --concurrency=<n> --summarize`, each argument given after it; a `--concurrency` among them
//   replaces <n>, half the cores of the pass's part, one at least (`tachesCoteACote`). A red
//   stops no task whose prerequisites passed, and each red is named. The workers of each task of
//   tests (`travailleursDeLaPasse`, GRILLHOUSE_TRAVAILLEURS) share the cores between the tasks of
//   tests side by side: the test processes of a pass never outnumber the cores.
// - The memory watch (scripts/garde-de-la-memoire.mjs): the run is cut when the memory available
//   and the free swap run out, or when the machine waits for its memory half of the time; the
//   pass says why and ends at 75, no task judged.
// - The pass plays no measure of time: a time budget bench and a time witness (a test file that
//   imports `mesurerAuRepos`) are out of the day, as the night tests are (vitest-config/cibles.mjs,
//   ./tests-de-nuit.mjs). A delay past is a red, and so is a task at 75.
// - The format check and the lint play per package (`<package>#format:check`, `<package>#lint`,
//   the scripts of each package that holds them) and for the root's own files (`//#format:check`,
//   `//#lint`), under the same `--continue`.
// - `--gardes` plays the guards, `format:check` and `lint` alone (`turbo run grillhouse:gardes
//   gardes format:check lint …`), the repository whole, with the same verdict: what the reviewer
//   plays. `--sans-tests` plays every task but the tests (`turbo run grillhouse:gardes gardes
//   typecheck format:check lint …`), with no measure. `--tranche i/n` plays the tasks of tests
//   alone (`turbo run test:unit …`) with the builds they depend on, each package of Vitest playing
//   the i-th of n parts of its test files (./tranches.mjs); it is measured as the pass is
//   (complete with `--tout`), carries itself in `GRILLHOUSE_TESTS`, which the hash of the tests
//   counts, plays for real since it writes its reports (`.vitest-reports/`, the former ones
//   removed first). Neither a tranche nor `--sans-tests` keeps its tree as the last green. A
//   tranche not of the form `i/n` (1 ≤ i ≤ n), or given with `--gardes` or `--sans-tests`, is
//   refused before any work, code 1.
// - The verdict reads the exit code of each task in the summary of each run
//   (`.turbo/runs/<id>.json`), since Turborepo exits with the greatest code of its tasks. The
//   summary is removed, and `.turbo/runs` with it when the run created it; under a results
//   directory (`GRILLHOUSE_RESULTATS`) it goes there. A task at 0 is green; any other code, 75
//   included, and a summary that does not read while Turborepo failed: red, code 1, each task named.
// - The progress (scripts/avancement.mjs): the directory `GRILLHOUSE_AVANCEMENT` names, else one
//   of its own, named in the file of the part it holds (`nommerLAvancement`) and removed at its
//   end. Before its run, the plan (`turbo run … --dry=json`) names the tasks of tests and counts
//   done the files of those Turborepo replays from its cache.
// - The red tasks: while `GRILLHOUSE_ROUGES` (`ROUGES`) names a file, the pass writes there, once
//   each, one line per task red on its own exit code: its id (`<package>#<task>`, `//#<task>`
//   for the root), a tab, the command that replays it alone (`npx turbo run <task>
//   --filter=<package>`); a task that did not play is none. Green, the file is empty. The night
//   reads it for its bisect commands (scripts/nuit.sh).
// - The base of the pass (scripts/mesure/base-de-passe.mjs): in the temporary directory of its
//   environment, swept first of the bases a killed pass left; every run of Turborepo gets it in
//   TMPDIR, TMP and TEMP (`globalPassThroughEnv`, ./turbo-des-paquets.mjs); removed at the end,
//   green, red or interrupted (SIGINT, SIGTERM, SIGHUP).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  A_REPASSER,
  AttenteDeLaMachine,
  AVANCEMENT,
  avecLaPasse,
  BASE_DU_LOT,
  CHANGEMENTS,
  consignerLesRegressions,
  garderLeRegistre,
  garderLeTotal,
  garderLeVert,
  GARDE_DE_LA_MEMOIRE,
  LA_FORME,
  langageDe,
  MEMOIRE_COUPEE,
  lireLaTranche,
  lireLeRegistre,
  mesure,
  nommerLAvancement,
  ouvrirAvancement,
  ouvrirBase,
  PASSE_ROUGE,
  retirerALInterruption,
  SCRIPT_DES_TESTS,
  SCRIPTS_DE_GARDES as GARDES,
  tachesCoteACote as concurrence,
  TESTS_CIBLES,
  testsCibles,
  travailleursDeLaSeance,
  VARIABLE_TRAVAILLEURS,
} from '../../services-du-noyau.mjs';
import { paquets, TYPAGE } from '../../paquets.mjs';
import { RESULTATS } from '../../resultats.mjs';
import { fichiersDeLaTranche, RAPPORTS } from './tranches.mjs';
import { garderLesResumes } from './resume-du-lanceur.mjs';
import { controlesDuDepot, planifier } from './turbo-des-paquets.mjs';

const TACHES = [...GARDES, TYPAGE, SCRIPT_DES_TESTS];
const CONCURRENCE = /^--concurrency(?:=|$)/;
// The variable that names the file of the red tasks, which the night reads.
const ROUGES = 'GRILLHOUSE_ROUGES';
// The command that replays the task <id> (`<package>#<task>`) alone, Turborepo's hash replaying
// from its cache what did not change.
const rejeu = id => {
  const i = id.indexOf('#');
  return `npx turbo run ${id.slice(i + 1)} --filter=${id.slice(0, i)}`;
};

const lister = dossier => (existsSync(dossier) ? readdirSync(dossier) : []);

// The tasks side by side <args> ask for (`--concurrency=<n>`, `--concurrency <n>`), null without
// a whole number.
function concurrenceDemandee(args) {
  const i = args.findIndex(a => CONCURRENCE.test(a));
  if (i < 0) {
    return null;
  }
  const v = args[i].includes('=') ? args[i].split('=')[1] : args[i + 1];
  return /^[1-9]\d*$/.test(v ?? '') ? Number(v) : null;
}

/**
 * The workers of each task of tests of a pass: the <coeurs> shared between the tasks of tests
 * played side by side, at most <coteACote> and at most the <paquets> that play tests; one at least.
 * @param {{ coeurs: number, coteACote: number, paquets: number }} o
 * @returns {number}
 */
export const travailleursDeLaPasse = ({ coeurs, coteACote, paquets: n }) =>
  Math.max(1, Math.floor(coeurs / Math.max(1, Math.min(coteACote, n))));

// The full pass in <racine>, its arguments <args> (`--gardes` among them: the guards alone), under
// <env> and its part of the machine; its verdict, 0 or 1, or 75 when the wait for the part, or for
// room in the temporary directory, reaches its bound, or when the watch of the memory cuts the run.
// `dire` writes a line; `coeurs`, the cores the pass shares between its tasks when no part is
// held (the part's cores otherwise, or those its parent's part gives: GRILLHOUSE_TRAVAILLEURS).
export function verifier({
  racine = process.cwd(),
  args: demandes = [],
  env = process.env,
  dire = l => process.stdout.write(`${l}\n`),
  coeurs = availableParallelism(),
}) {
  // A malformed request is refused before any work.
  const { erreur } = lireLesDemandes(demandes);
  if (erreur) {
    dire(erreur);
    return 1;
  }
  // The base of the pass, in the temporary directory of <env>: every task writes in it (TMPDIR,
  // which Turborepo passes on), and it goes at the end of the pass.
  const base = ouvrirBase('verification', { dans: env.TMPDIR || tmpdir() });
  const lacher = retirerALInterruption(base.fermer);
  try {
    return avecLaPasse(
      (envMachine, { part }) => {
        // The cores the pass shares between its tasks: its part's, else its parent's part's.
        const sesCoeurs = part?.coeurs ?? travailleursDeLaSeance(envMachine) ?? coeurs;
        // The progress of the pass: the directory its caller names (the circuit's), else its own,
        // named in the file of its part while it plays.
        const propre = !envMachine[AVANCEMENT];
        const dossier =
          envMachine[AVANCEMENT] || ouvrirAvancement({ racine, genre: 'verification' });
        const effacer = propre ? nommerLAvancement({ env: envMachine, dossier }) : () => {};
        try {
          return passe({
            racine,
            demandes,
            env: { ...envMachine, [AVANCEMENT]: dossier, ...base.env },
            dire,
            coeurs: sesCoeurs,
          });
        } finally {
          effacer();
          if (propre) {
            garderLeTotal(dossier);
            rmSync(dossier, { recursive: true, force: true });
          }
        }
      },
      { lourde: true, env, racine, dire }
    );
  } catch (e) {
    if (!(e instanceof AttenteDeLaMachine)) {
      throw e;
    }
    dire(e.message);
    return e.code;
  } finally {
    lacher();
    base.fermer();
  }
}

// The packages of <racine> that play tests (a script `test:unit`), its root for a repository
// without packages.
function paquetsAvecTests(racine) {
  const liste = paquets(racine);
  if (liste.length === 0) {
    try {
      return JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8')).scripts?.[
        SCRIPT_DES_TESTS
      ]
        ? 1
        : 0;
    } catch {
      return 0;
    }
  }
  return liste.filter(p => !p.hors && p.pkg.scripts?.[SCRIPT_DES_TESTS]).length;
}
const depotAvecTests = racine => paquetsAvecTests(racine) > 0;

// Whether <args> hold a filter of Turborepo (`--filter=<f>`, `--filter <f>`, `-F <f>`).
const filtre = args => args.some(a => a.startsWith('--filter=') || a === '--filter' || a === '-F');

// A pass green on every package keeps its tree as the last green (`garder`): not when it is
// restricted by a filter or to a part of its tasks (<partielle>: a tranche, `--sans-tests`),
// measured against nothing, or run after a red module (PASSE_ROUGE).
export function poserLeVert({ code, etat, args, env, garder, partielle = false }) {
  if (code === 0 && etat && !partielle && !filtre(args) && !env[PASSE_ROUGE]) {
    garder(etat);
  }
}

// The options of the pass in <demandes>: `{ gardesSeules, sansTests, tranche, tout, base, args,
// erreur }`. `--base <commit>` (or `--base=<commit>`) belongs to the verification alone: it never
// reaches the tasks, `base` is '' when it has no value (alone, or followed by another option), and
// undefined when it is not given or when the guards alone, or the pass without its tests, ask for
// no measure. `--tranche i/n` (or `--tranche=i/n`) neither: `tranche` is `{ index, count }`;
// `erreur`, the line that refuses a tranche not of the form i/n, or given with `--gardes` or
// `--sans-tests`.
export function lireLesDemandes(demandes) {
  const gardesSeules = demandes.includes('--gardes');
  const sansTests = demandes.includes('--sans-tests');
  const tout = demandes.includes('--tout') || demandes.includes('--force');
  let base;
  let texte;
  const args = [];
  for (let i = 0; i < demandes.length; i++) {
    const a = demandes[i];
    if (a === '--gardes' || a === '--tout' || a === '--sans-tests') {
      continue;
    }
    if (a === '--tranche') {
      const suite = demandes[i + 1];
      texte = suite !== undefined && !suite.startsWith('-') ? suite : '';
      i += texte ? 1 : 0;
    } else if (a.startsWith('--tranche=')) {
      texte = a.slice('--tranche='.length);
    } else if (a === '--base') {
      const suite = demandes[i + 1];
      if (suite !== undefined && !suite.startsWith('-')) {
        base = suite;
        i++;
      } else {
        base = '';
      }
    } else if (a.startsWith('--base=')) {
      base = a.slice('--base='.length);
    } else {
      args.push(a);
    }
  }
  const tranche = texte === undefined ? undefined : (lireLaTranche(texte) ?? undefined);
  let erreur;
  if (texte !== undefined && !tranche) {
    erreur = `⛔ --tranche attend la forme ${LA_FORME}, deux entiers avec 1 ≤ i ≤ n (par exemple --tranche 1/3) : « ${texte} » ne l'a pas.`;
  } else if (tranche && (gardesSeules || sansTests)) {
    erreur = `⛔ --tranche joue les seuls tests : elle ne se combine ni avec --gardes ni avec --sans-tests.`;
  }
  const mesure = !gardesSeules && !sansTests;
  return {
    gardesSeules,
    sansTests,
    tranche,
    tout,
    base: mesure ? base : undefined,
    args,
    ...(erreur ? { erreur } : {}),
  };
}

/**
 * The tasks of Turborepo a pass plays, from its options (`lireLesDemandes`), <controles> the tasks
 * of the format check and the lint of the repository (`controlesDuDepot`): a tranche, the tests
 * alone; `--gardes`, the guards and the controls; `--sans-tests`, every task but the tests; else
 * every task.
 * @param {{ gardesSeules?: boolean, sansTests?: boolean, tranche?: object }} demandes
 * @param {string[]} controles
 * @returns {string[]}
 */
export function tachesDeLaPasse({ gardesSeules, sansTests, tranche }, controles) {
  if (tranche) {
    return [SCRIPT_DES_TESTS];
  }
  if (gardesSeules) {
    return [...GARDES, ...controles];
  }
  if (sansTests) {
    return [...GARDES, TYPAGE, ...controles];
  }
  return [...TACHES, ...controles];
}

/**
 * The content of the variable of the tests (`GRILLHOUSE_TESTS`) for the tranche <tranche> of a pass
 * in <racine>: the tranche and the directory of its reports, and the moment of the pass, which no
 * cached run holds.
 * @param {{ index: number, count: number }} tranche
 * @param {string} racine
 */
export function testsDeLaTranche(tranche, racine) {
  return {
    ...testsCibles({ arguments: [], force: true }),
    tranche: `${tranche.index}/${tranche.count}`,
    rapports: path.join(racine, RAPPORTS),
  };
}

function passe({ racine, demandes, env, dire, coeurs }) {
  const lu = lireLesDemandes(demandes);
  const { gardesSeules, sansTests, tranche, tout, base, args } = lu;
  // The measure against the last green, or the base given: a pass without tests needs none.
  const m =
    gardesSeules || sansTests
      ? null
      : mesure(racine, { tout, base, lot: env[BASE_DU_LOT], dans: env.TMPDIR });
  if (m) {
    dire(m.ligne);
  }
  // A complete pass plays every test for real: when its caller names a results directory
  // (`GRILLHOUSE_RESULTATS`, which the night sets for its pass, scripts/nuit.sh), it keeps the
  // registry of results test by test besides the last green, which the proof of the red reads
  // (scripts/registre-des-resultats.mjs); a pass that names none writes no registry, so the pass
  // itself opens none and its environment is unchanged.
  const complet = tout && !gardesSeules && !sansTests && !tranche && !filtre(args);
  const taches = new Set();
  try {
    // A tranche writes its reports anew.
    if (tranche) {
      for (const f of fichiersDeLaTranche(path.join(racine, RAPPORTS), tranche)) {
        rmSync(f, { force: true });
      }
    }
    const code = jouerLaPasse({
      racine,
      demandes: lu,
      args,
      tout,
      ajouts: m?.env ?? {},
      env,
      dire,
      coeurs,
      taches,
    });
    if (env[ROUGES]) {
      writeFileSync(env[ROUGES], [...taches].map(t => `${t}\t${rejeu(t)}\n`).join(''));
    }
    // A pass green on every package keeps its tree as the last green.
    poserLeVert({
      code,
      etat: m?.etat,
      args,
      env,
      garder: garderLeVert,
      partielle: Boolean(tranche) || sansTests,
    });
    // The registry of a complete pass whose caller named a results directory, from the reports of
    // every language: green, it keeps the passed tests of its branch; red on main's own branch (the
    // night, or a complete pass on main), it records as regressions the tests the registry held
    // green that turned red, with the moment they did. A red pass on a ticket's branch records none:
    // its reds are the ticket's work.
    if (complet && env[RESULTATS] && m?.etat) {
      const rapports = langageDe(racine).verdict(env[RESULTATS], racine).rapports;
      if (code === 0) {
        garderLeRegistre(m.etat, rapports);
      } else if (!m.etat.branche || m.etat.branche === m.etat.main) {
        const rouges = rapports.flatMap(r =>
          (r.tests ?? [])
            .filter(t => t.etat === 'failed')
            .map(t => ({ fichier: path.relative(racine, r.fichier), nom: t.nom }))
        );
        const quand = env.GRILLHOUSE_VERIFICATION_SORTE === 'Nuit' ? 'nuit' : 'jour';
        consignerLesRegressions(m.etat, rouges, lireLeRegistre(racine), quand);
      }
    }
    return code;
  } finally {
    m?.retirer();
  }
}

function jouerLaPasse({ racine, demandes, args, tout, ajouts, env, dire, coeurs, taches }) {
  const { gardesSeules, sansTests, tranche } = demandes;
  const { [TESTS_CIBLES]: _, [CHANGEMENTS]: __, [BASE_DU_LOT]: ___, ...propre } = env;
  // The environment of the run: measured against the last green; the moment of a complete pass,
  // which moves the hash of every task of tests, so that each plays for real; a tranche, with it.
  const cibles = tranche
    ? testsDeLaTranche(tranche, racine)
    : tout
      ? testsCibles({ arguments: [], force: true })
      : undefined;
  const borne = args.some(a => CONCURRENCE.test(a)) ? [] : [`--concurrency=${concurrence(coeurs)}`];
  // The workers of each task of tests: the cores shared between those played side by side.
  const travailleurs = travailleursDeLaPasse({
    coeurs,
    coteACote: concurrenceDemandee(args) ?? concurrence(coeurs),
    paquets: paquetsAvecTests(racine),
  });
  const e =
    gardesSeules || sansTests
      ? propre
      : {
          ...propre,
          ...ajouts,
          ...(cibles ? { [TESTS_CIBLES]: JSON.stringify(cibles) } : {}),
          [VARIABLE_TRAVAILLEURS]: String(travailleurs),
        };
  const a = [
    ...tachesDeLaPasse(demandes, controlesDuDepot(racine)),
    '--continue=dependencies-successful',
    ...borne,
    ...args,
  ];
  // The plan of the run, before it: the progress knows all its tasks.
  if (!gardesSeules && !sansTests && depotAvecTests(racine)) {
    planifier(env[AVANCEMENT], { racine, args: a, env: e });
  }
  // The run of Turborepo, and its summary.
  const runs = path.join(racine, '.turbo', 'runs');
  const existait = existsSync(runs);
  const avant = new Set(lister(runs));
  // Under the watch of the memory, which writes in its witness why it cut the run.
  const temoin = path.join(e.TMPDIR || tmpdir(), `memoire-coupee-${process.pid}`);
  rmSync(temoin, { force: true });
  const r = spawnSync(
    process.execPath,
    [GARDE_DE_LA_MEMOIRE, '--temoin', temoin, '--', 'turbo', 'run', ...a, '--summarize'],
    { cwd: racine, env: e, stdio: 'inherit' }
  );
  if (existsSync(temoin)) {
    const raison = readFileSync(temoin, 'utf8').trim();
    rmSync(temoin, { force: true });
    garderLesResumes(racine, avant, e);
    // Said to whoever reads the results of the pass: its 75 is a cut, no wait of the machine.
    if (e[RESULTATS]) {
      writeFileSync(path.join(e[RESULTATS], MEMOIRE_COUPEE), `${raison}\n`);
    }
    dire(`⛔ ${raison}`);
    return A_REPASSER;
  }
  const nouveaux = lister(runs).filter(f => !avant.has(f) && f.endsWith('.json'));
  let resume = null;
  if (nouveaux.length === 1) {
    try {
      resume = JSON.parse(readFileSync(path.join(runs, nouveaux[0]), 'utf8'));
    } catch {
      resume = null;
    }
  }
  garderLesResumes(racine, avant, e);
  if (!existait && existsSync(runs) && lister(runs).length === 0) {
    rmdirSync(runs);
  }
  if (r.status === 0) {
    return 0;
  }

  // The verdict of each task: any code but 0 is a red, named.
  const rouges = [];
  if (!Array.isArray(resume?.tasks)) {
    rouges.push(
      `rouge : Turborepo sort en ${r.status ?? r.signal}, et le résumé de la passe ne se lit pas.`
    );
  } else {
    for (const t of resume.tasks) {
      const code = t.execution?.exitCode;
      if (code === 0) {
        continue;
      }
      rouges.push(`${t.taskId} (code ${code ?? 'absent'})`);
      if (typeof code === 'number') {
        taches.add(t.taskId);
      }
    }
    if (rouges.length === 0) {
      rouges.push(`Turborepo sort en ${r.status ?? r.signal} sans tâche en échec`);
    }
  }
  for (const l of rouges) {
    dire(`⛔ ${l}`);
  }
  dire('⛔ rouge.');
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = verifier({ args: process.argv.slice(2) });
}
