#!/usr/bin/env node
// `npm run verifier`: the full pass, what the integration, the queue, the continuous integration
// and the night play. Its verdict is green (0), red (1) or « à repasser » (75).
//
//   node scripts/verifier.mjs [<argument of Turborepo>…]      (npm run verifier -- --force)
//
// - Turborepo plays the build, then the guards (the frame's, `grillhouse:gardes`, and the
//   project's own, its root script `gardes`) and the tests (`test:vitest`) beside each other:
//   `turbo run grillhouse:gardes gardes test:vitest --continue=dependencies-successful
//   --summarize`, each argument given after it. A red does not stop the pass: every task whose
//   prerequisites passed plays, and each red is named.
// - The verdict reads the exit code of each task in the run's summary (`.turbo/runs/<id>.json`),
//   since Turborepo exits with the greatest code of its tasks (a 75 would hide a 1). The summary
//   this run writes is removed, and `.turbo/runs` with it when the run created it.
// - A task at 0 is green. A task at any other code than 0 and 75, a task at 75 that other tasks
//   wait for, a summary that does not read while Turborepo failed: red, code 1, each task named.
// - A task at 75 (« à repasser »: every failure of its tests depended on a duration and one took
//   place under load, scripts/vitest-config/duree.reporter.mjs) is played again alone, once the CPU
//   pressure is back under the threshold (scripts/vitest-config/pression.mjs; one line per 30 s at
//   most while it waits, with the pressure), one task after the other:
//   `turbo run <task> --filter=<package> --only`, the arguments given after it (its prerequisites
//   passed in the pass, `--only` plays it alone). Green at rest, it is green; at any code other
//   than 0 and 75, red; at 75 again (the load came back during the run), it waits and plays again.
// - The wait is bounded: 15 min after the pass. The bound reached, the verdict is 75, « à
//   repasser »: neither green nor red; whoever launched the pass presents it again later
//   (scripts/integration/integrer.mjs, scripts/integration/file.mjs, scripts/nuit.sh).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  A_REPASSER,
  attendreLeRepos,
  BORNE_ATTENTE_MS,
  lirePression,
} from './vitest-config/pression.mjs';

const TACHES = ['grillhouse:gardes', 'gardes', 'test:vitest'];

const lister = dossier => (existsSync(dossier) ? readdirSync(dossier) : []);

// The full pass in <racine>, its arguments <args>, under <env>; its verdict, 0, 1 or 75. `dire`
// writes a line; `borneMs` and `pasMs` are the bound of the wait and the gap between two readings
// of the pressure.
export function verifier({
  racine = process.cwd(),
  args = [],
  env = process.env,
  borneMs = BORNE_ATTENTE_MS,
  pasMs = 2_000,
  dire = l => process.stdout.write(`${l}\n`),
}) {
  const turbo = a => spawnSync('turbo', ['run', ...a], { cwd: racine, env, stdio: 'inherit' });
  // Each red named, then the verdict 1.
  const rouge = liste => {
    for (const r of liste) dire(`⛔ ${r}`);
    dire('⛔ rouge.');
    return 1;
  };

  // The pass, and its summary.
  const runs = path.join(racine, '.turbo', 'runs');
  const existait = existsSync(runs);
  const avant = new Set(lister(runs));
  const passe = turbo([...TACHES, '--continue=dependencies-successful', '--summarize', ...args]);
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
  if (passe.status === 0) return 0;
  if (!Array.isArray(resume?.tasks)) {
    dire(
      `⛔ rouge : Turborepo sort en ${passe.status ?? passe.signal}, et le résumé de la passe ne se lit pas.`
    );
    return 1;
  }

  // The verdict of each task.
  const rouges = [];
  const aRepasser = [];
  for (const t of resume.tasks) {
    const code = t.execution?.exitCode;
    if (code === 0) continue;
    if (code === A_REPASSER && (t.dependents ?? []).length === 0) aRepasser.push(t);
    else if (code === A_REPASSER)
      rouges.push(`${t.taskId} à repasser, mais ${t.dependents.join(', ')} l'attendent`);
    else rouges.push(`${t.taskId} (code ${code ?? 'absent'})`);
  }
  if (rouges.length === 0 && aRepasser.length === 0)
    rouges.push(`Turborepo sort en ${passe.status ?? passe.signal} sans tâche en échec`);
  if (rouges.length > 0) return rouge(rouges);

  // The tasks à repasser, each played again at rest, until the bound.
  const limite = Date.now() + borneMs;
  const lire = () => lirePression(env.GRILLHOUSE_PRESSION_CPU || undefined);
  let restants = aRepasser;
  dire(
    `⏱ à repasser : ${restants.map(t => t.taskId).join(', ')} ; chaque tâche se rejoue seule, au repos.`
  );
  while (restants.length > 0) {
    const suivants = [];
    for (const [i, t] of restants.entries()) {
      if (Date.now() >= limite || !attendreLeRepos({ lire, limite, pasMs, dire })) {
        const ouverts = [...suivants, ...restants.slice(i)].map(x => x.taskId).join(', ');
        const borne =
          borneMs >= 60_000 ? `${Math.round(borneMs / 60_000)} min` : `${borneMs / 1000} s`;
        dire(`⏱ pas de repos en ${borne} : ${ouverts} ni vert ni rouge.`);
        // A task red at rest makes the pass red, whatever remains to play.
        if (rouges.length > 0) return rouge(rouges);
        dire(`⏱ à repasser (code ${A_REPASSER}).`);
        return A_REPASSER;
      }
      dire(`↻ ${t.taskId} : relance au repos.`);
      const r = turbo([t.task, `--filter=${t.package}`, '--only', ...args]);
      if (r.status === 0) dire(`✓ ${t.taskId} vert au repos.`);
      else if (r.status === A_REPASSER) suivants.push(t);
      else rouges.push(`${t.taskId} rouge au repos (code ${r.status ?? r.signal})`);
    }
    restants = suivants;
  }
  if (rouges.length > 0) return rouge(rouges);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(verifier({ args: process.argv.slice(2) }));
}
