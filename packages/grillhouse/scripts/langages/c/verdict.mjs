// The verdict of a run of the module c, the demand `verdict` of the join (scripts/jointure.d.ts):
// what ./commandes.mjs left in the results directory of a pass (`GRILLHOUSE_RESULTATS`,
// scripts/resultats.mjs).
//
// - The tasks are those of the summary of the task runner (`tachesDuVerdict`,
//   scripts/taches-du-graphe.mjs), a package the cache replayed included (`code` 0, no report); a
//   task below that the summary lacks is added.
// - `<dossier>/c/<run>.json`, one per run: `{ taches, rapports }`, each task as the join types it
//   (`code` null for a task planned that did not run; `tests` true for a run of CTest), and the
//   folder of the package of each JUnit report by its file's name.
// - `<dossier>/ctest/<run>-<paquet>.xml`, the JUnit report CTest wrote (`--output-junit`), kept as
//   it is: a `testcase` by CTest test, `test_<nom>` the test of the file `tests/test_<nom>.c` of
//   the package; each file gives a report, each case a test, failed when it holds a `failure`,
//   skipped when it holds `skipped`; its message the output of the test (`system-out`), else the
//   failure's.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { tachesDuVerdict } from '../../services-du-noyau.mjs';

export const TACHES = 'c';
export const JUNIT = 'ctest';

const fichiers = (dossier, extension) =>
  existsSync(dossier)
    ? readdirSync(dossier)
        .filter(f => f.endsWith(extension))
        .sort()
    : [];
const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

const ENTITES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
// The text <t> of XML, its entities read.
const texte = t =>
  t.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    }
    return ENTITES[e] ?? m;
  });
// The attribute <nom> of the opening tag <balise>, its text, or null.
const attribut = (balise, nom) => {
  const m = new RegExp(`\\s${nom}="([^"]*)"`).exec(balise);
  return m ? texte(m[1]) : null;
};

/**
 * The cases of the JUnit report <xml> of CTest: `{ nom, etat, message }` each.
 * @param {string} xml
 */
export function casDuRapport(xml) {
  const cas = [];
  for (const c of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const corps = c[2] ?? '';
    const echec = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(corps);
    const etat = echec ? 'failed' : /<skipped\b/.test(corps) ? 'skipped' : 'passed';
    const sortie = /<system-out>([\s\S]*?)<\/system-out>/.exec(corps);
    const message = echec
      ? texte(sortie?.[1] ?? '').trim() || (attribut(echec[2], 'message') ?? '')
      : '';
    cas.push({ nom: attribut(c[1], 'name') ?? '', etat, message });
  }
  return cas;
}

// The reports of the JUnit report <xml> of the package at <dossier>, one per file of test.
function rapportsDe(xml, dossier) {
  return casDuRapport(xml).map(({ nom, etat, message }) => ({
    fichier: path.join(dossier, 'tests', `${nom}.c`),
    etat: etat === 'failed' ? 'failed' : 'passed',
    message: '',
    tests: [{ titre: nom, nom, etat, message }],
  }));
}

/**
 * The verdict the results directory <dossier> holds: `{ rapports, taches }`.
 * @param {string} dossier the results directory of a pass
 */
export function verdict(dossier) {
  const runs = fichiers(path.join(dossier, TACHES), '.json')
    .map(f => lireJson(path.join(dossier, TACHES, f)))
    .filter(Boolean);
  const dossiers = Object.assign({}, ...runs.map(r => r.rapports ?? {}));
  return {
    rapports: fichiers(path.join(dossier, JUNIT), '.xml')
      .filter(f => dossiers[f])
      .flatMap(f => rapportsDe(readFileSync(path.join(dossier, JUNIT, f), 'utf8'), dossiers[f])),
    taches: tachesDuVerdict(
      dossier,
      runs.flatMap(r => r.taches ?? [])
    ),
  };
}
