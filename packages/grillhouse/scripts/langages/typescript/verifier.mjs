#!/usr/bin/env node
// `npm run verifier`: the full pass, what the integration, the queue, the continuous integration
// and the night play. Its verdict is green (0) or red (1); « à repasser » (75) only when the wait
// for the lock of the machine, or for room in the temporary directory, reaches its bound.
//
//   npx grillhouse verifier [<argument of Turborepo>…]      (npm run verifier -- --force)
//   npx grillhouse verifier --tout [<argument>…]             every test, played for real
//   npx grillhouse verifier --gardes [<argument>…]           the guards alone (the reviewer)
//
// - A pass measures itself against the last green (scripts/dernier-vert.mjs), as
//   `vitest --changed` and `jest --onlyChanged` do: the tree of the last pass green on every
//   package, kept per branch (main's for a copy that has none yet). When it counts (its commit an ancestor of HEAD), each package
//   Turborepo plays again plays the tests Vitest relates to the files changed since it, or all
//   its tests when a change lies out of Vitest's graph (scripts/langages/typescript/vitest-config/changements.mjs);
//   a package whose inputs did not move replays from Turborepo's cache, the guards play whole,
//   and so do the builds. The changes reach Vitest in a variable no hash counts
//   (`GRILLHOUSE_CHANGEMENTS`). Without a last green that counts, the pass is complete. The
//   line `↳` says which. A pass green, restricted by no filter, keeps its tree as the last green;
//   a red one keeps the last green as it was. The pass is the one that keeps it, for every language
//   of the project: it plays the tasks of every package of the graph, a crate's and a Python
//   project's beside a TypeScript package's (their `test:unit` and `typecheck`, scripts of their
//   package.json), so it is green only when every task of every language is, and no module of
//   language keeps a green of its own (scripts/dernier-vert.mjs).
// - `--tout`, and `--force` (the night, scripts/nuit.sh), play the complete pass: no measure
//   against the last green, and each task of tests played for real (the variable of the tests
//   carries the moment of the pass, `rejouer`, which no cached run holds).
// - The pass holds the lock of the machine for the heavy measure (scripts/verrou-de-machine.mjs),
//   shared by every repository of the machine: a pass that finds it held waits for the end of the
//   other measure, and says so every 30 s with who holds it. The wait bounded (60 min), the pass
//   ends at 75, « à repasser »; a lock held by an ancestor of the pass ends it at once, red (1);
//   either way without playing, the holder named. A pass in the frame's own repository is of the
//   second rank: it waits while a project's measure waits too.
// - Turborepo plays the build, then the guards (the frame's, `grillhouse:gardes`, and the
//   project's own, its root script `gardes`), the typing of each package (`typecheck`, its
//   sources and its tests, cached per package: scripts/langages/typescript/turbo-des-paquets.mjs) and the tests
//   (`test:unit`) beside each other:
//   `turbo run grillhouse:gardes gardes typecheck test:unit --continue=dependencies-successful
//   --concurrency=<n> --summarize`, each argument given after it. A red does not stop the pass:
//   every task whose prerequisites passed plays, and each red is named. <n>, the tasks side by
//   side, is half the cores of the machine, one at least (`concurrence`): each task of tests is
//   itself parallel (Vitest's workers), as make's `-j` and Bazel's `--local_cpu_resources` bound a
//   build by the machine; a `--concurrency` among the arguments replaces it.
// - The pass plays no measure of time (grillhouse-bd7): the time budget benches and the time
//   witnesses (a test file that imports `mesurerAuRepos`) are out of the day, as the night tests
//   are, and the night plays them (scripts/langages/typescript/vitest-config/cibles.mjs,
//   scripts/langages/typescript/tests-de-nuit.mjs), as Bazel leaves a test tagged `manual` out of
//   its patterns and the benchmarks of Chromium and rustc-perf leave the CI of each commit for a
//   machine at rest. The day waits for no rest: a delay past is a red (the duration reporter
//   classifies a delay of a day test as a real red), and so is a task at 75.
// - The pass plays too the format check and the lint (grillhouse-61z, grillhouse-44b.9), per
//   package: the scripts `format:check` and `lint` of each package that holds them, as its tasks
//   (`<package>#format:check`, `<package>#lint`), and the root's for its own files only, as root
//   tasks (`//#format:check`, `//#lint`), under the same `--continue`: a red lint hides no red
//   test, each red is named with its package. The CI calls the pass alone.
// - `--gardes` plays the tasks of guards and these two controls alone, `turbo run grillhouse:gardes
//   gardes format:check lint …`, the repository whole (ESLint and Prettier have no notion of a lot;
//   their cache reads again what changed), with the same verdict: what the reviewer plays on the
//   ticket's copy, the tests aside.
// - The verdict reads the exit code of each task in the summary of each run
//   (`.turbo/runs/<id>.json`), since Turborepo exits with the greatest code of its tasks (a 75
//   would hide a 1). The summary each run writes is removed, and `.turbo/runs` with it when the
//   run created it; while the pass names a results directory (`GRILLHOUSE_RESULTATS`,
//   scripts/resultats.mjs), it goes there instead, where the circuit reads it.
// - A task at 0 is green. A task at any other code, 75 included, and a summary that does not read
//   while Turborepo failed: red, code 1, each task named.
// - The progress of the pass (scripts/avancement.mjs): the directory its caller names in
//   GRILLHOUSE_AVANCEMENT (the circuit's), else one of its own, which it names beside the lock of
//   the machine it holds while it plays (`nommerLAvancement`), as the board shows its holder, and
//   removes at its end, its total kept. Before its run of Turborepo, the plan of
//   the run (`turbo run … --dry=json`) names its tasks of tests and counts done the files of those
//   Turborepo replays from its cache.
// - The red tasks: while the variable `GRILLHOUSE_ROUGES` (`ROUGES`) names a file, the pass writes
//   there, one Turborepo task id per line (`<package>#<task>`, `//#<task>` for the root), then a
//   tab and the command that replays it alone (`npx turbo run <task> --filter=<package>`), each task
//   red on its own exit code, once each; a task that did not play is none of them (its
//   prerequisite red is). Green, the file is empty. The night reads it for its bisect commands (scripts/nuit.sh), with no second
//   reading of the summaries.
// - The pass has a base of its own (scripts/mesure/base-de-passe.mjs), in the temporary
//   directory of its environment, which it sweeps first of the bases a killed pass left: every
//   run of Turborepo gets it in TMPDIR, TMP and TEMP, the root's `globalPassThroughEnv` passing
//   TMPDIR on to every task (scripts/langages/typescript/turbo-des-paquets.mjs), and the pass
//   removes it at its end, green, red or interrupted (SIGINT, SIGTERM, SIGHUP).
// - The run plays without the paths of a targeted run's tests: the variable `GRILLHOUSE_TESTS`
//   (scripts/langages/typescript/vitest-config/cibles.mjs) carries only `rejouer`, for a complete
//   pass.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  AttenteDeLaMachine,
  AVANCEMENT,
  avecLaMachineEtUnePlace,
  CHANGEMENTS,
  garderLeTotal,
  garderLeVert,
  mesure,
  nommerLAvancement,
  ouvrirAvancement,
  ouvrirBase,
  PASSE_ROUGE,
  retirerALInterruption,
  SCRIPT_DES_TESTS,
  TESTS_CIBLES,
  testsCibles,
} from '../../services-du-noyau.mjs';
import { paquets, TYPAGE } from '../../paquets.mjs';
import { controlesDuDepot, planifier } from './turbo-des-paquets.mjs';
import { garderLesResumes } from './verdict.mjs';

const GARDES = ['grillhouse:gardes', 'gardes'];
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

// The tasks a pass plays side by side on a machine of <coeurs> cores: half of them, one at least.
const concurrence = (coeurs = availableParallelism()) => Math.max(1, Math.floor(coeurs / 2));

// The full pass in <racine>, its arguments <args> (`--gardes` among them: the guards alone), under
// <env> and the lock of the machine; its verdict, 0 or 1, or 75 when the wait for the lock, or for
// room in the temporary directory, reaches its bound. `dire` writes a line; `coeurs`, the cores of the machine.
export function verifier({
  racine = process.cwd(),
  args: demandes = [],
  env = process.env,
  dire = l => process.stdout.write(`${l}\n`),
  coeurs = availableParallelism(),
}) {
  // The base of the pass, in the temporary directory of <env>: every task writes in it (TMPDIR,
  // which Turborepo passes on), and it goes at the end of the pass.
  const base = ouvrirBase('verification', { dans: env.TMPDIR || tmpdir() });
  const lacher = retirerALInterruption(base.fermer);
  try {
    return avecLaMachineEtUnePlace(
      envMachine => {
        // The progress of the pass: the directory its caller names (the circuit's), else its own,
        // named beside the lock of the machine, which it holds, while it plays.
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
            coeurs,
          });
        } finally {
          effacer();
          if (propre) {
            garderLeTotal(dossier);
            rmSync(dossier, { recursive: true, force: true });
          }
        }
      },
      { env, racine, dire }
    );
  } catch (e) {
    if (!(e instanceof AttenteDeLaMachine)) throw e;
    dire(e.message);
    return e.code;
  } finally {
    lacher();
    base.fermer();
  }
}

// Whether a package of <racine>, or its root, plays tests (a script `test:unit`).
function depotAvecTests(racine) {
  const liste = paquets(racine);
  if (liste.length === 0) {
    try {
      return Boolean(
        JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8')).scripts?.[
          SCRIPT_DES_TESTS
        ]
      );
    } catch {
      return false;
    }
  }
  return liste.some(p => !p.hors && p.pkg.scripts?.[SCRIPT_DES_TESTS]);
}

// Whether <args> hold a filter of Turborepo (`--filter=<f>`, `--filter <f>`, `-F <f>`).
const filtre = args => args.some(a => a.startsWith('--filter=') || a === '--filter' || a === '-F');

// A pass green on every package keeps its tree as the last green (`garder`): not when it is
// restricted by a filter, measured against nothing, or run after a red module (PASSE_ROUGE).
export function poserLeVert({ code, etat, args, env, garder }) {
  if (code === 0 && etat && !filtre(args) && !env[PASSE_ROUGE]) garder(etat);
}

function passe({ racine, demandes, env, dire, coeurs }) {
  const gardesSeules = demandes.includes('--gardes');
  const tout = demandes.includes('--tout') || demandes.includes('--force');
  const args = demandes.filter(a => a !== '--gardes' && a !== '--tout');
  // The measure against the last green: the guards alone need none.
  const m = gardesSeules ? null : mesure(racine, { tout, dans: env.TMPDIR });
  if (m) dire(m.ligne);
  const taches = new Set();
  try {
    const code = jouerLaPasse({
      racine,
      gardesSeules,
      args,
      tout,
      ajouts: m?.env ?? {},
      env,
      dire,
      coeurs,
      taches,
    });
    if (env[ROUGES])
      writeFileSync(env[ROUGES], [...taches].map(t => `${t}\t${rejeu(t)}\n`).join(''));
    // A pass green on every package keeps its tree as the last green.
    poserLeVert({ code, etat: m?.etat, args, env, garder: garderLeVert });
    return code;
  } finally {
    m?.retirer();
  }
}

function jouerLaPasse({ racine, gardesSeules, args, tout, ajouts, env, dire, coeurs, taches }) {
  const { [TESTS_CIBLES]: _, [CHANGEMENTS]: __, ...propre } = env;
  // The environment of the run: measured against the last green; the moment of a complete pass,
  // which moves the hash of every task of tests, so that each plays for real.
  const e = gardesSeules
    ? propre
    : {
        ...propre,
        ...ajouts,
        ...(tout
          ? { [TESTS_CIBLES]: JSON.stringify(testsCibles({ arguments: [], force: true })) }
          : {}),
      };
  const borne = args.some(a => CONCURRENCE.test(a)) ? [] : [`--concurrency=${concurrence(coeurs)}`];
  const a = [
    ...(gardesSeules ? GARDES : TACHES),
    ...controlesDuDepot(racine),
    '--continue=dependencies-successful',
    ...borne,
    ...args,
  ];
  // The plan of the run, before it: the progress knows all its tasks.
  if (!gardesSeules && depotAvecTests(racine)) {
    planifier(env[AVANCEMENT], { racine, args: a, env: e });
  }
  // The run of Turborepo, and its summary.
  const runs = path.join(racine, '.turbo', 'runs');
  const existait = existsSync(runs);
  const avant = new Set(lister(runs));
  const r = spawnSync('turbo', ['run', ...a, '--summarize'], {
    cwd: racine,
    env: e,
    stdio: 'inherit',
  });
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
  if (!existait && existsSync(runs) && lister(runs).length === 0) rmdirSync(runs);
  if (r.status === 0) return 0;

  // The verdict of each task: any code but 0 is a red, named.
  const rouges = [];
  if (!Array.isArray(resume?.tasks)) {
    rouges.push(
      `rouge : Turborepo sort en ${r.status ?? r.signal}, et le résumé de la passe ne se lit pas.`
    );
  } else {
    for (const t of resume.tasks) {
      const code = t.execution?.exitCode;
      if (code === 0) continue;
      rouges.push(`${t.taskId} (code ${code ?? 'absent'})`);
      if (typeof code === 'number') taches.add(t.taskId);
    }
    if (rouges.length === 0)
      rouges.push(`Turborepo sort en ${r.status ?? r.signal} sans tâche en échec`);
  }
  for (const l of rouges) dire(`⛔ ${l}`);
  dire('⛔ rouge.');
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = verifier({ args: process.argv.slice(2) });
}
