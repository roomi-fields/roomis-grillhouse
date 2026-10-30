// The verdict of a run of the module cargo, the demand `verdict` of the join
// (scripts/jointure.d.ts): what ./commandes.mjs left in the results directory of a pass
// (`GRILLHOUSE_RESULTATS`, scripts/resultats.mjs).
//
// - `<dossier>/cargo/<run>.json`, one per run: `{ taches, cibles }`, each task as the join types
//   it (`code` null for a task planned that did not run; `tests` true for the runs of nextest and
//   of the doctests), and the file of each test binary of nextest by its id (`ws-core`,
//   `ws-core::integ`, `ws-core::bin/outil`), its target's source.
// - `<dossier>/nextest/<run>-<crate>.xml`, the JUnit report of each run of nextest: each
//   `testsuite`, a test binary, gives a test file, each `testcase` a test, failed when it holds a
//   `failure` or an `error`, skipped when it holds `skipped`; its message, the failure's.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const TACHES = 'cargo';
export const JUNIT = 'nextest';

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

// The test files of the JUnit report <xml>, each binary's file read in <cibles>.
function rapportsDe(xml, cibles) {
  const out = [];
  for (const s of xml.matchAll(/<testsuite\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testsuite>)/g)) {
    const nom = attribut(s[1], 'name') ?? '';
    const tests = [];
    for (const c of (s[2] ?? '').matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
      const corps = c[2] ?? '';
      const echec = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(corps);
      const etat = echec ? 'failed' : /<skipped\b/.test(corps) ? 'skipped' : 'passed';
      const message = echec ? (attribut(echec[2], 'message') ?? texte(echec[3] ?? '')) : '';
      const titre = attribut(c[1], 'name') ?? '';
      tests.push({ titre, nom: titre, etat, message });
    }
    out.push({
      fichier: cibles[nom] ?? nom,
      etat: tests.some(t => t.etat === 'failed') ? 'failed' : 'passed',
      message: '',
      tests,
    });
  }
  return out;
}

/**
 * The verdict the results directory <dossier> holds: `{ rapports, taches }`.
 * @param {string} dossier the results directory of a pass
 */
export function verdict(dossier) {
  const runs = fichiers(path.join(dossier, TACHES), '.json').map(lireJson).filter(Boolean);
  const cibles = Object.assign({}, ...runs.map(r => r.cibles ?? {}));
  return {
    rapports: fichiers(path.join(dossier, JUNIT), '.xml').flatMap(f =>
      rapportsDe(readFileSync(f, 'utf8'), cibles)
    ),
    taches: runs.flatMap(r => r.taches ?? []),
  };
}
