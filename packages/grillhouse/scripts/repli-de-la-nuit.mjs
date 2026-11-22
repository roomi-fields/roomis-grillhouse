// The fallback of the night of Grillhouse: the night of PC3 (scripts/nuit.sh) reads, by `gh`, the jobs
// of the day's Nuit flow, and decides tranche by tranche what PC3 plays in place of PC2, as a queue
// of agents falls back on another capacity (Buildkite) when no agent takes the job in time.
//
// - A tranche finished on PC2, green or red, is never replayed.
// - A tranche whose job has not started 60 minutes after the hour of the flow is cancelled and
//   played on PC3, on its part; a tranche started then interrupted (cancelled, a runner lost, never
//   started) counts as not played and plays whole again.
// - A tranche that runs, or waits for less than 60 minutes, stays at PC2.
// - The statement says which tranches played where: `pc2` the finished ones, `pc3` the replayed.
//
//   node repli-de-la-nuit.mjs <dépôt owner/nom> <nombre de tranches> [<identifiant du flux>]   the
//   decision as JSON, the run cancelled (`gh run cancel`) when a tranche waited too long; a run that
//   waits for its group of concurrence, with no job yet, counts every tranche as not started
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** The minutes a tranche may wait for its job to start before PC3 plays it. */
export const ATTENTE_MAX_MINUTES = 60;

const TRANCHE = /^tranches\b.*?(\d+)\)\s*$/;
// The conclusions of a job that started or was cancelled without finishing its tranche.
const INTERROMPUES = new Set(['cancelled', 'skipped', 'startup_failure']);

/**
 * The decision on the tranches of a Nuit flow.
 * @param {{ jobs: { name: string, status: string, conclusion: string | null, startedAt: string | null }[], heureDuFlux: string, maintenant: string }} o
 * `jobs` the jobs of the run as `gh run view --json jobs` gives them, `heureDuFlux` the hour the
 * flow was created, `maintenant` the present hour, both ISO.
 * @returns {{ aRejouer: number[], aAnnuler: number[], enAttente: number[], pc2: number[], pc3: number[] }}
 */
export function choisirLeRepli({ jobs, heureDuFlux, maintenant }) {
  const attente = Date.parse(maintenant) - Date.parse(heureDuFlux);
  const d = { aRejouer: [], aAnnuler: [], enAttente: [], enCours: [], rouges: [], pc2: [], pc3: [] };
  const tranches = jobs
    .map(j => ({ j, n: Number(TRANCHE.exec(j.name)?.[1]) }))
    .filter(({ n }) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a.n - b.n);
  for (const { j, n } of tranches) {
    if (j.status === 'completed') {
      if (INTERROMPUES.has(j.conclusion ?? '')) {
        d.aRejouer.push(n);
      } else {
        d.pc2.push(n);
        if (j.conclusion !== 'success') {
          d.rouges.push(n);
        }
      }
    } else if (j.startedAt || j.status === 'in_progress') {
      d.pc2.push(n);
      d.enCours.push(n);
    } else if (attente >= ATTENTE_MAX_MINUTES * 60_000) {
      d.aAnnuler.push(n);
      d.aRejouer.push(n);
    } else {
      d.enAttente.push(n);
    }
  }
  d.pc3 = [...d.aRejouer];
  return d;
}

function gh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`gh ${args.join(' ')} : ${r.stderr || r.error?.message || r.status}`);
  }
  return r.stdout;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [depot, tranches, identifiant] = process.argv.slice(2);
  const vide = { aRejouer: [], aAnnuler: [], enAttente: [], enCours: [], rouges: [], pc2: [], pc3: [] };
  try {
    const id =
      identifiant ||
      JSON.parse(
        gh(['run', 'list', '-R', depot, '--workflow', 'nuit.yml', '--limit', '1', '--json', 'databaseId'])
      )[0]?.databaseId;
    if (!id) {
      process.stdout.write(`${JSON.stringify(vide)}\n`);
    } else {
      const run = JSON.parse(
        gh(['run', 'view', String(id), '-R', depot, '--json', 'jobs,createdAt,status'])
      );
      // A run that waits for the group of concurrence has no job yet: each of its tranches is
      // a job not started.
      const jobs =
        run.jobs.length === 0 && run.status !== 'completed'
          ? Array.from({ length: Number(tranches) || 0 }, (_, i) => ({
              name: `tranches (26.x, ${i + 1})`,
              status: 'queued',
              conclusion: null,
              startedAt: null,
            }))
          : run.jobs;
      const d = choisirLeRepli({
        jobs,
        heureDuFlux: run.createdAt,
        maintenant: new Date().toISOString(),
      });
      if (d.aAnnuler.length > 0) {
        gh(['run', 'cancel', String(id), '-R', depot]);
      }
      process.stdout.write(`${JSON.stringify({ ...d, flux: id })}\n`);
    }
  } catch (e) {
    process.stderr.write(`⛔ repli de la nuit : ${e.message}\n`);
    process.exitCode = 1;
  }
}
