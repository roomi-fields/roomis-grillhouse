// The duration reporter of the base configuration, beside Vitest's default reporter; a project
// names it by its published entry, `@roomi-fields/grillhouse/vitest-config/duree`
// (`--reporter=<entry>`, or `reporters` in a configuration; types ./duree.reporter.d.ts). At the end
// of a run with failures, it reads each one:
//
// - a failure depends on a duration when it is a failure of a time budget bench (a file
//   `*.budget.test.*`, `*.budget.spec.*`), of a test marked as a measure of time (`mesurerAuRepos`,
//   ./mesure.mjs), or a delay past (an error « Test timed out in <n>ms. » or « Hook timed out in
//   <n>ms. », Vitest's own message) in a file out of the day (a night test, a bench, a time
//   witness: `estHorsDuJour` of ./cibles.mjs); every other failure is a real red, a delay past in
//   a day test included: a delay of the day is a safeguard, not a measure, as in Bazel and Vitest
//   (grillhouse-bd7), and one too tight widens, far above the test's usual duration;
// - it took place under load when the CPU pressure (./pression.mjs) was at or above the threshold
//   at the start or at the end of the test (noted by ./mesure.setup.mjs), or, for a hook or a file
//   that fails outside of a test, at the start or at the end of the run.
//
// When every failure depends on a duration and at least one took place under load, the run is
// « à repasser »: the exit code becomes 75 (it runs after Vitest set 1, and replaces it). Else
// Vitest's code stands: a real red, a duration past at rest, an error outside the tests, a pressure
// that does not read. Each failure of duration is written with the pressure measured and the
// threshold; a pressure that does not read is said, « pression CPU illisible ».
import path from 'node:path';
import {
  A_REPASSER,
  ecrirePression,
  lirePression,
  SEUIL_PRESSION,
} from '../../../services-du-noyau.mjs';
import { estHorsDuJour, estUnBanc } from './cibles.mjs';
import { classer } from './duree.classement.mjs';
import { delaisSurLeDisque, libelleDuDelai } from './delais.mjs';

function aUnEchec(t) {
  if (t.type === 'test' ? t.result?.state === 'fail' : (t.result?.errors ?? []).length > 0) {
    return true;
  }
  return (t.tasks ?? []).some(aUnEchec);
}

// The 20 slowest files of the run, slowest first, each with its share of the total time.
const PLUS_LENTS = 20;
function plusLents(files, dire) {
  const duree = f => f.result?.duration ?? 0;
  const total = files.reduce((s, f) => s + duree(f), 0);
  if (total <= 0) {
    return;
  }
  const lents = [...files].sort((a, b) => duree(b) - duree(a)).slice(0, PLUS_LENTS);
  dire(
    `${lents.length === 1 ? '1 fichier le plus lent' : `${lents.length} fichiers les plus lents`} (part du temps total, ${Math.round(total)} ms) :`
  );
  for (const f of lents) {
    const part = ((100 * duree(f)) / total).toFixed(1);
    dire(
      `${part.padStart(5)} % ${Math.round(duree(f))} ms ${path.relative(process.cwd(), f.filepath)}`
    );
  }
}

export default class DureeReporter {
  onInit() {
    this.debut = lirePression();
  }

  onFinished(files = [], errors = []) {
    const fin = lirePression();
    const dire = l => process.stdout.write(`⏱ ${l}\n`);
    plusLents(files, dire);
    const fichiers = {};
    for (const f of files) {
      if (!aUnEchec(f) || f.filepath in fichiers) {
        continue;
      }
      fichiers[f.filepath] = {
        horsDuJour: estHorsDuJour(f.filepath),
        banc: estUnBanc(f.filepath),
        libelleDelai: libelleDuDelai(delaisSurLeDisque(f.filepath).taille),
      };
    }
    const { echecs, verdict, conclusion } = classer({
      files,
      errors,
      debut: this.debut,
      fin,
      codeDeSortie: process.exitCode,
      fichiers,
    });
    for (const e of echecs) {
      const nom = path.relative(process.cwd(), e.fichier) + (e.nom ? ` › ${e.nom}` : '');
      const delai = e.delai ? ` (${e.delai})` : '';
      if (e.cause === 'réel') {
        if (e.delai) {
          dire(`${nom} : délai dépassé${delai}.`);
        }
        continue;
      }
      dire(
        `${nom} : ${e.cause}${delai}, pression CPU ${ecrirePression(e.pressionDebut)} au début, ${ecrirePression(e.pressionFin)} à la fin (seuil ${SEUIL_PRESSION} %).`
      );
    }
    if (conclusion) {
      dire(conclusion);
    }
    if (verdict === 'a-repasser') {
      process.exitCode = A_REPASSER;
    }
  }
}
