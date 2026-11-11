// The verdict of a run of the module typescript, the third demand of the join
// (scripts/jointure.d.ts, `verdict`): what a run of Turborepo and of Vitest left in the results
// directory of a pass (`GRILLHOUSE_RESULTATS`, scripts/resultats.mjs).
//
// - The summary of a run of Turborepo (./resume-du-lanceur.mjs): `lireLesResumes` gives each task.
// - The JSON report of Vitest, which the frame's base configuration writes under
//   `<dossier>/vitest/` while the variable is set (scripts/langages/typescript/vitest-config/resultats.mjs):
//   `lireRapportsVitest` gives each test file, its status, the message of a file that does not
//   load, and each test, its title, its full name, its status and its first message.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { lireLesResumes } from './resume-du-lanceur.mjs';
import { VITEST } from './vitest-config/resultats.mjs';

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
  return { rapports: lireRapportsVitest(dossier), taches: lireLesResumes(dossier) };
}
