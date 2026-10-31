// The verdict of a run of the module cargo, the demand `verdict` of the join
// (scripts/jointure.d.ts): what ./commandes.mjs left in the results directory of a pass
// (`GRILLHOUSE_RESULTATS`, scripts/resultats.mjs).
//
// - `<dossier>/cargo/<run>.json`, one per run: `{ taches, cibles }`, each task as the join types
//   it (`code` null for a task planned that did not run; `tests` true for the runs of nextest and
//   of the doctests; `journal`, from the root, the log of the task `build`, the build of a crate's
//   test targets, which the circuit reads for a failed build), and the file of each test binary of nextest by its id (`ws-core`,
//   `ws-core::integ`, `ws-core::bin/outil`), its target's source.
// - `<dossier>/nextest/<run>-<crate>.xml`, the JUnit report of each run of nextest: each
//   `testsuite`, a test binary, gives a test file, each `testcase` a test, failed when it holds a
//   `failure` or an `error`, skipped when it holds `skipped`; its message, the failure's. A unit
//   test of a module `tests` that lives in a file of its own (`server::tests::relais`, in
//   `src/server/tests.rs` beside the library's root, grillhouse-agr) gives that file, so that the
//   proof of the red finds the result of a new tests.rs.
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

// The file of the unit test <nom> (its module path, `server::tests::relais`) of the binary whose
// root is <racine>: the file of its module `tests` that exists, as rustc finds a module's file
// from its crate root's folder — `server/tests.rs` or `server/tests/mod.rs`, a module under it
// `server/tests/<m>.rs` or `server/tests/<m>/mod.rs`, the deepest first; <racine> for a test of
// no such file (an inline module).
function fichierDuTest(racine, nom) {
  const parts = nom.split('::').slice(0, -1);
  const k = parts.indexOf('tests');
  if (k < 0) {
    return racine;
  }
  const dossier = path.join(path.dirname(racine), ...parts.slice(0, k), 'tests');
  const sous = parts.slice(k + 1);
  for (let j = sous.length; j >= 0; j--) {
    const d = path.join(dossier, ...sous.slice(0, j));
    const candidats = [`${d}.rs`, path.join(d, 'mod.rs')];
    const trouve = candidats.find(f => existsSync(f));
    if (trouve) {
      return trouve;
    }
  }
  return racine;
}

// The test files of the JUnit report <xml>, each binary's file read in <cibles>, each unit test
// under its own file (`fichierDuTest`).
function rapportsDe(xml, cibles) {
  const out = [];
  for (const s of xml.matchAll(/<testsuite\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testsuite>)/g)) {
    const nom = attribut(s[1], 'name') ?? '';
    const racine = cibles[nom] ?? nom;
    const parFichier = new Map([[racine, []]]);
    for (const c of (s[2] ?? '').matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
      const corps = c[2] ?? '';
      const echec = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(corps);
      const etat = echec ? 'failed' : /<skipped\b/.test(corps) ? 'skipped' : 'passed';
      const message = echec ? (attribut(echec[2], 'message') ?? texte(echec[3] ?? '')) : '';
      const titre = attribut(c[1], 'name') ?? '';
      const test = { titre, nom: titre, etat, message };
      const fichier = cibles[nom] ? fichierDuTest(racine, titre) : racine;
      if (!parFichier.has(fichier)) {
        parFichier.set(fichier, []);
      }
      parFichier.get(fichier).push(test);
    }
    for (const [fichier, deCeFichier] of parFichier) {
      // The binary's root without a test of its own reports nothing, but for an empty binary.
      if (deCeFichier.length === 0 && parFichier.size > 1) {
        continue;
      }
      out.push({
        fichier,
        etat: deCeFichier.some(t => t.etat === 'failed') ? 'failed' : 'passed',
        message: '',
        tests: deCeFichier,
      });
    }
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
