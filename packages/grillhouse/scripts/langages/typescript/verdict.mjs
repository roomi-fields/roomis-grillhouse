// The verdict of a run of the module typescript, the third demand of the join
// (scripts/jointure.d.ts, `verdict`): what a run of Turborepo and of Vitest left in the results
// directory of a pass (`GRILLHOUSE_RESULTATS`, scripts/resultats.mjs).
//
// - The summary of a run of Turborepo (`turbo run … --summarize`, `.turbo/runs/<id>.json`):
//   `garderLesResumes` moves the summaries a run wrote into `<dossier>/turbo/`, and `lireResumes`
//   gives each task, its package and directory, its script, its exit code, its cache status and
//   its log file (from the root).
// - The JSON report of Vitest, which the frame's base configuration writes under
//   `<dossier>/vitest/` while the variable is set (scripts/langages/typescript/vitest-config/resultats.mjs):
//   `lireRapportsVitest` gives each test file, its status, the message of a file that does not
//   load, and each test, its title, its full name, its status and its first message.
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
import { VITEST } from './vitest-config/resultats.mjs';

const TURBO = 'turbo';

const fichiers = (dossier, extension) =>
  existsSync(dossier)
    ? readdirSync(dossier)
        .filter(f => f.endsWith(extension))
        .sort()
        .map(f => path.join(dossier, f))
    : [];
const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// Moves the summaries of Turborepo that a run in <racine> wrote (`.turbo/runs/*.json` absent from
// <avant>, the names there before it) into the results directory <env> names; removes them
// without it. `.turbo/runs` goes too when the run created it (<avant> empty) and it is left empty.
export function garderLesResumes(racine, avant, env = process.env) {
  const runs = path.join(racine, '.turbo', 'runs');
  const neufs = (existsSync(runs) ? readdirSync(runs) : []).filter(
    f => !avant.has(f) && f.endsWith('.json')
  );
  const dossier = env[RESULTATS];
  for (const f of neufs) {
    if (dossier) {
      mkdirSync(path.join(dossier, TURBO), { recursive: true });
      // The results directory may lie on another file system: a copy, then the removal.
      copyFileSync(path.join(runs, f), path.join(dossier, TURBO, f));
      rmSync(path.join(runs, f), { force: true });
    } else rmSync(path.join(runs, f), { force: true });
  }
  if (neufs.length && !avant.size && existsSync(runs) && readdirSync(runs).length === 0) {
    rmdirSync(runs);
  }
}

// The tasks of the summaries of Turborepo under the results directory <dossier>, in their order:
// `{ tache, paquet, dossier, script, code, cache, journal }`, `dossier` « . » for the root,
// `code` null for a task that did not run.
export function lireResumes(dossier) {
  return fichiers(path.join(dossier, TURBO), '.json').flatMap(f =>
    (lireJson(f)?.tasks ?? []).map(t => ({
      tache: t.taskId,
      paquet: t.package,
      dossier: t.directory || '.',
      script: t.task,
      code: t.execution?.exitCode ?? null,
      cache: t.cache?.status ?? null,
      journal: t.logFile ?? null,
    }))
  );
}

// The test files of the reports of Vitest under the results directory <dossier>: `{ fichier,
// etat, message, tests }`, `fichier` its absolute path, each test `{ titre, nom, etat, message }`.
export function lireRapportsVitest(dossier) {
  return fichiers(path.join(dossier, VITEST), '.json').flatMap(f =>
    (lireJson(f)?.testResults ?? []).map(r => ({
      fichier: r.name,
      etat: r.status,
      message: String(r.message ?? ''),
      tests: (r.assertionResults ?? []).map(a => ({
        titre: a.title,
        nom: a.fullName || a.title,
        etat: a.status,
        message: String(a.failureMessages?.[0] ?? ''),
      })),
    }))
  );
}

// The verdict the results directory <dossier> holds: `{ rapports, taches }`.
export function verdict(dossier) {
  return { rapports: lireRapportsVitest(dossier), taches: lireResumes(dossier) };
}
