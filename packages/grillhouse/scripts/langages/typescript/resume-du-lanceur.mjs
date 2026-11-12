// The summary of a run of Turborepo (`turbo run … --summarize`, `.turbo/runs/<id>.json`), read and
// kept once, here: the module typescript drives Turborepo, and the join serves these members to the
// modules cargo and python through the services of the core (`tachesDuVerdict`,
// scripts/taches-du-graphe.mjs).
//
// - `resumesDuLancement` names the summaries present in a project before a run.
// - `garderLesResumes` moves the summaries a run wrote into `<dossier>/turbo/`, the results
//   directory (`GRILLHOUSE_RESULTATS`, scripts/resultats.mjs) its environment names, or removes
//   them without one, and gives each of their tasks with its exit code.
// - `lireLesResumes` gives each task of those summaries, its package and directory, its script,
//   its exit code, its cache status and its log file (from the root), and whether it plays the
//   tests of its package (`test:unit`).
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { RESULTATS } from '../../resultats.mjs';
import { SCRIPT_DES_TESTS } from '../../services-du-noyau.mjs';

const TURBO = 'turbo';

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// The names of the summaries of <racine> before a run; none without `.turbo/runs`.
export function resumesDuLancement(racine) {
  const runs = path.join(racine, '.turbo', 'runs');
  return new Set(existsSync(runs) ? readdirSync(runs) : []);
}

// Moves the summaries that a run in <racine> wrote (`.turbo/runs/*.json` absent from <avant>, the
// names there before it) into the results directory <env> names; removes them without it.
// `.turbo/runs` goes too when the run created it (<avant> empty) and it is left empty. Gives each
// task of those summaries, `{ tache, code }`, `code` null for a task that did not run.
export function garderLesResumes(racine, avant, env = process.env) {
  const runs = path.join(racine, '.turbo', 'runs');
  const neufs = (existsSync(runs) ? readdirSync(runs) : []).filter(
    f => !avant.has(f) && f.endsWith('.json')
  );
  const dossier = env[RESULTATS];
  const taches = [];
  for (const f of neufs) {
    for (const t of lireJson(path.join(runs, f))?.tasks ?? []) {
      taches.push({ tache: t.taskId, code: t.execution?.exitCode ?? null });
    }
    if (dossier) {
      mkdirSync(path.join(dossier, TURBO), { recursive: true });
      // The results directory may lie on another file system: a copy, then the removal.
      copyFileSync(path.join(runs, f), path.join(dossier, TURBO, f));
    }
    rmSync(path.join(runs, f), { force: true });
  }
  if (neufs.length && !avant.size && existsSync(runs) && readdirSync(runs).length === 0) {
    rmdirSync(runs);
  }
  return taches;
}

// The tasks of the summaries under the results directory <dossier>, in their order:
// `{ tache, paquet, dossier, script, tests, code, cache, journal }`, `dossier` « . » for the root,
// `code` null for a task that did not run.
export function lireLesResumes(dossier) {
  const d = path.join(dossier, TURBO);
  const fichiers = existsSync(d)
    ? readdirSync(d)
        .filter(f => f.endsWith('.json'))
        .sort()
    : [];
  return fichiers.flatMap(f =>
    (lireJson(path.join(d, f))?.tasks ?? []).map(t => ({
      tache: t.taskId,
      paquet: t.package,
      dossier: t.directory || '.',
      script: t.task,
      tests: t.task === SCRIPT_DES_TESTS,
      code: t.execution?.exitCode ?? null,
      cache: t.cache?.status ?? null,
      journal: t.logFile ?? null,
    }))
  );
}
