#!/usr/bin/env node
// `npm run verifier`: the full pass, what the integration, the queue, the continuous integration
// and the night play. Its verdict is green (0), red (1) or « à repasser » (75).
//
//   node scripts/verifier.mjs [<argument of Turborepo>…]      (npm run verifier -- --force)
//   node scripts/verifier.mjs --gardes [<argument>…]           the guards alone (the reviewer)
//
// - The pass holds the lock of the machine for the heavy measure (scripts/verrou-de-machine.mjs),
//   shared by every repository of the machine: a pass that finds it held waits for the end of the
//   other measure, and says so.
// - Turborepo plays the build, then the guards (the frame's, `grillhouse:gardes`, and the
//   project's own, its root script `gardes`) and the tests (`test:vitest`) beside each other:
//   `turbo run grillhouse:gardes gardes test:vitest --continue=dependencies-successful
//   --concurrency=<n> --summarize`, each argument given after it. A red does not stop the pass:
//   every task whose prerequisites passed plays, and each red is named. <n>, the tasks side by
//   side, is half the cores of the machine, one at least (`concurrence`): each task of tests is
//   itself parallel (Vitest's workers), as make's `-j` and Bazel's `--local_cpu_resources` bound a
//   build by the machine; a `--concurrency` among the arguments replaces it.
// - The time witnesses play alone, as Bazel plays a test tagged `exclusive`: the pass above leaves
//   them out, then a pass of their own plays them, one task at a time, one file at a time, nothing
//   beside them: `turbo run test:vitest --filter=<package>… --continue=dependencies-successful
//   --concurrency=1 --summarize`, for each package that holds one (a test file that imports
//   `mesurerAuRepos`, `fichiersTemoins` of scripts/vitest-config/cibles.mjs, which receives the
//   choice in the variable of the tests, `GRILLHOUSE_TESTS`: `temoins: 'hors'`, then `'seuls'`).
//   A repository without a witness plays no such pass. So a witness is measured under no load of
//   its own pass: a load it meets comes from elsewhere on the machine.
// - `--gardes` plays the two tasks of guards alone, `turbo run grillhouse:gardes gardes …`, with the
//   same verdict: what the reviewer plays on the ticket's copy, the tests aside.
// - The verdict reads the exit code of each task in the summary of each run
//   (`.turbo/runs/<id>.json`), since Turborepo exits with the greatest code of its tasks (a 75
//   would hide a 1). The summary each run writes is removed, and `.turbo/runs` with it when the
//   run created it.
// - A task at 0 is green. A task at any other code than 0 and 75, a task at 75 that other tasks
//   wait for, a summary that does not read while Turborepo failed: red, code 1, each task named, a
//   task of the witnesses' pass with « (témoins de temps) ».
// - A task at 75 (« à repasser »: every failure of its tests depended on a duration and one took
//   place under load, scripts/vitest-config/duree.reporter.mjs) is played again alone, once the CPU
//   pressure is back under the threshold (scripts/vitest-config/pression.mjs; one line per 30 s at
//   most while it waits, with the pressure), one task after the other, in the choice of its run
//   (a task of the witnesses' pass plays its witnesses alone again):
//   `turbo run <task> --filter=<package>`, the arguments given after it, with what it depends on,
//   which passed in the pass and replays from the cache: its hash holds theirs, as in the pass.
//   Green at rest, it is green; at any code other
//   than 0 and 75, red; at 75 again (the load came back during the run), it waits and plays again.
// - The wait is bounded: 15 min after the pass. The bound reached, the verdict is 75, « à
//   repasser »: neither green nor red; whoever launched the pass presents it again later
//   (scripts/integration/integrer.mjs, scripts/integration/file.mjs, scripts/nuit.sh).
// - Every run plays without the paths of a targeted run's tests: the variable `GRILLHOUSE_TESTS`
//   (scripts/vitest-config/cibles.mjs) carries only the choice of the witnesses, and the pass plays
//   every test.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { paquets } from './paquets.mjs';
import { avecLaMachine } from './verrou-de-machine.mjs';
import {
  A_REPASSER,
  attendreLeRepos,
  BORNE_ATTENTE_MS,
  lirePression,
} from './vitest-config/pression.mjs';
import { fichiersTemoins, VARIABLE as TESTS_CIBLES } from './vitest-config/cibles.mjs';

const GARDES = ['grillhouse:gardes', 'gardes'];
const TACHES = [...GARDES, 'test:vitest'];
const TEMOINS = ' (témoins de temps)';
const CONCURRENCE = /^--concurrency(?:=|$)/;

const lister = dossier => (existsSync(dossier) ? readdirSync(dossier) : []);

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
    .filter(p => !p.hors && p.pkg.scripts?.['test:vitest'])
    .filter(p => fichiersTemoins(path.resolve(racine, p.dossier)).length > 0)
    .map(p => p.pkg.name);
  return noms.length ? noms.map(n => `--filter=${n}`) : null;
}

// The full pass in <racine>, its arguments <args> (`--gardes` among them: the guards alone), under
// <env> and the lock of the machine; its verdict, 0, 1 or 75. `dire` writes a line; `borneMs` and
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
  return avecLaMachine(
    envMachine => passe({ racine, demandes, env: envMachine, borneMs, pasMs, dire, coeurs }),
    { env, dire }
  );
}

function passe({ racine, demandes, env, borneMs, pasMs, dire, coeurs }) {
  const { [TESTS_CIBLES]: _, ...propre } = env;
  // The environment of a run whose tests leave the witnesses out (`hors`) or play them alone
  // (`seuls`).
  const choix = temoins => ({
    ...propre,
    [TESTS_CIBLES]: JSON.stringify({ arguments: [], temoins }),
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
      const f = path.join(runs, nouveaux[0]);
      try {
        resume = JSON.parse(readFileSync(f, 'utf8'));
      } catch {
        resume = null;
      }
      rmSync(f, { force: true });
      if (!existait && lister(runs).length === 0) rmdirSync(runs);
    }
    return { r, resume, env: e, libelle };
  };

  const gardesSeules = demandes.includes('--gardes');
  const args = demandes.filter(a => a !== '--gardes');
  const borne = args.some(a => CONCURRENCE.test(a)) ? [] : [`--concurrency=${concurrence(coeurs)}`];
  const passes = [
    jouer(
      [
        ...(gardesSeules ? GARDES : TACHES),
        '--continue=dependencies-successful',
        ...borne,
        ...args,
      ],
      gardesSeules ? propre : choix('hors'),
      ''
    ),
  ];
  // The time witnesses, alone.
  const filtres = gardesSeules ? null : filtresDesTemoins(racine);
  if (filtres) {
    const ou = filtres.map(f => f.slice('--filter='.length)).join(', ') || 'la racine';
    dire(`⏱ témoins de temps : ${ou} ; ils jouent seuls, une tâche après l'autre.`);
    passes.push(
      jouer(
        [
          'test:vitest',
          ...filtres,
          '--continue=dependencies-successful',
          '--concurrency=1',
          ...sansConcurrence(args),
        ],
        choix('seuls'),
        TEMOINS
      )
    );
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
      else rouges.push(`${nom} (code ${code ?? 'absent'})`);
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
      else rouges.push(`${t.nom} rouge au repos (code ${r.status ?? r.signal})`);
    }
    restants = suivants;
  }
  if (rouges.length > 0) return rouge(rouges);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = verifier({ args: process.argv.slice(2) });
}
