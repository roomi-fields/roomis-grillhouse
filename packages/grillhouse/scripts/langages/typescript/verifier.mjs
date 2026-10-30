#!/usr/bin/env node
// `npm run verifier`: the full pass, what the integration, the queue, the continuous integration
// and the night play. Its verdict is green (0), red (1) or « à repasser » (75).
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
//   a red one keeps the last green as it was.
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
// - The time witnesses play alone, as Bazel plays a test tagged `exclusive`: the pass above leaves
//   them out, then a pass of their own plays them, one task at a time, one file at a time, nothing
//   beside them: `turbo run test:unit --filter=<package>… --continue=dependencies-successful
//   --concurrency=1 --summarize`, for each package that holds one (a test file that imports
//   `mesurerAuRepos`, `fichiersTemoins` of scripts/langages/typescript/vitest-config/cibles.mjs, which receives the
//   choice in the variable of the tests, `GRILLHOUSE_TESTS`: `temoins: 'hors'`, then `'seuls'`).
//   A repository without a witness plays no such pass. So a witness is measured under no load of
//   its own pass: a load it meets comes from elsewhere on the machine.
// - A pass restricted by filters of Turborepo among the arguments (`--filter`, `-F`: the circuit's
//   final pass after a review sent back, `--filter=...[<avant>...<après>] --filter=//`,
//   scripts/circuit.mjs) plays the witnesses of the packages those filters choose alone
//   (`turbo ls <filtres> --output=json`): the pass of the witnesses carries no filter of its own
//   beside theirs, which Turborepo would join to them.
// - `--gardes` plays the two tasks of guards alone, `turbo run grillhouse:gardes gardes …`, with the
//   same verdict: what the reviewer plays on the ticket's copy, the tests aside.
// - The verdict reads the exit code of each task in the summary of each run
//   (`.turbo/runs/<id>.json`), since Turborepo exits with the greatest code of its tasks (a 75
//   would hide a 1). The summary each run writes is removed, and `.turbo/runs` with it when the
//   run created it; while the pass names a results directory (`GRILLHOUSE_RESULTATS`,
//   scripts/resultats.mjs), it goes there instead, where the circuit reads it.
// - A task at 0 is green. A task at any other code than 0 and 75, a task at 75 that other tasks
//   wait for, a summary that does not read while Turborepo failed: red, code 1, each task named, a
//   task of the witnesses' pass with « (témoins de temps) ».
// - A task at 75 (« à repasser »: every failure of its tests depended on a duration and one took
//   place under load, scripts/langages/typescript/vitest-config/duree.reporter.mjs) is played again alone, once the CPU
//   pressure is back under the threshold (scripts/mesure/pression.mjs; one line per 30 s at
//   most while it waits, with the pressure), one task after the other, in the choice of its run
//   (a task of the witnesses' pass plays its witnesses alone again):
//   `turbo run <task> --filter=<package>`, the arguments given after it, with what it depends on,
//   which passed in the pass and replays from the cache: its hash holds theirs, as in the pass.
//   Green at rest, it is green; at any code other
//   than 0 and 75, red; at 75 again (the load came back during the run), it waits and plays again.
// - The wait is bounded: 15 min after the pass. The bound reached, the verdict is 75, « à
//   repasser »: neither green nor red; whoever launched the pass presents it again later
//   (scripts/integration/integrer.mjs, scripts/integration/file.mjs, scripts/nuit.sh).
// - The progress of the pass (scripts/avancement.mjs): the directory its caller names in
//   GRILLHOUSE_AVANCEMENT (the circuit's), else one of its own, which it names beside the lock of
//   the machine while it plays (its repository, its command), as a measure out of a ticket the
//   board shows, and removes at its end, its total kept. Before its first run of Turborepo, the
//   plan of each run that plays tests (`turbo run … --dry=json`) names their tasks and counts done
//   the files of those Turborepo replays from its cache.
// - The red tasks: while the variable `GRILLHOUSE_ROUGES` (`ROUGES`) names a file, the pass writes
//   there, one Turborepo task id per line (`<package>#<task>`, `//#<task>` for the root), then a
//   tab and the command that replays it alone (`npx turbo run <task> --filter=<package>`), each task
//   red on its own exit code, a task red at rest included, once each; a task à repasser (75) is
//   none of them, nor a task that did not play (its prerequisite red is). Green or à repasser, the
//   file is empty. The night reads it for its bisect commands (scripts/nuit.sh), with no second
//   reading of the summaries.
// - The pass has a base of its own (scripts/mesure/base-de-passe.mjs), in the temporary
//   directory of its environment, which it sweeps first of the bases a killed pass left: every
//   run of Turborepo gets it in TMPDIR, which the root's `globalPassThroughEnv` passes on to every
//   task (scripts/langages/typescript/turbo-des-paquets.mjs), and the pass removes it at its end, green or red.
// - Every run plays without the paths of a targeted run's tests: the variable `GRILLHOUSE_TESTS`
//   (scripts/langages/typescript/vitest-config/cibles.mjs) carries only the choice of the witnesses (and `rejouer` for
//   a complete pass).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  A_REPASSER,
  attendreLeRepos,
  AttenteDeLaMachine,
  AVANCEMENT,
  avecLaMachine,
  BORNE_ATTENTE_MS,
  CHANGEMENTS,
  ecrireLaMesure,
  garderLeTotal,
  garderLeVert,
  lirePression,
  mesure,
  ouvrirAvancement,
  ouvrirBase,
  paquetsDeLEnveloppe,
} from '../../services-du-noyau.mjs';
import { paquets, TYPAGE } from '../../paquets.mjs';
import { planifier } from './turbo-des-paquets.mjs';
import { SCRIPT_DES_TESTS } from './script-des-tests.mjs';
import { garderLesResumes } from './verdict.mjs';
import { fichiersTemoins, VARIABLE as TESTS_CIBLES } from './vitest-config/cibles.mjs';

const GARDES = ['grillhouse:gardes', 'gardes'];
const TACHES = [...GARDES, TYPAGE, SCRIPT_DES_TESTS];
const TEMOINS = ' (témoins de temps)';
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

// The filters of Turborepo among <args> (`--filter=<f>`, `--filter <f>`, `-F <f>`) and the other
// arguments: `{ filtres, autres }`, the filters each written `--filter=<f>`.
function separerLesFiltres(args) {
  const filtres = [];
  const autres = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--filter=')) filtres.push(args[i]);
    else if ((args[i] === '--filter' || args[i] === '-F') && i + 1 < args.length)
      filtres.push(`--filter=${args[++i]}`);
    else autres.push(args[i]);
  }
  return { filtres, autres };
}

// The names of the packages of <racine> the filters <filtres> choose, as Turborepo lists them.
function paquetsChoisis(racine, filtres, env) {
  const r = spawnSync('turbo', ['ls', ...filtres, '--output=json'], {
    cwd: racine,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    return new Set(JSON.parse(r.stdout).packages.items.map(p => p.name));
  } catch {
    return null;
  }
}

// The tasks a pass plays side by side on a machine of <coeurs> cores: half of them, one at least.
const concurrence = (coeurs = availableParallelism()) => Math.max(1, Math.floor(coeurs / 2));

// <args> without a `--concurrency` (`--concurrency=<n>` or `--concurrency <n>`).
function sansConcurrence(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--concurrency') i++;
    else if (!CONCURRENCE.test(args[i])) out.push(args[i]);
  }
  return out;
}

// The filters of the packages of <racine> that hold a time witness, `--filter=<name>` each; in a
// repository without packages, none when its root holds one. Null without a witness.
function filtresDesTemoins(racine) {
  const liste = paquets(racine);
  if (liste.length === 0) return fichiersTemoins(racine).length ? [] : null;
  const noms = liste
    .filter(p => !p.hors && p.pkg.scripts?.[SCRIPT_DES_TESTS])
    .filter(p => fichiersTemoins(path.resolve(racine, p.dossier)).length > 0)
    .map(p => p.pkg.name);
  return noms.length ? noms.map(n => `--filter=${n}`) : null;
}

// The full pass in <racine>, its arguments <args> (`--gardes` among them: the guards alone), under
// <env> and the lock of the machine; its verdict, 0, 1 or 75 (the stop of the wait for the lock
// included). `dire` writes a line; `borneMs` and
// `pasMs` are the bound of the wait and the gap between two readings of the pressure; `coeurs`,
// the cores of the machine.
export function verifier({
  racine = process.cwd(),
  args: demandes = [],
  env = process.env,
  borneMs = BORNE_ATTENTE_MS,
  pasMs = 2_000,
  dire = l => process.stdout.write(`${l}\n`),
  coeurs = availableParallelism(),
}) {
  // The base of the pass, in the temporary directory of <env>: every task writes in it (TMPDIR,
  // which Turborepo passes on), and it goes at the end of the pass.
  const base = ouvrirBase('verification', { dans: env.TMPDIR || tmpdir() });
  try {
    return avecLaMachine(
      envMachine => {
        // The progress of the pass: the directory its caller names (the circuit's), else its own,
        // named beside the lock of the machine while it plays.
        const propre = !envMachine[AVANCEMENT];
        const dossier =
          envMachine[AVANCEMENT] || ouvrirAvancement({ racine, genre: 'verification' });
        const effacer =
          propre && !paquetsDeLEnveloppe(envMachine)
            ? ecrireLaMesure({
                env: envMachine,
                depot: nomDuDepot(racine),
                commande: [
                  'npm run verifier',
                  ...(demandes.length ? ['--', ...demandes] : []),
                ].join(' '),
                dossier,
              })
            : () => {};
        try {
          return passe({
            racine,
            demandes,
            env: { ...envMachine, [AVANCEMENT]: dossier, TMPDIR: base.dossier },
            borneMs,
            pasMs,
            dire,
            coeurs,
          });
        } finally {
          effacer();
          if (propre) {
            garderLeTotal(dossier, racine);
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
    base.fermer();
  }
}

// The name of the repository at <racine>: the folder of its main tree, its copies included; the
// folder of <racine> out of git.
function nomDuDepot(racine) {
  const r = spawnSync(
    'git',
    ['-C', racine, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    {
      encoding: 'utf8',
    }
  );
  return path.basename(r.status === 0 ? path.dirname(r.stdout.trim()) : path.resolve(racine));
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

function passe({ racine, demandes, env, borneMs, pasMs, dire, coeurs }) {
  const gardesSeules = demandes.includes('--gardes');
  const tout = demandes.includes('--tout') || demandes.includes('--force');
  const args = demandes.filter(a => a !== '--gardes' && a !== '--tout');
  const { filtres: filtresDeLaPasse } = separerLesFiltres(args);
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
      borneMs,
      pasMs,
      dire,
      coeurs,
      taches,
    });
    if (env[ROUGES])
      writeFileSync(env[ROUGES], [...taches].map(t => `${t}\t${rejeu(t)}\n`).join(''));
    // A pass green on every package keeps its tree as the last green.
    if (code === 0 && m?.etat && filtresDeLaPasse.length === 0) garderLeVert(m.etat);
    return code;
  } finally {
    m?.retirer();
  }
}

function jouerLaPasse({
  racine,
  gardesSeules,
  args,
  tout,
  ajouts,
  env,
  borneMs,
  pasMs,
  dire,
  coeurs,
  taches,
}) {
  const { [TESTS_CIBLES]: _, [CHANGEMENTS]: __, ...propre } = env;
  // The moment of a complete pass, which moves the hash of every task of tests: each plays for
  // real.
  const rejouer = tout ? { rejouer: new Date().toISOString() } : {};
  // The environment of a run whose tests leave the witnesses out (`hors`) or play them alone
  // (`seuls`), measured against the last green.
  const choix = temoins => ({
    ...propre,
    ...ajouts,
    [TESTS_CIBLES]: JSON.stringify({ arguments: [], temoins, ...rejouer }),
  });
  const turbo = (a, e) =>
    spawnSync('turbo', ['run', ...a], { cwd: racine, env: e, stdio: 'inherit' });
  // Each red named, then the verdict 1.
  const rouge = liste => {
    for (const r of liste) dire(`⛔ ${r}`);
    dire('⛔ rouge.');
    return 1;
  };

  // One run of Turborepo, and its summary.
  const runs = path.join(racine, '.turbo', 'runs');
  const jouer = (a, e, libelle) => {
    const existait = existsSync(runs);
    const avant = new Set(lister(runs));
    const r = turbo([...a, '--summarize'], e);
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
    return { r, resume, env: e, libelle };
  };

  const borne = args.some(a => CONCURRENCE.test(a)) ? [] : [`--concurrency=${concurrence(coeurs)}`];
  const lancements = [
    {
      a: [
        ...(gardesSeules ? GARDES : TACHES),
        '--continue=dependencies-successful',
        ...borne,
        ...args,
      ],
      e: gardesSeules ? propre : choix('hors'),
      libelle: '',
    },
  ];
  // The time witnesses, alone: in a pass restricted by filters, those of the packages they choose.
  const { filtres: filtresDeLaPasse, autres } = separerLesFiltres(args);
  let filtres = gardesSeules ? null : filtresDesTemoins(racine);
  if (filtres?.length && filtresDeLaPasse.length) {
    const choisis = paquetsChoisis(racine, filtresDeLaPasse, propre);
    if (choisis) filtres = filtres.filter(f => choisis.has(f.slice('--filter='.length)));
    if (filtres.length === 0) filtres = null;
  }
  if (filtres) {
    lancements.push({
      a: [
        SCRIPT_DES_TESTS,
        ...filtres,
        '--continue=dependencies-successful',
        '--concurrency=1',
        ...sansConcurrence(filtres.length || !filtresDeLaPasse.length ? autres : args),
      ],
      e: choix('seuls'),
      libelle: TEMOINS,
    });
  }
  // The plan of each run that plays tests, before the first: the progress knows all its tasks.
  if (!gardesSeules && depotAvecTests(racine)) {
    for (const { a, e } of lancements) planifier(env[AVANCEMENT], { racine, args: a, env: e });
  }
  const passes = [];
  for (const { a, e, libelle } of lancements) {
    if (libelle) {
      const ou = filtres.map(f => f.slice('--filter='.length)).join(', ') || 'la racine';
      dire(`⏱ témoins de temps : ${ou} ; ils jouent seuls, une tâche après l'autre.`);
    }
    passes.push(jouer(a, e, libelle));
  }
  if (passes.every(p => p.r.status === 0)) return 0;

  // The verdict of each task.
  const rouges = [];
  const aRepasser = [];
  for (const { r, resume, env: e, libelle } of passes) {
    if (r.status === 0) continue;
    if (!Array.isArray(resume?.tasks)) {
      rouges.push(
        `rouge${libelle} : Turborepo sort en ${r.status ?? r.signal}, et le résumé de la passe ne se lit pas.`
      );
      continue;
    }
    let echecs = 0;
    for (const t of resume.tasks) {
      const code = t.execution?.exitCode;
      if (code === 0) continue;
      echecs++;
      const nom = `${t.taskId}${libelle}`;
      if (code === A_REPASSER && (t.dependents ?? []).length === 0)
        aRepasser.push({ ...t, nom, env: e });
      else if (code === A_REPASSER)
        rouges.push(`${nom} à repasser, mais ${t.dependents.join(', ')} l'attendent`);
      else {
        rouges.push(`${nom} (code ${code ?? 'absent'})`);
        if (typeof code === 'number') taches.add(t.taskId);
      }
    }
    if (echecs === 0)
      rouges.push(`Turborepo sort en ${r.status ?? r.signal}${libelle} sans tâche en échec`);
  }
  if (rouges.length > 0) return rouge(rouges);

  // The tasks à repasser, each played again at rest in the choice of its run, until the bound.
  const limite = Date.now() + borneMs;
  const lire = () => lirePression(env.GRILLHOUSE_PRESSION_CPU || undefined);
  let restants = aRepasser;
  dire(
    `⏱ à repasser : ${restants.map(t => t.nom).join(', ')} ; chaque tâche se rejoue seule, au repos.`
  );
  while (restants.length > 0) {
    const suivants = [];
    for (const [i, t] of restants.entries()) {
      if (Date.now() >= limite || !attendreLeRepos({ lire, limite, pasMs, dire })) {
        const ouverts = [...suivants, ...restants.slice(i)].map(x => x.nom).join(', ');
        const borneTexte =
          borneMs >= 60_000 ? `${Math.round(borneMs / 60_000)} min` : `${borneMs / 1000} s`;
        dire(`⏱ pas de repos en ${borneTexte} : ${ouverts} ni vert ni rouge.`);
        // A task red at rest makes the pass red, whatever remains to play.
        if (rouges.length > 0) return rouge(rouges);
        dire(`⏱ à repasser (code ${A_REPASSER}).`);
        return A_REPASSER;
      }
      dire(`↻ ${t.nom} : relance au repos.`);
      const r = turbo([t.task, `--filter=${t.package}`, ...args], t.env);
      if (r.status === 0) dire(`✓ ${t.nom} vert au repos.`);
      else if (r.status === A_REPASSER) suivants.push(t);
      else {
        rouges.push(`${t.nom} rouge au repos (code ${r.status ?? r.signal})`);
        taches.add(t.taskId);
      }
    }
    restants = suivants;
  }
  if (rouges.length > 0) return rouge(rouges);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = verifier({ args: process.argv.slice(2) });
}
