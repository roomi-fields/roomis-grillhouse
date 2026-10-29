// The duration reporter of the base configuration, beside Vitest's default reporter. At the end of
// a run with failures, it reads each one:
//
// - a failure depends on a duration when it is a delay past (an error « Test timed out in <n>ms. »
//   or « Hook timed out in <n>ms. », Vitest's own message), a failure of a time budget bench (a
//   file `*.budget.test.*`, `*.budget.spec.*`), or of a test marked as a measure of time
//   (`mesurerAuRepos`, ./mesure.mjs); every other failure is a real red;
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

const DELAI = /^(Test|Hook) timed out in \d+ms\./;
const BANC = /\.budget\.(test|spec)\.(c|m)?[jt]sx?$/;

function* taches(t) {
  yield t;
  for (const c of t.tasks ?? []) yield* taches(c);
}
const fichierDe = t => {
  let x = t;
  while (x && !x.filepath) x = x.suite ?? x.file;
  return x?.filepath ?? '';
};
const nomDe = t => {
  const noms = [];
  for (let x = t; x && !x.filepath; x = x.suite) noms.unshift(x.name);
  return noms.join(' › ');
};

export default class DureeReporter {
  onInit() {
    this.debut = lirePression();
  }

  onFinished(files = [], errors = []) {
    const fin = lirePression();
    const echecs = [];
    for (const f of files) {
      for (const t of taches(f)) {
        const erreurs = t.result?.errors ?? [];
        if (t.type === 'test' ? t.result?.state === 'fail' : erreurs.length > 0) echecs.push(t);
      }
    }
    if (echecs.length === 0) return;
    const dire = l => process.stdout.write(`⏱ ${l}\n`);
    let reels = 0;
    const pressions = [];
    for (const t of echecs) {
      const fichier = fichierDe(t);
      const erreurs = t.result?.errors ?? [];
      const cause =
        t.type === 'test' && t.meta?.mesureDeTemps
          ? 'mesure de temps'
          : BANC.test(fichier)
            ? 'banc de temps'
            : erreurs.length > 0 && erreurs.every(e => DELAI.test(e.message ?? ''))
              ? 'délai dépassé'
              : null;
      if (!cause) {
        reels++;
        continue;
      }
      const debut = t.type === 'test' ? (t.meta?.pressionDebut ?? this.debut) : this.debut;
      const finT = t.type === 'test' ? (t.meta?.pressionFin ?? fin) : fin;
      pressions.push(debut, finT);
      const nom = nomDe(t);
      dire(
        `${path.relative(process.cwd(), fichier)}${nom ? ` › ${nom}` : ''} : ${cause}, pression CPU ${ecrirePression(debut)} au début, ${ecrirePression(finT)} à la fin (seuil ${SEUIL_PRESSION} %).`
      );
    }
    if (pressions.length === 0) return;
    if (reels > 0 || errors.length > 0 || process.exitCode !== 1) {
      dire('un échec ne dépend pas d’une durée : verdict de Vitest.');
      return;
    }
    const lues = pressions.filter(p => p !== null);
    if (lues.length === 0) {
      dire('pression CPU illisible (/proc/pressure/cpu) : verdict de Vitest.');
      return;
    }
    if (lues.some(p => p >= SEUIL_PRESSION)) {
      dire(
        `à repasser (code ${A_REPASSER}) : chaque échec dépend d’une durée, et au moins un a eu lieu sous charge ; ni vert ni rouge, la mesure se rejoue au repos.`
      );
      process.exitCode = A_REPASSER;
      return;
    }
    dire(`échecs de durée au repos (pression CPU sous ${SEUIL_PRESSION} %) : rouge.`);
  }
}
