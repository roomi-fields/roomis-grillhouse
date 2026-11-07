// The classification of the duration reporter (./duree.reporter.mjs), a pure function: it takes
// data (the tasks of the run, the errors outside the tests, the CPU pressures at the start and at
// the end, Vitest's exit code, and per file its size label, whether it is out of the day and
// whether it is a time budget bench, by the rules of ./cibles.mjs) and
// never reads the disk nor the global state. The reporter reads those, calls `classer`, writes the
// lines and sets the exit code.
//
// A failure depends on a duration when it is a failure of a time budget bench (a file
// `*.budget.test.*`, `*.budget.spec.*`), of a test marked as a measure of time (`mesurerAuRepos`),
// or a delay past (« Test timed out in <n>ms. », « Hook timed out in <n>ms. ») in a file out of the
// day; every other failure is a real red, a delay past in a day test included.
//
// The verdict is `a-repasser` when every failure depends on a duration and at least one took place
// under load (pressure at or above the threshold at the start or at the end); `rouge` when they
// all took place at rest; `vitest` (Vitest's verdict stands) when a failure is real, an error is
// outside the tests, Vitest's code is not 1, or no pressure reads; no pressure measured at all
// (no failure of duration) gives no line of conclusion.
import { A_REPASSER, SEUIL_PRESSION } from '../../../services-du-noyau.mjs';

const DELAI = /^(Test|Hook) timed out in \d+ms\./;

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

/**
 * @param {{ files?: any[], errors?: unknown[], debut: number | null, fin: number | null,
 *   codeDeSortie: number | undefined, fichiers: Record<string, { horsDuJour: boolean, banc?: boolean, libelleDelai: string }> }} entree
 */
export function classer({ files = [], errors = [], debut, fin, codeDeSortie, fichiers }) {
  const echecs = [];
  for (const f of files) {
    for (const t of taches(f)) {
      const erreurs = t.result?.errors ?? [];
      if (t.type === 'test' ? t.result?.state !== 'fail' : erreurs.length === 0) continue;
      const fichier = fichierDe(t);
      const info = fichiers[fichier];
      const delaiDepasse = erreurs.length > 0 && erreurs.every(e => DELAI.test(e.message ?? ''));
      const cause =
        t.type === 'test' && t.meta?.mesureDeTemps
          ? 'mesure de temps'
          : info?.banc
            ? 'banc de temps'
            : delaiDepasse && info?.horsDuJour
              ? 'délai dépassé'
              : 'réel';
      echecs.push({
        fichier,
        nom: nomDe(t),
        cause,
        delai: delaiDepasse ? (info?.libelleDelai ?? null) : null,
        pressionDebut: t.type === 'test' ? (t.meta?.pressionDebut ?? debut) : debut,
        pressionFin: t.type === 'test' ? (t.meta?.pressionFin ?? fin) : fin,
      });
    }
  }
  const dependants = echecs.filter(e => e.cause !== 'réel');
  if (dependants.length === 0) {
    // No failure of duration: no pressure measured, so no line of conclusion.
    return { echecs, verdict: 'vitest', conclusion: null };
  }
  if (dependants.length < echecs.length || errors.length > 0 || codeDeSortie !== 1) {
    return {
      echecs,
      verdict: 'vitest',
      conclusion: 'un échec ne dépend pas d’une durée : verdict de Vitest.',
    };
  }
  const lues = dependants.flatMap(e => [e.pressionDebut, e.pressionFin]).filter(p => p !== null);
  if (lues.length === 0) {
    return {
      echecs,
      verdict: 'vitest',
      conclusion: 'pression CPU illisible (/proc/pressure/cpu) : verdict de Vitest.',
    };
  }
  if (lues.some(p => p >= SEUIL_PRESSION)) {
    return {
      echecs,
      verdict: 'a-repasser',
      conclusion: `à repasser (code ${A_REPASSER}) : chaque échec dépend d’une durée, et au moins un a eu lieu sous charge ; ni vert ni rouge, la mesure se rejoue au repos.`,
    };
  }
  return {
    echecs,
    verdict: 'rouge',
    conclusion: `échecs de durée au repos (pression CPU sous ${SEUIL_PRESSION} %) : rouge.`,
  };
}
