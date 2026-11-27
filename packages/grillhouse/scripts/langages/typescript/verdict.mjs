// The verdict of a run of the module typescript, the third demand of the join
// (scripts/jointure.d.ts, `verdict`): what a run of Turborepo and of Vitest left in the results
// directory of a pass (`GRILLHOUSE_RESULTATS`, scripts/resultats.mjs; packages/grillhouse/docs/architecture/tests.md
// §3.3).
//
// - The summary of a run of Turborepo (./resume-du-lanceur.mjs): `lireLesResumes` gives each task.
// - The JSON report of Vitest, which the frame's base configuration writes under
//   `<dossier>/vitest/` while the variable is set (scripts/langages/typescript/vitest-config/resultats.mjs):
//   `lireRapportsVitest` gives each test file, its status, the message of a file that does not
//   load, and each test, its title, its full name, its status and its first message.
// - The log of a task of tests whose package has no report (./rapports-aux-lignes.mjs, a runner
//   without a report test by test), read from the root of the run.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { A_REPASSER } from '../../services-du-noyau.mjs';
import { rapportsAuxLignes } from './rapports-aux-lignes.mjs';
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

// The reports the logs of the tasks <taches> give, from the root <racine> of their run: those of
// each task of tests that ran, not « à repasser », whose package has none among <rapports>.
function rapportsDesJournaux(racine, taches, rapports) {
  return taches
    .filter(t => t.tests && t.journal && t.code !== null && t.code !== A_REPASSER)
    .flatMap(t => {
      const paquet = path.join(racine, t.dossier, path.sep);
      const journal = path.join(racine, t.journal);
      return !existsSync(journal) || rapports.some(r => r.fichier.startsWith(paquet))
        ? []
        : rapportsAuxLignes(stripVTControlCharacters(readFileSync(journal, 'utf8')), {
            dossier: paquet,
            code: t.code,
          });
    });
}

// The verdict the results directory <dossier> holds: `{ rapports, taches }`; with the root
// <racine> of the run, the reports its logs give too.
export function verdict(dossier, racine) {
  const rapports = lireRapportsVitest(dossier);
  const taches = lireLesResumes(dossier);
  const auxLignes = racine ? rapportsDesJournaux(racine, taches, rapports) : [];
  return { rapports: [...rapports, ...auxLignes], taches };
}
