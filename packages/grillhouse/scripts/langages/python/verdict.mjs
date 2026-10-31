// The verdict of a run of the module python, the demand `verdict` of the join
// (scripts/jointure.d.ts): what ./commandes.mjs left in the results directory of a pass
// (`GRILLHOUSE_RESULTATS`, scripts/resultats.mjs).
//
// - `<dossier>/python/<run>.json`, one per run: `{ taches, rapports }`, each task as the join types
//   it (`code` null for a task planned that did not run; `tests` true for a run of pytest), and the
//   folder of the package of each JUnit report by its file's name.
// - `<dossier>/pytest/<run>-<paquet>.xml`, the JUnit report of each run of pytest, in the family
//   `xunit1`, whose `testcase` names its file (`file`, from the package's folder): each file gives
//   a test file, each `testcase` a test, failed when it holds a `failure` or an `error`, skipped
//   when it holds `skipped`; its message, the failure's.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const TACHES = 'python';
export const JUNIT = 'pytest';

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

// The test files of the JUnit report <xml> of the package at <dossier>.
function rapportsDe(xml, dossier) {
  const parFichier = new Map();
  for (const c of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const corps = c[2] ?? '';
    const echec = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(corps);
    const etat = echec ? 'failed' : /<skipped\b/.test(corps) ? 'skipped' : 'passed';
    const message = echec ? (attribut(echec[2], 'message') ?? texte(echec[3] ?? '')) : '';
    const titre = attribut(c[1], 'name') ?? '';
    const fichier = path.resolve(dossier, attribut(c[1], 'file') ?? '');
    if (!parFichier.has(fichier)) {
      parFichier.set(fichier, []);
    }
    parFichier.get(fichier).push({ titre, nom: titre, etat, message });
  }
  return [...parFichier].map(([fichier, tests]) => ({
    fichier,
    etat: tests.some(t => t.etat === 'failed') ? 'failed' : 'passed',
    message: '',
    tests,
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
    taches: runs.flatMap(r => r.taches ?? []),
  };
}
